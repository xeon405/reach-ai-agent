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

        // Fetch subject + snippet, then let AI classify the reply
        let sentiment = "";
        let replySubject = "";
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=metadata&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${await refreshGmailToken(refreshToken)}` } }
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            replySubject = msgData?.payload?.headers?.find((h: { name: string }) => h.name === "Subject")?.value ?? "";
            const snippet: string = msgData?.snippet ?? "";

            // Check for opt-out request first (keyword match beats AI)
            if (/unsubscribe|opt.?out|remove me|stop emailing/i.test(replySubject)) {
              unsubscribes++;
              sentiment = "NOT_INTERESTED";
              await supabase.from("leads").update({ unsubscribed: true, status: "unsubscribed" }).eq("id", lead.id);
            } else {
              const keys = (Deno.env.get("GROQ_API_KEYS") ?? Deno.env.get("GROQ_API_KEY") ?? "")
                .split(",").map((s: string) => s.trim()).filter(Boolean);
              if (keys.length > 0 && (replySubject || snippet)) {
                const model = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
                const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys[Math.floor(Math.random() * keys.length)]}` },
                  body: JSON.stringify({
                    model,
                    messages: [
                      { role: "system", content: "Classify this cold-email reply into exactly one word: INTERESTED, MAYBE, or NOT_INTERESTED. Reply with only that word." },
                      { role: "user", content: `Subject: ${replySubject}\nPreview: ${snippet}` },
                    ],
                    temperature: 0,
                    max_tokens: 5,
                  }),
                });
                if (aiRes.ok) {
                  const aiData = await aiRes.json();
                  const raw: string = String(aiData?.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
                  if (raw.includes("INTERESTED") && !raw.includes("NOT")) sentiment = "INTERESTED";
                  else if (raw.includes("MAYBE")) sentiment = "MAYBE";
                  else if (raw.includes("NOT_INTERESTED") || raw.includes("NOT INTERESTED")) sentiment = "NOT_INTERESTED";
                }
              }
              if (!sentiment) sentiment = "MAYBE";
            }
            await supabase.from("emails_sent").update({ reply_sentiment: sentiment }).eq("id", email.id);
          }
        } catch (classErr) {
          console.error("[follow-up] Reply classification failed:", classErr instanceof Error ? classErr.message : classErr);
          sentiment = sentiment || "MAYBE";
        }

        const tag = sentiment === "INTERESTED" ? "🔥 INTERESTED" : sentiment === "NOT_INTERESTED" ? "❌ Not interested" : "😴 Maybe later";

        // Alert the user from their own inbox (free, no SMTP needed)
        if (profile.notify_replies !== false) {
          try {
            const selfEmail = profile.gmail_email || profile.email;
            if (selfEmail) {
              await sendGmail(
                await refreshGmailToken(refreshToken),
                buildRawEmail(
                  selfEmail,
                  `${tag} — New reply from ${lead.name ?? lead.email}`,
                  `${lead.name ?? lead.email} (${lead.email}) just replied to your outreach email.\n\nAI verdict: ${tag}\nSubject: ${replySubject || "(see Gmail)"}\n\nOpen Gmail and search: from:${lead.email}\n\n— OutreachAI Agent`,
                  selfEmail
                )
              );
            }
          } catch (notifyErr) {
            console.error("[follow-up] Reply alert failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
          }
        }
      }
    } catch (scanErr) {
      console.error("[follow-up] Reply scan error:", scanErr instanceof Error ? scanErr.message : scanErr);
    }

    // Find all first-touch emails that are due for a follow-up
    const now = new Date().toISOString();

    // ☀️ Morning digest: once a day (~10:30am IST / 04:00 UTC) email each active
    // sender a summary of their agent's yesterday. Runs inline with the hourly cron.
    if (new Date().getUTCHours() === 4) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const { data: digestProfiles } = await supabase
          .from("profiles")
          .select("id, email, gmail_email, created_at, last_digest_date")
          .neq("last_digest_date", today);
        for (const dp of digestProfiles ?? []) {
          const { data: sentRows } = await supabase
            .from("emails_sent")
            .select("id, replied, reply_sentiment")
            .eq("user_id", dp.id)
            .gte("sent_at", new Date(Date.now() - 86400000).toISOString())
            .limit(500);
          if (!sentRows || sentRows.length === 0) continue;
          const replies = sentRows.filter((r: { replied: boolean }) => r.replied);
          const hot = replies.filter((r: { reply_sentiment?: string }) => r.reply_sentiment === "INTERESTED").length;
          const self = dp.gmail_email || dp.email;
          if (!self) continue;
          try {
            await sendGmail(
              await refreshGmailToken((await fetchTokenMap(supabase, [dp.id]))[dp.id]),
              buildRawEmail(
                self,
                `☀️ Your agent's last 24h: ${sentRows.length} emails · ${replies.length} replies · ${hot} hot 🔥`,
                `Morning report from your OutreachAI agent:\n\n• Emails sent (24h): ${sentRows.length}\n• Replies detected: ${replies.length}\n• 🔥 Interested: ${hot}\n• 😴 Maybe later: ${replies.filter((r: { reply_sentiment?: string }) => r.reply_sentiment === "MAYBE").length}\n• ❌ Not interested: ${replies.filter((r: { reply_sentiment?: string }) => r.reply_sentiment === "NOT_INTERESTED").length}\n\n${hot > 0 ? "You have interested leads waiting — check Gmail now!" : "Keep the pipeline full — import fresh leads today."}\n\n— OutreachAI Agent`,
                self
              )
            );
            await supabase.from("profiles").update({ last_digest_date: today }).eq("id", dp.id);
          } catch (digestErr) {
            console.error("[follow-up] Digest failed:", digestErr instanceof Error ? digestErr.message : digestErr);
          }
        }
      } catch (outerErr) {
        console.error("[follow-up] Digest pass failed:", outerErr instanceof Error ? outerErr.message : outerErr);
      }
    }

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

Reply with UNSUBSCRIBE to opt out.${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`;

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
