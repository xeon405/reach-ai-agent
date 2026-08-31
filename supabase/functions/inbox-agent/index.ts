// ============================================================
// INBOX AGENT — inbound intelligence ONLY. Never sends cold email.
// Inbox scan → strip quoted → dedupe → classify (structured JSON)
// → POLICY ENGINE decides → controlled actions.
// Also hosts: 05:00 UTC autopilot top-up. (Daily digest lives in its own scheduled fn.)
// Auth: CRON_SECRET header or service-role bearer only.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO, nicheFor, searchDirectory } from "../_shared/osm.ts";
import { groqChat, groqKeys, sanitizeForPrompt } from "../_shared/groq.ts";
import { getAccessToken, sendGmailRaw, buildRawEmail } from "../_shared/gmail.ts";
import {
  classificationSystemPrompt,
  parseClassification,
  decide,
  nextLifecycle,
  type Classification,
} from "../_shared/policy.ts";
import { insertAudit } from "../_shared/audit.ts";
import { REPLY_CONTINUITY_RULES } from "../_shared/ai-lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SITE = "https://outreach-ochre-sigma.vercel.app";

/** Build structured business intelligence context for AI prompts. */
function buildBIContext(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  if (profile.business_description) parts.push(`Business: ${sanitizeForPrompt(String(profile.business_description), 300)}`);
  if (profile.offer) parts.push(`Product/Service: ${sanitizeForPrompt(String(profile.offer), 300)}`);
  if (profile.problem_solved) parts.push(`Problem we solve: ${sanitizeForPrompt(String(profile.problem_solved), 300)}`);
  if (profile.target_customer) parts.push(`Ideal customer: ${sanitizeForPrompt(String(profile.target_customer), 300)}`);
  if (profile.communication_style) parts.push(`Tone & style: ${sanitizeForPrompt(String(profile.communication_style), 200)}`);
  if (profile.dont_claim) parts.push(`HARD RULES — never say or promise: ${sanitizeForPrompt(String(profile.dont_claim), 300)}`);
  if (parts.length === 0) return "";
  return `BUSINESS CONTEXT:\n${parts.join("\n")}\n\n`;
}
const CONFIDENCE_FLOOR = 0.55;
const MAX_AI_REPLIES_PER_LEAD_24H = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function extractGmailBody(payload: unknown, depth = 0): string {
  if (!payload || depth > 6) return "";
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (p.body?.data) {
    try {
      const b64 = p.body.data.replace(/-/g, "+").replace(/_/g, "/");
      let text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      if ((p.mimeType ?? "").includes("html")) {
        text = text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      }
      if (text.trim()) return text.trim();
    } catch (_e) { /* skip malformed */ }
  }
  for (const part of p.parts ?? []) {
    const inner = extractGmailBody(part, depth + 1);
    if (inner) return inner;
  }
  return "";
}

function stripQuoted(text: string): string {
  const markers = [
    /\n?On .{4,80} (wrote|said):[\s\S]*$/i,
    /\n?-+\s?(Forwarded|Original)\s?-*[\s\S]*$/i,
    /\n?From:\s[^\n]{3,120}\n(Sent|Date|To|Subject):[\s\S]*$/i,
  ];
  let out = text;
  for (const m of markers) out = out.replace(m, "");
  out = out.split("\n").filter((l) => !/^\s*>/.test(l)).join("\n");
  return out.trim();
}

/** Crawls the owner's ENTIRE website (homepage + every internal page) and
 *  reduces it to a compact structured text knowledge base so the AI can answer
 *  prospect questions about the business, products, pricing, FAQ, etc.
 *  Results are cached per origin (TTL 12h). Fails soft → "" → prompts fall back. */
const siteKnowledgeCache = new Map<string, { at: number; kb: string }>();
const SITE_CACHE_TTL = 12 * 3600 * 1000;
const MAX_PAGES = 20;
const MAX_PAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 30000;

function cleanPageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInternalLinks(html: string, origin: string): string[] {
  const links = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.size < 300) {
    const href = String(m[1]).split("#")[0].split("?")[0];
    if (!href || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const u = new URL(href, origin);
      if (u.origin !== origin || links.has(u.pathname)) continue;
      if (/^\/assets\//i.test(u.pathname)) continue;                       // bundled assets
      if (/\.(js|css|svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|map|pdf|json|txt|xml)$/i.test(u.pathname)) continue; // static files
      links.add(u.pathname);
    } catch { /* skip malformed */ }
  }
  return [...links];
}

/** Harvests readable human copy from client-rendered (SPA) JS bundles:
 *  extracts natural-language string literals and filters out minified markup,
 *  identifiers, code glue and style noise. */
const MAX_JS_CHUNKS = 12;

