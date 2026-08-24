import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { COUNTRY_ISO } from "../_shared/osm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 40;
const DELAY_MS = 8000;

const PLAN_LIMITS: Record<string, { dailyEmails: number }> = {
  free: { dailyEmails: 10 },
  starter: { dailyEmails: 50 },
  growth: { dailyEmails: 200 },
  agency: { dailyEmails: 500 },
};

const SITE = "https://outreach-ochre-sigma.vercel.app";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
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
  unsubUrl: string
): string {
  const boundary = "oai-alt-" + Math.random().toString(36).slice(2);
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `List-Unsubscribe: <${unsubUrl}>, <mailto:${fromEmail}?subject=unsubscribe>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
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

async function sendGmail(accessToken: string, raw: string): Promise<void> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status}`);
}

async function refreshGmailToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
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

// Accepts "Germany", "DE", "de", " United States " … → ISO-2 code or null
function normalizeCountry(country: string | null | undefined): string | null {
  const raw = String(country ?? "").trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_ISO[raw.toLowerCase()] ?? raw.toUpperCase().slice(0, 2);
}

function tzOffsetFor(country: string | null | undefined): number {
  const iso = normalizeCountry(country);
  if (!iso) return 0;
  const range = COUNTRY_TZ[iso];
  if (!range) return 0;
  return range[0];
}

function isBusinessMorning(country: string | null | undefined): boolean {
  const hourUTC = new Date().getUTCHours();
  const local = (hourUTC + tzOffsetFor(country) + 24) % 24;
  return local >= 8 && local < 11;
}

function isArabicLead(country: string | null | undefined): boolean {
  const iso = normalizeCountry(country);
  if (!iso) return false;
  return ARAB_COUNTRIES.has(iso);
}

