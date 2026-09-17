// UNSUBSCRIBE — one-click opt-out (RFC 8058) + reply-based keyword path.
// Suppression is enforced at THREE levels: leads flags, suppressions table
// (with DB triggers blocking queue/sent inserts), and worker re-checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("l");
    // NOTE: "c" (campaign) accepted for compatibility but deliberately ignored —
    // an opt-out must suppress the lead EVERYWHERE, unconditionally.
    if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) {
      return new Response(JSON.stringify({ error: "missing lead" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    // Verify HMAC token when present (signed URLs prevent unauthorized lead state manipulation)
    const token = url.searchParams.get("t") ?? "/no-token/";
    // RFC 8058: mailbox providers one-click via POST with no interaction.
    // Humans who land here via GET get redirected to the branded confirmation page instead.
    if (req.method === "GET") {
      const target = new URL(`${APP_BASE_URL}/unsubscribe`);
      target.searchParams.set("l", leadId);
      target.searchParams.set("t", token);
      return new Response(null, { status: 302, headers: { Location: target.toString() } });
    }
    // POST (one-click) must carry a valid signature
    const validSig = await verifyToken(leadId, token);
    if (!validSig) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
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

    return new Response(JSON.stringify({ ok: true, updated }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
