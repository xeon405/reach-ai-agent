// ============================================================
// SEND WORKER — the ONLY component that puts outreach email on the wire.
// Queue processing · eligibility · limits · MX · Gmail send · follow-ups.
// AI generates content here, but every decision is deterministic.
// Auth: CRON_SECRET header or service-role bearer only.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { COUNTRY_ISO } from "../_shared/osm.ts";
import { getAccessToken, sendGmailRaw } from "../_shared/gmail.ts";
import { insertAudit } from "../_shared/audit.ts";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtmlBody(plain: string, pixel?: string): string {
  const html = escapeHtml(plain).replace(/\n/g, "<br>");
  return `<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">${html}${pixel ?? ""}</body></html>`;
}

function buildRawEmail(
  to: string,
  subject: string,
  plainBody: string,
  htmlBody: string,
  fromEmail: string,
  unsubUrl: string,
  threadId?: string | null
): string {
  const boundary = "oai-alt-" + Math.random().toString(36).slice(2);
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `List-Unsubscribe: <${unsubUrl}>, <mailto:${fromEmail}?subject=unsubscribe>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    ...(threadId ? [`In-Reply-To: ${threadId}`, `References: ${threadId}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
  ];
  const email = [
    ...headers,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    plainBody,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
    ``,
    `--`,
    `You received this one-time email. Reply with UNSUBSCRIBE or use the link above to opt out.`,
  ].join("\n");
  return toBase64Url(email);
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
  leadName: string,
  leadCompany: string,
  leadJobTitle: string,
  userOffer: string,
  avoidHint = "",
  arabic = false,
  bookingLink = "",
  biContext = ""
): Promise<{ subject: string; body: string }> {
  const text = await groqChat([{
    role: "user",
    content: `${biContext}Write a short cold email to ${sanitizeForPrompt(leadName, 80)}, ${sanitizeForPrompt(leadJobTitle, 80)} at ${sanitizeForPrompt(leadCompany, 120)}.
Our offer: ${sanitizeForPrompt(userOffer)}
The sender's name is ${sanitizeForPrompt(senderName, 60)} — sign off with their actual name, never a placeholder.
${avoidHint ? `\nIMPORTANT — your previous draft scored poorly on spam analysis. ${avoidHint}\n` : ""}
Rules for subject:
- Under 50 characters. CLEAR and concrete about the outcome we deliver — a busy person should know what we do from the subject alone.
- No riddles, no curiosity-only hooks like "what if...", no vague teasers.
- No spam words, no ALL CAPS words, no emojis, no "Re:"/"Fwd:" prefixes.
Rules for body:
- 60-120 words max. Short paragraphs (1-3 sentences each).
- Open with something tied to their role or industry. NEVER invent news, events, product launches, or claims about their company that were not provided — generic role-based openers are safer than fabricated facts.
- Explain our offer in one clear sentence tied to THEIR pain.
- Sell in this first message: state the offer plainly and end with one clear call-to-action.${bookingLink ? `\n- A booking link is added automatically right AFTER your text — do NOT type any URL yourself. Close with a line that points to it (e.g. "grab a time via the link below").` : "\n- End by inviting a one-word reply (e.g. \"yes\") if they want details."}
- Never use these words: free, guarantee, act now, limited time, risk-free, urgent, buy now, cheap, loan, click here, 100%, make money, congratulations, dear friend, instant.
Return ONLY a JSON object with this exact format:
{"subject":"...","body":"line1\\nline2\\nline3"}
The body must use \\n between paragraphs.${arabic ? "\n\nLANGUAGE REQUIREMENT — WRITE IN ARABIC:\n- Write the subject and body in fluent Modern Standard Arabic with a professional Gulf business tone.\n- Keep company names and technical terms in Latin script where natural.\n- The JSON keys stay \"subject\" and \"body\"; values are Arabic." : ""}`,
  }], { maxTokens: 700, temperature: 0.8 });

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
  return { subject: (lines[0] ?? "Quick question").slice(0, 90), body: lines.slice(1).join("\n") || text };
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
async function getAltSubjects(campaignId: string, offer: string, biContext = ""): Promise<string[]> {
  const hit = abCache.get(campaignId);
  if (hit && Date.now() - hit.at < 600_000) return hit.subs;
  let subs: string[] = [];
  try {
    const altText = await groqChat([{
      role: "user",
      content: `${biContext}Our cold outreach offer: ${sanitizeForPrompt(offer, 300)}
Write 5 alternative email subject lines for this offer. Rules: max 8 words each, CLEAR and concrete about what we deliver — a busy person should understand the offer from the subject alone. No riddles, no vague curiosity hooks. Never spammy, no ALL CAPS, no emojis. Return one per line, no numbering.`,
    }], { maxTokens: 200, temperature: 0.9 });
    subs = altText.split("\n").map((l: string) => l.replace(/^[\d.\-\s"']+/, "").trim()).filter(Boolean).slice(0, 5);
  } catch (_e) { /* variant B falls back to A */ }
  abCache.set(campaignId, { subs, at: Date.now() });
  return subs;
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
  const startedAt = Date.now();

  try {
    // ---------------- PASS 1: due FOLLOW-UPS (re-checked, never blind) ----------
    const fuStats = await processDueFollowUps(supabase);

    // ---------------- PASS 2: claimed queue jobs --------------------------------
    let sent = 0, failed = 0, retried = 0, dead = 0;
    const ctxs = new Map<string, UserCtx>();

    while (Date.now() - startedAt < RUNTIME_MS) {
      const { data: jobs, error: claimErr } = await supabase.rpc("claim_queue_jobs_v2", { p_limit: 3, p_lease_minutes: 10 });
      if (claimErr || !jobs || jobs.length === 0) break;

      for (const job of jobs as QueueJob[]) {
        try {
          await insertAudit(supabase, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: job.lead_id, event: "email.claimed", payload: { job_id: job.id, attempt: job.attempts } });

          let ctx = ctxs.get(job.user_id);
          if (!ctx) {
            const fresh = await getUserCtx(supabase, job.user_id).catch(() => null);
            if (!fresh) { await failJob(supabase, job, "gmail_disconnected", MAX_ATTEMPTS); failed++; continue; }
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
  async function getUserCtx(db: ReturnType<typeof createClient>, uid: string): Promise<UserCtx | null> {
    const { data: profile } = await db.from("profiles").select("*").eq("id", uid).single();
    if (!profile?.gmail_connected) return null;
    const tok = await getAccessToken(db, uid).catch(() => null);
    if (!tok) return null;
    const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    const today = new Date().toISOString().split("T")[0];
    return {
      profile,
      dailyCap: Math.min(limits.dailyEmails, 5 + daysWarm * 5, profile.gmail_account_type === "workspace" ? 2000 : 500),
      today,
      sentToday: profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0,
      exhausted: false,
    };
  }

  /** Deterministic failure handling: exponential backoff → dead-letter. */
  async function failJob(db: ReturnType<typeof createClient>, job: QueueJob, errMsg: string, maxAttempts: number): Promise<"retry" | "dead"> {
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
  async function eligibilityBlock(db: ReturnType<typeof createClient>, job: QueueJob, profile: Record<string, any>): Promise<string | null> {
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
    if (!profile.gmail_connected) return "gmail_disconnected";                             // 1/2
    const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    const cap = Math.min(limits.dailyEmails, 5 + daysWarm * 5);
    const today = new Date().toISOString().split("T")[0];
    const used = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
    if (used >= cap) return "daily_limit";                                                 // 9/10
    return null;
  }

  async function processJob(db: ReturnType<typeof createClient>, job: QueueJob, ctx: UserCtx, _start: number): Promise<boolean> {
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

    const tok = await getAccessToken(db, job.user_id);
    if (!tok) throw new Error("gmail_token_mint_failed");

    const biCtx = buildBIContext(ctx.profile);

    let variant = job.variant;
    if (variant === "B") {
      const subs = await getAltSubjects(job.campaign_id, String(ctx.profile.offer ?? "our services"), biCtx);
      if (subs.length === 0) variant = null;
    }

    const destLink = String(ctx.profile.website_url || ctx.profile.booking_link || "");
    let gen = await generateEmail(
      String(ctx.profile.name ?? "Best regards"),
      lead.name ?? "there",
      lead.company ?? "your company",
      lead.job_title ?? "professional",
      String(ctx.profile.offer ?? "our service"),
      "",
      isArabicLead(lead.country),
      destLink,
      biCtx
    );
    if (variant === "B") {
      const subs = abCache.get(job.campaign_id)?.subs ?? [];
      if (subs.length > 0) gen.subject = subs[Math.floor(Math.random() * subs.length)];
    }
    let check = localSpamScore(gen.subject, gen.body);
    if (check.score < 60 && check.hint) {
      try {
        const retry = await generateEmail(String(ctx.profile.name ?? ""), lead.name ?? "there", lead.company ?? "your company", lead.job_title ?? "professional", String(ctx.profile.offer ?? "our service"), check.hint, isArabicLead(lead.country), String(ctx.profile.website_url || ctx.profile.booking_link || ""), biCtx);
        if (localSpamScore(retry.subject, retry.body).score > check.score) gen = retry;
      } catch { /* keep original */ }
    }

    const destLink2 = String(ctx.profile.website_url || ctx.profile.booking_link || "");
    const bodyText = `${gen.body}${destLink2 ? (ctx.profile.website_url ? `\n\n🔗 See how it works & get started: ${destLink2}` : `\n\n📅 Want details or a quick demo? Book a time that suits you: ${destLink2}`) : ""}${ctx.profile.signature ? `\n\n${sanitizeForPrompt(ctx.profile.signature, 400)}` : ""}

PS: I use an AI assistant (OutreachAI) to help manage my outreach — this note was drafted with its help.
Reply UNSUBSCRIBE anytime to opt out.${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

    // Generate tracking ID BEFORE send so we can reference it in the pixel.
    // The emails_sent row is inserted ONLY after Gmail send succeeds (anti-phantom-send).
    const trackingId = crypto.randomUUID();
    const pixel = `<img src="https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-open?id=${trackingId}" width="1" height="1" alt="" style="display:none;border:0" />`;
    const unsubUrl = `${SITE}/unsubscribe?l=${lead.id}&c=${job.campaign_id}`;

    const ids = await sendGmailRaw(
      tok.accessToken,
      buildRawEmail(lead.email, gen.subject, bodyText, buildHtmlBody(bodyText, pixel), String(ctx.profile.gmail_email ?? ""), unsubUrl)
    );

    // Gmail send succeeded — NOW insert the record. If this fails, no phantom row exists.
    const { data: emailRow, error: insertErr } = await db
      .from("emails_sent")
      .insert({
        id: trackingId,
        user_id: job.user_id,
        lead_id: lead.id,
        campaign_id: job.campaign_id,
        subject: gen.subject,
        body: bodyText,
        variant,
        follow_up_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        sequence: 1,
        follow_up_sent: false,
        gmail_message_id: ids.id,
        gmail_thread_id: ids.threadId,
      })
      .select("id")
      .single();
    if (insertErr || !emailRow) throw new Error(`record_insert_failed:${insertErr?.message?.slice(0, 120)}`);
    await db.from("send_queue").update({ status: "sent", lease_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    await db.from("leads").update({
      status: "emailed",
      lifecycle: "CONTACTED",
      normalized_email: String(lead.email).toLowerCase(),
    }).eq("id", lead.id);

    ctx.sentToday++;
    await insertAudit(db, { user_id: job.user_id, campaign_id: job.campaign_id, lead_id: lead.id, event: "email.sent", payload: { email_id: emailRow.id, gmail_message_id: ids.id, thread_id: ids.threadId, variant, subject: gen.subject.slice(0, 80) } });
    return true;
  }

  // ------------------------------------------------------------------
  // FOLLOW-UP ENGINE: time-gated but NEVER blind — full re-check per send.
  async function processDueFollowUps(db: ReturnType<typeof createClient>): Promise<{ followupsSent: number; followupsCancelled: number }> {
    let followupsSent = 0, followupsCancelled = 0;
    const now = new Date().toISOString();
    const { data: emails } = await db
      .from("emails_sent")
      .select("*, lead:leads(*)")
      .eq("follow_up_sent", false)
      .eq("replied", false)
      .in("sequence", [1, 3])
      .lte("follow_up_at", now)
      .limit(60);
    if (!emails || emails.length === 0) return { followupsSent, followupsCancelled };

    const userIds = [...new Set(emails.map((e) => e.user_id))];
    const { data: profiles } = await db.from("profiles").select("*").in("id", userIds);
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    for (const email of emails) {
      try {
        const profile = profileMap[email.user_id];
        const lead = Array.isArray(email.lead) ? email.lead[0] : email.lead;
        if (!profile || !lead?.email) continue;

        // Re-check ALL blocking conditions before every follow-up
        const reasons: string[] = [];
        if (lead.unsubscribed || ["unsubscribed", "bounced", "suppressed"].includes(lead.status)) reasons.push("lead_state");
        if (["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "HUMAN_TAKEOVER"].includes(lead.lifecycle ?? "")) reasons.push("lifecycle");
        if ((lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN") reasons.push("human_takeover");
        const { data: camp } = await db.from("campaigns").select("status").eq("id", email.campaign_id).maybeSingle();
        if (!camp || camp.status !== "active") reasons.push("campaign_inactive");
        const { data: sup } = await db.from("suppressions").select("id").eq("user_id", email.user_id).ilike("email", lead.email).limit(1).maybeSingle();
        if (sup) reasons.push("suppression_list");

        if (reasons.length > 0) {
          // Cancel the scheduled step — conditions changed
          await db.from("emails_sent").update({ follow_up_sent: true }).eq("id", email.id);
          // Also cancel any live queue jobs for this lead
          await db.from("send_queue").update({ status: "cancelled", last_error: `followup_cancel:${reasons[0]}`, updated_at: new Date().toISOString() })
            .eq("lead_id", lead.id).in("status", ["pending", "claimed"]);
          // Cancel orphaned step 3 placeholder if step 2 was cancelled before it sent
          if (email.sequence === 1) {
            await db.from("emails_sent").update({ follow_up_sent: true }).eq("campaign_id", email.campaign_id).eq("lead_id", lead.id).eq("sequence", 3).eq("follow_up_sent", false);
          }
          followupsCancelled++;
          await insertAudit(db, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "followup.cancelled", payload: { reasons } });
          continue;
        }

        // IDEMPOTENCY: skip if this step already recorded (crash-retry protection).
        const step = email.sequence === 1 ? 2 : 3;
        const { data: existingStep } = await db.from("emails_sent")
          .select("id").eq("campaign_id", email.campaign_id).eq("lead_id", lead.id).eq("sequence", step).limit(1).maybeSingle();
        if (existingStep) {
          await db.from("emails_sent").update({ follow_up_sent: true }).eq("id", email.id);
          continue;
        }

        // ATOMIC daily-cap reservation (concurrency-safe). Cap hit → DEFER an hour, never cancel.
        const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
        const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
        const baseCap = profile.gmail_account_type === "workspace" ? 2000 : 500;
        const cap = Math.min(limits.dailyEmails, 5 + daysWarm * 5, baseCap);
        const { data: reserved } = await db.rpc("reserve_send_slot", { p_user: email.user_id, p_cap: cap });
        if (!reserved) {
          await db.from("emails_sent").update({ follow_up_at: new Date(Date.now() + 3600_000).toISOString() }).eq("id", email.id);
          continue;
        }

        const tok = await getAccessToken(db, email.user_id).catch(() => null);
        if (!tok) {
          await db.rpc("release_send_slot", { p_user: email.user_id });
          followupsCancelled++;
          continue;
        }
        const firstName = (lead.name ?? "there").split(" ")[0];
        const subject = String(email.subject ?? "").startsWith("Re: ") ? String(email.subject) : `Re: ${email.subject}`;
        const footer = `--

⚡ Still automated — my AI agent sent this follow-up too.
Get your own AI outreach agent → ${SITE}

Reply with UNSUBSCRIBE to opt out.${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;
        const body = step === 2
          ? `Hi ${firstName},

Just floating this back up — I know inboxes get busy.

Worth a quick 15-minute chat about ${lead.company ?? "your team"}? Happy to work around your schedule.

Best regards
${footer}`
          : `Hi ${firstName},

I'll stop reaching out after this one 🙂

If ${lead.company ?? "your team"} ever needs help turning cold outreach into booked meetings, my door is open. Otherwise, wishing you a great quarter.

Best regards
${footer}`;

        const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(lead.email, subject, body, buildHtmlBody(body), profile.gmail_email ?? "", `${SITE}/unsubscribe?l=${lead.id}&c=${email.campaign_id}`));

        await db.from("emails_sent").insert({
          user_id: email.user_id, lead_id: lead.id, campaign_id: email.campaign_id,
          subject, body, sequence: step, follow_up_sent: true,
          gmail_message_id: ids.id, gmail_thread_id: ids.threadId,
        });
        if (step === 2) {
          await db.from("emails_sent").insert({
            user_id: email.user_id, lead_id: lead.id, campaign_id: email.campaign_id,
            subject, body: "(scheduled step 3)", sequence: 3, follow_up_sent: false,
            follow_up_at: new Date(Date.now() + 4 * 86400000).toISOString(), // Follow-up #2 at +4 days
          });
        }
        await db.from("emails_sent").update({ follow_up_sent: true }).eq("id", email.id);
        followupsSent++;
        await insertAudit(db, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "email.sent", payload: { kind: "followup", step, email_id: email.id, gmail_message_id: ids.id } });
      } catch (e) {
        // Slot was reserved but the send failed — give it back.
        try { await db.rpc("release_send_slot", { p_user: email.user_id }); } catch (_e) { /* best effort */ }
        try {
          await insertAudit(db, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: email.lead_id ?? null, event: "email.failed", payload: { kind: "followup", error: e instanceof Error ? e.message : String(e) } });
        } catch (_e) { /* best effort */ }
      }
    }
    return { followupsSent, followupsCancelled };
  }
});
