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

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: authData, error: authErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !authData.user) return json({ error: "Invalid session" }, 401);
    const userId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const emailId = body?.emailId;
    const customBody = typeof body?.body === "string" ? body.body.trim() : "";
    if (!emailId) throw new Error("Missing emailId");

    // Load the outreach email + lead, verifying ownership via join
    const { data: row, error: rowErr } = await admin
      .from("emails_sent")
      .select("id, user_id, subject, ai_draft, lead:leads(email, name)")
      .eq("id", emailId)
      .single();
    if (rowErr || !row) throw new Error("Email not found");
    if (row.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!row.ai_draft && !customBody) throw new Error("No AI draft available for this email");

    const leadRow = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    const toEmail = leadRow?.email;
    if (!toEmail) throw new Error("Lead email missing");

    // Load sender profile + Gmail token
    const { data: profile } = await admin
      .from("profiles")
      .select("gmail_connected, name")
      .eq("id", userId)
      .single();
    if (!profile?.gmail_connected) throw new Error("Gmail not connected. Connect it in Settings first.");

    const { data: tokenRow } = await admin
      .from("gmail_tokens")
      .select("refresh_token")
      .eq("profile_id", userId)
      .single();
    if (!tokenRow?.refresh_token) throw new Error("Gmail not connected. Connect it in Settings first.");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error("Token refresh failed: " + tokenData.error);

    const replyBody = customBody || row.ai_draft!;
    const origSubject = row.subject ?? "";
    const subject = origSubject.toLowerCase().startsWith("re:") ? origSubject : `Re: ${origSubject}`;

    const raw = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      replyBody,
      ``,
      `--`,
      profile.name ?? "",
    ].join("\n");

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: toBase64Url(raw) }),
    });
    const sendJson = await sendRes.json();
    if (!sendRes.ok) throw new Error(sendJson.error?.message ?? "Gmail send failed");

    await admin.from("emails_sent").update({ ai_draft: null }).eq("id", emailId);

    return json({ sent: true, to: toEmail });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
