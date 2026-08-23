import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

function buildRawEmail(to: string, subject: string, body: string, fromEmail: string): string {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `List-Unsubscribe: <mailto:${fromEmail}?subject=unsubscribe>`,
    ``,
    body,
    ``,
    `--`,
    `You received this one-time email. Reply with UNSUBSCRIBE and you will not be contacted again.`,
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

async function generateEmail(
  leadName: string,
  leadCompany: string,
  leadJobTitle: string,
  userOffer: string
): Promise<{ subject: string; body: string }> {
  const keys = (Deno.env.get("GROQ_API_KEYS") ?? Deno.env.get("GROQ_API_KEY") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("No GROQ API keys configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys[Math.floor(Math.random() * keys.length)]}`,
    },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Write a short cold email to ${leadName}, ${leadJobTitle} at ${leadCompany}.
Our offer: ${userOffer}

Return ONLY a JSON object with this exact format:
{"subject": "...", "body": "..."}

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
      }],
    }),
  });
  if (!res.ok) {
    console.error("[send-campaign] Groq error:", await res.text());
    throw new Error("Email generation is temporarily unavailable — please try again.");
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return { subject: String(parsed.subject), body: String(parsed.body) };
}

// Smart send-time: deliver into each lead's local business morning
const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", CA: "America/Toronto", GB: "Europe/London", IE: "Europe/Dublin",
  IN: "Asia/Kolkata", AE: "Asia/Dubai", SA: "Asia/Riyadh", SG: "Asia/Singapore",
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
      .select("id, status")
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

    for (const lead of eligible) {
      try {
        const { subject, body: aiBody } = await generateEmail(
          lead.name ?? "there",
          lead.company ?? "your company",
          lead.job_title ?? "professional",
          profile.offer ?? "our service"
        );

        // Killer feature: every email is a live demo of the product
        const body = `${aiBody}

--

⚡ Fun fact: this email was found, written and sent automatically by an AI agent.
Want an AI agent doing this for YOUR sales pipeline? → https://outreach-ochre-sigma.vercel.app

Reply with UNSUBSCRIBE to opt out.${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

        await sendGmail(accessToken, buildRawEmail(lead.email, subject, body, profile.gmail_email ?? ""));

        await supabase.from("emails_sent").insert({
          user_id: userId,
          lead_id: lead.id,
          campaign_id: campaignId,
          subject,
          body,
          follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          sequence: 1,
          follow_up_sent: false,
        });

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
