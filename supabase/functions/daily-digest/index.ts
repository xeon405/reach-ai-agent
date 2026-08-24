import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAccessToken, sendGmailRaw, buildRawEmail } from "../_shared/gmail.ts";
import { insertAudit } from "../_shared/audit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const auth = req.headers.get("authorization") ?? "";
    const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
    const isService = !!serviceKey && auth === `Bearer ${serviceKey}`;
    if (!isCron && !isService) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const today = new Date().toISOString().split("T")[0];
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data: digestProfiles } = await supabase
      .from("profiles")
      .select("id, email, gmail_email, last_digest_date")
      .neq("last_digest_date", today);
    let digestsSent = 0;

    for (const dp of digestProfiles ?? []) {
      try {
        const { data: sentRows } = await supabase
          .from("emails_sent")
          .select("id, replied, opened, reply_sentiment, autoreplied, campaign_id")
          .eq("user_id", dp.id)
          .gte("sent_at", since)
          .limit(500);
        if (!sentRows || sentRows.length === 0) continue;

        const { count: failed24 } = await supabase.from("send_queue").select("id", { count: "exact", head: true })
          .eq("user_id", dp.id).in("status", ["failed", "dead"]).gte("updated_at", since);
        const { count: bounced24 } = await supabase.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", dp.id).eq("event", "email.bounced").gte("created_at", since);
        const { count: unsubs24 } = await supabase.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", dp.id).in("event", ["lead.unsubscribed", "lead.suppressed"]).gte("created_at", since);
        const { count: bookings24 } = await supabase.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", dp.id).eq("event", "booking.detected").gte("created_at", since);
        const { count: takeovers24 } = await supabase.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", dp.id).eq("event", "human.takeover").gte("created_at", since);

        const opens = sentRows.filter((r: { opened?: boolean }) => r.opened).length;
        const replies = sentRows.filter((r: { replied: boolean }) => r.replied);
        const hot = replies.filter((r: { reply_sentiment?: string }) => r.reply_sentiment === "INTERESTED").length;
        const aiSent = sentRows.filter((r: { autoreplied?: boolean }) => r.autoreplied).length;

        const perCamp = new Map<string, { s: number; r: number }>();
        for (const r of sentRows) {
          const k = r.campaign_id ?? "none";
          const cur = perCamp.get(k) ?? { s: 0, r: 0 };
          cur.s++; if (r.replied) cur.r++;
          perCamp.set(k, cur);
        }
        const campLines = [...perCamp.entries()].map(([cid, v]) => `   • ${cid.slice(0, 8)}…: ${v.s} sent · ${v.r} replies`).join("\n");

        const self = dp.gmail_email || dp.email;
        if (!self) continue;
        const tok = await getAccessToken(supabase, dp.id);
        if (!tok) continue;
        await sendGmailRaw(tok.accessToken, buildRawEmail(self,
          `☀️ Your agent's last 24h: ${sentRows.length} sent · ${replies.length} replies · ${hot} hot 🔥`,
          `Morning report from your OutreachAI agent:

• Emails sent: ${sentRows.length}
• Failed/dead queue jobs: ${failed24 ?? 0}
• Bounces: ${bounced24 ?? 0}
• Opens: ${opens}
• Replies: ${replies.length}
• 🔥 Interested: ${hot}
• 📅 Booking-intent conversations: ${bookings24 ?? 0}
• 🚫 Unsubscribes: ${unsubs24 ?? 0}
• 🤖 AI replies sent: ${aiSent}
• 🤝 Human takeovers: ${takeovers24 ?? 0}

Campaign performance (last 24h):
${campLines || "   • (none)"}

${hot > 0 || (bookings24 ?? 0) > 0 ? "You have HOT leads waiting — check Gmail now!" : "Keep the pipeline full — import fresh leads today."}

— OutreachAI Agent`,
          self));
        await supabase.from("profiles").update({ last_digest_date: today }).eq("id", dp.id);
        await insertAudit(supabase, { user_id: dp.id, event: "digest.sent", payload: { sent: sentRows.length, replies: replies.length, hot } });
        digestsSent++;
      } catch (digestErr) {
        console.error("[daily-digest] profile failed:", digestErr instanceof Error ? digestErr.message : digestErr);
      }
    }

    return json({ ok: true, digestsSent });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
