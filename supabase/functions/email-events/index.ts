// SendGrid Event Webhook receiver. Turns delivery events into suppression:
//   bounce / dropped      -> lead BOUNCED + suppression + queue cancel
//   spamreport            -> lead UNSUBSCRIBED + suppression + alert
//   unsubscribe / group_  -> lead UNSUBSCRIBED + suppression + alert
// Replaces the Gmail "mailer-daemon" bounce sweep (inbox-agent).
//
// Deployed with verify_jwt OFF (SendGrid cannot send our JWT).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const HANDLED = new Set(["bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json().catch(() => null);
    const events: Record<string, any>[] = Array.isArray(payload) ? payload : payload ? [payload] : [];

    let handled = 0;
    for (const e of events) {
      const type = String(e?.event ?? "").toLowerCase();
      const email = String(e?.email ?? "").trim().toLowerCase();
      if (!email || !HANDLED.has(type)) continue;

      // Match leads by exact normalized email, falling back to exact email.
      let { data: leads } = await supabase
        .from("leads").select("id, user_id, campaign_id, email, lifecycle")
        .eq("normalized_email", email);
      if (!leads || leads.length === 0) {
        const { data: l2 } = await supabase
          .from("leads").select("id, user_id, campaign_id, email, lifecycle")
          .eq("email", email);
        leads = l2 ?? [];
      }
      if (!leads.length) continue;

      const isBounce = type === "bounce" || type === "dropped";
      const reason = isBounce ? "bounced" : type === "spamreport" ? "spam_report" : "unsubscribed";

      for (const lead of leads) {
        if (isBounce && lead.lifecycle === "BOUNCED") continue;
        if (!isBounce && lead.lifecycle === "UNSUBSCRIBED") continue;

        if (isBounce) {
          await supabase.from("leads").update({ status: "bounced", unsubscribed: true, lifecycle: "BOUNCED" }).eq("id", lead.id);
        } else {
          await supabase.from("leads").update({ status: "unsubscribed", unsubscribed: true, lifecycle: "UNSUBSCRIBED", conv_mode: "PAUSED" }).eq("id", lead.id);
        }

        await supabase.from("suppressions").upsert({
          user_id: lead.user_id, lead_id: lead.id, email, reason, source: "sendgrid_event",
        }, { onConflict: "user_id,email" });

        await supabase.from("send_queue").update({ status: "cancelled", last_error: reason, updated_at: new Date().toISOString() })
          .eq("lead_id", lead.id).in("status", ["pending", "claimed"]);

        await supabase.from("owner_alerts").insert({
          user_id: lead.user_id, lead_id: lead.id,
          kind: isBounce ? "bounce" : "opt_out",
          title: isBounce ? `💥 Bounce: ${email}` : type === "spamreport" ? `⚠️ Spam report: ${email}` : `🚫 Opt-out: ${email}`,
          body: isBounce ? "Address is dead — suppressed permanently." : "They opted out or marked spam — suppressed.",
          priority: "normal",
        });

        await insertAudit(supabase, {
          user_id: lead.user_id, campaign_id: lead.campaign_id, lead_id: lead.id,
          event: isBounce ? "email.bounced" : "email.unsubscribed",
          payload: { source: "sendgrid_event", type, reason: e?.reason ?? null },
        });
        handled++;
      }
    }

    return json({ ok: true, handled });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
  }
});
