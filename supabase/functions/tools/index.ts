import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, groqKeys, extractJson, sanitizeForPrompt } from "../_shared/groq.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function clientIp(req: Request): string {
  // Platform APPENDS the real client IP — attacker-controlled entries come first
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.headers.get("x-real-ip") || "anon";
}

// Durable rate limiting (DB-backed — survives multi-instance load balancing)
async function throttled(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("tools_rate_limit")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if ((count ?? 0) >= 10) return true;
  await admin.from("tools_rate_limit").insert({ ip });
  if (Math.random() < 0.02) {
    await admin.from("tools_rate_limit").delete().lt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  }
  return false;
}

// Global AI-cost cap per hour across ALL instances
async function aiBudgetExhausted(): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("tools_rate_limit")
    .select("*", { count: "exact", head: true })
    .eq("action", "ai")
    .gte("created_at", since);
  return (count ?? 0) >= 150;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Lightweight per-instance throttle (kept as a fast pre-filter on top of the DB limit)
const hits = new Map<string, number[]>();

function throttledLocal(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 10) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

async function checkMx(domain: string): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns(domain.toLowerCase(), "MX");
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ip = clientIp(req);
  if (throttledLocal(ip) || (await throttled(ip))) {
    return json({ error: "Slow down a little — try again in a minute." }, 429);
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 📮 Free email list validator
    if (action === "validate") {
      const emails = body.emails;
      if (!Array.isArray(emails) || emails.length === 0 || emails.length > 25) {
        return json({ error: "Provide 'emails' as an array of 1-25 addresses to validate." }, 400);
      }
      const results = [];
      for (const raw of emails.slice(0, 25)) {
        const email = String(raw).trim().toLowerCase();
        const shapeOk = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email);
        let deliverable = false;
        let reason = "invalid format";
        if (shapeOk) {
          const domain = email.split("@")[1];
          deliverable = await checkMx(domain);
          reason = deliverable ? "ok" : "domain cannot receive mail";
        }
        results.push({ email, deliverable, reason });
      }
      return json({ results });
    }

    // ✍️ Free subject line generator
    if (action === "subjects") {
      const offer = body.offer;
      const audience = body.audience;
      if (!offer || !audience) return json({ error: "offer and audience are required" }, 400);
      if (groqKeys().length === 0) return json({ error: "Generator is warming up — try again soon." }, 503);
      // Global cost backstop: even with IP rotation, AI spend is capped per hour
      if (await aiBudgetExhausted()) {
        return json({ error: "Free generator is very busy right now — please try again later." }, 429);
      }
      await admin.from("tools_rate_limit").insert({ ip, action: "ai" });
      try {
        const text = await groqChat([{
          role: "user",
          content: `Generate 5 cold-email subject lines offering "${sanitizeForPrompt(offer)}" to ${sanitizeForPrompt(audience, 100)}.
Rules: max 7 words each, personal, curiosity-driven, lowercase style ok. NEVER use the words opportunity, proposal, or "quick question".
Return ONLY a JSON array of strings.`,
        }], { maxTokens: 500, temperature: 0.9, context: { fn: "tools", kind: "subjects" } });
        const parsed = extractJson<string[]>(text);
        const subjects = Array.isArray(parsed) ? parsed : text.split("\n").map((l) => l.trim()).filter(Boolean);
        return json({ subjects: subjects.slice(0, 5) });
      } catch {
        return json({ error: "Generator hiccup — try again." }, 502);
      }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    return json({ error: "Bad request" }, 400);
  }
});
