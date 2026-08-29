import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Public key for the browser's PushManager.subscribe call — it is public by design.
    if (req.method === "GET") {
      return json({ vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userId = await getAuthedUserId(req);
    const { enabled, subscription } = await req.json();

    if (enabled && subscription?.endpoint && subscription?.keys?.p256dh && subscription?.keys?.auth) {
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint: String(subscription.endpoint),
            p256dh: String(subscription.keys.p256dh),
            auth_secret: String(subscription.keys.auth),
          },
          { onConflict: "user_id,endpoint" }
        );
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    // Toggle off (or a bare call): remove this device/all devices for the user.
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});