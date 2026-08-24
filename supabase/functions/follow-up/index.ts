import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO, nicheFor, searchDirectory } from "../_shared/osm.ts";
import { groqChat, groqKeys, sanitizeForPrompt } from "../_shared/groq.ts";

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
        .select("id, user_id, sent_at, lead:leads(id, email, unsubscribed, name, company, job_title, country)")
        .eq("replied", false)
        .order("sent_at", { ascending: false })
        .limit(60);

      const scanUserIds = [...new Set((openEmails ?? []).map((e) => e.user_id))];
      const { data: scanProfiles } = scanUserIds.length
        ? await supabase.from("profiles").select("*").in("id", scanUserIds)
        : { data: [] };
      const scanProfileMap = Object.fromEntries((scanProfiles ?? []).map((p) => [p.id, p]));
      const scanTokens = await fetchTokenMap(supabase, scanUserIds);

      // 💥 Bounce sweep: delivery failures from mailer-daemon/postmaster mean dead
      // addresses. Mark those leads bounced (unsubscribed=true reuses all suppression).
      for (const uid of scanUserIds) {
        const rt = scanTokens[uid];
        if (!rt) continue;
        try {
          const bRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
              "{from:mailer-daemon from:postmaster} newer_than:7d"
            )}&maxResults=10`,
            { headers: { Authorization: `Bearer ${await refreshGmailToken(rt)}` } }
          );
          if (!bRes.ok) continue;
          const bData = await bRes.json();
          for (const msg of bData.messages ?? []) {
            const mRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Delivered-To`,
              { headers: { Authorization: `Bearer ${await refreshGmailToken(rt)}` } }
            );
            if (!mRes.ok) continue;
            const mData = await mRes.json();
            const toHeader = (mData?.payload?.headers ?? [])
              .filter((h: { name: string }) => /to/i.test(h.name))
              .map((h: { value: string }) => h.value)
              .join(" ");
            const failedAddr = toHeader.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
            if (!failedAddr) continue;
            const { data: badLead } = await supabase
              .from("leads")
              .select("id")
              .eq("user_id", uid)
              .eq("email", failedAddr)
              .maybeSingle();
            if (badLead) {
              await supabase.from("leads").update({ status: "bounced", unsubscribed: true }).eq("id", badLead.id);
            }
          }
        } catch (bErr) {
          console.error("[follow-up] Bounce sweep failed:", bErr instanceof Error ? bErr.message : bErr);
        }
      }

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
        let fullReplyText = "";
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=metadata&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${await refreshGmailToken(refreshToken)}` } }
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            replySubject = msgData?.payload?.headers?.find((h: { name: string }) => h.name === "Subject")?.value ?? "";
            const snippet: string = msgData?.snippet ?? "";
            const msgSnippet = snippet;

            // Pull the full reply body so the AI can respond to specifics
            try {
              const fullRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=full`,
                { headers: { Authorization: `Bearer ${await refreshGmailToken(refreshToken)}` } }
              );
              if (fullRes.ok) {
                const fullData = await fullRes.json();
                fullReplyText = extractGmailBody(fullData?.payload).slice(0, 900);
              }
            } catch (_be) { /* fall back to snippet */ }

            // Check for opt-out request first (keyword match beats AI)
            if (/unsubscribe|opt.?out|remove me|stop emailing/i.test(replySubject)) {
              unsubscribes++;
              sentiment = "NOT_INTERESTED";
              await supabase.from("leads").update({ unsubscribed: true, status: "unsubscribed" }).eq("id", lead.id);
            } else {
              if (groqKeys().length > 0 && (replySubject || snippet)) {
                try {
                  const raw = (await groqChat([
                    { role: "system", content: "Classify this cold-email reply into exactly one word: INTERESTED, MAYBE, or NOT_INTERESTED. Reply with only that word." },
                    { role: "user", content: `Subject: ${sanitizeForPrompt(replySubject, 150)}\nPreview: ${sanitizeForPrompt(snippet, 300)}` },
                  ], { maxTokens: 200, temperature: 0 })).toUpperCase();
                  if (raw.includes("INTERESTED") && !raw.includes("NOT")) sentiment = "INTERESTED";
                  else if (raw.includes("MAYBE")) sentiment = "MAYBE";
                  else if (raw.includes("NOT_INTERESTED") || raw.includes("NOT INTERESTED")) sentiment = "NOT_INTERESTED";
                } catch (_e) { /* fall through to MAYBE */ }
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

        // 🧠 Draft the reply for the user when the lead looks warm
        let draft = "";
        if (sentiment === "INTERESTED" || sentiment === "MAYBE") {
          try {
            draft = await groqChat([{
              role: "user",
              content: `A reply arrived to a cold email you sent.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}${lead.country ? `, ${sanitizeForPrompt(lead.country, 40)}` : ""}
Their exact words: "${sanitizeForPrompt(fullReplyText || msgSnippet, 900)}"
You originally offered: ${sanitizeForPrompt(profile.offer ?? "our services")}${profile.booking_link ? `
Their booking link: ${profile.booking_link} — invite them to book there.` : ""}

Write a 3-4 sentence human reply on behalf of the sender. Warm, confident, zero fluff.${sentiment === "MAYBE" ? " Gently keep the door open." : " Move toward booking a call."}
Rules: respond to something SPECIFIC they actually said (quote or reference it). Ask exactly one question that moves toward a call. Never use placeholders like [name]. Sign off as "Best regards". Return only the reply text.${(email as { ai_draft?: string }).ai_draft ? `\nIMPORTANT: You already sent them this earlier reply: "${sanitizeForPrompt((email as { ai_draft?: string }).ai_draft!, 300)}" — your new reply must use completely different wording, structure and opening line.` : ""}`,
            }], { maxTokens: 600, temperature: 0.9 });
          } catch (draftErr) {
            console.error("[follow-up] Draft failed:", draftErr instanceof Error ? draftErr.message : draftErr);
          }
          if (draft) {
            try {
              await supabase.from("emails_sent").update({ ai_draft: draft }).eq("id", email.id);
            } catch (saveErr) {
              console.error("[follow-up] Draft save failed:", saveErr instanceof Error ? saveErr.message : saveErr);
            }

            // 🚀 AUTOPILOT: campaign opted in → send the reply automatically
            if (sentiment === "INTERESTED") {
              try {
                const { data: camp } = await supabase
                  .from("campaigns")
                  .select("autopilot")
                  .eq("id", email.campaign_id)
                  .maybeSingle();
                if (camp?.autopilot) {
                  const accessToken2 = await refreshGmailToken(refreshToken);
                  const selfEmail = profile.gmail_email || profile.email;
                  await sendGmail(
                    accessToken2,
                    buildRawEmail(
                      lead.email,
                      replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`,
                      `${draft}\n\n--\nReply with UNSUBSCRIBE to stop further emails.`,
                      selfEmail
                    )
                  );
                  await supabase.from("emails_sent").update({ autoreplied: true, ai_draft: draft }).eq("id", email.id);
                }
              } catch (autoErr) {
                console.error("[follow-up] Autopilot send failed:", autoErr instanceof Error ? autoErr.message : autoErr);
              }
            }
          }
        }

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
                  `${lead.name ?? lead.email} (${lead.email}) just replied to your outreach email.\n\nAI verdict: ${tag}\nSubject: ${replySubject || "(see Gmail)"}\n\nOpen Gmail and search: from:${lead.email}\n${draft ? `\n✍️ Suggested reply (copy, tweak, send):\n\n"""\n${draft}\n"""\n` : ""}\n— OutreachAI Agent`,
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

    // 🤖 AUTOPILOT: once a day (~05:00 UTC) top up campaigns and trigger sends
    // for every user who flipped the switch. They do nothing; the agent works.
    if (new Date().getUTCHours() === 5) {
      try {
        const { data: pilots } = await supabase
          .from("profiles")
          .select("id, autopilot_country, autopilot_niche, gmail_email")
          .eq("autopilot", true);
        for (const pilot of pilots ?? []) {
          try {
            const tokens = await fetchTokenMap(supabase, [pilot.id]);
            if (!tokens[pilot.id]) continue; // Gmail not connected → skip

            // Find (or create) their most recent campaign
            let { data: camp } = await supabase
              .from("campaigns")
              .select("id")
              .eq("user_id", pilot.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!camp) {
              const { data: created } = await supabase
                .from("campaigns")
                .insert({ user_id: pilot.id, name: "Autopilot campaign", status: "active" })
                .select("id")
                .single();
              camp = created;
            }
            if (!camp) continue;

            // Top up: keep at least 15 fresh leads queued
            const { count: freshCount } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .eq("status", "new");
            if ((freshCount ?? 0) < 15 && pilot.autopilot_country && pilot.autopilot_niche) {
              const iso =
                COUNTRY_ISO[String(pilot.autopilot_country).toLowerCase().trim()] ??
                String(pilot.autopilot_country || "").toUpperCase().slice(0, 2);
              if (iso && iso.length === 2) {
                const niche = nicheFor(String(pilot.autopilot_niche));
                const found = await searchDirectory(niche, iso, 25 - Math.min(15, freshCount ?? 0));
                const existing = new Set(
                  (await supabase.from("leads").select("email").eq("user_id", pilot.id)).data?.map(
                    (l: { email: string }) => String(l.email || "").toLowerCase()
                  ) ?? []
                );
                const rows = found
                  .filter((l: { email?: string }) => l.email && !existing.has(String(l.email).toLowerCase()))
                  .map((l: { name?: string; email?: string; company?: string; job_title?: string }) => ({
                    user_id: pilot.id,
                    campaign_id: camp.id,
                    name: l.name ?? null,
                    email: l.email,
                    company: l.company ?? null,
                    job_title: l.job_title ?? null,
                    country: pilot.autopilot_country,
                    status: "new",
                  }));
                if (rows.length > 0) await supabase.from("leads").insert(rows);
              }
            }

            // Trigger a send batch through send-campaign's cron path
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-campaign`, {
              method: "POST",
              headers: {
                "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
                "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ campaign_id: camp.id, user_id: pilot.id }),
            });
          } catch (pilotErr) {
            console.error("[autopilot] pilot failed:", pilotErr instanceof Error ? pilotErr.message : pilotErr);
          }
        }
      } catch (apErr) {
        console.error("[autopilot] pass failed:", apErr instanceof Error ? apErr.message : apErr);
      }
    }

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
      .in("sequence", [1, 3])
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

        // Multi-step sequence: step 2 = gentle nudge (+3d), step 3 = breakup (+4d more)
        const step = email.sequence === 1 ? 2 : 3;
        const firstName = (lead.name ?? "there").split(" ")[0];
        const subject = String(email.subject ?? "").startsWith("Re: ")
          ? String(email.subject)
          : `Re: ${email.subject}`;
        const body =
          step === 2
            ? `Hi ${firstName},

Just floating this back up — I know inboxes get busy.

Worth a quick 15-minute chat about ${lead.company ?? "your team"}? Happy to work around your schedule.

Best regards

--

⚡ Still automated — my AI agent sent this follow-up too.
Get your own AI outreach agent → https://outreach-ochre-sigma.vercel.app

Reply with UNSUBSCRIBE to opt out.${profile.booking_link ? `\n📅 Book time with me directly: ${profile.booking_link}` : ""}${Deno.env.get("SENDER_ADDRESS") ? `\n${Deno.env.get("SENDER_ADDRESS")}` : ""}`
            : `Hi ${firstName},

I'll stop reaching out after this one 🙂

If ${lead.company ?? "your team"} ever needs help turning cold outreach into booked meetings, my door is open. Otherwise, wishing you a great quarter.

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
          sequence: step,
          follow_up_sent: true,
        });

        if (step === 2) {
          // Schedule the final breakup step
          await supabase.from("emails_sent").insert({
            user_id: email.user_id,
            lead_id: lead.id,
            campaign_id: email.campaign_id,
            subject,
            body: "(scheduled step 3)",
            sequence: 3,
            follow_up_sent: false,
            follow_up_at: new Date(Date.now() + 4 * 86400000).toISOString(),
          });
        }

        await supabase.from("emails_sent").update({ follow_up_sent: true }).eq("id", email.id);

        sent++;
      } catch (e) {
        console.error(`Follow-up failed for email ${email.id}:`, e instanceof Error ? e.message : e);
      }
    }

    // ♻️ QUEUE REVIVAL: nudge any pending send_queue jobs so nothing ever sits stuck
    try {
      const { data: pendingCamps } = await supabase
        .from("send_queue")
        .select("user_id, campaign_id")
        .eq("status", "pending")
        .limit(50);
      const seen = new Set<string>();
      for (const row of pendingCamps ?? []) {
        const key = `${row.user_id}:${row.campaign_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-campaign`, {
          method: "POST",
          headers: {
            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: row.campaign_id, user_id: row.user_id }),
        });
      }
    } catch (reviveErr) {
      console.error("[follow-up] queue revival failed:", reviveErr instanceof Error ? reviveErr.message : reviveErr);
    }

    return json({ sent, repliesFound, unsubscribes });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
