// Returns the Calendly webhook subscription details (URL + HMAC signing key)
// so an owner can create the subscription on their own Calendly account
// (Settings → Webhooks → Webhook subscriptions). Authenticated users only.
//
// The URL+key are app-wide (one shared secret, mirroring the billing webhook).
// The key is derived from CALENDLY_WEBHOOK_SECRET, never committed.
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

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);

  const secret = Deno.env.get("CALENDLY_WEBHOOK_SECRET") ?? "";
  if (!secret) return json({ error: "Calendly webhook not configured" }, 500);

  return json({
    webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendly-webhook`,
    webhook_secret: secret,
  });
});