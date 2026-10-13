// ============================================================
// SEND WORKER — the ONLY component that puts outreach email on the wire.
// Queue processing · eligibility · limits · MX · Gmail send · follow-ups.
// AI generates content here, but every decision is deterministic.
// Auth: CRON_SECRET header or service-role bearer only.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { buildBIContext } from "../_shared/business-context.ts";
import { openAiCall, type AiCallHandle } from "../_shared/ai-cost-gate.ts";
import { COUNTRY_ISO } from "../_shared/osm.ts";
import { sendEmail } from "../_shared/email-provider.ts";
import { inboundReplyTo } from "../_shared/reply-address.ts";
import { insertAudit } from "../_shared/audit.ts";
import { effectivePlan } from "../_shared/effective-plan.ts";
import { resolveDailyCap, type CapProfile } from "../_shared/sender-health.ts";
import { getLeadScore, getNextSequenceHint, sequenceHintSuffix, strategyRef, type CampaignHint } from "../_shared/intelligence-reads.ts";
import { signToken } from "../_shared/crypto.ts";
import {
  buildLeadFacts,
  COLD_EMAIL_FEWSHOTS,
  containsArabic,
  detectLeadLanguage,
  followUpArc,
  hashString,
  pickOpenerDirective,
} from "../_shared/ai-lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 40;
const DELAY_MS = 8000;
const RUNTIME_MS = 50_000;
const MAX_ATTEMPTS = 4;

const PLAN_LIMITS: Record<string, { dailyEmails: number }> = {
  free: { dailyEmails: 10 },
  starter: { dailyEmails: 50 },
  growth: { dailyEmails: 200 },
  agency: { dailyEmails: 500 },
};

const SITE = APP_BASE_URL;

/** Deterministic cold-email template (Stage 7 conserve path: metering degraded /
 *  ceiling tripped / per-call guard). No LLM, no ledger, no debit. Mirrors the
 *  AI output's structure so downstream (spam check, tracking, footer) is
 *  untouched. Never contains banned words, URLs, caps, or placeholders. */
function templateEmail(
  senderName: string,
  lead: Record<string, any>,
  userOffer: string,
  arabic: boolean,
  _sequenceSuffix = "",
): { subject: string; body: string } {
  const leadName = sanitizeForPrompt(lead.name, 80);
  const leadCompany = sanitizeForPrompt(lead.company ?? lead.category ?? "your company", 120);
  const offer = sanitizeForPrompt(userOffer, 200);
  const sign = sanitizeForPrompt(senderName, 60) || "Best regards";
  const subject = arabic ? arabicFallbackSubject(leadCompany) : pickFallbackSubject(userOffer, leadCompany);
  const body = arabic
    ? `السلام عليكم ${leadName}،\n\nأكتب إليك لأن ${offer} قد تكون مفيدة لشركة ${leadCompany}.\n\nهل لديك بضع دقائق لقراءة رسالة سريعة؟\n\nمع التحية،\n${sign}`
    : `Hi ${leadName},\n\nI'm reaching out because ${offer} may be a good fit for ${leadCompany}.\n\nWould you be open to a quick look?\n\nBest regards,\n${sign}`;
  return { subject, body };
}

/** Deterministic follow-up template (Stage 7 conserve path). Same shape as the
 *  AI follow-up: acknowledges the earlier email, no URLs, no banned words. */
function templateFollowUp(
  senderName: string,
  leadName: string,
  leadCompany: string,
  userOffer: string,
  currentStep: number,
  totalSteps: number,
  arabic: boolean,
): { subject: string; body: string } {
  const offer = sanitizeForPrompt(userOffer, 200);
  const name = sanitizeForPrompt(leadName, 80);
  const company = sanitizeForPrompt(leadCompany, 120);
  const sign = sanitizeForPrompt(senderName, 60) || "Best regards";
  const hint = currentStep >= totalSteps ? "one last" : "quick";
  const body = arabic
    ? `السلام عليكم ${name}،\n\nتواصلت معك مسبقًا بخصوص ${offer} لشركة ${company}. أردت فقط أن أُذكّرك بأهميتها إن كان ذلك مفيدًا لك.\n\nمع التحية،\n${sign}`
    : `Hi ${name},\n\nFollowing up on my earlier message about ${offer} for ${company}.\n\nThis ${hint} note is just to keep it on your radar — happy to share more if useful.\n\nBest regards,\n${sign}`;
  return { subject: "Re: Quick question", body };
}


/** Curated, boring, deliverable fallback subjects — used when AI generation
 *  produces something unusable (gibberish, repeated characters, spammy caps). */
function pickFallbackSubject(offer: string, company: string): string {
  const short = sanitizeForPrompt(String(offer || "my services"), 60).replace(/[,;:].*$/s, "").trim();
  const companyShort = sanitizeForPrompt(String(company || "your company"), 40);
  const list = [
    `Quick question about ${companyShort}`,
    `Idea for ${companyShort}`,
    short ? `Helping with ${short}` : `An idea for ${companyShort}`,
    `Reaching out to ${companyShort}`,
  ];
  return list[Math.floor(Math.random() * list.length)].slice(0, 60);
}

/** Arabic-curated fallback subjects — used when an Arabic email's subject
 *  can't be salvaged, so we never ship an English title stuck onto Arabic. */
function arabicFallbackSubject(company: string): string {
  const companyShort = sanitizeForPrompt(String(company || "شركتكم"), 40);
  const list = [
    `فكرة سريعة خاصة بـ ${companyShort}`,
    `سؤال سريع عن ${companyShort}`,
    `عرض قصير لـ ${companyShort}`,
    `تواصل حول ${companyShort}`,
  ];
  return list[Math.floor(Math.random() * list.length)].slice(0, 60);
}

/** Makes any AI-produced subject professional and deliverable: preserves all
 *  scripts (Arabic emoji-free), rejects gibberish / repeated-character runs /
 *  spammy caps, and falls back to a curated subject when it can't be salvaged. */
