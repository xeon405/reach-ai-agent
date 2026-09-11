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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Single authenticated wrapper over the Stage-8 erasure RPCs
// (forget_lead / delete_lead). Auth = the existing session-JWT pattern: the
// caller's uid is passed into the RPC, whose own ownership gate
// (WHERE id = p_lead_id AND user_id = p_user_id) scopes every erasure to the
// signed-in user's own lead. No roles, no admin model — per-lead ownership is
// the gate, which is owner-only today (single operator) and automatically the
// right scope for future customers. The RPC's row_counts jsonb is returned
// verbatim so the UI can show what was actually erased.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth FIRST — reject before any RPC can fire (same standard as the
    // six-function audit: no Authorization header => 401, zero side effects).
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: authData, error: authErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !authData.user) return json({ error: "Not authenticated" }, 401);
    const uid = authData.user.id;

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const leadId = body?.leadId;
    if (action !== "forget" && action !== "delete") {
      return json({ error: "Invalid action" }, 400);
    }
    if (typeof leadId !== "string" || !UUID_RE.test(leadId)) {
      return json({ error: "Invalid leadId" }, 400);
    }

    const { data, error: rpcError } = await (action === "forget"
      ? admin.rpc("forget_lead", {
          p_user_id: uid,
          p_lead_id: leadId,
          p_suppress: !!body?.suppress,
        })
      : admin.rpc("delete_lead", {
          p_user_id: uid,
          p_lead_id: leadId,
        }));

    if (rpcError) {
      if (String(rpcError.message ?? "").includes("LEAD_NOT_FOUND_OR_NOT_OWNED")) {
        return json({ error: "Not found" }, 404);
      }
      return json({ error: "Erasure failed" }, 500);
    }

    // Verbatim RPC jsonb: {forgot|deleted, suppressed?, row_counts:{...}}
    return json(data);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});