function extractJsCopy(js: string): string[] {
  const out: string[] = [];
  for (const m of js.matchAll(/["`]([^"`]{12,220})["`]/g)) {
    const raw = m[1];
    const s = raw.replace(/\$\{[\s\S]*?\}/g, " ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (s.length < 14 || s.length > 210) continue;
    if (!/[a-zA-Z]{3,}/.test(s)) continue;                                   // needs real words
    if (/^[a-zA-Z0-9_\-./\\:#%+()=,$]*$/.test(s) && !/\s/.test(s)) continue; // ids/paths/keys
    if (!/\s/.test(s) && /[:{};,=<>]/.test(s)) continue;                     // minified glue
    if (/<(div|p|span|a|h[1-6])(\s|>)/i.test(s)) continue;                   // stray HTML
    if (/-webkit-|!important|background(Color)?|className|fontSize|--tw-/i.test(s)) continue; // CSS-in-JS
    if (/^\s*(import|export|const |let |function|return|throw|class |jsx|href)/i.test(s)) continue;
    out.push(s);
  }
  return [...new Set(out)];
}

async function fetchSiteKnowledge(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  let origin = url;
  try { origin = new URL(url).origin; } catch { return ""; }
  const cached = siteKnowledgeCache.get(origin);
  if (cached && Date.now() - cached.at < SITE_CACHE_TTL) return cached.kb;

  try {
    const fetchPage = async (u: string, ms = 6000): Promise<string> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        const r = await fetch(u, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; OutShipAI/1.0)" }, redirect: "follow" });
        return r.ok ? (await r.text()).slice(0, 400_000) : "";
      } catch { return ""; } finally { clearTimeout(timer); }
    };

    const pages = new Map<string, string>();
    const homeHtml = await fetchPage(url);
    if (!homeHtml) return "";
    pages.set("/", homeHtml);

    // Discover URLs three ways: sitemap.xml → SSR anchors → common paths.
    const candidates = new Set<string>();
    try {
      const sitemap = await fetchPage(`${origin}/sitemap.xml`, 5000);
      const locs = (sitemap.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) ?? [])
        .map((l) => l.replace(/<\/?loc>/gi, "").trim())
        .filter((l) => l.startsWith(origin));
      for (const l of locs) {
        try { candidates.add(new URL(l).pathname); } catch { /* skip */ }
      }
    } catch { /* no sitemap */ }
    for (const p of extractInternalLinks(homeHtml, origin)) candidates.add(p);
    const COMMON_PATHS = ["/pricing", "/price", "/features", "/about", "/faq", "/contact", "/services", "/products", "/plans"];
    for (const p of COMMON_PATHS) candidates.add(p);

    // Breadth-first over internal pages, bounded by MAX_PAGES.
    for (const path of candidates) {
      if (pages.size >= MAX_PAGES) break;
      if (pages.has(path)) continue;
      const html = await fetchPage(origin + path, 5000);
      if (html) pages.set(path, html);
    }

    const sections: string[] = [];
    let total = 0;
    for (const [path, pageHtml] of pages) {
      const title = sanitizeForPrompt((pageHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || path, 120);
      const h1 = sanitizeForPrompt((pageHtml.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1] ?? "").trim(), 120);
      const txt = cleanPageText(pageHtml).slice(0, MAX_PAGE_CHARS);
      if (!txt) continue;
      const pageUrl = path === "/" ? url : `${origin}${path}`;
      sections.push(`== ${title}${h1 && h1.toLowerCase() !== title.toLowerCase() ? ` — ${h1}` : ""} (${pageUrl}) ==\n${txt}`);
      total += txt.length;
      if (total >= MAX_TOTAL_CHARS) break;
    }

    // SPA fallback: client-rendered sites ship their real copy inside JS
    // bundles, so harvest readable strings from the entry chunks (plus one
    // level of dynamic imports) and append them to the knowledge base.
    let jsHarvest = "";
    try {
      const jsUrls = new Map<string, string>();
      for (const m of homeHtml.matchAll(/(?:src|href)="([^"]+\.js)"/gi)) {
        const href = m[1];
        try {
          const u = new URL(href, origin);
          if (u.origin === origin) jsUrls.set(u.pathname, u.href);
        } catch { /* skip */ }
      }
      for (const entry of jsUrls.entries()) {
        if (jsUrls.size >= MAX_JS_CHUNKS) break;
        const js = await fetchPage(entry[1], 6000);
        if (!js) continue;
        for (const imp of js.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/gi)) {
          const p = imp[1].replace(/^\.\//, "/");
          if (!p.startsWith("/") || jsUrls.has(p)) continue;
          if (jsUrls.size >= MAX_JS_CHUNKS) break;
          jsUrls.set(p, `${origin}${p}`);
        }
      }
      const strings = new Set<string>();
      for (const [, url] of jsUrls) {
        const js = await fetchPage(url, 6000);
        if (!js) continue;
        for (const s of extractJsCopy(js)) strings.add(s);
        if (strings.size >= 400) break;
      }
      if (strings.size) {
        const ranked = [...strings].sort((a, b) => b.length - a.length).slice(0, 180);
        jsHarvest = ranked.join(". ");
      }
    } catch { /* SPA harvest is best-effort */ }
    if (jsHarvest) {
      sections.push(`== Site copy (client-rendered content) ==\n${jsHarvest.slice(0, 12000)}`);
    }

    const kb = sections.join("\n\n");
    if (kb.length > MAX_TOTAL_CHARS) { /* trimmed already via per-page budget + total cap */ }
    siteKnowledgeCache.set(origin, { at: Date.now(), kb });
    return kb;
  } catch {
    return "";
  }
}

/** Reconstructs the recent Gmail thread transcript (our messages + lead's
 *  messages) so reply generation has real conversation memory. Excludes the
 *  newest message (the one we're answering, which is passed separately). */
