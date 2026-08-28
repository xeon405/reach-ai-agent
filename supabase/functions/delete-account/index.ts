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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return json({ error: "Invalid token" }, 401);
  const userId = userData.user.id;

  try {
    // 1. Gmail OAuth token row is cascade-deleted via profiles FK.
    //    User can additionally revoke at myaccount.google.com/permissions.

    // 2. Delete all owned rows (order matters: children before parents)
    const tables = [
      { name: "audit_events", column: "user_id" },
      { name: "owner_alerts", column: "user_id" },
      { name: "ai_classifications", column: "user_id" },
      { name: "email_threads", column: "user_id" },
      { name: "tracking_events", column: "user_id" },
      { name: "suppressions", column: "user_id" },
      { name: "send_queue", column: "user_id" },
      { name: "usage_limits", column: "user_id" },
      { name: "referrals", column: "referrer_id" },
      { name: "meetings", column: "user_id" },
      { name: "emails_sent", column: "user_id" },
      { name: "leads", column: "user_id" },
      { name: "campaigns", column: "user_id" },
      { name: "profiles", column: "id" },
    ];

    for (const { name, column } of tables) {
      try {
        await supabase.from(name).delete().eq(column, userId);
      } catch (_e) {
        // Continue deleting remaining tables even if one fails
      }
    }

    // 3. Delete the auth user
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return json({ deleted: true });
  } catch (err) {
    console.error("[delete-account]", err instanceof Error ? err.message : err);
    return json({ error: "Failed to delete account" }, 500);
  }
});
