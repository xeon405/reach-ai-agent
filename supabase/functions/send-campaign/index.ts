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

Rules for body:
- Max 5 sentences
- Sound human, not salesy
- Reference their specific role
- Include ONE short transparent sentence mentioning that this email was found, written and sent automatically by your AI agent
- End with a simple question
- Sign off with "Best regards"
- No subject line in body`,
      }],
    }),
  });
  if (!res.ok) throw new Error("AI generation failed: " + (await res.text()));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return { subject: String(parsed.subject), body: String(parsed.body) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = await getAuthedUserId(req);
    const { campaignId } = await req.json();
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
    if (!profile.gmail_connected || !profile.gmail_refresh_token) {
      throw new Error("Gmail not connected. Connect it in Settings first.");
    }

    // Check plan limits
    const plan = profile.plan ?? "starter";
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;

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

    const remainingToday = limits.dailyEmails - sentToday;
    if (remainingToday <= 0) {
      return json({
        sent: 0,
        sentToday,
        remainingToday: 0,
        continue: false,
        error: `Daily limit reached. Your ${plan} plan allows ${limits.dailyEmails} emails/day.`,
      }, 429);
    }

    // Refresh Gmail token once per batch
    const accessToken = await refreshGmailToken(profile.gmail_refresh_token);
    await supabase.from("profiles").update({ gmail_access_token: accessToken }).eq("id", userId);

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

    let sent = 0;

    for (const lead of leads) {
      try {
        const { subject, body } = await generateEmail(
          lead.name ?? "there",
          lead.company ?? "your company",
          lead.job_title ?? "professional",
          profile.offer ?? "our service"
        );

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

        await supabase.from("profiles").update({
          emails_sent_today: sentToday,
          emails_sent_date: today,
        }).eq("id", userId);

        if (sent < leads.length) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      } catch (e) {
        console.error(`Failed to send to ${lead.email}:`, e instanceof Error ? e.message : e);
      }
    }

    // Decide whether another batch should be requested
    const stillRemainingToday = limits.dailyEmails - sentToday;
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
