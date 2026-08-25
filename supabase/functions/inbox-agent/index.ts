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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SITE = "https://outreach-ochre-sigma.vercel.app";
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

/** Fetches the owner's website and reduces it to a compact text knowledge
 *  base so the AI can answer prospect questions about the business itself.
 *  Fails soft: any problem returns "" and prompts fall back to current behavior. */
async function fetchSiteKnowledge(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; OutreachAI/1.0)" }, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 200_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1500);
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
          if (!profile || !rt || !lead?.email || lead.unsubscribed || ["UNSUBSCRIVED", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(lead.status ?? "")) continue;
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
          try {
            const fullRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=full`,
              { headers: { Authorization: `Bearer ${tok.accessToken}` } }
            );
            if (fullRes.ok) {
              const fullData = await fullRes.json();
              replySubject = (fullData?.payload?.headers ?? []).find((h: { name: string }) => h.name === "Subject")?.value ?? "";
              snippet = fullData?.snippet ?? "";
              fullReplyText = stripQuoted(extractGmailBody(fullData?.payload)).slice(0, 900);
            }
          } catch (_e) { /* fall back to empty */ }

          // ---- STRUCTURED AI CLASSIFICATION (advice only) ---------------
          let cls: Classification = parseClassification("", `${replySubject}\n${snippet || fullReplyText}`);
          if (groqKeys().length > 0 && (replySubject || fullReplyText || snippet)) {
            try {
              const raw = await groqChat([
                { role: "system", content: classificationSystemPrompt() },
                { role: "user", content: `Subject: ${sanitizeForPrompt(replySubject, 150)}\nMessage: ${sanitizeForPrompt(fullReplyText || snippet, 800)}` },
              ], { maxTokens: 300, temperature: 0 });
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
            suggested_action: cls.suggested_action, raw: { subject: replySubject.slice(0, 150) },
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
            await notifySelf(tok.accessToken, profile, `🚫 ${lead.name ?? lead.email} asked to stop — suppressed permanently.\n→ ${SITE}/leads`);
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
            await notifySelf(tok.accessToken, profile, `🔥 HOT: ${lead.name ?? lead.email} wants to book a call!\nThey said: "${(fullReplyText || snippet).slice(0, 150)}"\n${profile.website_url ? "AI replied pointing them to your site." : "AI stepped back — reply from your Gmail to close."}\n→ ${SITE}/emails`);
            await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "booking.detected", payload: {} });

            if (!profile.website_url) {
              // No self-serve destination — park the thread; the human must close.
              await supabase.from("emails_sent").update({ ai_paused: true }).eq("id", email.id);
            } else {
              // Self-serve funnel: AI answers and points to the owner's site; thread stays alive.
              try {
                const siteKnowledge = await fetchSiteKnowledge(profile.website_url);
                const bDraft = await groqChat([{
                  role: "user",
                  content: `A lead just replied asking how to get started / book a meeting.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)}