async function fetchThreadHistory(
  tok: { accessToken: string },
  threadId: string | null | undefined,
  leadEmail: string,
  senderEmail: string,
  maxMsgs = 5,
): Promise<string> {
  if (!threadId) return "";
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
      { headers: { Authorization: `Bearer ${tok.accessToken}` } },
    );
    if (!res.ok) return "";
    const data = await res.json();
    const msgs = (data.messages ?? []) as Array<{ payload?: unknown }>;
    if (msgs.length < 2) return "";
    const priors = msgs.slice(0, -1).slice(-maxMsgs);
    const senderNorm = String(senderEmail || "").toLowerCase();
    const lines: string[] = [];
    for (const m of priors) {
      const from = (m.payload as { headers?: Array<{ name: string; value: string }> })?.headers
        ?.find((h) => h.name === "From")?.value ?? "";
      const fromEmail = (from.match(/<([^>]+)>/) ?? [ "", from ])[1].toLowerCase();
      const body = stripQuoted(extractGmailBody((m.payload as { payload?: unknown }) ?? m.payload)).slice(0, 700);
      if (!body) continue;
      const who = fromEmail.includes(senderNorm) ? "You" : "Lead";
      lines.push(`${who}: ${body}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

async function fetchTokenMap(db: ReturnType<typeof createClient>, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await db.from("gmail_tokens").select("profile_id, refresh_token").in("profile_id", ids);
  return Object.fromEntries((data ?? []).map((r) => [r.profile_id, r.refresh_token]));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" && new URL(req.url).searchParams.has("health")) {
    return json({ ok: true, service: "inbox-agent" });
  }

  const secret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
  const isService = !!serviceKey && auth === `Bearer ${serviceKey}`;
  if (!isCron && !isService) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);

  let repliesFound = 0;
  let unsubscribes = 0;
  let bookings = 0;
  let aiRepliesSent = 0;
  let handoffs = 0;
  let groqFail = "";

  try {
    // =====================================================================
    // PHASE 1 · FIRST-REPLY DETECTION + CLASSIFICATION + POLICY
    // =====================================================================
    try {
      const { data: openEmails } = await supabase
        .from("emails_sent")
        .select("id, user_id, campaign_id, sent_at, replied, lead:leads(id, email, unsubscribed, status, conv_mode, lifecycle, name, company, job_title, country)")
        .eq("replied", false)
        .order("sent_at", { ascending: false })
        .limit(60);

      const scanUserIds = [...new Set((openEmails ?? []).map((e) => e.user_id))];
      const { data: scanProfiles } = scanUserIds.length
        ? await supabase.from("profiles").select("*").in("id", scanUserIds)
        : { data: [] };
      const profileMap = Object.fromEntries((scanProfiles ?? []).map((p) => [p.id, p]));
      const scanTokens = await fetchTokenMap(supabase, scanUserIds);

      // ---- 💥 Bounce sweep (DSN detection) ------------------------------
      for (const uid of scanUserIds) {
        const rt = scanTokens[uid];
        if (!rt) continue;
        try {
          const tok = await getAccessToken(supabase, uid);
          if (!tok) continue;
          const bRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("{from:mailer-daemon from:postmaster} newer_than:7d")}&maxResults=10`,
            { headers: { Authorization: `Bearer ${tok.accessToken}` } }
          );
          if (!bRes.ok) continue;
          const bData = await bRes.json();
          for (const msg of bData.messages ?? []) {
            const mRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Delivered-To`,
              { headers: { Authorization: `Bearer ${tok.accessToken}` } }
            );
            if (!mRes.ok) continue;
            const mData = await mRes.json();
            const toHeader = (mData?.payload?.headers ?? [])
              .filter((h: { name: string }) => /to/i.test(h.name))
              .map((h: { value: string }) => h.value)
              .join(" ");
            const failedAddr = toHeader.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
            if (!failedAddr) continue;
            const { data: badLead } = await supabase.from("leads").select("*")
              .eq("user_id", uid).ilike("email", failedAddr).maybeSingle();
            if (badLead && badLead.lifecycle !== "BOUNCED") {
              await supabase.from("leads").update({
                status: "bounced", unsubscribed: true, lifecycle: "BOUNCED",
              }).eq("id", badLead.id);
              await supabase.from("suppressions").upsert({
                user_id: uid, lead_id: badLead.id, email: failedAddr.toLowerCase(),
                reason: "bounced", source: "dsn_sweep",
              }, { onConflict: "user_id,email" });
              await supabase.from("send_queue").update({ status: "cancelled", last_error: "bounced", updated_at: new Date().toISOString() })
                .eq("lead_id", badLead.id).in("status", ["pending", "claimed"]);
              await supabase.from("owner_alerts").insert({ user_id: uid, lead_id: badLead.id, kind: "bounce", title: `💥 Bounce: ${badLead.email}`, body: "Address is dead — suppressed permanently.", priority: "normal" });
              await insertAudit(supabase, { user_id: uid, lead_id: badLead.id, event: "email.bounced", payload: { email: failedAddr } });
            }
          }
        } catch (bErr) {
          console.error("[inbox] bounce sweep failed:", bErr instanceof Error ? bErr.message : bErr);
        }
      }

      // ---- First-reply processing ---------------------------------------
      for (const email of openEmails ?? []) {
        try {
          const profile = profileMap[email.user_id];
          const lead = Array.isArray(email.lead) ? email.lead[0] : email.lead;
          const rt = scanTokens[email.user_id];
          if (!profile || !rt || !lead?.email || lead.unsubscribed || ["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(lead.status ?? "")) continue;
          if ((lead.lifecycle ?? "") && ["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "HUMAN_TAKEOVER"].includes(lead.lifecycle)) continue;

          const tok = await getAccessToken(supabase, email.user_id);
          if (!tok) continue;
          const afterEpoch = Math.floor(new Date(email.sent_at).getTime() / 1000);
          const q = `from:${lead.email} in:anywhere -category:promotions after:${afterEpoch}`;
          const searchRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`,
            { headers: { Authorization: `Bearer ${tok.accessToken}` } }
          );
          if (!searchRes.ok) continue;
          const hits = ((await searchRes.json()).messages ?? []) as Array<{ id: string }>;
          if (hits.length === 0) continue;

          repliesFound++;
          await supabase.from("emails_sent").update({ replied: true }).eq("id", email.id);
          const newLifecycle = nextLifecycle(lead.lifecycle ?? "CONTACTED", "email.replied");
          await supabase.from("leads").update({ status: "replied", lifecycle: newLifecycle }).eq("id", lead.id);
          await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "email.replied", payload: { email_row: email.id } });

          // Pull full message
          let replySubject = "";
          let fullReplyText = "";
          let snippet = "";
          let threadId: string | null = null;
          try {
            const fullRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=full`,
              { headers: { Authorization: `Bearer ${tok.accessToken}` } }
            );
            if (fullRes.ok) {
              const fullData = await fullRes.json();
              threadId = fullData?.threadId ?? null;
              replySubject = (fullData?.payload?.headers ?? []).find((h: { name: string }) => h.name === "Subject")?.value ?? "";
              snippet = fullData?.snippet ?? "";
              fullReplyText = stripQuoted(extractGmailBody(fullData?.payload)).slice(0, 900);
            }
          } catch (_e) { /* fall back to empty */ }

          // ---- STRUCTURED AI CLASSIFICATION (advice only) ---------------
          let cls: Classification = parseClassification("", `${replySubject}\n${snippet || fullReplyText}`);
          if (groqKeys().length > 0 && (replySubject || fullReplyText || snippet)) {
            try {
              const threadWindow = await fetchThreadHistory(tok, threadId, lead.email, profile.gmail_email || profile.email, 3);
              const threadCtx = threadWindow
                ? `\n\nEarlier in this thread (read this before classifying — a short reply like "yes" or "no" usually answers a question asked earlier):\n${sanitizeForPrompt(threadWindow, 1300)}`
                : "";
              const raw = await groqChat([
                { role: "system", content: classificationSystemPrompt() },
                { role: "user", content: `Subject: ${sanitizeForPrompt(replySubject, 150)}\nMessage: ${sanitizeForPrompt(fullReplyText || snippet, 800)}${threadCtx}` },
              ], { maxTokens: 320, temperature: 0 });
              cls = parseClassification(raw, `${replySubject}\n${fullReplyText || snippet}`);
            } catch (ce) {
              groqFail = String(ce).slice(0, 160);
            }
          }
          // CONFIDENCE FLOOR: heuristic fallback scores 0.3 → auto-routes to human review.
          if (!cls.confidence || cls.confidence < CONFIDENCE_FLOOR) {
            cls.requires_human = true;
          }
          const { error: clsErr } = await supabase.from("ai_classifications").insert({
            user_id: email.user_id, lead_id: lead.id, message_id: hits[0].id,
            intent: cls.intent, confidence: cls.confidence ?? 0.5, interested: cls.interested,
            booking_intent: cls.booking_intent, unsubscribe: cls.unsubscribe,
            sentiment: cls.sentiment, requires_human: cls.requires_human,
            suggested_action: cls.suggested_action, reason: cls.reason, raw: { subject: replySubject.slice(0, 150) },
          });
          if (clsErr && String(clsErr.message ?? "").includes("duplicate key")) continue;
          await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "ai.classified", payload: { intent: cls.intent, sentiment: cls.sentiment, confidence: cls.confidence, source: "first_reply" } });
          await supabase.from("emails_sent").update({ reply_sentiment: cls.sentiment }).eq("id", email.id);

          // ---- POLICY ENGINE DECIDES ------------------------------------
          const { data: camp } = await supabase.from("campaigns").select("autopilot,status").eq("id", email.campaign_id).maybeSingle();
          const decision = decide(cls, {
            conv_mode: lead.conv_mode ?? "AI_AUTOPILOT",
            campaign_autopilot: !!camp?.autopilot && camp?.status === "active",
            ai_turns: 0,
            max_turns: 3,
            lead_status: lead.status ?? "",
            unsubscribed: !!lead.unsubscribed,
          });

          // ---- EXECUTE DECISION ------------------------------------------
          let tag = "😴 Maybe later";
          let draft = "";

          if (decision.action === "SUPPRESS") {
            unsubscribes++;
            await suppressLead(supabase, email.user_id, email.campaign_id, lead, "unsubscribe_requested");
            await supabase.from("owner_alerts").insert({ user_id: email.user_id, lead_id: lead.id, kind: "opt_out", title: `🚫 Opt-out: ${lead.name ?? lead.email}`, body: "Suppressed permanently across all campaigns.", priority: "high" });
            continue;
          }

          if (decision.action === "NOTIFY_OWNER_BOOKING") {
            bookings++;
            await supabase.from("leads").update({ lifecycle: nextLifecycle(newLifecycle, "booking.detected") }).eq("id", lead.id);
            await supabase.from("email_threads").upsert({
              user_id: email.user_id, lead_id: lead.id, gmail_thread_id: null,
              last_message_id: hits[0].id, high_priority: true, updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,lead_id" });
            await supabase.from("owner_alerts").insert({ user_id: email.user_id, lead_id: lead.id, kind: "booking", title: `🔥 HOT: ${lead.name ?? lead.email} wants to book!`, body: `They said: "${(fullReplyText || snippet).slice(0, 150)}"\n${profile.website_url ? "AI answered with your site link — thread stays on autopilot." : "AI stepped back — reply from your Gmail to close."}`, priority: "high" });
            await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "booking.detected", payload: {} });

            if (!profile.website_url) {
              // No self-serve destination — park the thread; the human must close.
              await supabase.from("emails_sent").update({ ai_paused: true }).eq("id", email.id);
              await supabase.from("leads").update({ conv_mode: "AI_OVERRIDDEN" }).eq("id", lead.id);
            } else {
              // Self-serve funnel: AI answers and points to the owner's site; thread stays alive.
              try {
                const siteKnowledge = await fetchSiteKnowledge(profile.website_url);
                const histB = await fetchThreadHistory(tok, hits[0].threadId ?? null, lead.email, profile.gmail_email || profile.email);
                const bDraft = await groqChat([{
                  role: "user",
                  content: `${buildBIContext(profile)}A lead just replied asking how to get started / book a meeting.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)}