async function generateEmail(
  leadName: string,
  leadCompany: string,
  leadJobTitle: string,
  userOffer: string,
  avoidHint = "",
  arabic = false
): Promise<{ subject: string; body: string }> {
  const text = await groqChat([{
    role: "user",
    content: `Write a short cold email to ${sanitizeForPrompt(leadName, 80)}, ${sanitizeForPrompt(leadJobTitle, 80)} at ${sanitizeForPrompt(leadCompany, 120)}.
Our offer: ${sanitizeForPrompt(userOffer)}
${avoidHint ? `\nIMPORTANT — your previous draft scored poorly on spam analysis. ${avoidHint}\n` : ""}
Rules for subject:
- Under 50 characters, lowercase-friendly, curious not salesy.
- No spam words, no ALL CAPS words, no emojis, no "Re:"/"Fwd:" prefixes.
Rules for body:
- 60-120 words max. Short paragraphs (1-3 sentences each).
- Open with something specific to their role/company. No "Dear Sir/Madam", no "Hope this finds you well".
- Explain our offer in one clear sentence tied to THEIR pain.
- End with a soft question asking if this is worth a quick chat.
- Sign off as "Best regards".
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
    } catch {
      // fall through to line-based parse
    }
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
  if (/!{2,}|\$/.test(subject)) { s -= 12; hints.push('Remove "!!!" or "$" from the subject.'); }
  if (subjLower.length > 60) { s -= 8; hints.push("Subject must be under 50 characters."); }
  if (/^(re:|fwd:)/.test(subjLower)) { s -= 15; hints.push('Never start the subject with "Re:" or "Fwd:".'); }
  const triggers = ["free", "guarantee", "act now", "limited time", "risk-free", "urgent", "buy now",
    "cheap", "loan", "click here", "100%", "make money", "congratulations", "dear friend", "instant"];
  const found = triggers.filter((w) => bodyLower.includes(w));
  if (found.length > 0) { s -= Math.min(25, found.length * 7); hints.push(`Never use these words in the body: ${found.join(", ")}.`); }
  if (/^dear (sir|madam|friend)/im.test(body)) { s -= 8; hints.push('Greet by first name only — never "Dear Sir/Madam".'); }
  const links = (body.match(/https?:\/\//g) ?? []).length;
  if (links > 3) { s -= (links - 3) * 6; hints.push("Use at most 1-2 links in a cold email."); }
  return { score: Math.max(0, Math.min(100, s)), hint: hints.join(" ") };
}

const abCache = new Map<string, { subs: string[]; at: number }>();
async function getAltSubjects(campaignId: string, offer: string): Promise<string[]> {
  const hit = abCache.get(campaignId);
  if (hit && Date.now() - hit.at < 600_000) return hit.subs;
  let subs: string[] = [];
  try {
    const altText = await groqChat([{
      role: "user",
      content: `Our cold outreach offer: ${sanitizeForPrompt(offer, 300)}
Write 5 alternative email subject lines for this offer. Rules: max 8 words each, curious but never spammy, no ALL CAPS, no emojis. Return one per line, no numbering.`,
    }], { maxTokens: 200, temperature: 0.9 });
    subs = altText.split("\n").map((l: string) => l.replace(/^[\d.\-\s"']+/, "").trim()).filter(Boolean).slice(0, 5);
  } catch (_e) {
    // empty list → variant B falls back to A behaviour
  }
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

type UserCtx = {
  profile: Record<string, unknown>;
  accessToken: string;
  dailyCap: number;
  today: string;
  sentToday: number;
  exhausted: boolean;
  offer: () => string;
};

const drainCtxs = new Map<string, UserCtx>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let userId: string;
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret && typeof body.user_id === "string") {
      userId = body.user_id;
    } else {
      userId = await getAuthedUserId(req);
    }
    const campaignId: string = body.campaignId ?? body.campaign_id;
    if (!campaignId) throw new Error("campaignId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status, ab_test")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .single();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "active") throw new Error("Campaign is not active");

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!profile) throw new Error("Profile not found");

    const { data: tokenRow } = await supabase
      .from("gmail_tokens")
      .select("refresh_token")
      .eq("profile_id", userId)
      .single();
    if (!profile.gmail_connected || !tokenRow?.refresh_token) {
      throw new Error("Gmail not connected. Connect it in Settings first.");
    }

    const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    const dailyCap = Math.min(limits.dailyEmails, 5 + daysWarm * 5);
    const today = new Date().toISOString().split("T")[0];
    const sentTodayBase = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;

    const remainingToday = dailyCap - sentTodayBase;
    if (remainingToday <= 0) {
      return json({
        queued: 0,
        error: `Daily limit reached (warm-up cap: ${dailyCap}/day while your sender builds reputation).`,
      }, 429);
    }

    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, country, created_at")
      .eq("campaign_id", campaignId)
      .eq("status", "new")
      .eq("unsubscribed", false)
      .limit(Math.min(BATCH_SIZE, remainingToday));

    if (!leads || leads.length === 0) {
      return json({ queued: 0, message: "No new leads to email" });
    }

    // 🚫 Global dedupe: never email the same person twice — across ALL campaigns
    const batchEmails = leads.map((l: { email?: string | null }) => String(l.email ?? "").toLowerCase()).filter(Boolean);
    const dupeIds = new Set<string>();
    if (batchEmails.length > 0) {
      const { data: sameEmailLeads } = await supabase
        .from("leads")
        .select("id, email")
        .eq("user_id", userId)
        .in("email", batchEmails)
        .limit(2000);
      const emailToLeadIds = new Map<string, string[]>();
      for (const l of sameEmailLeads ?? []) {
        const key = String(l.email).toLowerCase();
        emailToLeadIds.set(key, [...(emailToLeadIds.get(key) ?? []), l.id]);
      }
      const allRelated = [...emailToLeadIds.values()].flat();
      if (allRelated.length > 0) {
        const { data: emailed } = await supabase
          .from("emails_sent")
          .select("lead_id")
          .in("lead_id", allRelated)
          .limit(5000);
        const emailedSet = new Set((emailed ?? []).map((r: { lead_id: string }) => r.lead_id));
        for (const l of leads) {
          const key = String(l.email ?? "").toLowerCase();
          const related = emailToLeadIds.get(key) ?? [];
          if (related.some((id) => emailedSet.has(id))) dupeIds.add(l.id);
        }
        if (dupeIds.size > 0) {
          await supabase.from("leads").update({ status: "skipped" }).in("id", [...dupeIds]);
        }
      }
    }
    const freshLeads = (leads as Array<{ id: string; email?: string | null; country?: string | null }>).filter(
      (l) => !dupeIds.has(l.id)
    );
    if (freshLeads.length === 0) {
      return json({ queued: 0, message: `${dupeIds.size} duplicates skipped` });
    }

    // 📡 MX validation before spending a send
    const invalidLeadIds: string[] = [];
    const domainCache = new Map<string, boolean>();
    for (const l of freshLeads) {
      const domain = String(l.email ?? "").split("@")[1]?.toLowerCase().trim();
      if (!domain) { invalidLeadIds.push(l.id); continue; }
      if (!domainCache.has(domain)) {
        try {
          const mx = await Deno.resolveDns(domain, "MX");
          domainCache.set(domain, Array.isArray(mx) && mx.length > 0);
        } catch {
          domainCache.set(domain, false);
        }
      }
      if (!domainCache.get(domain)) invalidLeadIds.push(l.id);
    }
    if (invalidLeadIds.length > 0) {
      await supabase.from("leads").update({ status: "invalid" }).in("id", invalidLeadIds);
    }
    const deliverable = freshLeads.filter((l) => !invalidLeadIds.includes(l.id));
    if (deliverable.length === 0) {
      return json({ queued: 0, message: `${invalidLeadIds.length} undeliverable emails skipped` });
    }

    const eligible = deliverable.filter((l: { country?: string | null }) => isBusinessMorning(l.country));
    const waiting = deliverable.length - eligible.length;

    const rows = eligible.map((l: { id: string }, i: number) => ({
      user_id: userId,
      campaign_id: campaignId,
      lead_id: l.id,
      variant: campaign.ab_test ? (i % 2 === 0 ? "A" : "B") : null,
    }));
    let inserted = rows.length;
    if (rows.length > 0) {
      const { data: insertedRows, error: qErr } = await supabase
        .from("send_queue")
        .insert(rows)
        .select("id");
      if (qErr) throw new Error(`Queue error: ${qErr.message}`);
      inserted = insertedRows?.length ?? 0;
    }

    // Kick the background drain without blocking the response
    const kickoff = drainQueue(supabase);
    const et = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (et?.waitUntil) et.waitUntil(kickoff); else kickoff.catch(() => {});

    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} email${inserted === 1 ? "" : "s"} queued — sending one by one in the background`);
    if (waiting > 0) parts.push(`${waiting} waiting for their local morning`);
    if (invalidLeadIds.length > 0) parts.push(`${invalidLeadIds.length} undeliverable skipped`);
    if (dupeIds.size > 0) parts.push(`${dupeIds.size} duplicates skipped`);

    return json({
      queued: inserted,
      message: parts.join(" · ") || "Nothing new to send",
      remainingToday: Math.max(remainingToday - inserted, 0),
    });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }

  async function processJob(supabase: ReturnType<typeof createClient>, job: QueueJob, ctx: UserCtx): Promise<boolean> {
    const { data: lead } = await supabase.from("leads").select("*").eq("id", job.lead_id).single();
    if (!lead || lead.unsubscribed) return false;

    let variant = job.variant;
    if (variant === "B") {
      const subs = await getAltSubjects(job.campaign_id, String(ctx.profile.offer ?? "our services"));
      if (subs.length === 0) variant = null;
    }

    let gen = await generateEmail(
      lead.name ?? "there",
      lead.company ?? "your company",
      lead.job_title ?? "professional",
      String(ctx.profile.offer ?? "our service"),
      "",
      isArabicLead(lead.country)
    );
    if (variant === "B") {
      const subs = abCache.get(job.campaign_id)?.subs ?? [];
      if (subs.length > 0) gen.subject = subs[Math.floor(Math.random() * subs.length)];
    }

    let check = localSpamScore(gen.subject, gen.body);
    if (check.score < 60 && check.hint) {
      try {
        const retry = await generateEmail(
          lead.name ?? "there",
          lead.company ?? "your company",
          lead.job_title ?? "professional",
          String(ctx.profile.offer ?? "our service"),
          check.hint,
          isArabicLead(lead.country)
        );
        const retryCheck = localSpamScore(retry.subject, retry.body);
        if (retryCheck.score > check.score) gen = retry;
      } catch {
        // keep original draft
      }
    }

    const bodyText = `${gen.body}${ctx.profile.signature ? `\n\n${sanitizeForPrompt(ctx.profile.signature, 400)}` : ""}

PS: I use an AI assistant (OutreachAI) to help manage my outreach — this note was drafted with its help.
Reply UNSUBSCRIBE anytime to opt out.${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

    const { data: emailRow, error: insertErr } = await supabase
      .from("emails_sent")
      .insert({
        user_id: job.user_id,
        lead_id: lead.id,
        campaign_id: job.campaign_id,
        subject: gen.subject,
        body: bodyText,
        variant,
        follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        sequence: 1,
        follow_up_sent: false,
      })
      .select("id")
      .single();

    const pixel = emailRow?.id && !insertErr
      ? `<img src="https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-open?id=${emailRow.id}" width="1" height="1" alt="" style="display:none;border:0" />`
      : undefined;

    const unsubUrl = `${SITE}/unsubscribe?l=${lead.id}&c=${job.campaign_id}`;
    await sendGmail(
      ctx.accessToken,
      buildRawEmail(lead.email, gen.subject, bodyText, buildHtmlBody(bodyText, pixel), String(ctx.profile.gmail_email ?? ""), unsubUrl)
    );
    await supabase.from("leads").update({ status: "emailed" }).eq("id", lead.id);

    ctx.sentToday++;
    if (ctx.sentToday % 3 === 0) {
      await supabase.from("profiles").update({
        emails_sent_today: ctx.sentToday,
        emails_sent_date: ctx.today,
      }).eq("id", job.user_id);
    }
    return true;
  }

  async function getUserCtx(supabase: ReturnType<typeof createClient>, uid: string): Promise<UserCtx | null> {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (!profile) return null;
    const { data: tokenRow } = await supabase
      .from("gmail_tokens")
      .select("refresh_token")
      .eq("profile_id", uid)
      .single();
    if (!profile.gmail_connected || !tokenRow?.refresh_token) return null;

    const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    const today = new Date().toISOString().split("T")[0];
    const sentToday = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
    const accessToken = await refreshGmailToken(tokenRow.refresh_token);
    await supabase.from("gmail_tokens").upsert({
      profile_id: uid,
      refresh_token: tokenRow.refresh_token,
      access_token: accessToken,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });

    return {
      profile,
      accessToken,
      dailyCap: Math.min(limits.dailyEmails, 5 + daysWarm * 5),
      today,
      sentToday,
      exhausted: false,
      offer: () => String(profile.offer ?? "our services"),
    };
  }

  async function drainQueue(supabase: ReturnType<typeof createClient>): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 50_000) {
      let jobs: QueueJob[] | null = null;
      try {
        const { data } = await supabase.rpc("claim_queue_jobs", { p_limit: 3 });
        jobs = data as QueueJob[] | null;
      } catch (e) {
        console.error("[queue] claim failed:", e instanceof Error ? e.message : e);
        break;
      }
      if (!jobs || jobs.length === 0) break;

      for (const job of jobs) {
        try {
          let ctx = drainCtxs.get(job.user_id);
          if (!ctx) {
            const fresh = await getUserCtx(supabase, job.user_id);
            if (!fresh) {
              await supabase.from("send_queue").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", job.id);
              continue;
            }
            ctx = fresh;
            drainCtxs.set(job.user_id, ctx);
          }
          if (ctx.exhausted || ctx.sentToday >= ctx.dailyCap) {
            ctx.exhausted = true;
            await supabase.from("send_queue").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", job.id);
            continue;
          }
          const ok = await processJob(supabase, job, ctx);
          await supabase.from("send_queue").update({ status: ok ? "done" : "failed", updated_at: new Date().toISOString() }).eq("id", job.id);
          await new Promise((r) => setTimeout(r, DELAY_MS));
        } catch (e) {
          console.error("[queue] job failed:", e instanceof Error ? e.message : e);
          const nextAttempts = job.attempts + 1;
          await supabase.from("send_queue").update({
            status: nextAttempts >= 3 ? "failed" : "pending",
            attempts: nextAttempts,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
        }
      }
    }
    for (const [uid, ctx] of drainCtxs) {
      await supabase.from("profiles").update({
        emails_sent_today: ctx.sentToday,
        emails_sent_date: ctx.today,
      }).eq("id", uid);
    }
    drainCtxs.clear();
  }
});