Their exact words: "${sanitizeForPrompt(fullReplyText || snippet, 600)}"
What we offer: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (factual only — never invent anything beyond it): "${sanitizeForPrompt(siteKnowledge, 1000)}"` : ""}
Your site — direct them there to get started: ${sanitizeForPrompt(profile.website_url, 200)}

Write a short warm reply (2-3 sentences) on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)} that answers them and clearly points them to the site link above as the next step. Sign off as "Best regards". Return only the reply text.`,
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
                    await supabase.from("emails_sent").update({ autoreplied: true, ai_draft: bDraft.trim(), gmail_thread_id: ids.threadId, last_ai_msg_at: new Date().toISOString(), last_lead_msg_at: new Date().toISOString() }).eq("id", email.id);
                    await insertAudit(supabase, { user_id: email.user_id, campaign_id: email.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { kind: "booking_self_serve" } });
                  }
                }
              } catch (_be) { /* alert already sent — owner can still close manually */ }
            }
            continue;
          }

          // Generate a draft for warm replies (AUTO_REPLY or ALERT_OWNER)
          if (cls.interested || cls.sentiment !== "NOT_INTERESTED") {
            tag = cls.sentiment === "INTERESTED" ? "🔥 INTERESTED" : cls.sentiment === "MAYBE" ? "😴 Maybe later" : "❌ Not interested";
            const siteKnowledge = profile.website_url ? await fetchSiteKnowledge(profile.website_url) : "";
            try {
              draft = await groqChat([{
                role: "user",
                content: `A reply arrived to a cold email you sent.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}${lead.country ? `, ${sanitizeForPrompt(lead.country, 40)}` : ""}
Their exact words: "${sanitizeForPrompt(fullReplyText || snippet, 900)}"
You originally offered: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (from your website — use this to answer questions factually; never invent anything not written here or above):
"${sanitizeForPrompt(siteKnowledge, 1400)}"` : ""}${profile.booking_link ? `
Your booking link was already included in your first email to them — do NOT paste it again. If pointing them to it, say "the link I sent earlier".` : ""}

Write a 3-4 sentence human reply on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)}. Warm, confident, zero fluff.${cls.sentiment === "MAYBE" ? " Gently keep the door open." : " Move toward booking a call."}
Rules: respond to something SPECIFIC they actually said (quote or reference it). If they asked a question, ANSWER it directly using the company knowledge base above when possible — when they ask what we do or how it works, briefly state 1-2 concrete capabilities from the knowledge base in your own words before pointing them onward; never invent pricing or facts. If the answer lives on your website${profile.website_url ? ` (${sanitizeForPrompt(profile.website_url, 120)})` : ""}, point them there. Ask exactly one question that moves toward a call. Never use placeholders like [name]. Sign off as "Best regards". Return only the reply text.`,
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

          // Owner alert for every detected first reply (slim + link)
          if (profile.notify_replies !== false) {
            await notifySelf(tok.accessToken, profile, `${lead.name ?? lead.email} replied to your outreach.\n\nVerdict: ${tag}\nTheir message: "${(fullReplyText || snippet).slice(0, 150)}"\n\nThe AI already drafted a personal response for you.\nReview & send it in one click:\n→ ${SITE}/emails\n\n— OutreachAI Agent`, `${tag} — New reply from ${lead.name ?? lead.email}`);
            await supabase.from("owner_alerts").insert({ user_id: email.user_id, lead_id: lead.id, kind: "first_reply", title: `${tag} — ${lead.name ?? lead.email}`, body: (fullReplyText || snippet).slice(0, 280), priority: cls.interested ? "high" : "normal" });
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
                  .map((l: { name?: string; email?: string; company?: string; job_title?: string }) => ({
                    user_id: pilot.id, campaign_id: camp!.id, name: l.name ?? null, email: l.email,
                    company: l.company ?? null, job_title: l.job_title ?? null,
                    country: pilot.autopilot_country, status: "new",
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
              if (profile.notify_replies !== false) {
                await notifySelf(tok.accessToken, profile, `You replied to ${lead.email} yourself, so the AI has stopped auto-answering this thread.\nThe conversation is all yours now.\n→ ${SITE}/emails`, `🤝 AI stepped back — you're talking with ${lead.name ?? lead.email}`);
              }
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
              const raw = await groqChat([
                { role: "system", content: classificationSystemPrompt() },
                { role: "user", content: `Subject: ${sanitizeForPrompt(subj, 150)}\nMessage: ${sanitizeForPrompt(theirWords, 800)}` },
              ], { maxTokens: 300, temperature: 0 });
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
            suggested_action: cls.suggested_action, raw: { subject: subj.slice(0, 150) },
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

          let ownerNote = "";

          switch (decision.action) {
            case "SUPPRESS": {
              unsubscribes++;
              await suppressLead(supabase, t.user_id, t.campaign_id, lead, "unsubscribe_requested");
              ownerNote = `🚫 ${lead.name ?? lead.email} asked to stop — suppressed permanently.\n→ ${SITE}/leads`;
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
              ownerNote = profile.website_url
                ? `🔥 HOT: ${lead.name ?? lead.email} wants to book a call!\nThey said: "${theirWords.slice(0, 150)}"\nAI replied pointing them to your site.\n→ ${SITE}/emails`
                : `🔥 HOT: ${lead.name ?? lead.email} wants to book a call!\nThey said: "${theirWords.slice(0, 150)}"\nAI stepped back — reply from your Gmail to close.\n→ ${SITE}/emails`;
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "booking.detected", payload: {} });

              if (!profile.website_url) {
                // No self-serve destination — park the thread; the human must close.
                await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
              } else {
                // Self-serve funnel: AI answers and points to the owner's site; thread stays alive.
                try {
                  const siteKnowledge = await fetchSiteKnowledge(profile.website_url);
                  const bReply = await groqChat([{
                    role: "user",
                    content: `A lead just replied asking how to get started / book a meeting.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)}
Their newest message: "${sanitizeForPrompt(theirWords, 600)}"
What we offer: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (factual only — never invent anything beyond it): "${sanitizeForPrompt(siteKnowledge, 1000)}"` : ""}
Your site — direct them there to get started: ${sanitizeForPrompt(profile.website_url, 200)}

Write a short warm reply (2-3 sentences) on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)} that answers them and clearly points them to the site link above as the next step. Sign off as "Best regards". Return only the reply text.`,
                  }], { maxTokens: 400, temperature: 0.8 });
                  if (bReply?.trim()) {
                    const ids = await sendGmailRaw(tok.accessToken, buildRawEmail(
                      lead.email,
                      subj.startsWith("Re:") ? subj : `Re: ${subj}`,
                      `${bReply.trim()}\n\n--\nReply UNSUBSCRIBE anytime to opt out.`,
                      profile.gmail_email || profile.email,
                      `${SITE}/unsubscribe?l=${lead.id}`
                    )).catch(() => null);
                    if (ids) {
                      aiRepliesSent++;
                      const newTurnsB = (t.ai_turns ?? 0) + 1;
                      await supabase.from("emails_sent").update({ autoreplied: true, ai_draft: bReply.trim(), gmail_thread_id: ids.threadId, ai_turns: newTurnsB, last_ai_msg_at: new Date().toISOString() }).eq("id", t.id);
                      await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "ai.reply_sent", payload: { kind: "booking_self_serve", turn: newTurnsB } });
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
              await supabase.from("emails_sent").update({ ai_paused: true, last_lead_msg_at: new Date(msgDateMs).toISOString() }).eq("id", t.id);
              await supabase.from("leads").update({ conv_mode: "PAUSED" }).eq("id", lead.id);
              await supabase.from("owner_alerts").insert({ user_id: t.user_id, lead_id: lead.id, kind: "handoff", title: `🤝 Handoff: ${lead.name ?? lead.email}`, body: decision.action === "HANDOFF_TO_HUMAN" && cls.requires_human ? "They need a human answer." : "Turn budget used.", priority: "high" });
              ownerNote = `🤝 ${lead.name ?? lead.email}: the AI handed this thread to you${cls.requires_human ? " (they need a human answer)" : ` after ${newTurns} conversation turns`}.\nContinue from your Gmail:\n→ ${SITE}/emails`;
              await insertAudit(supabase, { user_id: t.user_id, campaign_id: t.campaign_id, lead_id: lead.id, event: "agent.handoff", payload: { reason: cls.requires_human ? "requires_human" : "turn_budget" } });
              break;
            }
            case "AUTO_REPLY": {
              let aiReply: string | null = null;
              try {
                const siteKnowledge = profile.website_url ? await fetchSiteKnowledge(profile.website_url) : "";
                aiReply = await groqChat([{
                  role: "user",
                  content: `Ongoing email conversation with a lead.
Lead: ${sanitizeForPrompt(lead.name ?? lead.email, 80)} (${sanitizeForPrompt(lead.job_title, 80) || "professional"}) at ${sanitizeForPrompt(lead.company, 120)}${lead.country ? `, ${sanitizeForPrompt(lead.country, 40)}` : ""}.
Their newest message: "${sanitizeForPrompt(theirWords, 900)}"
Thread topic: ${sanitizeForPrompt(t.subject ?? "our services", 100)}
You originally offered: ${sanitizeForPrompt(profile.offer ?? "our services")}${siteKnowledge ? `
COMPANY KNOWLEDGE BASE (from your website — answer questions factually from this; never invent anything not written here or above):
"${sanitizeForPrompt(siteKnowledge, 1400)}"` : ""}${profile.booking_link ? `
Booking-link policy: your link was already shared earlier in this thread. Do NOT paste it again unless they explicitly ask for it or say they can't find it — refer to it as "the link I sent earlier".` : ""}${t.ai_turns > 0 && t.last_ai_msg_at ? "\nYou have already exchanged messages in this thread — keep continuity, do not reintroduce yourself." : ""}

Write a short (2-4 sentence) human reply on behalf of ${sanitizeForPrompt(profile.name ?? "the sender", 60)}. Match their energy and length. Answer whatever they asked directly and factually using the knowledge base when available — when they ask what we do or how it works, briefly state 1-2 concrete capabilities from the knowledge base in your own words before pointing them onward; never invent pricing or facts; if something isn't covered there${profile.website_url ? `, point them to ${sanitizeForPrompt(profile.website_url, 120)}` : ", offer to cover specifics on a call"}. Ask at most one question. Sign off as "Best regards". Return only the reply text.`,
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
                    ownerNote = `🤝 ${lead.name ?? lead.email}: the AI has used its 3 conversation turns, so the thread is now yours.\nContinue from your Gmail, or track it here:\n→ ${SITE}/emails`;
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

          if (ownerNote && profile.notify_replies !== false && profile.gmail_email) {
            await notifySelf(tok.accessToken, profile, ownerNote, subj.includes("Re:") ? `Re: ${subj.split("Re:").pop()?.trim()} — AI update` : `AI update: ${lead.name ?? lead.email}`).catch(() => {});
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

  async function notifySelf(accessToken: string, profile: Record<string, any>, body: string, subject?: string): Promise<void> {
    const self = profile.gmail_email || profile.email;
    if (!self) return;
    await sendGmailRaw(accessToken, buildRawEmail(self, subject ?? "OutreachAI update", body, self));
  }
});
