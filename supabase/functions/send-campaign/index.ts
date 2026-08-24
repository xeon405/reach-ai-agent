import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { groqChat, groqKeys, extractJson, sanitizeForPrompt } from "../_shared/groq.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// One invocation sends a small batch, well under the edge-function time limit.
// The frontend loops invocations while `continue` is true.
const BATCH_SIZE = 10;
const DELAY_MS = 8000;

const PLAN_LIMITS: Record<string, { dailyEmails: number }> = {
  free: { dailyEmails: 10 },
  starter: { dailyEmails: 50 },
  growth: { dailyEmails: 200 },
  agency: { dailyEmails: 500 },
};

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
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  const data = await res.json();
  if (data.error) throw new Error("Failed to refresh token: " + data.error);
  return data.access_token;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtmlBody(plain: string): string {
  return `<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">${escapeHtml(plain).replace(/\n/g, "<br>")}</body></html>`;
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Gmail send failed: " + err);
  }
}

// Arab countries → emails are written in professional Arabic automatically
const ARAB_COUNTRIES = new Set([
  "KW", "QA", "BH", "OM", "AE", "SA", "JO", "LB", "IQ", "PS", "YE", "LY", "TN", "DZ", "MA", "SD", "SY", "EG",
  "KUWAIT", "QATAR", "BAHRAIN", "OMAN", "UAE", "UNITED ARAB EMIRATES", "SAUDI ARABIA", "JORDAN",
  "LEBANON", "IRAQ", "PALESTINE", "YEMEN", "LIBYA", "TUNISIA", "ALGERIA", "MOROCCO", "SUDAN", "SYRIA", "EGYPT",
]);
function isArabicLead(country?: string | null): boolean {
  if (!country) return false;
  return ARAB_COUNTRIES.has(country.trim().toUpperCase());
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
Return ONLY a JSON object with this exact format:
{"subject": "...", "body": "..."}
${arabic ? `
LANGUAGE REQUIREMENT — WRITE IN ARABIC:
- The entire subject AND body must be in professional Modern Standard Arabic (فصحى مبسطة), business-appropriate for Gulf region (Kuwait, UAE, Saudi Arabia, Qatar).
- Start the greeting with "السلام عليكم" or "تحية طيبة وبعد،".
- Keep company/person names and technical terms in their original form where natural.
- End with a polite question inviting a reply, e.g. "هل يمكنني مشاركة المزيد من التفاصيل؟".
- Sign off with "مع أطيب التحيات".
- JSON keys stay in English; only the VALUES are in Arabic.
` : ""}
Rules for subject:
- Max 7 words
- Personal and curiosity-driven — mention their company, role, or a specific benefit
- NEVER use words like "opportunity", "business proposal", or "quick question"
- Lowercase style is fine (e.g. "quick idea for acme's pipeline")

Rules for body:
- Max 5 sentences
- Sound human, not salesy
- Reference their specific role
- Include ONE short transparent sentence mentioning that this email was found, written and sent automatically by your AI agent (keep it fun and confident, e.g. "Fun fact: my AI agent found you, wrote this, and hit send")
- End with a simple question
- Sign off with "Best regards"
- No subject line in body`,
  }], { maxTokens: 900 });

  const parsed = extractJson<{ subject?: unknown; body?: unknown }>(text);
  if (!parsed || !parsed.subject || !parsed.body) throw new Error("AI returned a malformed email");
  return { subject: String(parsed.subject), body: String(parsed.body) };
}

// Smart send-time: deliver into each lead's local business morning
const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", CA: "America/Toronto", GB: "Europe/London", IE: "Europe/Dublin",
  IN: "Asia/Kolkata", AE: "Asia/Dubai", SA: "Asia/Riyadh", SG: "Asia/Singapore",
  KW: "Asia/Kuwait", QA: "Asia/Qatar", BH: "Asia/Bahrain", OM: "Asia/Muscat",
  JO: "Asia/Amman", LB: "Asia/Beirut", IQ: "Asia/Baghdad", PS: "Asia/Gaza",
  YE: "Asia/Aden", LY: "Africa/Tripoli", TN: "Africa/Tunis", DZ: "Africa/Algiers",
  MA: "Africa/Casablanca", SD: "Africa/Khartoum", SY: "Asia/Damascus",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland", DE: "Europe/Berlin", FR: "Europe/Paris",
  NL: "Europe/Amsterdam", ES: "Europe/Madrid", IT: "Europe/Rome", CH: "Europe/Zurich",
  SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen", FI: "Europe/Helsinki",
  PL: "Europe/Warsaw", PT: "Europe/Lisbon", BR: "America/Sao_Paulo", MX: "America/Mexico_City",
  ZA: "Africa/Johannesburg", NG: "Africa/Lagos", KE: "Africa/Nairobi", EG: "Africa/Cairo",
  JP: "Asia/Tokyo", KR: "Asia/Seoul", HK: "Asia/Hong_Kong", MY: "Asia/Kuala_Lumpur",
  ID: "Asia/Jakarta", TH: "Asia/Bangkok", PH: "Asia/Manila", PK: "Asia/Karachi",
  BD: "Asia/Dhaka", LK: "Asia/Colombo", IL: "Asia/Jerusalem", TR: "Europe/Istanbul",
};

function isBusinessMorning(country: string | null | undefined): boolean {
  if (!country) return true; // unknown origin → send immediately
  const tz = COUNTRY_TZ[country.toUpperCase()];
  if (!tz) return true;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      weekday: "short",
      timeZone: tz,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    if (weekday === "Sat" || weekday === "Sun") return false; // nobody reads cold email on weekends
    return hour >= 9 && hour <= 17;
  } catch {
    return true;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    let userId: string;
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (
      cronSecret &&
      req.headers.get("x-cron-secret") === cronSecret &&
      typeof body.user_id === "string"
    ) {
      // Trusted autopilot path (cron robot) — same secret gate as follow-up
      userId = body.user_id;
    } else {
      userId = await getAuthedUserId(req);
    }
    const { campaignId } = body;
    if (!campaignId) throw new Error("campaignId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the campaign belongs to this user and is active
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status, ab_test")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .single();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "active") throw new Error("Campaign is not active");

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!profile) throw new Error("Profile not found");

    // A/B test: pre-generate alternative subject lines for variant B
    let altSubjects: string[] = [];
    if (campaign.ab_test) {
      try {
        const altText = await groqChat([{
          role: "user",
          content: `Our cold outreach offer: ${sanitizeForPrompt(profile.offer ?? "our services", 300)}
Write 5 alternative email subject lines for this offer. Rules: max 8 words each, curious but never spammy, no ALL CAPS, no emojis. Return one per line, no numbering.`,
        }], { maxTokens: 200, temperature: 0.9 });
        altSubjects = altText.split("\n").map((l: string) => l.replace(/^[\d.\-\s"']+/, "").trim()).filter(Boolean).slice(0, 5);
      } catch (_e) {
        // fall back to single-variant run if generation fails
      }
    }

    const { data: tokenRow } = await supabase
      .from("gmail_tokens")
      .select("refresh_token")
      .eq("profile_id", userId)
      .single();
    if (!profile.gmail_connected || !tokenRow?.refresh_token) {
      throw new Error("Gmail not connected. Connect it in Settings first.");
    }

    // Check plan limits
    const plan = profile.plan ?? "starter";
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;

    // Auto warm-up: fresh Gmail accounts ramp 5/day, +5 each day, up to the plan cap.
    // Keeps new senders out of spam while they build reputation.
    const daysWarm = Math.max(
      0,
      Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
    );
    const dailyCap = Math.min(limits.dailyEmails, 5 + daysWarm * 5);

    // Reset daily counter if new day
    const today = new Date().toISOString().split("T")[0];
    let sentToday: number = profile.emails_sent_today ?? 0;
    if (profile.emails_sent_date !== today) {
      sentToday = 0;
      await supabase.from("profiles").update({
        emails_sent_today: 0,
        emails_sent_date: today,
      }).eq("id", userId);
    }

    const remainingToday = dailyCap - sentToday;
    if (remainingToday <= 0) {
      return json({
        sent: 0,
        sentToday,
        remainingToday: 0,
        continue: false,
        error: `Daily limit reached (warm-up cap: ${dailyCap}/day while your sender builds reputation).`,
      }, 429);
    }

    // Refresh Gmail token once per batch; persist rotated access token in the vault
    const accessToken = await refreshGmailToken(tokenRow.refresh_token);
    await supabase.from("gmail_tokens").upsert({
      profile_id: userId,
      refresh_token: tokenRow.refresh_token,
      access_token: accessToken,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });

    // Fetch next batch of un-emailed leads (never email unsubscribed leads)
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "new")
      .eq("unsubscribed", false)
      .limit(Math.min(BATCH_SIZE, remainingToday));

    if (!leads || leads.length === 0) {
      return json({ sent: 0, sentToday, remainingToday, continue: false, message: "No new leads to email" });
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
      return json({ sent: 0, sentToday, remainingToday, continue: true, message: `${dupeIds.size} duplicates skipped` });
    }

    // 📡 MX validation: verify each domain can actually receive mail before spending a send
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
      return json({ sent: 0, sentToday, remainingToday, continue: true, message: `${invalidLeadIds.length} undeliverable emails skipped` });
    }

    // Only send into the lead's local business hours — the rest wait for their morning
    const eligible = deliverable.filter((l: { country?: string | null }) => isBusinessMorning(l.country));
    const waiting = leads.length - eligible.length;
    if (eligible.length === 0) {
      return json({
        sent: 0,
        sentToday,
        remainingToday,
        continue: true,
        message: `Smart timing: ${waiting} lead${waiting === 1 ? "" : "s"} wait for their local business hours`,
      });
    }

    let sent = 0;

// Lightweight spam scoring (same rules as the /spam-check edge function).
// If an AI draft scores below 60, we regenerate ONCE with corrective hints
// before sending — protecting domain reputation automatically.
function localSpamScore(subject: string, body: string): { score: number; hint: string } {
  let s = 100;
  const hints: string[] = [];
  const subjLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const capsWords = subject.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (capsWords.length > 0) { s -= Math.min(20, capsWords.length * 8); hints.push("Do not use ANY all-caps words in the subject."); }
  if (/[!]{2,}|\$\$\$/.test(subject)) { s -= 12; hints.push('Remove "!!!" or "$$$" from the subject.'); }
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

    for (let leadIdx = 0; leadIdx < eligible.length; leadIdx++) {
      const lead = eligible[leadIdx];
      try {
        // A/B split: even leads = A (AI per-lead subject), odd leads = B (alt subjects, rotating)
        let variant: string | null = null;
        if (campaign.ab_test && altSubjects.length > 0) {
          variant = leadIdx % 2 === 0 ? "A" : "B";
        }

        let { subject, body: aiBody } = await generateEmail(
          lead.name ?? "there",
          lead.company ?? "your company",
          lead.job_title ?? "professional",
          profile.offer ?? "our service",
          "",
          isArabicLead(lead.country)
        );
        if (variant === "B") subject = altSubjects[sent % altSubjects.length];

        // 🛡️ Pre-send deliverability guard: regenerate once if draft looks spammy
        let check = localSpamScore(subject, aiBody);
        if (check.score < 60 && check.hint) {
          try {
            const retry = await generateEmail(
              lead.name ?? "there",
              lead.company ?? "your company",
              lead.job_title ?? "professional",
              profile.offer ?? "our service",
              check.hint,
              isArabicLead(lead.country)
            );
            const retryCheck = localSpamScore(retry.subject, retry.body);
            if (retryCheck.score > check.score) {
              subject = retry.subject;
              aiBody = retry.body;
              check = retryCheck;
            }
          } catch {
            // keep original draft if retry fails
          }
        }

        // Killer feature: every email is a live demo of the product
        const body = `${aiBody}${profile.signature ? `\n\n${sanitizeForPrompt(profile.signature, 400)}` : ""}

--

⚡ Fun fact: this email was found, written and sent automatically by an AI agent.
Want an AI agent doing this for YOUR sales pipeline? → https://outreach-ochre-sigma.vercel.app

Reply with UNSUBSCRIBE to opt out.
One click: https://outreach-ochre-sigma.vercel.app/unsubscribe?l=${lead.id}&c=${lead.campaign_id ?? ""}${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

        // insert row first so we get an id for the open-tracking pixel
        const { data: emailRow, error: insertErr } = await supabase
          .from("emails_sent")
          .insert({
            user_id: userId,
            lead_id: lead.id,
            campaign_id: campaignId,
            subject,
            body,
            variant,
            follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            sequence: 1,
            follow_up_sent: false,
          })
          .select("id")
          .single();

        const unsubUrl = `https://outreach-ochre-sigma.vercel.app/unsubscribe?l=${lead.id}&c=${lead.campaign_id ?? ""}`;
        const htmlPart = emailRow?.id && !insertErr
          ? buildHtmlBody(body).replace("</body>", `<img src="https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/track-open?id=${emailRow.id}" width="1" height="1" alt="" style="display:none;border:0" /></body>`)
          : buildHtmlBody(body);

        await sendGmail(accessToken, buildRawEmail(lead.email, subject, body, htmlPart, profile.gmail_email ?? "", unsubUrl));

        await supabase.from("leads").update({ status: "emailed" }).eq("id", lead.id);

        sent++;
        sentToday++;

        if (sent < leads.length) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      } catch (e) {
        console.error(`Failed to send to ${lead.email}:`, e instanceof Error ? e.message : e);
      }
    }

    // Single counter update per batch (not per email)
    if (sent > 0) {
      await supabase.from("profiles").update({
        emails_sent_today: sentToday,
        emails_sent_date: today,
      }).eq("id", userId);
    }

    // Decide whether another batch should be requested
    const stillRemainingToday = dailyCap - sentToday;
    const { count: leadsLeft } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "new");

    return json({
      sent,
      sentToday,
      remainingToday: Math.max(stillRemainingToday, 0),
      continue: stillRemainingToday > 0 && (leadsLeft ?? 0) > 0,
    });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
