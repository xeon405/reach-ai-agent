// ============================================================
// REVIEW QUEUE — approve or skip a held draft, then wake the worker.
//
// A held email is a finished draft in send_queue with status='awaiting_review'.
// Approval sets it back to 'pending' and kicks send-worker, so the owner does
// not wait for the next hourly cron run. The worker itself re-checks the lead,
// the campaign and the daily cap before anything leaves.
//
// Auth: the signed-in owner only. No service-role secret ever reaches the browser.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error: userError } = await admin.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);
  const userId = userData.user.id;

  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    const action = body?.action;
    if (!id) return json({ error: "Missing draft id." }, 400);
    if (action !== "approve" && action !== "skip") {
      return json({ error: "action must be approve or skip." }, 400);
    }

    // The status filter is the guard: a draft can only be decided once, and the
    // user_id filter means one account can never touch another's draft.
    const patch = action === "approve"
      ? {
          status: "pending",
          review_state: "approved",
          lease_until: null,
          next_retry_at: null,
          last_error: null,
        }
      : {
          status: "cancelled",
          review_state: "skipped",
          lease_until: null,
          next_retry_at: null,
          last_error: "skipped_in_review",
        };

    const { data: row, error: updErr } = await admin
      .from("send_queue")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "awaiting_review")
      .select("id, campaign_id, lead_id")
      .maybeSingle();

    if (updErr) return json({ error: updErr.message }, 400);
    if (!row) return json({ error: "That draft is no longer waiting for review." }, 409);

    await insertAudit(admin, {
      user_id: userId,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      event: action === "approve" ? "email.review_approved" : "email.review_skipped",
      payload: { job_id: id },
    });

    // Kick the worker so an approved email does not sit until the hourly cron.
    // Failure here is not fatal: the worker will pick it up on its own.
    if (action === "approve") {
      const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-worker`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }).then((r) => r.text()).catch(() => "");
      const et = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (et?.waitUntil) et.waitUntil(kick);
      else await Promise.race([kick, new Promise((r) => setTimeout(r, 1500))]);
    }

    return json({ ok: true, id, action });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
