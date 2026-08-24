import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/crypto.ts";
import { insertAudit } from "../_shared/audit.ts";

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
    const userId = await getAuthedUserId(req);
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Disconnect action: wipe vault row + clear profile flags
    if (body?.action === "disconnect") {
      await supabase.from("gmail_tokens").delete().eq("profile_id", userId);
      await supabase.from("profiles").update({
        gmail_connected: false,
        gmail_email: null,
      }).eq("id", userId);
      return json({ disconnected: true });
    }

    const { code } = body ?? {};
    if (!code) throw new Error("Missing authorization code");

    const redirectUri =
      Deno.env.get("GOOGLE_REDIRECT_URI") ??
      "https://reach-ai-agent.vercel.app/gmail/callback";

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description ?? tokens.error);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Disconnect Gmail in Settings, then reconnect (make sure the consent prompt appears)."
      );
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleProfile = await profileRes.json();

    const { error: updateError } = await supabase.from("profiles").update({
      gmail_connected: true,
      gmail_email: googleProfile.email,
    }).eq("id", userId);

    if (updateError) throw new Error(updateError.message);

    // Store OAuth credentials in the service-role-only vault, encrypted at rest
    // (AES-GCM via GOOGLE_TOKEN_ENC_KEY). Plaintext fallback only if key absent.
    const storedRefresh = await encryptSecret(tokens.refresh_token);
    await supabase.from("gmail_tokens").upsert({
      profile_id: userId,
      access_token: null,
      refresh_token: storedRefresh,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });

    await insertAudit(supabase, { user_id: userId, event: "gmail.connected", payload: { email: googleProfile.email, encrypted: storedRefresh.startsWith("v1:") } });

    return json({ email: googleProfile.email });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
