// ============================================================
// DEMO — paste a public website, get three sourced sample emails.
//
// No account, no signup, nothing sent, and no email address is ever read or
// shown. The page is fetched, turned into facts, and every email sentence must
// point at one of those facts or it is removed before it reaches the browser.
//
// Abuse control: per-IP limits on the demo table, plus the shared guest AI
// budget (a real dollar ceiling), so an open endpoint cannot become a bill.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat } from "../_shared/groq.ts";
import { openGuestAiCall } from "../_shared/ai-cost-gate.ts";
import { guardDraft } from "../_shared/fact-writer.ts";
import { type Fact } from "../_shared/fact-layer.ts";
import {
  hostIsPrivate,
  ipIsPrivate,
  normalizeDemoUrl,
  pickPageFacts,
} from "../_shared/page-facts.ts";
import { buildFactWriterPrompt } from "../_shared/fact-writer.ts";

const SITE = "https://out-ship.com";
const MAX_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 7_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function clientIp(req: Request): string {
  // The platform appends the real client IP; attacker-supplied entries come first.
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || req.headers.get("x-real-ip") || "anon";
}

/** 6 demos an hour and 25 a day per visitor. Never a permanent block. */
async function throttled(ip: string): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [hour, day] = await Promise.all([
    admin.from("demo_rate_limit").select("*", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo),
    admin.from("demo_rate_limit").select("*", { count: "exact", head: true }).eq("ip", ip).gte("created_at", dayAgo),
  ]);
  if ((hour.count ?? 0) >= 6) return "You have run a few demos in the last hour. Try again in a little while.";
  if ((day.count ?? 0) >= 25) return "This visitor has reached today's demo limit. Try again tomorrow.";
  await admin.from("demo_rate_limit").insert({ ip, action: "demo" });
  if (Math.random() < 0.02) {
    await admin.from("demo_rate_limit").delete().lt("created_at", dayAgo);
  }
  return null;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostIsPrivate(hostname)) throw new Error("That address is not a public website.");
  // Resolve every address the name points at. A hostname that resolves to a
  // private address (including cloud metadata) is refused.
  for (const type of ["A", "AAAA"] as const) {
    try {
      const rows = await Deno.resolveDns(hostname, type);
      for (const ip of rows) {
        if (ipIsPrivate(ip)) throw new Error("That address is not a public website.");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("not a public")) throw err;
      // No record of this type is normal (v4-only or v6-only hosts).
    }
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* already closed */ }
      break;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, total - offset);
    bytes.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Fetch a public page, following at most three redirects, each one checked. */
async function fetchPage(start: URL): Promise<{ url: string; html: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "OutshipAiDemo/1.0 (+https://out-ship.com/demo)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      try { await res.body?.cancel(); } catch { /* no body */ }
      if (!location) throw new Error("That link redirects nowhere.");
      url = new URL(location, url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("That link redirects off the web.");
      continue;
    }
    if (!res.ok) throw new Error(`That page returned ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) throw new Error("That link is not a web page.");
    return { url: url.toString(), html: await readCapped(res) };
  }
  throw new Error("That link redirects too many times.");
}

const OFFER = "we help solo founders and freelancers find local businesses and start careful email conversations";
const ANGLES = [
  {
    label: "The most specific detail",
    directive: "This sample: open with the most concrete thing the page says about the work they do.",
  },
  {
    label: "Who they serve",
    directive: "This sample: open with who they serve or where they are, using only a listed fact.",
  },
  {
    label: "Straight to the offer",
    directive: "This sample: open directly with what we do, then one fact about them.",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const ip = clientIp(req);
  const limited = await throttled(ip);
  if (limited) return json({ error: limited }, 429);

  try {
    const body = await req.json().catch(() => ({}));
    const url = normalizeDemoUrl(String(body?.url ?? ""));
    if (!url) {
      return json({ error: "Paste a normal public website address, like example.com." }, 400);
    }

    let page: { url: string; html: string };
    try {
      page = await fetchPage(url);
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "We could not open that page." },
        422,
      );
    }

    const checkedAt = new Date().toISOString();
    const picked = pickPageFacts({ html: page.html, sourceUrl: page.url, checkedAt, limit: 5 });

    // Nothing readable means nothing true to say. Zero results is allowed;
    // an invented result is not.
    if (picked.facts.length === 0) {
      return json({
        business: picked.businessName || url.hostname.replace(/^www\./, ""),
        sourceUrl: page.url,
        checkedAt,
        facts: [],
        emails: [],
        notice: "We could not read enough real text on that page to write anything true. Try a page with a few sentences about the business.",
      });
    }

    const facts: Fact[] = [
      ...picked.facts,
      {
        id: "offer",
        kind: "offer",
        value: OFFER,
        quote: OFFER,
        sourceUrl: SITE,
        checkedAt,
        source: "ours",
      },
    ];

    const emails: Array<Record<string, unknown>> = [];
    for (const angle of ANGLES) {
      const prompt = buildFactWriterPrompt({
        facts,
        senderName: "the OutshipAi team",
        senderCompany: "OutshipAi",
        offer: OFFER,
        openerDirective: angle.directive,
      });

      const handle = await openGuestAiCall(
        admin,
        { kind: "demo_email", fn: "demo", groqChat, perCallGuard: 0.004 },
        700,
      );
      if (handle.mode !== "ai") {
        emails.push({
          angle: angle.label,
          content: "",
          claims: [],
          blocked: [{ sentence: "", reason: "The demo is at capacity right now. Try again later." }],
          empty: true,
        });
        continue;
      }

      const raw = await handle.run(prompt, { maxTokens: 700, temperature: 0.6, json: true });
      if (!raw) {
        emails.push({
          angle: angle.label,
          content: "",
          claims: [],
          blocked: [{ sentence: "", reason: "The writer did not answer in time. Try again." }],
          empty: true,
        });
        continue;
      }

      const outcome = guardDraft(raw, facts);
      emails.push({
        angle: angle.label,
        content: outcome.content,
        claims: outcome.claims,
        blocked: outcome.blocked,
        empty: outcome.empty,
      });
    }

    return json({
      business: picked.businessName || url.hostname.replace(/^www\./, ""),
      sourceUrl: page.url,
      checkedAt,
      facts,
      emails,
      notice: "No signup. Nothing is sent. Email addresses are never read or shown.",
    });
  } catch (err) {
    console.error("[demo]", err instanceof Error ? err.message : String(err));
    return json({ error: "The demo hit a problem. Try again in a moment." }, 500);
  }
});