Their exact words: "${sanitizeForPrompt(fullReplyText || snippet, 600)}"
Conversation so far (do not repeat any link, offer, or CTA already there):
"${sanitizeForPrompt(histB, 1800)}"
What we offer: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (from your website — use this to answer questions factually; never invent anything not written here or above): "${sanitizeForPrompt(siteKnowledge, 1400)}"` : ""}
Your site — direct them there to get started: ${sanitizeForPrompt(profile.website_url, 200)}

Write a short warm reply (2-3 sentences) on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)} that answers them and clearly points them to the site link above as the next step. If the site link / CTA already appears in the conversation above, do NOT paste it again — refer to it as already shared. If they asked about PRICE/PRICING/COST: answer using the company knowledge base; if pricing is not in the knowledge base, say so honestly and point them to the site above to see pricing — never invent an amount, and never defer to a human. Sign off as "Best regards". Return only the reply text.${REPLY_CONTINUITY_RULES}`,
                }], { maxTokens: 400, temperature: 0.8 });
                if (bDraft?.trim()) {
                  const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
                    lead.email,
                    replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`,
                    `${bDraft.trim()}\n\n--\nReply with UNSUBSCRIBE to stop further emails.`,
                    profile.gmail_email || profile.email,
                    `${SITE}/unsubscribe?l=${lead.id}`
                  )).catch(() => null);
                  if (ids) {
                    aiRepliesSent++;
                    const newTurns = (email.ai_turns ?? 0) + 1;
                    await supabase.from("emails_sent").update({
                      autoreplied: true, ai_draft: bDraft.trim(),
                      gmail_thread_id: ids.threadId,
                      last_ai_msg_at: new Date().toISOString(),
                      last_lead_msg_at: new Date().toISOString(),
                      ai_turns: newTurns,
                      ...(newTurns >= 3 ? { ai_paused: true } : {}),
                    }).eq("id", email.id);
                    if (newTurns >= 3) {
                      await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                      await supabase.from("owner_alerts").insert({ user_id: email.user_id, lead_id: lead.id, kind: "handoff", title: "AI turn budget reached", body: "3 AI turns used — thread paused for human review.", priority: "high" });
                    }
                    await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { kind: "booking_self_serve", turn: newTurns } });
                  }
                }
              } catch (_be) { /* alert already sent — owner can still close manually */ }
            }
            continue;
          }

          // Generate a draft for warm replies (AUTO_REPLY or ALERT_OWNER)
          if (cls.interested || cls.sentiment !== "NOT_INTERESTED") {
            tag = cls.sentiment === "INTERESTED" ? "INTERESTED" : cls.sentiment === "MAYBE" ? "Maybe later" : "Not interested";
            const siteKnowledge = profile.website_url ? await fetchSiteKnowledge(profile.website_url) : "";
            const hasSite = Boolean(profile.website_url);
            const intentGuide = cls.intent === "objection"
              ? `They raised an OBJECTION, pushed back, or sound annoyed. FIRST genuinely acknowledge their point, then answer their real concern with 1-2 concrete facts. Do NOT push, re-pitch a call/booking, or repeat anything already said. If they seem done, close warmly.`
              : cls.intent === "unclear"
              ? `Their message was UNCLEAR or too short to determine intent. Ask a gentle clarifying question to understand what they need.`
              : hasSite
              ? `Answer their question clearly and helpfully using the company knowledge base. Do NOT push a call or booking — pure substance.`
              : `Answer their question from the business context above (what the owner told us). Never invent facts you weren't given. Do NOT push a booking link.`;
            try {
              const threadHistory = await fetchThreadHistory(tok, hits[0].threadId ?? null, lead.email, profile.gmail_email || profile.email);
              draft = await groqChat([{
                role: "user",
                content: `${buildBIContext(profile)}A reply arrived to a cold email you sent.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}${lead.country ? `, ${sanitizeForPrompt(lead.country, 40)}` : ""}
Their exact words: "${sanitizeForPrompt(fullReplyText || snippet, 900)}"
Your original email (read it — do not repeat its offer, link, or CTA):
"${sanitizeForPrompt(threadHistory.split("\n")[0] ?? "", 800)}"
You originally offered: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (from your website — use this to answer questions factually; never invent anything not written here or above):
"${sanitizeForPrompt(siteKnowledge, 1800)}"` : ""}${profile.booking_link ? `
Your booking link was already included in your first email to them — do NOT paste it again. If pointing them to it, say "the link I sent earlier".` : ""}

Write a 3-4 sentence human reply on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)}. Warm, confident, zero fluff. ${intentGuide}
Rules: respond to something SPECIFIC they actually said (quote or reference it). If they asked a question, ANSWER it directly using the company knowledge base above when possible — when they ask what we do or how it works, briefly state 1-2 concrete capabilities from the knowledge base in your own words before pointing them onward; never invent pricing or facts. If they ask about PRICE/PRICING/COST: answer with the amount when the knowledge base contains one; if none${hasSite ? ", say the price is on the site / happy to confirm" : ", say you're happy to confirm it with them directly"} — never invent an amount and never leave the question unanswered or defer to a human. If the answer lives on your website${profile.website_url ? ` (${sanitizeForPrompt(profile.website_url, 120)})` : ""}, point them there — but only once, and never repeat a link you already put in your original email above. ${hasSite ? "Do NOT ask them to book a call or meeting — answer fully and stop; if you ask anything, make it a genuine information question, not about booking." : "Politely leave the door open — you may invite one quick call to discuss further only if it's genuinely useful, and never mention booking links."} Never use placeholders like [name]. Sign off as "Best regards". Return only the reply text.${REPLY_CONTINUITY_RULES}`,
              }], { maxTokens: 600, temperature: 0.9 });
              await supabase.from("emails_sent").update({ ai_draft: draft }).eq("id", email.id);
              await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "ai.reply_generated", payload: { kind: "first_reply_draft" } });
            } catch (de) {
              groqFail = groqFail || String(de).slice(0, 160);
            }
          }

          if (decision.action === "AUTO_REPLY" && draft) {
            const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
              lead.email,
              replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`,
              `${draft}\n\n--\nReply with UNSUBSCRIBE to stop further emails.`,
              profile.gmail_email || profile.email,
              `${SITE}/unsubscribe?l=${lead.id}`
            )).catch(() => null);
            if (ids) {
              aiRepliesSent++;
              await supabase.from("emails_sent").update({ autoreplied: true, ai_draft: draft, gmail_thread_id: ids.threadId }).eq("id", email.id);
              await supabase.from("leads").update({ lifecycle: nextLifecycle(newLifecycle, "classified.interested") }).eq("id", lead.id);
              await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { gmail_message_id: ids.id } });
            }
          }

          // In-app alert for every detected first reply (slim + link)
          if (profile.notify_replies !== false) {
            await supabase.from("owner_alerts").insert({ user_id: email.user_id, lead_id: lead.id, kind: "first_reply", title: `${tag} — ${lead.name ?? lead.email}`, body: `${(fullReplyText || snippet).slice(0, 280)}${cls.reason ? `\n\nBecause: ${cls.reason}` : ""}`, priority: cls.interested ? "high" : "normal" });
          }
        } catch (rowErr) {
          console.error("[inbox] first-reply row failed:", rowErr instanceof Error ? rowErr.message : rowErr);
        }
      }
    } catch (scanErr) {
      console.error("[inbox] reply scan error:", scanErr instanceof Error ? scanErr.message : scanErr);
    }

    // =====================================================================
    // AUTOPILOT TOP-UP @ 05:00 UTC
    // =====================================================================
    if (new Date().getUTCHours() === 5) {
      try {
        const { data: pilots } = await supabase
          .from("profiles")
          .select("id, autopilot_country, autopilot_niche, gmail_email")
          .eq("autopilot", true);
        for (const pilot of pilots ?? []) {
          try {
            const tokens = await fetchTokenMap(supabase, [pilot.id]);
            if (!tokens[pilot.id]) continue;
            let { data: camp } = await supabase.from("campaigns").select("id")
              .eq("user_id", pilot.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (!camp) {
              const { data: created } = await supabase.from("campaigns")
                .insert({ user_id: pilot.id, name: "Autopilot campaign", status: "active" }).select("id").single();
              camp = created;
            }
            if (!camp) continue;
            const { count: freshCount } = await supabase.from("leads").select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id).eq("status", "new");
            if ((freshCount ?? 0) < 15 && pilot.autopilot_country && pilot.autopilot_niche) {
              const iso = COUNTRY_ISO[String(pilot.autopilot_country).toLowerCase().trim()] ??
                String(pilot.autopilot_country || "").toUpperCase().slice(0, 2);
              if (iso && iso.length === 2) {
                const niche = nicheFor(String(pilot.autopilot_niche));
                const found = await searchDirectory(niche, iso, 25 - Math.min(15, freshCount ?? 0));
                const existing = new Set(
                  (await supabase.from("leads").select("email").eq("user_id", pilot.id)).data?.map((l: { email: string }) => String(l.email || "").toLowerCase()) ?? []
                );
                const rows = found
                  .filter((l: { email?: string }) => l.email && !existing.has(String(l.email).toLowerCase()))
                  .map((l: { name?: string; email?: string; company?: string; job_title?: string; city?: string; category?: string; place_id?: string; source?: string }) => ({
                    user_id: pilot.id, campaign_id: camp!.id, name: l.name ?? null, email: l.email,
                    company: l.company ?? null, job_title: l.job_title ?? null,
                    country: pilot.autopilot_country, status: "new",
                    category: l.category ?? null, place_id: l.place_id ?? null, lead_source: l.source ?? "openstreetmap",
                  }));
                if (rows.length > 0) {
                  await supabase.from("leads").insert(rows);
                  await insertAudit(supabase, { user_id: pilot.id, campaign_id: camp.id, event: "lead.imported", payload: { count: rows.length, source: "autopilot" } });
                }
              }
            }
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-campaign`, {
              method: "POST",
              headers: {
                "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
                apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ campaign_id: camp.id, user_id: pilot.id }),
            });
          } catch (pilotErr) {
            console.error("[inbox] pilot failed:", pilotErr instanceof Error ? pilotErr.message : pilotErr);
          }
        }
      } catch (apErr) {
        console.error("[inbox] autopilot pass failed:", apErr instanceof Error ? apErr.message : apErr);
      }
    }

    // =====================================================================
    // CONVERSATION MODE — multi-turn threads under policy control
    // =====================================================================
    try {
      const { data: threads } = await supabase
        .from("emails_sent")
        .select("id, user_id, campaign_id, subject, sent_at, ai_turns, last_lead_msg_at, last_ai_msg_at, ai_paused, replied, reply_sentiment, lead:leads(id, email, name, company, job_title, country, unsubscribed, status, conv_mode, lifecycle)")
        .eq("ai_paused", false)
        .lt("ai_turns", 3)
        .order("sent_at", { ascending: false })
        .limit(40);

      const convUserIds = [...new Set((threads ?? []).map((t) => t.user_id))];
      const { data: convProfiles } = convUserIds.length
        ? await supabase.from("profiles").select("*").in("id", convUserIds)
        : { data: [] };
      const convProfileMap = Object.fromEntries((convProfiles ?? []).map((p) => [p.id, p]));
      const convCampIds = [...new Set((threads ?? []).map((t) => t.campaign_id).filter(Boolean))];
      const { data: convCamps } = convCampIds.length
        ? await supabase.from("campaigns").select("id, autopilot, status").in("id", convCampIds)
        : { data: [] };
      const convCampMap = Object.fromEntries((convCamps ?? []).map((c: { id: string; autopilot: boolean; status: string }) => [c.id, c]));
      const convTokenMap = await fetchTokenMap(supabase, convUserIds);
      const handledMsgs = new Set<string>();

      for (const t of threads ?? []) {
        try {
          const lead = Array.isArray(t.lead) ? t.lead[0] : t.lead;
          const profile = convProfileMap[t.user_id];
          const rt = convTokenMap[t.user_id];
          if (!lead?.email || lead.unsubscribed || !profile || !rt) continue;
          if (["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "HUMAN_TAKEOVER"].includes(lead.lifecycle ?? "") || lead.status === "unsubscribed") continue;

          const tok = await getAccessToken(supabase, t.user_id);
          if (!tok) continue;
          const sRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`from:${lead.email} in:anywhere`)}&maxResults=3`,
            { headers: { Authorization: `Bearer ${tok.accessToken}` } }
          );
          if (!sRes.ok) continue;
          const hits = ((await sRes.json()).messages ?? []) as Array<{ id: string; threadId?: string }>;
          if (hits.length === 0) continue;

          // Owner manually answered after our last AI turn? Human takes over for good.
          if (t.last_ai_msg_at) {
            const oRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`to:${lead.email} is:sent after:${Math.floor(new Date(t.last_ai_msg_at).getTime() / 1000) + 1}`)}&maxResults=1`,
              { headers: { Authorization: `Bearer ${tok.accessToken}` } }
            );
            if (oRes.ok && (((await oRes.json()).messages ?? []).length > 0)) {
              await supabase.from("emails_sent").update({ ai_paused: true }).eq("id", t.id);
              await supabase.from("leads").update({ conv_mode: "HUMAN", lifecycle: nextLifecycle(lead.lifecycle ?? "", "human.takeover") }).eq("id", lead.id);
              await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "takeover", title: `🤝 You took over: ${lead.name ?? lead.email}`, body: "AI stood down — the thread is yours.", priority: "normal" });
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "human.takeover", payload: { trigger: "owner_replied_manually" } });
              continue;
            }
          }

          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=full`,
            { headers: { Authorization: `Bearer ${tok.accessToken}` } }
          );
          if (!mRes.ok) continue;
          const msg = await mRes.json();
          const msgDateMs = Number(msg.internalDate ?? Date.now());
          if (msgDateMs <= new Date(t.last_lead_msg_at ?? t.sent_at).getTime()) continue;
          if (handledMsgs.has(`${lead.email}:${hits[0].id}`)) continue;
          handledMsgs.add(`${lead.email}:${hits[0].id}`);

          const theirWords = stripQuoted(extractGmailBody(msg.payload)).slice(0, 900);
          if (!theirWords.trim()) {
            await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            continue;
          }
          const subj = (msg.payload?.headers ?? []).find((h: { name: string }) => h.name === "Subject")?.value ?? "";

          // ---- LOOP GUARD 1: vacation/autoresponder bots — never spend a turn ----
          const AUTO_RE = /^(auto(:|matic)?\s*reply|automatic response|out of office|away from (the )?office)/i;
          if (AUTO_RE.test(subj) || /i am (currently )?(out of (the )?office|on vacation|unavailable until)|this is an auto(matic)?[- ]repl/i.test(theirWords.slice(0, 300))) {
            await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            // Persist autoresponder classification
            const autoClsInsert = await supabase.from("ai_classifications").insert({
              user_id: t.user_id, lead_id: lead.id, message_id: hits[0].id,
              intent: "autoresponder", confidence: 0.95, interested: false,
              booking_intent: false, unsubscribe: false,
              sentiment: "NOT_INTERESTED", requires_human: false,
              reason: "automatic out-of-office / vacation reply",
              suggested_action: "do_nothing", raw: { subject: subj.slice(0, 150) },
            });
            if (!autoClsInsert.error) {
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.classified", payload: { intent: "autoresponder", source: "loop_guard" } });
            }
            await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "review", title: `🤖 Autoresponder detected: ${lead.name ?? lead.email}`, body: subj.slice(0, 120) || theirWords.slice(0, 120), priority: "normal" });
            continue;
          }

          // ---- LOOP GUARD 2: rolling AI-reply budget per lead (24h) ----
          const { count: aiLast24 } = await supabase.from("audit_events").select("id", { count: "exact", head: true })
            .eq("user_id", t.user_id).eq("lead_id", lead.id).eq("event", "ai.reply_sent")
            .gte("created_at", new Date(Date.now() - 86400000).toISOString());
          if ((aiLast24 ?? 0) >= MAX_AI_REPLIES_PER_LEAD_24H) {
            await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
            await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "review", title: `🔁 Reply loop stopped: ${lead.name ?? lead.email}`, body: `AI already replied ${aiLast24}× in 24h — thread paused for review.`, priority: "high" });
            await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "loop.stopped", payload: { kind: "reply_budget", count: aiLast24 } });
            continue;
          }

          // ---- LOOP GUARD 3: echo/quoted-text failure — they mirrored our last AI send back
          const normEcho = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100);
          if (t.ai_draft && normEcho(theirWords).startsWith(normEcho(String(t.ai_draft)).slice(0, 60))) {
            await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            continue;
          }

          // Structured classification of THIS turn
          let cls: Classification = parseClassification("", `${subj}\n${theirWords}`);
          if (groqKeys().length > 0) {
            try {
              const threadWindow = await fetchThreadHistory(tok, hits[0].threadId ?? msg.threadId ?? null, lead.email, profile.gmail_email || profile.email, 3);
              const threadCtx = threadWindow
                ? `\n\nEarlier in this thread (read this before classifying — a short reply like "yes" or "no" usually answers a question asked earlier):\n${sanitizeForPrompt(threadWindow, 1300)}`
                : "";
              const raw = await groqChat([
                { role: "system", content: classificationSystemPrompt() },
                { role: "user", content: `Subject: ${sanitizeForPrompt(subj, 150)}\nMessage: ${sanitizeForPrompt(theirWords, 800)}${threadCtx}` },
              ], { maxTokens: 320, temperature: 0 });
              cls = parseClassification(raw, `${subj}\n${theirWords}`);
            } catch (ce) { groqFail = groqFail || String(ce).slice(0, 160); }
          }
          // CONFIDENCE FLOOR: low-confidence or heuristic-fallback verdicts route to a human, never to an AI send.
          if (!cls.confidence || cls.confidence < CONFIDENCE_FLOOR) {
            cls.requires_human = true;
          }
          const { error: clsErr } = await supabase.from("ai_classifications").insert({
            user_id: t.user_id, lead_id: lead.id, message_id: hits[0].id,
            intent: cls.intent, confidence: cls.confidence ?? 0.5, interested: cls.interested,
            booking_intent: cls.booking_intent, unsubscribe: cls.unsubscribe,
            sentiment: cls.sentiment, requires_human: cls.requires_human,
            suggested_action: cls.suggested_action, reason: cls.reason, raw: { subject: subj.slice(0, 150), snip: theirWords.slice(0, 150) },
          });
          if (clsErr) {
            // Duplicate message id → already processed by a previous run; just advance the pointer.
            await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            continue;
          }
          await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.classified", payload: { intent: cls.intent, sentiment: cls.sentiment, source: "conversation_turn" } });

          const campInfo = convCampMap[t.campaign_id];
          const decision = decide(cls, {
            conv_mode: lead.conv_mode ?? "AI_AUTOPILOT",
            campaign_autopilot: !!campInfo?.autopilot && campInfo?.status === "active",
            ai_turns: t.ai_turns ?? 0,
            max_turns: 3,
            lead_status: lead.status ?? "",
            unsubscribed: !!lead.unsubscribed,
          });

          switch (decision.action) {
            case "SUPPRESS": {
              unsubscribes++;
              await suppressLead(supabase, t.user_id, t.campaign_id, lead, "unsubscribe_requested");
              break;
            }
            case "NOTIFY_OWNER_BOOKING": {
              bookings++;
              await supabase.from("leads").update({ lifecycle: nextLifecycle(lead.lifecycle ?? "REPLIED", "booking.detected") }).eq("id", lead.id);
              await supabase.from("email_threads").upsert({
                user_id: t.user_id, lead_id: lead.id, gmail_thread_id: hits[0].threadId ?? null,
                last_message_id: hits[0].id, high_priority: true, updated_at: new Date().toISOString(),
              }, { onConflict: "user_id,lead_id" });
              await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "booking", title: `🔥 HOT: ${lead.name ?? lead.email} wants to book!`, body: `They said: "${theirWords.slice(0, 150)}"${profile.website_url ? "\nAI answered with your site link — thread stays on autopilot." : ""}`, priority: "high" });
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "booking.detected", payload: {} });

              if (!profile.website_url) {
                // No self-serve destination — park the thread; the human must close.
                await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
                await supabase.from("leads").update({ conv_mode: "AI_OVERRIDDEN" }).eq("id", lead.id);
              } else {
                // Self-serve funnel: AI answers and points to the owner's site; thread stays alive.
                try {
const siteKnowledge = await fetchSiteKnowledge(profile.website_url);
                  const convHistoryB = await fetchThreadHistory(tok, hits[0].threadId ?? null, lead.email, profile.gmail_email || profile.email);
                   const bReply = await groqChat([{
                    role: "user",
                    content: `${buildBIContext(profile)}A lead just replied asking how to get started / book a meeting.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)}
Their newest message: "${sanitizeForPrompt(theirWords, 600)}"
Conversation so far (do not repeat any link, offer or CTA already there):
"${sanitizeForPrompt(convHistoryB, 1800)}"
What we offer: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (factual only — never invent anything beyond it): "${sanitizeForPrompt(siteKnowledge, 1400)}"` : ""}
Your site — direct them there to get started: ${sanitizeForPrompt(profile.website_url, 200)}

Write a short warm reply (2-3 sentences) on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)} that answers them and clearly points them to the site link above as the next step. If the site link or booking link already appears in the conversation above, do NOT paste it again — refer to it as already shared. If they asked about PRICE/PRICING/COST: answer using the company knowledge base; if pricing is not in the knowledge base, say so honestly and point them to the site above to see pricing — never invent an amount, and never defer to a human. Sign off as "Best regards". Return only the reply text.${REPLY_CONTINUITY_RULES}`,
                  }], { maxTokens: 400, temperature: 0.8 });
                  if (bReply?.trim()) {
                    const newTurnsB = (t.ai_turns ?? 0) + 1;
                    // Enforce turn limit — don't send if budget exhausted
                    if (newTurnsB > 3) {
                      await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
                      await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                      await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "handoff", title: `🤝 Handoff: ${lead.name ?? lead.email}`, body: "3 AI turns used.", priority: "high" });
                    } else {
                      const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
                        lead.email,
                        subj.startsWith("Re:") ? subj : `Re: ${subj}`,
                        `${bReply.trim()}\n\n--\nReply UNSUBSCRIBE anytime to opt out.`,
                        profile.gmail_email || profile.email,
                        `${SITE}/unsubscribe?l=${lead.id}`
                      )).catch(() => null);
                      if (ids) {
                        aiRepliesSent++;
                        await supabase.from("emails_sent").update({ autoreplied: true, ai_draft: bReply.trim(), gmail_thread_id: ids.threadId, ai_turns: newTurnsB, last_ai_msg_at: new Date().toISOString() }).eq("id", t.id);
                        await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { kind: "booking_self_serve", turn: newTurnsB } });
                        if (newTurnsB >= 3) {
                          await supabase.from("emails_sent").update({ ai_paused: true }).eq("id", t.id);
                          await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                          await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "handoff", title: `🤝 Handoff: ${lead.name ?? lead.email}`, body: "3 AI turns used.", priority: "high" });
                        }
                      }
                    }
                  }
                } catch (_be2) { /* alert already sent — owner can still close manually */ }
                await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
              }
              break;
            }
            case "HANDOFF_TO_HUMAN": {
              handoffs++;
              const newTurns = (t.ai_turns ?? 0);
              const phone = String(profile.phone ?? "").trim();
              if (cls.requires_human && phone) {
                // Escalation with the owner's direct number: reply NOW so the
                // lead isn't left hanging, then stop. No owner alert here — the
                // lead now calls/messages the number directly (avoids alert spam).
                let esc = "";
                try {
                  const convHist = await fetchThreadHistory(tok, hits[0].threadId ?? null, lead.email, profile.gmail_email || profile.email);
                  esc = await groqChat([{
                    role: "user",
                    content: `${buildBIContext(profile)}A lead in an ongoing email conversation has asked something that needs the owner (${sanitizeForPrompt(profile.name ?? "the owner", 40)}) to answer personally — it should not be answered by automation.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}.
Their newest message: "${sanitizeForPrompt(theirWords, 700)}"
Conversation so far (do not repeat anything already shared):
"${sanitizeForPrompt(convHist, 2000)}"
The owner's direct phone number (share it exactly once, as a real number): ${sanitizeForPrompt(phone, 40)}
Write a short (2-3 sentence) reply: (1) thank them / acknowledge their point, (2) honestly say you'll get them the exact details personally, (3) give the phone number once and suggest they call or send a quick text. Never mention an AI assistant, never invent facts, never repeat links. Sign off as "Best regards". Return only the reply text.${REPLY_CONTINUITY_RULES}`,
                  }], { maxTokens: 400, temperature: 0.7 });
                } catch (ee) {
                  groqFail = groqFail || String(ee).slice(0, 160);
                }
                if (esc?.trim()) {
                  const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
                    lead.email,
                    subj.startsWith("Re:") ? subj : `Re: ${subj}`,
                    `${esc.trim()}\n\n--\nReply UNSUBSCRIBE anytime to opt out.`,
                    profile.gmail_email || profile.email,
                    `${SITE}/unsubscribe?l=${lead.id}`
                  )).catch(() => null);
                  if (ids) {
                    aiRepliesSent++;
                    await supabase.from("emails_sent").update({
                      ai_paused: true, autoreplied: true, ai_draft: esc.trim(),
                      ai_turns: newTurns + 1, last_ai_msg_at: new Date().toISOString(),
                      last_lead_msg_at: new Date(msgDateMs).toISOString(), gmail_thread_id: ids.threadId,
                    }).eq("id", t.id);
                    await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                    await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { kind: "phone_handoff", turn: newTurns + 1 } });
                    await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "agent.handoff", payload: { reason: "requires_human", escalated_with_phone: true } });
                    break;
                  }
                }
                // Generation or send failed — park quietly; the owner dashboard still shows the thread.
                await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
                await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "agent.handoff", payload: { reason: "requires_human", escalated_with_phone: false } });
                break;
              }
              await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
              await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
              await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "handoff", title: `🤝 Handoff: ${lead.name ?? lead.email}`, body: decision.action === "HANDOFF_TO_HUMAN" && cls.requires_human ? "They need a human answer." : "Turn budget used.", priority: "high" });
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "agent.handoff", payload: { reason: cls.requires_human ? "requires_human" : "turn_budget" } });
              break;
            }
            case "AUTO_REPLY": {
              let aiReply: string | null = null;
              try {
                const siteKnowledge = profile.website_url ? await fetchSiteKnowledge(profile.website_url) : "";
                const convIntentGuide = cls.intent === "objection"
                  ? "They raised an OBJECTION, pushed back, or sound annoyed by something earlier in the thread. FIRST genuinely acknowledge their point, then answer their real concern with 1-2 concrete facts from the knowledge base. Do NOT pitch, re-offer a call/booking, or repeat anything already said. If they seem done, close warmly and invite them to reach out anytime."
                  : cls.intent === "unclear"
                  ? "Their message was UNCLEAR. Ask a gentle clarifying question to understand what they need."
                  : t.ai_turns > 0 ? "You have already exchanged messages — keep full continuity with the transcript below; do not reintroduce yourself, restate the offer, or repeat any link/CTA already shared." : "";
                const threadHistory = await fetchThreadHistory(tok, hits[0].threadId ?? null, lead.email, profile.gmail_email || profile.email);
                aiReply = await groqChat([{
                  role: "user",
                  content: `${buildBIContext(profile)}Ongoing email conversation with a lead.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}${lead.country ? `, ${sanitizeForPrompt(lead.country, 40)}` : ""}.
Their newest message: "${sanitizeForPrompt(theirWords, 900)}"
Thread topic: ${sanitizeForPrompt(t.subject ?? "our services", 100)}
Conversation so far (your messages + theirs — DO NOT repeat any offer, booking link, website link or CTA that appears here):
"${sanitizeForPrompt(threadHistory, 2500)}"
You originally offered: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (from your website — answer questions factually from this; never invent anything not written here or above):
"${sanitizeForPrompt(siteKnowledge, 1600)}"` : ""}${profile.booking_link ? `
Booking-link policy: your link was already shared earlier in this thread. Do NOT paste it again unless they explicitly ask for it or say they can't find it — refer to it as "the link I sent earlier".` : ""}
${convIntentGuide}

Write a short (2-4 sentence) human reply on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)}. Match their energy and length. Answer whatever they asked directly and factually using the knowledge base when available — when they ask what we do or how it works, briefly state 1-2 concrete capabilities from the knowledge base in your own words before pointing them onward; never invent pricing or facts; if something isn't covered there${profile.website_url ? `, point them to ${sanitizeForPrompt(profile.website_url, 120)}` : ", keep it honest and brief — never guess"}. If they asked about PRICE/PRICING/COST, answer with the amount when it appears in the knowledge base above; if no amount appears, ${profile.website_url ? "say the price is on the site" : "explain you'd rather get them the exact details on a quick call"} — never invent an amount. Do NOT push a call or booking${profile.website_url ? " — answer fully from the knowledge base and stop" : " unless they explicitly ask to talk"}. Ask at most one question. Sign off as "Best regards". Return only the reply text.${REPLY_CONTINUITY_RULES}`,
                }], { maxTokens: 500, temperature: 0.9 });
              } catch (ge) {
                groqFail = groqFail || String(ge).slice(0, 160);
              }
              if (aiReply?.trim()) {
                const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
                  lead.email,
                  subj.startsWith("Re:") ? subj : `Re: ${subj}`,
                  `${aiReply.trim()}\n\n--\nReply UNSUBSCRIBE anytime to opt out.`,
                  profile.gmail_email || profile.email,
                  `${SITE}/unsubscribe?l=${lead.id}`
                )).catch(() => null);
                if (ids) {
                  aiRepliesSent++;
                  const newTurns = (t.ai_turns ?? 0) + 1;
                  await supabase.from("emails_sent").update({
                    ai_turns: newTurns,
                    last_ai_msg_at: new Date().toISOString(),
                    last_lead_msg_at: new Date(msgDateMs).toISOString(),
                    autoreplied: true,
                    ai_draft: aiReply.trim(),
                    gmail_thread_id: ids.threadId,
                  }).eq("id", t.id);
                  await supabase.from("email_threads").upsert({
                    user_id: t.user_id, lead_id: lead.id, gmail_thread_id: ids.threadId ?? null,
                    last_message_id: hits[0].id, turn_count: newTurns, high_priority: false, updated_at: new Date().toISOString(),
                  }, { onConflict: "user_id,lead_id" });
                  await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { gmail_message_id: ids.id, turn: newTurns } });
                  if (newTurns >= 3) {
                    await supabase.from("emails_sent").update({ ai_paused: true }).eq("id", t.id);
                    await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
                    await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "handoff", title: `🤝 Handoff: ${lead.name ?? lead.email}`, body: "3 AI turns used.", priority: "high" });
                  }
                }
              } else {
                await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
              }
              break;
            }
            default: {
              await supabase.from("emails_sent").update({ last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
            }
          }

        } catch (convErr) {
          console.error("[inbox] conversation turn failed:", convErr instanceof Error ? convErr.message : convErr);
        }
      }
    } catch (cmErr) {
      console.error("[inbox] conversation mode failed:", cmErr instanceof Error ? cmErr.message : cmErr);
    }

    return json({ ok: true, repliesFound, unsubscribes, bookings, aiRepliesSent, handoffs, groqFail: groqFail || undefined });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  async function suppressLead(
    db: ReturnType<typeof createClient>,
    userId: string,
    campaignId: string | null,
    lead: Record<string, any>,
    reason: string
  ): Promise<void> {
    await db.from("leads").update({ unsubscribed: true, status: "unsubscribed", lifecycle: "UNSUBSCRIBED", conv_mode: "PAUSED" }).eq("id", lead.id);
    await db.from("suppressions").upsert({
      user_id: userId, lead_id: lead.id, email: String(lead.email).toLowerCase(),
      reason: "unsubscribed", source: "reply_scan",
    }, { onConflict: "user_id,email" });
    await db.from("send_queue").update({ status: "cancelled", last_error: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("lead_id", lead.id).in("status", ["pending", "claimed"]);
    await insertAudit(db, { user_id: userId, campaign_id: campaignId, lead_id: lead.id, event: "lead.suppressed", payload: { reason } });
  }

});
