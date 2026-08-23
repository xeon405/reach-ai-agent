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

  // Identity comes ONLY from the JWT — never from the body
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return json({ error: "Invalid token" }, 401);
  const userId = userData.user.id;

  try {
    // Wipe all owned rows (profiles last, in case triggers depend on it)
    await supabase.from("emails_sent").delete().eq("user_id", userId);
    await supabase.from("leads").delete().eq("user_id", userId);
    await supabase.from("campaigns").delete().eq("user_id", userId);
    await supabase.from("meetings").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("id", userId);

    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return json({ deleted: true });
  } catch (err) {
    console.error("[delete-account]", err instanceof Error ? err.message : err);
    return json({ error: "Failed to delete account" }, 500);
  }
});