function sanitizeSubject(subject: string, offer = "our services", company = "your company", arabic = false): string {
  const fb = arabic ? arabicFallbackSubject(company) : pickFallbackSubject(offer, company);
  let s = String(subject ?? "").replace(/\s+/g, " ").trim();
  if (/(.)\1{2,}/.test(s)) return fb;                                        // "csssss" / "SSSS"
  const words = s.split(/\s+/).filter(Boolean);
  const wordy = words.filter((w) => /[\p{L}]{2,}/u.test(w)).length;          // letters in ANY script
  if (words.length >= 2 && wordy < 2) return fb;                             // symbol/number salad
  if (/\b[A-Z]{4,}\b/.test(s) || /[!]{2,}/.test(s) || /[$€₹£]/.test(s)) return fb;
  s = s.replace(/[^\p{L}\p{M}\p{N}_ .,!?&'@#+%:;-]/gu, "").replace(/[\uFE00-\uFE0F\u200D]/g, "").replace(/\s{2,}/g, " ").trim(); // strips emojis, keeps Arabic
  if (s.length < 4 || s === "" || !/[\p{L}]{2,}/u.test(s)) return fb;
  if (/^[A-Za-z]/.test(s) && /^[a-z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.slice(0, 60);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function wrapUrlsForTracking(html: string, trackingBase: string, signer: (url: string) => Promise<string>): Promise<string> {
  // Wrap plain-text URLs / href links in the HTML body with click-tracking redirects
  // Only wrap http/https URLs that are NOT already tracking pixels or unsubscribe links.
  const tokenRegex = /(href=["'])?(https?:\/\/(?!zvohdvopmvzsujktrdmu\.supabase\.co\/functions\/v1\/track-|.*unsubscribe)[^\s"']+)/gi;
  const matches = html.matchAll(tokenRegex);
  const jobs: Array<{ start: number; end: number; replaceWith: string }> = [];
  for (const m of Array.from(matches)) {
    const prefix = m[1] ?? "";
    const url = m[2];
    const sig = await signer(url);
    jobs.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      replaceWith: `${prefix}${trackingBase}${encodeURIComponent(url)}&s=${sig}${prefix ? '"' : ""}`,
    });
  }
  let out = "";
  let cursor = 0;
  for (const j of jobs) {
    out += html.slice(cursor, j.start) + j.replaceWith;
    cursor = j.end;
  }
  return out + html.slice(cursor);
}

function buildHtmlBody(plain: string, pixel?: string): string {
  const html = escapeHtml(plain).replace(/\n/g, "<br>");
  return `<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">${html}${pixel ?? ""}</body></html>`;
}

const ARAB_COUNTRIES = new Set([
  "SA", "AE", "EG", "KW", "QA", "BH", "OM", "JO", "LB", "IQ", "PS", "YE", "LY", "TN", "DZ", "MA", "SD", "SY",
]);

const COUNTRY_TZ: Record<string, [number, number]> = {
  US: [-8, -5], CA: [-8, -3.5], GB: [0, 0], IE: [0, 0], PT: [0, 0],
  ES: [1, 1], FR: [1, 1], BE: [1, 1], NL: [1, 1], DE: [1, 1], CH: [1, 1], AT: [1, 1], IT: [1, 1],
  SE: [1, 1], NO: [1, 1], DK: [1, 1], FI: [2, 2], PL: [1, 1], CZ: [1, 1], HU: [1, 1], RO: [2, 2], GR: [2, 2],
  TR: [3, 3], RU: [3, 3], UA: [2, 2],
  IN: [5.5, 5.5], PK: [5, 5], BD: [6, 6], LK: [5.5, 5.5], NP: [5.75, 5.75],
  CN: [8, 8], HK: [8, 8], TW: [8, 8], JP: [9, 9], KR: [9, 9], SG: [8, 8], MY: [8, 8],
  TH: [7, 7], VN: [7, 7], PH: [8, 8], ID: [7, 8],
  AU: [8, 11], NZ: [12, 13],
  BR: [-3, -2], AR: [-3, -3], CL: [-4, -4], CO: [-5, -5], MX: [-6, -6], PE: [-5, -5],
  ZA: [2, 2], NG: [1, 1], KE: [3, 3], GH: [0, 0], EG: [2, 2],
  SA: [3, 3], AE: [4, 4], KW: [3, 3], QA: [3, 3], BH: [3, 3], OM: [4, 4],
  JO: [3, 3], LB: [2, 2], IQ: [3, 3], PS: [2, 2], YE: [3, 3], LY: [2, 2], TN: [1, 1], DZ: [1, 1], MA: [1, 1], SD: [2, 2], SY: [3, 3],
  IL: [2, 2],
};

function normalizeCountry(country: string | null | undefined): string | null {
  const raw = String(country ?? "").trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_ISO[raw.toLowerCase()] ?? raw.toUpperCase().slice(0, 2);
}

function tzOffsetFor(country: string | null | undefined): number {
  const iso = normalizeCountry(country);
  if (!iso) return 0;
  return COUNTRY_TZ[iso]?.[0] ?? 0;
}

function isBusinessMorning(country: string | null | undefined): boolean {
  const hourUTC = new Date().getUTCHours();
  const local = (hourUTC + tzOffsetFor(country) + 24) % 24;
  return local >= 8 && local < 11;
}

function isArabicLead(country: string | null | undefined): boolean {
  const iso = normalizeCountry(country);
  return !!iso && ARAB_COUNTRIES.has(iso);
}

async function generateEmail(
  senderName: string,
  lead: Record<string, any>,
  userOffer: string,
  bookingLink = "",
  biContext = "",
  arabic = false,
  avoidHint = "",
  sequenceSuffix = "",
  gate?: AiCallHandle
): Promise<{ subject: string; body: string }> {
  if (gate && gate.mode !== "ai") return templateEmail(senderName, lead, userOffer, arabic, sequenceSuffix);
  const leadName = sanitizeForPrompt(lead.name, 80);
  const leadCompany = sanitizeForPrompt(lead.company ?? lead.category ?? "your company", 120);
  const leadJobTitle = sanitizeForPrompt(lead.job_title, 80);
  const lang = arabic ? `
LANGUAGE REQUIREMENT — WRITE IN ARABIC:
- Write the subject and body in fluent Modern Standard Arabic with a professional Gulf business tone.
- The subject must be FULLY IN ARABIC with no English words — a foreign brand/company name may appear in Latin inside the Arabic subject, but never write an English subject or mix English and Arabic in the same phrase.
- Keep company names and technical terms in Latin script where natural.
- The JSON keys stay "subject" and "body"; values are Arabic.` : "";
  const openerDirective = pickOpenerDirective(`${leadName}-${leadCompany}-${leadJobTitle}`);
  const promptContent = `${biContext}${buildLeadFacts(lead)}Write a short, PERSONALIZED cold email from ${sanitizeForPrompt(senderName, 60)} ("the sender") to ${leadName}, ${leadJobTitle} at ${leadCompany}.
Our offer: ${sanitizeForPrompt(userOffer)}
A booking link is added automatically AFTER your text — do NOT type any URL yourself.
${avoidHint ? `\nIMPORTANT — your previous draft scored poorly on spam analysis. ${avoidHint}\n` : ""}
${sequenceSuffix}
${openerDirective}

${COLD_EMAIL_FEWSHOTS}

Rules for subject:
- Under 50 characters. CLEAR and concrete about the outcome we deliver — a busy person should know what we do from the subject alone.
- No riddles, no curiosity-only hooks like "what if...", no vague teasers.
- No spam words, no ALL CAPS words, no emojis, no "Re:"/"Fwd:" prefixes.

Rules for body:
- 60-120 words max. Short paragraphs (1-3 sentences each).
- Open with the ATTENTION angle above, made specific using the LEAD FACTS — reference something real about them, never invent.
- Explain our offer in one clear sentence tied to THEIR pain.
- Sell plainly in this first message and end with one clear call-to-action pointing to the auto-added booking link, or a one-word reply ("yes") opening.
- Sign off with the sender's ACTUAL name, never a placeholder.
- Never use these words: free, guarantee, act now, limited time, risk-free, urgent, buy now, cheap, loan, click here, 100%, make money, congratulations, dear friend, instant.

Return ONLY a JSON object with this exact format:
{"subject":"...","body":"line1\\nline2\\nline3"}
The body must use \\n between paragraphs.${lang}`;
  const text = gate
    ? (await gate.run(promptContent, { maxTokens: 700, temperature: 0.8 })) ?? ""
    : await groqChat([{ role: "user", content: promptContent }], { maxTokens: 700, temperature: 0.8 });
  if (gate && !text.trim()) return templateEmail(senderName, lead, userOffer, arabic, sequenceSuffix); // conserve on empty AI

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed.subject && parsed.body) {
        let subj = sanitizeSubject(String(parsed.subject), userOffer, leadCompany, arabic);
        if (arabic && !containsArabic(subj)) subj = arabicFallbackSubject(leadCompany);
        return { subject: subj, body: String(parsed.body).replace(/\\n/g, "\n") };
      }
    } catch { /* fall through */ }
  }
  const lines = text.split("\n").filter(Boolean);
  let subj = sanitizeSubject(lines[0] ?? "Quick question", userOffer, leadCompany, arabic);
  if (arabic && !containsArabic(subj)) subj = arabicFallbackSubject(leadCompany);
  return { subject: subj, body: lines.slice(1).join("\n") || text };
}

function localSpamScore(subject: string, body: string): { score: number; hint: string } {
  let s = 100;
  const hints: string[] = [];
  const subjLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const capsWords = subject.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (capsWords.length > 0) { s -= Math.min(20, capsWords.length * 8); hints.push("Do not use ANY all-caps words in the subject."); }
  if (/!{2,}|\$/.test(subject)) { s -= 12; hints.push("Remove \"!!!\" or \"$\" from the subject."); }
  if (subjLower.length > 60) { s -= 8; hints.push("Subject must be under 50 characters."); }
  if (/^(re:|fwd:)/.test(subjLower)) { s -= 15; hints.push("Never start the subject with \"Re:\" or \"Fwd:\"."); }
  const triggers = ["free", "guarantee", "act now", "limited time", "risk-free", "urgent", "buy now",
    "cheap", "loan", "click here", "100%", "make money", "congratulations", "dear friend", "instant"];
  const found = triggers.filter((w) => bodyLower.includes(w));
  if (found.length > 0) { s -= Math.min(25, found.length * 7); hints.push(`Never use these words in the body: ${found.join(", ")}.`); }
  if (/^dear (sir|madam|friend)/im.test(body)) { s -= 8; hints.push("Greet by first name only — never \"Dear Sir/Madam\"."); }
  if (/\[your name\]|\[name\]/i.test(body)) { s -= 30; hints.push("Sign off with the sender's REAL name — placeholders are forbidden."); }
  const links = (body.match(/https?:\/\//g) ?? []).length;
  if (links > 3) { s -= (links - 3) * 6; hints.push("Use at most 1-2 links in a cold email."); }
  return { score: Math.max(0, Math.min(100, s)), hint: hints.join(" ") };
}

const abCache = new Map<string, { subs: string[]; at: number }>();
async function getAltSubjects(campaignId: string, offer: string, biContext = "", gate?: AiCallHandle): Promise<string[]> {
  const hit = abCache.get(campaignId);
  if (hit && Date.now() - hit.at < 600_000) return hit.subs;
  let subs: string[] = [];
  if (!gate || gate.mode === "ai") {
    const promptContent = `${biContext}Our cold outreach offer: ${sanitizeForPrompt(offer, 300)}
Write 5 alternative email subject lines for this offer. Rules: max 8 words each, CLEAR and concrete about what we deliver — a busy person should understand the offer from the subject alone. No riddles, no vague curiosity hooks. Never spammy, no ALL CAPS, no emojis. Return one per line, no numbering.`;
    try {
      const altText = gate
        ? (await gate.run(promptContent, { maxTokens: 200, temperature: 0.9 })) ?? ""
        : await groqChat([{ role: "user", content: promptContent }], { maxTokens: 200, temperature: 0.9 });
      subs = altText.split("\n").map((l: string) => l.replace(/^[\d.\-\s"']+/, "").trim()).filter(Boolean).slice(0, 5)
        .map((l: string) => sanitizeSubject(l, offer));
    } catch (_e) { /* variant B falls back to A */ }
  }
  abCache.set(campaignId, { subs, at: Date.now() });
  return subs;
}

// Per-invocation next_sequence_hint cache (mirrors styleCache in inbox-agent:
// read once per campaign per invocation, never across invocations). Missing/
// stale/kill-switched => null => prompts stay byte-identical to today.
// note: CONSUMER BUILT, PRODUCER DEFERRED — learning-loop never populates the
// key, so this is always null in production (see AUDIT-FOLLOWUP.md).
const sequenceHintCache = new Map<string, CampaignHint | null>();
async function sequenceHintFor(db: ReturnType<typeof createClient<any>>, campaignId: string): Promise<CampaignHint | null> {
  if (!campaignId) return null;
  if (!sequenceHintCache.has(campaignId)) {
    try {
      sequenceHintCache.set(campaignId, await getNextSequenceHint(db, campaignId));
    } catch {
      sequenceHintCache.set(campaignId, null);
    }
  }
  return sequenceHintCache.get(campaignId)!;
}

type QueueJob = {
  id: string;
  user_id: string;
  campaign_id: string;
  lead_id: string;
  variant: string | null;
  attempts: number;
};

interface UserCtx {
  profile: Record<string, any>;
  dailyCap: number;
  today: string;
  sentToday: number;
  exhausted: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" && new URL(req.url).searchParams.has("health")) {
    return json({ ok: true, service: "send-worker" });
  }

  const secret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
  const isService = !!serviceKey && auth === `Bearer ${serviceKey}`;
  if (!isCron && !isService) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);

  // Dry-run (service-role OR cron-secret only — this project deploys with
  // verify_jwt=false and the service key is not recoverable, so the cron secret
  // is the only injected credential): PASS 1 executes the full decision pipeline
  // but performs NO sends and NO writes — evaluation without touching the wire or
  // production rows. `x-followup-only` additionally scopes it to specific leads
  // (also credential-gated; ignored unless dry).
  const dry = (isService || isCron) &&
    (req.headers.get("x-followup-dry-run") === "1" || new URL(req.url).searchParams.get("dry") === "1");
  const onlyIds = dry
    ? (req.headers.get("x-followup-only") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  // Run-marker: unconditional proof this invocation EXECUTED (health-check's
  // cron probe judges freshness on this, never on dispatch 'succeeded' alone).
  if (!dry) {
    try {
      await insertAudit(supabase as any, {
        user_id: null,
        event: "send.worker.run",
        payload: { at: new Date().toISOString() },
      });
    } catch { /* marker is best-effort; the send pipeline is authoritative */ }
  }

  const startedAt = Date.now();

  // FOLLOW-UP AI CONTEXT (must be before try block to avoid TDZ)
  const FOLLOWUP_COPY_CONTEXT = [
    "You are writing a follow-up email in an ongoing cold outreach campaign.",
    "This is NOT the first email — the lead has received previous emails from the sender.",
    "Write a SHORT, natural follow-up (30-80 words). Keep it conversational and respectful.",
    "Do NOT repeat the original email. Reference that you reached out before.",
    "Do NOT invent websites, booking links, products, prices, or company facts.",
    "If a website/booking link is provided, you may mention it once naturally.",
    "Do NOT use spam words. Do NOT use ALL CAPS. Do NOT use emojis.",
    "Sign off with the sender's real name — never a placeholder.",
  ].join("\n");

  try {
    // ---------------- PASS 1: due FOLLOW-UPS (re-checked, never blind) ----------
    const fuStats = await processDueFollowUps(supabase, dry, onlyIds);
    if (dry) {
      return json({ dry: true, at: new Date().toISOString(), ...fuStats, dryDecisions: fuStats.dryDecisions ?? [] });
    }

    // ---------------- PASS 2: claimed queue jobs --------------------------------
    let sent = 0, failed = 0, retried = 0, dead = 0;
    const ctxs = new Map<string, UserCtx>();

    while (Date.now() - startedAt < RUNTIME_MS) {
      const { data: jobs, error: claimErr } = await supabase.rpc("claim_queue_jobs_v2", { p_limit: 3, p_lease_minutes: 10 });
      if (claimErr || !jobs || jobs.length === 0) break;

      for (const job of jobs as QueueJob[]) {
        let slotHeld = false;
        try {
          // Advisory lead-score read (Stage 5): behind the agent_config kill-switch,
          // stale/missing => null => logged as such. Purely observational here —
          // priority shaping of the queue ORDER happens at enqueue (send-campaign)
          // and at claim (claim_queue_jobs_v2); volume stays owned by sender_health.
          const leadScore = await getLeadScore(supabase, { userId: job.user_id, campaignId: job.campaign_id, leadId: job.lead_id });
          await insertAudit(supabase, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: job.lead_id, event: "email.claimed", payload: { job_id: job.id, attempt: job.attempts, ...(leadScore ? { lead_score: leadScore.score, lead_tier: leadScore.tier, lead_score_version: leadScore.score_version, lead_score_at: leadScore.computed_at } : { lead_score: null }) } });
          let ctx = ctxs.get(job.user_id);
          if (!ctx) {
            const fresh = await getUserCtx(supabase, job.user_id).catch(() => null);
            if (!fresh) { await failJob(supabase, job, "sender_unavailable", MAX_ATTEMPTS); failed++; continue; }
            ctx = fresh; ctxs.set(job.user_id, ctx);
          }
          if (ctx.exhausted) {
            await supabase.from("send_queue").update({
              status: "pending", lease_until: null,
              next_retry_at: new Date(Date.now() + 3600_000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            retried++;
            continue;
          }

          // ATOMIC daily-cap reservation — no read/then/write race across workers.
          const { data: reserved } = await supabase.rpc("reserve_send_slot", { p_user: job.user_id, p_cap: ctx.dailyCap });
          if (!reserved) {
            ctx!.exhausted = true;
            await supabase.from("send_queue").update({
              status: "pending", lease_until: null,
              next_retry_at: new Date(Date.now() + 3600_000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            retried++;
            continue;
          }
          slotHeld = true;

          const ok = await processJob(supabase, job, ctx!, startedAt);
          if (ok) { sent++; ctx!.sentToday++; }
          else {
            // Send didn't happen — give the reserved slot back.
            try { await supabase.rpc("release_send_slot", { p_user: job.user_id }); } catch (_e) { /* best effort */ }
            failed++;
          }
          await new Promise((r) => setTimeout(r, DELAY_MS));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Release the reserved daily slot even on throw (prevent cap inflation).
          if (slotHeld) { try { await supabase.rpc("release_send_slot", { p_user: job.user_id }); } catch (_e) { /* best effort */ } }
          const d = await failJob(supabase, job, msg, MAX_ATTEMPTS);
          if (d === "dead") dead++; else retried++;
          failed++;
        }
        if (Date.now() - startedAt > RUNTIME_MS) break;
      }
    }

    // usage_limits mirror only — profiles counters are owned by reserve_send_slot RPC.
    for (const [uid, ctx] of ctxs) {
      if (ctx.sentToday > 0) {
        try {
          await supabase.from("usage_limits").upsert({ user_id: uid, emails_sent_today: ctx.sentToday, limit_date: ctx.today, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        } catch (_e) { /* mirror only */ }
      }
    }

    return json({ ok: true, sent, failed, retried, dead, ...fuStats });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  // ------------------------------------------------------------------
  async function getUserCtx(db: ReturnType<typeof createClient<any>>, uid: string): Promise<UserCtx | null> {
    const { data: profile } = await db.from("profiles").select("*").eq("id", uid).single();
    if (!profile) return null;
    const limits = PLAN_LIMITS[effectivePlan(profile)] ?? PLAN_LIMITS.starter;
    const ceil = profile.gmail_account_type === "workspace" ? 2000 : 500;
    const dailyCap = await resolveDailyCap(db, profile, limits.dailyEmails, ceil);
    const today = new Date().toISOString().split("T")[0];
    return {
      profile,
      dailyCap,
      today,
      sentToday: profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0,
      exhausted: false,
    };
  }

  /** Deterministic failure handling: exponential backoff → dead-letter. */
  async function failJob(db: ReturnType<typeof createClient<any>>, job: QueueJob, errMsg: string, maxAttempts: number): Promise<"retry" | "dead"> {
    const attempts = (job.attempts ?? 1);
    const isDead = attempts >= maxAttempts;
    const backoffMs = Math.min(60 * 60000, Math.pow(2, attempts) * 5 * 60000);
    await db.from("send_queue").update({
      status: isDead ? "dead" : "failed",
      last_error: errMsg.slice(0, 300),
      lease_until: null,
      next_retry_at: isDead ? null : new Date(Date.now() + backoffMs).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    await insertAudit(db, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: job.lead_id, event: "email.failed", payload: { job_id: job.id, error: errMsg.slice(0, 200), attempt: attempts, dead: isDead } });
    return isDead ? "dead" : "retry";
  }

  /** THE 13-point eligibility gate. Returns null when eligible, else reason. */
  async function eligibilityBlock(db: ReturnType<typeof createClient<any>>, job: QueueJob, profile: Record<string, any>): Promise<string | null> {
    const { data: campaign } = await db.from("campaigns").select("id,status,autopilot").eq("id", job.campaign_id).maybeSingle();
    if (!campaign) return "campaign_missing";
    if (campaign.status !== "active") return "campaign_not_active";                       // 3
    const { data: lead } = await db.from("leads").select("*").eq("id", job.lead_id).maybeSingle();
    if (!lead) return "lead_missing";                                                     // 4
    if (lead.status === "suppressed" || lead.lifecycle === "SUPPRESSED") return "lead_suppressed"; // 7
    if (lead.unsubscribed || lead.status === "unsubscribed" || lead.lifecycle === "UNSUBSCRIBED") return "lead_unsubscribed"; // 6
    if (lead.status === "bounced" || lead.lifecycle === "BOUNCED") return "lead_bounced";  // 7b
    if ((lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN") return "human_takeover";           // 8
    const { data: sup } = await db.from("suppressions").select("id")
      .eq("user_id", job.user_id).ilike("email", lead.email).limit(1).maybeSingle();
    if (sup) return "lead_suppressed_db";                                                  // 5/7 (DB truth)
    const limits = PLAN_LIMITS[effectivePlan(profile)] ?? PLAN_LIMITS.starter;
    const cap = await resolveDailyCap(db, profile as CapProfile, limits.dailyEmails, profile.gmail_account_type === "workspace" ? 2000 : 500);
    const today = new Date().toISOString().split("T")[0];
    const used = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
    if (used >= cap) return "daily_limit";                                                 // 9/10
    return null;
  }

  async function processJob(db: ReturnType<typeof createClient<any>>, job: QueueJob, ctx: UserCtx, _start: number): Promise<boolean> {
    const blockReason = await eligibilityBlock(db, job, ctx.profile);
    if (blockReason) {
      await db.from("send_queue").update({ status: "cancelled", last_error: blockReason, lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      await insertAudit(db, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: job.lead_id, event: "email.cancelled", payload: { reason: blockReason } });
      return false;
    }

    const { data: lead } = await db.from("leads").select("*").eq("id", job.lead_id).single();
    if (!lead) return false;

    // Idempotency: never double-send a first touch
    const { data: prior } = await db.from("emails_sent").select("id")
      .eq("campaign_id", job.campaign_id).eq("lead_id", lead.id).eq("sequence", 1).limit(1).maybeSingle();
    if (prior) {
      await db.from("send_queue").update({ status: "sent", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      return true;
    }

    // Domain syntax + MX pre-check (pre-check only — bounces handled separately)
    const domain = String(lead.email ?? "").split("@")[1]?.toLowerCase().trim();
    if (!domain || !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(lead.email)) {
      await db.from("leads").update({ status: "invalid" }).eq("id", lead.id);
      await db.from("send_queue").update({ status: "cancelled", last_error: "invalid_email", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      return false;
    }
    try {
      const mx = await Deno.resolveDns(domain, "MX");
      if (!Array.isArray(mx) || mx.length === 0) throw new Error("no_mx");
    } catch {
      await db.from("leads").update({ status: "invalid" }).eq("id", lead.id);
      await db.from("send_queue").update({ status: "cancelled", last_error: "mx_fail", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      return false;
    }

    const biCtx = buildBIContext(ctx.profile);

    // Stage 6: campaign-tracked next-step advice (36h fresh, kill-switch gated).
    // Advisory-only: null => prompts byte-identical to today. Applied => the
    // email.sent audit carries the campaign_learning strategy_ref + model_version.
    const seqHint = await sequenceHintFor(db, job.campaign_id);
    const seqSuffix = seqHint ? sequenceHintSuffix(seqHint.hint) : "";

    let variant = job.variant;

    // Stage 7: AI-cost gate. mode !== 'ai' => the whole send degenerates to the
    // deterministic template (no LLM, no ledger, no debit). mode === 'ai' => the
    // gate reserves the durable counter; the meter settles actual-after.
    const aiGate = await openAiCall(supabase, {
      userId: job.user_id, campaignId: job.campaign_id, leadId: lead.id,
      kind: "gen_email", plan: effectivePlan(ctx.profile), fn: "send-worker", groqChat,
    }, 700);
    if (variant === "B") {
      const subs = aiGate.mode === "ai"
        ? await getAltSubjects(job.campaign_id, String(ctx.profile.offer ?? "our services"), biCtx, aiGate)
        : [];
      if (subs.length === 0) variant = null;
    }

    const destLink = String(ctx.profile.website_url || ctx.profile.booking_link || "");
    const leadLang = detectLeadLanguage(lead, ctx.profile);
    let gen = aiGate.mode === "ai"
      ? await generateEmail(
          String(ctx.profile.name ?? "Best regards"),
          lead,
          String(ctx.profile.offer ?? "our service"),
          destLink,
          biCtx,
          leadLang === "ar",
          "",
          seqSuffix,
          aiGate
        )
      : templateEmail(String(ctx.profile.name ?? "Best regards"), lead, String(ctx.profile.offer ?? "our service"), leadLang === "ar", seqSuffix);
    if (variant === "B") {
      const subs = aiGate.mode === "ai" ? (abCache.get(job.campaign_id)?.subs ?? []) : [];
      if (subs.length > 0) gen.subject = subs[Math.floor(Math.random() * subs.length)];
    }
    let check = localSpamScore(gen.subject, gen.body);
    if (check.score < 60 && check.hint && aiGate.mode === "ai") {
      try {
        const retry = await generateEmail(String(ctx.profile.name ?? ""), lead, String(ctx.profile.offer ?? "our service"), destLink, biCtx, leadLang === "ar", check.hint, seqSuffix, aiGate);
        if (localSpamScore(retry.subject, retry.body).score > check.score) gen = retry;
      } catch { /* keep original */ }
    }

    const destLink2 = String(ctx.profile.website_url || ctx.profile.booking_link || "");
    const bodyText = `${gen.body}${destLink2 ? (ctx.profile.website_url ? `\n\n🔗 See how it works & get started: ${destLink2}` : `\n\n📅 Want details or a quick demo? Book a time that suits you: ${destLink2}`) : ""}${ctx.profile.signature ? `\n\n${sanitizeForPrompt(ctx.profile.signature, 400)}` : ""}

PS: I use an AI assistant (OutshipAi) to help manage my outreach — this note was drafted with its help.
Reply UNSUBSCRIBE anytime to opt out.${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

    // Generate tracking ID BEFORE send so we can reference it in the pixel.
    const trackingId = crypto.randomUUID();
    const pixel = `<img src="https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-open?id=${trackingId}" width="1" height="1" alt="" style="display:none;border:0" />`;
    const unsubToken = await signToken(lead.id);
    const unsubUrl = `${SITE}/unsubscribe?l=${lead.id}&c=${job.campaign_id}&t=${unsubToken}`;

    // Wrap outbound links in the HTML body with click-tracking redirects
    const trackingBase = `https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-click?id=${trackingId}&url=`;

    // TWO-PHASE INSERT: pending row acts as distributed lock against lease-expiry races.
    // Phase 1: Insert PENDING row (unique constraint prevents concurrent worker from sending).
    const { error: pendingErr } = await db
      .from("emails_sent")
      .insert({
        id: trackingId,
        user_id: job.user_id,
        lead_id: lead.id,
        campaign_id: job.campaign_id,
        subject: gen.subject,
        body: "(pending)",
        variant,
        sequence: 1,
        follow_up_sent: false,
      });
    if (pendingErr) {
      // Unique constraint violation → another worker already has this job.
      // Mark our queue job as sent (idempotent — the other worker is handling it).
      if (String(pendingErr.message ?? "").includes("duplicate key")) {
        await db.from("send_queue").update({ status: "sent", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
        return true;
      }
      throw new Error(`pending_insert_failed:${pendingErr.message?.slice(0, 120)}`);
    }

    // Phase 2: Send via Gmail.
    let ids: { id: string | null; threadId: string | null };
    try {
      const htmlBody = buildHtmlBody(bodyText, pixel);
      const trackedHtml = destLink2 ? await wrapUrlsForTracking(htmlBody, trackingBase, async (u) => signToken(`${trackingId}|${u}`)) : htmlBody;
      const res = await sendEmail({
        to: lead.email,
        subject: gen.subject,
        text: bodyText,
        html: trackedHtml,
        replyTo: inboundReplyTo(lead.id) ?? (ctx.profile.gmail_email ? String(ctx.profile.gmail_email) : undefined),
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      ids = { id: res.id, threadId: null };
    } catch (sendErr) {
      // Send failed — DELETE pending row so retry can try again cleanly.
      await db.from("emails_sent").delete().eq("id", trackingId);
      throw sendErr;
    }

    // Phase 3: Confirm — update pending row with Gmail IDs + real body.
    await db.from("emails_sent").update({
      body: bodyText,
      gmail_message_id: ids.id,
      gmail_thread_id: ids.threadId,
    }).eq("id", trackingId);
    await db.from("send_queue").update({ status: "sent", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    await db.from("leads").update({
      status: "emailed",
      lifecycle: "CONTACTED",
      normalized_email: String(lead.email).toLowerCase(),
    }).eq("id", lead.id);

    // Initialize follow-up tracking on the lead (sets followup_step, followup_status, next_followup_at)
    // Skip if follow-ups are disabled for this campaign
    const { data: campCheck } = await db.from("campaigns").select("followups_enabled").eq("id", job.campaign_id).maybeSingle();
    if (campCheck?.followups_enabled !== false) {
      const { error: fuInitErr } = await db.rpc("init_lead_followup", {
        p_lead_id: lead.id,
        p_campaign_id: job.campaign_id,
        p_initial_send_at: new Date().toISOString(),
      });
      if (fuInitErr) {
        console.error("[send-worker] Failed to init follow-up tracking:", fuInitErr.message);
      }
    }

    ctx.sentToday++;
    await insertAudit(db, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: lead.id, event: "email.sent", payload: { email_id: trackingId, gmail_message_id: ids.id, thread_id: ids.threadId, variant, subject: gen.subject.slice(0, 80), followup_initialized: campCheck?.followups_enabled !== false }, ...(seqHint ? { model_version: "campaign_learning/v1", strategy_ref: strategyRef(job.campaign_id, seqHint.version) } : {}) });
    return true;
  }

  // ------------------------------------------------------------------
  // FOLLOW-UP ENGINE v2: lead-centric, AI-generated, DB-driven.
  // Queries leads.next_followup_at instead of emails_sent sentinels.
  // Every follow-up is re-checked, never blind.
  // ------------------------------------------------------------------

  async function generateFollowUp(
    senderName: string,
    leadName: string,
    leadCompany: string,
    leadJobTitle: string,
    userOffer: string,
    previousEmails: string[],
    currentStep: number,
    totalSteps: number,
    bookingLink = "",
    biContext = "",
    arabic = false,
    openerDirective = "",
    leadFacts = "",
    sequenceSuffix = "",
    gate?: AiCallHandle
  ): Promise<{ subject: string; body: string }> {
    if (gate && gate.mode !== "ai") return templateFollowUp(senderName, leadName, leadCompany, userOffer, currentStep, totalSteps, arabic);
    const history = previousEmails.map((e, i) => `Email ${i + 1}:\n${e}`).join("\n\n");
    const arc = followUpArc(currentStep, totalSteps);
    const promptContent = `${biContext}${leadFacts}${FOLLOWUP_COPY_CONTEXT}

Write follow-up email #${currentStep} of ${totalSteps} to ${sanitizeForPrompt(leadName, 80)}, ${sanitizeForPrompt(leadJobTitle, 80)} at ${sanitizeForPrompt(leadCompany, 120)}.
Our offer: ${sanitizeForPrompt(userOffer, 300)}
Sender name: ${sanitizeForPrompt(senderName, 60)} — sign off with their actual name.

Previous emails sent to this lead (for context — do NOT repeat their openers, phrasing, asks, links or answers):
${history || "(no previous emails available)"}

${arc}

${sequenceSuffix}

${openerDirective ? `\n${openerDirective}\n` : ""}
${bookingLink ? `A booking link exists: ${sanitizeForPrompt(bookingLink, 200)}. Mention it at most ONCE total across the whole thread — if a previous email already shared it, do NOT paste it again.` : "No booking link is configured. Do NOT invent one."}

Rules:
- Subject: Keep the SAME subject as the previous email (or a slight variation). Do NOT create a new subject.
- Body: 30-80 words. Natural, conversational. Acknowledge you've reached out before.
- Follow the ARC PHASE above exactly — every step must feel like a different, thoughtful touch, never a re-send dressed up.
- Return ONLY a JSON object: {"subject":"...","body":"line1\\nline2"}
The body must use \\n between paragraphs.${arabic ? "\n\nLANGUAGE REQUIREMENT — WRITE IN ARABIC with professional Gulf business tone. Keep company names in Latin script." : ""}`;
    const text = gate
      ? (await gate.run(promptContent, { maxTokens: 500, temperature: 0.85 })) ?? ""
      : await groqChat([{ role: "user", content: promptContent }], { maxTokens: 500, temperature: 0.85 });
    if (gate && !text.trim()) return templateFollowUp(senderName, leadName, leadCompany, userOffer, currentStep, totalSteps, arabic); // conserve on empty AI

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (parsed.subject && parsed.body) {
          return { subject: String(parsed.subject), body: String(parsed.body).replace(/\\n/g, "\n") };
        }
      } catch { /* fall through */ }
    }
    const lines = text.split("\n").filter(Boolean);
    return { subject: sanitizeSubject(lines[0] ?? "Follow-up", userOffer, leadCompany), body: lines.slice(1).join("\n") || text };
  }

  async function processDueFollowUps(
    db: ReturnType<typeof createClient<any>>,
    dry = false,
    onlyIds: string[] | null = null,
  ): Promise<{ followupsSent: number; followupsCancelled: number; dryDecisions?: Array<Record<string, unknown>> }> {
    let followupsSent = 0, followupsCancelled = 0;
    const dryDecisions: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();

    // Reclaim stranded 'sending' leads (worker crashed mid-flight after the CAS claim).
    // A healthy send completes in seconds, so anything stuck >30 min is abandoned.
    // (Dry-run performs no writes.)
    if (!dry) {
      try { await db.from("leads").update({ followup_status: "active" })
        .eq("followup_status", "sending")
        .lt("next_followup_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .select("id"); } catch (_e) { /* best effort */ }
    }

    // Query leads directly — much simpler and more efficient than scanning emails_sent sentinels
    let q = db
      .from("leads")
      .select("*, campaign:campaigns(id, name, status, followups_enabled, user_id)")
      .eq("followup_status", "active")
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", now);
    if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
    const { data: dueLeads } = await q.limit(30);
    if (!dueLeads || dueLeads.length === 0) {
      return dry ? { followupsSent, followupsCancelled, dryDecisions } : { followupsSent, followupsCancelled };
    }

    // Batch-fetch profiles
    const userIds = [...new Set(dueLeads.map((l) => l.campaign?.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("*").in("id", userIds)
      : { data: [] };
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    // Batch-fetch follow-up sequences
    const campIds = [...new Set(dueLeads.map((l) => l.campaign?.id).filter(Boolean))];
    const { data: seqRows } = campIds.length
      ? await db.from("follow_up_sequences").select("campaign_id, step_number, delay_days").in("campaign_id", campIds).eq("active", true)
      : { data: [] };
    const seqByCampaign = new Map<string, Array<{ step: number; delayDays: number }>>();
    for (const r of seqRows ?? []) {
      const arr = seqByCampaign.get(r.campaign_id) ?? [];
      arr.push({ step: r.step_number, delayDays: r.delay_days });
      seqByCampaign.set(r.campaign_id, arr);
    }

    for (const lead of dueLeads) {
      // Runtime ceiling (PASS 2 parity): stop once the shared invocation budget is
      // spent. Unprocessed leads stay 'active' with a past next_followup_at and
      // roll to the next worker run.
      if (Date.now() - startedAt >= RUNTIME_MS) break;
      try {
        const campaign = Array.isArray(lead.campaign) ? lead.campaign[0] : lead.campaign;
        if (!campaign) { followupsCancelled++; continue; }
        const profile = profileMap[campaign.user_id];
        if (!profile || !lead.email) { followupsCancelled++; continue; }

        // ── SAFETY RE-CHECK: every blocking condition ──
        const reasons: string[] = [];
        if (lead.unsubscribed || ["unsubscribed", "bounced", "suppressed"].includes(lead.status)) reasons.push("lead_state");
        if (["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(lead.lifecycle ?? "")) reasons.push("lifecycle");
        if ((lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN") reasons.push("human_takeover");
        if (campaign.status !== "active") reasons.push("campaign_inactive");
        if (!campaign.followups_enabled) reasons.push("followups_disabled");

        // Check DB suppressions
        const { data: sup } = await db.from("suppressions").select("id")
          .eq("user_id", campaign.user_id).ilike("email", lead.email).limit(1).maybeSingle();
        if (sup) reasons.push("suppression_list");

        // Check if lead has replied since scheduling (belt-and-suspenders with trigger)
        const { data: repliedCheck } = await db.from("emails_sent").select("id")
          .eq("lead_id", lead.id).eq("campaign_id", campaign.id).eq("replied", true).limit(1).maybeSingle();
        if (repliedCheck) reasons.push("already_replied");

        if (reasons.length > 0) {
          if (dry) {
            dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "cancel", step: (lead.followup_step ?? 0) + 1, reason: reasons.join(",") });
          } else {
            await db.rpc("cancel_lead_followup", { p_lead_id: lead.id, p_reason: "cancelled" });
            await insertAudit(db, { user_id: campaign.user_id, campaign_id: campaign.id, lead_id: lead.id, event: "followup.cancelled", payload: { reasons, step: lead.followup_step } });
          }
          followupsCancelled++;
          continue;
        }

        // ── DETERMINE NEXT STEP ──
        const currentStep = lead.followup_step ?? 0;
        const nextStep = currentStep + 1;
        if (nextStep > 14) {
          if (dry) dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "cancel", reason: "completed" });
          else await db.rpc("cancel_lead_followup", { p_lead_id: lead.id, p_reason: "completed" });
          continue;
        }

        // Check sequence definition exists
        const campSeq = seqByCampaign.get(campaign.id) ?? [];
        const nextSeqDef = campSeq.find((s) => s.step === nextStep);
        if (!nextSeqDef) {
          if (dry) dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "cancel", reason: "completed_no_sequence" });
          else await db.rpc("cancel_lead_followup", { p_lead_id: lead.id, p_reason: "completed" });
          continue;
        }

        // ── IDEMPOTENCY: skip if next step already recorded ──
        const { data: existingStep } = await db.from("emails_sent")
          .select("id").eq("campaign_id", campaign.id).eq("lead_id", lead.id).eq("sequence", nextStep).limit(1).maybeSingle();
        if (existingStep) {
          // Already sent — advance the lead to the next step
          if (dry) dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "already_sent", step: nextStep });
          else await db.rpc("advance_lead_followup", { p_lead_id: lead.id, p_campaign_id: campaign.id, p_current_step: nextStep });
          continue;
        }

        // ── ATOMIC CLAIM: CAS update followup_status from 'active' to 'sending' ──
        // This prevents concurrent workers from double-sending. (Dry-run treats
        // the lead as claimed without mutating it.)
        const { data: claimed } = dry
          ? { data: { id: String(lead.id) } }
          : await db.from("leads")
            .update({ followup_status: "sending" }, { count: "exact" })
            .eq("id", lead.id)
            .eq("followup_status", "active")
            .select("id")
            .maybeSingle();
        if (!claimed) continue;

        // ── DAILY CAP CHECK ──
        const limits = PLAN_LIMITS[effectivePlan(profile)] ?? PLAN_LIMITS.starter;
        const baseCap = profile.gmail_account_type === "workspace" ? 2000 : 500;
        const cap = await resolveDailyCap(db, profile, limits.dailyEmails, baseCap);
        const reserved = dry ? true : (await db.rpc("reserve_send_slot", { p_user: campaign.user_id, p_cap: cap })).data;
        if (!reserved) {
          // Defer 1 hour — restore to 'active' so next worker picks it up
          if (dry) dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "deferred_1h", step: nextStep });
          else {
            const nextHour = new Date(Date.now() + 3600_000).toISOString();
            await db.from("leads").update({ followup_status: "active", next_followup_at: nextHour }).eq("id", lead.id);
          }
          continue;
        }

        // ── GATHER CONTEXT FOR AI ──
        const biCtx = buildBIContext(profile);
        const firstName = (lead.name ?? "there").split(" ")[0];

        // Fetch previous emails for this lead+campaign (for AI context)
        const { data: prevEmails } = await db.from("emails_sent")
          .select("subject, body, sequence")
          .eq("campaign_id", campaign.id).eq("lead_id", lead.id)
          .order("sequence", { ascending: true })
          .limit(10);
        const previousBodies = (prevEmails ?? [])
          .filter((e) => e.body && !e.body.startsWith("(scheduled") && !e.body.startsWith("(pending"))
          .map((e) => `Subject: ${e.subject}\n${e.body}`);

        // ── AI GENERATE FOLLOW-UP ──
        const destLink = String(profile.website_url || profile.booking_link || "");
        const leadLang = detectLeadLanguage(lead, profile);
        const fuOpener = pickOpenerDirective(`${String(lead.name ?? "there")}-${String(lead.company ?? "")}-step${nextStep}`);
        const fuSeqHint = await sequenceHintFor(db, campaign.id);
        const fuSeqSuffix = fuSeqHint ? sequenceHintSuffix(fuSeqHint.hint) : "";
        const fuGate = dry
          ? null
          : await openAiCall(db, {
              userId: campaign.user_id, campaignId: campaign.id, leadId: lead.id,
              kind: "gen_followup", plan: effectivePlan(profile), fn: "send-worker", groqChat,
            }, 500);
        const gen: { subject: string; body: string } = dry
          ? { subject: `Re: dry-run step ${nextStep}`, body: "(dry-run placeholder)" }
          : (fuGate!.mode === "ai"
              ? await generateFollowUp(
                  String(profile.name ?? "Best regards"),
                  lead.name ?? "there",
                  lead.company ?? "your company",
                  lead.job_title ?? "professional",
                  String(profile.offer ?? "our service"),
                  previousBodies,
                  nextStep,
                  14,
                  destLink,
                  biCtx,
                  leadLang === "ar",
                  fuOpener,
                  buildLeadFacts(lead),
                  fuSeqSuffix,
                  fuGate ?? undefined,
                )
              : templateFollowUp(
                  String(profile.name ?? "Best regards"),
                  lead.name ?? "there",
                  lead.company ?? "your company",
                  String(profile.offer ?? "our service"),
                  nextStep,
                  14,
                  leadLang === "ar",
                ));

        // Spam check
        let check = localSpamScore(gen.subject, gen.body);
        if (!dry && check.score < 60 && check.hint && fuGate!.mode === "ai") {
          try {
            const retry = await generateFollowUp(
              String(profile.name ?? "Best regards"),
              lead.name ?? "there",
              lead.company ?? "your company",
              lead.job_title ?? "professional",
              String(profile.offer ?? "our service"),
              previousBodies,
              nextStep,
              14,
              destLink,
              biCtx,
              leadLang === "ar",
              fuOpener,
              buildLeadFacts(lead),
              fuSeqSuffix,
              fuGate!,
            );
            if (localSpamScore(retry.subject, retry.body).score > check.score) {
              Object.assign(gen, retry);
            }
          } catch { /* keep original */ }
        }

        // Build final body with footer
        const footer = `--

⚡ Still automated — my AI agent sent this follow-up too.
Get your own AI outreach agent → ${SITE}

Reply with UNSUBSCRIBE to opt out.${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

        const bodyText = `${gen.body}${footer}`;
        const originalSubject = (prevEmails ?? []).find((e) => e.sequence === 1)?.subject;
        const followBase = sanitizeSubject(originalSubject || gen.subject, String(profile.offer ?? "our services"), lead.company ?? "your company");
        const subject = followBase.toLowerCase().startsWith("re:") ? followBase : `Re: ${followBase}`;
        const unsubToken = await signToken(lead.id);
        const unsubUrl = `${SITE}/unsubscribe?l=${lead.id}&c=${campaign.id}&t=${unsubToken}`;

        // Tracking pixel + click tracking
        const trackingId = crypto.randomUUID();
        const pixel = `<img src="https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-open?id=${trackingId}" width="1" height="1" alt="" style="display:none;border:0" />`;
        const trackingBase = `https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-click?id=${trackingId}&url=`;

        const htmlBody = buildHtmlBody(bodyText, pixel);
        const trackedHtml = destLink ? await wrapUrlsForTracking(htmlBody, trackingBase, async (u) => signToken(`${trackingId}|${u}`)) : htmlBody;

        // ── PRE-SEND EMITTED-STATE RE-CHECK ──
        // Closes the mid-flight reply window: a reply or unsubscribe that lands
        // between the safety re-check above and the wire send (content generation
        // takes seconds) must abort here, never ship. With the reply-cancel trigger
        // now firing on the 'sending' claim state too, a scanned reply flips
        // followup_status to 'cancelled' — read back here as the claim no longer
        // holding.
        const { data: freshState } = await db.from("leads")
          .select("unsubscribed, status, lifecycle, conv_mode, followup_status")
          .eq("id", lead.id)
          .maybeSingle();
        const claimHolds = dry ? true : freshState?.followup_status === "sending";
        const { data: freshReplied } = await db.from("emails_sent")
          .select("id").eq("lead_id", lead.id).eq("campaign_id", campaign.id).eq("replied", true).limit(1).maybeSingle();
        const { data: freshSuppressed } = await db.from("suppressions")
          .select("id").eq("user_id", campaign.user_id).ilike("email", lead.email).limit(1).maybeSingle();
        const blocked = !freshState
          || !claimHolds
          || freshReplied
          || freshSuppressed
          || freshState.unsubscribed
          || ["unsubscribed", "bounced", "suppressed"].includes(freshState.status)
          || ["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(freshState.lifecycle ?? "")
          || (freshState.conv_mode ?? "AI_AUTOPILOT") === "HUMAN";
        if (blocked) {
          if (dry) {
            dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "cancel", step: nextStep, reason: "pre_send_recheck" });
          } else {
            try { await db.rpc("release_send_slot", { p_user: campaign.user_id }); } catch (_e) { /* best effort */ }
            try { await db.rpc("cancel_lead_followup", { p_lead_id: lead.id, p_reason: "cancelled" }); } catch (_e) { /* best effort */ }
            try { await insertAudit(db, { user_id: campaign.user_id, campaign_id: campaign.id, lead_id: lead.id, event: "followup.cancelled", payload: { reasons: ["pre_send_recheck"], step: nextStep } }); } catch (_e) { /* best effort */ }
          }
          followupsCancelled++;
          continue;
        }

        if (dry) {
          dryDecisions.push({ lead_id: lead.id, email: lead.email, decision: "would_send", step: nextStep });
          // fall through — the loop-end pacing delay still applies (PASS 2 parity)
        } else {
        // ── SEND ──
        // ── SEND VIA PROVIDER ──
        const res = await sendEmail({
          to: lead.email,
          subject,
          text: bodyText,
          html: trackedHtml,
          replyTo: inboundReplyTo(lead.id) ?? (profile.gmail_email ? String(profile.gmail_email) : undefined),
          headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        const ids = { id: res.id, threadId: null };

        // ── RECORD SENT ──
        await db.from("emails_sent").insert({
          user_id: campaign.user_id, lead_id: lead.id, campaign_id: campaign.id,
          subject, body: bodyText, sequence: nextStep, follow_up_sent: true,
          gmail_message_id: ids.id, gmail_thread_id: ids.threadId,
        });

        // ── ADVANCE LEAD TO NEXT STEP ──
        await db.rpc("advance_lead_followup", { p_lead_id: lead.id, p_campaign_id: campaign.id, p_current_step: nextStep });

        // ── AUDIT ──
        const nextSeqDelay = campSeq.find((s) => s.step === nextStep + 1)?.delayDays ?? null;
        await insertAudit(db, {
          user_id: campaign.user_id, campaign_id: campaign.id, lead_id: lead.id,
          event: "followup.sent",
          payload: {
            step: nextStep,
            total_steps: 14,
            email_id: trackingId,
            gmail_message_id: ids.id,
            next_delay_days: nextSeqDelay,
          },
          ...(fuSeqHint ? { model_version: "campaign_learning/v1", strategy_ref: strategyRef(campaign.id, fuSeqHint.version) } : {}),
        });

        followupsSent++;
        }
      } catch (e) {
        // Release slot and restore lead to active on failure (dry-run: no writes)
        if (!dry) {
          try {
            await db.rpc("release_send_slot", { p_user: lead.campaign?.user_id });
          } catch { /* best effort */ }
          try {
            await db.from("leads").update({ followup_status: "active" }).eq("id", lead.id);
          } catch { /* best effort */ }
          try {
            await insertAudit(db, {
              user_id: lead.campaign?.user_id, campaign_id: lead.campaign?.id, lead_id: lead.id,
              event: "followup.failed",
              payload: { error: e instanceof Error ? e.message : String(e), step: (lead.followup_step ?? 0) + 1 },
            });
          } catch { /* best effort */ }
        }
      }
      // Pacing (PASS 2 parity): idle DELAY_MS between processed leads so follow-up
      // bursts never hammer the mailbox. Early-exit `continue` paths skip this,
      // mirroring how PASS 2 only paces jobs that reached their send pipeline.
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return dry ? { followupsSent, followupsCancelled, dryDecisions } : { followupsSent, followupsCancelled };
  }
});
