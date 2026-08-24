// UNSUBSCRIBE — one-click opt-out (RFC 8058) + reply-based keyword path.
// Suppression is enforced at THREE levels: leads flags, suppressions table
// (with DB triggers blocking queue/sent inserts), and worker re-checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("l");
    // NOTE: "c" (campaign) accepted for compatibility but deliberately ignored —
    // an opt-out must suppress the lead EVERYWHERE, unconditionally.
    if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) {
      return new Response(JSON.stringify({ error: "missing lead" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    // RFC 8058: mailbox providers one-click via POST with no interaction.
    // Humans who land here via GET get redirected to the branded confirmation page instead.
    if (req.method === "GET") {
      const target = new URL("https://outreach-ochre-sigma.vercel.app/unsubscribe");
      target.searchParams.set("l", leadId);
      return new Response(null, { status: 302, headers: { Location: target.toString() } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();

    const { data, error } = await admin
      .from("leads")
      .update({ unsubscribed: true, status: "unsubscribed", lifecycle: "UNSUBSCRIBED", conv_mode: "PAUSED" })
      .eq("id", leadId)
      .select("id");
    if (error) throw new Error(error.message);
    const updated = data?.length ?? 0;

    if (lead) {
      await admin.from("suppressions").upsert({
        user_id: lead.user_id,
        lead_id: lead.id,
        email: String(lead.email).toLowerCase(),
        reason: "unsubscribed",
        source: "one_click_link",
      }, { onConflict: "user_id,email" });
      // Cancel any queued work for this lead immediately
      await admin.from("send_queue").update({ status: "cancelled", last_error: "unsubscribed", updated_at: new Date().toISOString() })
        .eq("lead_id", leadId).in("status", ["pending", "claimed"]);
      await admin.from("owner_alerts").insert({
        user_id: lead.user_id, lead_id: lead.id, kind: "opt_out",
        title: `🚫 Opt-out: ${lead.name ?? lead.email}`,
        body: "One-click unsubscribe. Suppressed permanently across all campaigns.",
        priority: "high",
      });
      await insertAudit(admin, { user_id: lead.user_id, campaign_id: lead.campaign_id, lead_id: lead.id, event: "lead.unsubscribed", payload: { via: "link_one_click" } });
    }

    return new Response(JSON.stringify({ ok: true, updated }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
