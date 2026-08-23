import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

async function fetchTokenMap(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("gmail_tokens")
    .select("profile_id, refresh_token")
    .in("profile_id", ids);
  return Object.fromEntries((data ?? []).map((r) => [r.profile_id, r.refresh_token]));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // This function runs on a schedule (external cron), so it authenticates
  // with a shared secret instead of a user JWT.
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // -----------------------------------------------------------------
    // PHASE 1: Reply & unsubscribe detection
    // Scans Gmail inboxes for messages from leads we emailed. If a lead
    // replied, mark the email + lead as replied; if the reply contains
    // "unsubscribe", permanently suppress that lead.
    // -----------------------------------------------------------------
    let repliesFound = 0;
    let unsubscribes = 0;

    try {
      const { data: openEmails } = await supabase
        .from("emails_sent")
        .select("id, user_id, sent_at, lead:leads(id, email, unsubscribed)")
        .eq("replied", false)
        .order("sent_at", { ascending: false })
        .limit(60);

      const scanUserIds = [...new Set((openEmails ?? []).map((e) => e.user_id))];
      const { data: scanProfiles } = scanUserIds.length
        ? await supabase.from("profiles").select("*").in("id", scanUserIds)
        : { data: [] };
      const scanProfileMap = Object.fromEntries((scanProfiles ?? []).map((p) => [p.id, p]));
      const scanTokens = await fetchTokenMap(supabase, scanUserIds);

      for (const email of openEmails ?? []) {
        const profile = scanProfileMap[email.user_id];
        const lead = Array.isArray(email.lead) ? email.lead[0] : email.lead;
        const refreshToken = scanTokens[email.user_id];
        if (!profile || !refreshToken || !lead?.email || lead.unsubscribed) continue;

        const afterEpoch = Math.floor(new Date(email.sent_at).getTime() / 1000);
        const q = `from:${lead.email} is:inbox after:${afterEpoch}`;
        const searchRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`,
          { headers: { Authorization: `Bearer ${await refreshGmailToken(refreshToken)}` } }
        );
        if (!searchRes.ok) continue;
        const searchData = await searchRes.json();
        const hits = searchData.messages ?? [];
        if (hits.length === 0) continue;

        repliesFound++;
        await supabase.from("emails_sent").update({ replied: true }).eq("id", email.id);
        await supabase.from("leads").update({ status: "replied" }).eq("id", lead.id);

        // Alert the user from their own inbox (free, no SMTP needed)
        if (profile.notify_replies !== false) {
          try {
            const selfEmail = profile.gmail_email || profile.email;
            if (selfEmail) {
              await sendGmail(
                await refreshGmailToken(refreshToken),
                buildRawEmail(
                  selfEmail,
                  `New reply from ${lead.name ?? lead.email}`,
                  `${lead.name ?? lead.email} (${lead.email}) just replied to your outreach email.\n\nOpen Gmail and search: from:${lead.email}\n\n— OutreachAI Agent`,
                  selfEmail
                )
              );
            }
          } catch (notifyErr) {
            console.error("[follow-up] Reply alert failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
          }
        }

        // Check subject for an opt-out request
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=metadata&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${await refreshGmailToken(refreshToken)}` } }
        );
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const subject = msgData?.payload?.headers?.find((h: { name: string }) => h.name === "Subject")?.value ?? "";
          if (/unsubscribe|opt.?out|remove me|stop emailing/i.test(subject)) {
            unsubscribes++;
            await supabase.from("leads").update({ unsubscribed: true, status: "unsubscribed" }).eq("id", lead.id);
          }
        }
      }
    } catch (scanErr) {
      console.error("[follow-up] Reply scan error:", scanErr instanceof Error ? scanErr.message : scanErr);
    }

    // Find all first-touch emails that are due for a follow-up
    const now = new Date().toISOString();
    const { data: emails } = await supabase
      .from("emails_sent")
      .select("*, lead:leads(*)")
      .eq("follow_up_sent", false)
      .eq("replied", false)
      .eq("sequence", 1)
      .lte("follow_up_at", now);

    if (!emails || emails.length === 0) {
      return json({ message: "No follow-ups due", repliesFound, unsubscribes });
    }

    // Fetch profiles separately (avoids the broken FK embed)
    const userIds = [...new Set(emails.map((e) => e.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    const fuTokens = await fetchTokenMap(supabase, userIds);

    let sent = 0;

    for (const email of emails) {
      try {
        const profile = profileMap[email.user_id];
        const lead = email.lead;
        const refreshToken = fuTokens[email.user_id];

        if (!profile || !refreshToken || !lead?.email) continue;

        const accessToken = await refreshGmailToken(refreshToken);

        const subject = `Re: ${email.subject}`;
        const body = `Hi ${lead.name ?? "there"},

I wanted to follow up on my previous email. I know things get busy, so I thought I'd check in.

Would it make sense to connect for a quick 15-minute call this week?

Best regards

--

⚡ Still automated — my AI agent sent this follow-up too.
Get your own AI outreach agent → https://outreach-ochre-sigma.vercel.app

Reply with UNSUBSCRIBE to opt out.${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

        await sendGmail(
          accessToken,
          buildRawEmail(lead.email, subject, body, profile.gmail_email ?? "")
        );

        await supabase.from("emails_sent").insert({
          user_id: email.user_id,
          lead_id: lead.id,
          campaign_id: email.campaign_id,
          subject,
          body,
          sequence: 2,
          follow_up_sent: true,
        });

        await supabase.from("emails_sent").update({ follow_up_sent: true }).eq("id", email.id);

        sent++;
      } catch (e) {
        console.error(`Follow-up failed for email ${email.id}:`, e instanceof Error ? e.message : e);
      }
    }

    return json({ sent, repliesFound, unsubscribes });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
