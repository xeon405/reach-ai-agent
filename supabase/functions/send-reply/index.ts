import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";

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

function extractGmailBody(payload: unknown, depth = 0): string {
  if (!payload || depth > 6) return "";
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (p.body?.data) {
    try {
      const b64 = p.body.data.replace(/-/g, "+").replace(/_/g, "/");
      let text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      if ((p.mimeType ?? "").includes("html")) {
        text = text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      }
      if (text.trim()) return text.trim();
    } catch (_e) { /* skip malformed */ }
  }
  for (const part of p.parts ?? []) {
    const inner = extractGmailBody(part, depth + 1);
    if (inner) return inner;
  }
  return "";
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
    const regenerate = body?.regenerate === true;
    if (!emailId) throw new Error("Missing emailId");

    // Load the outreach email + lead, verifying ownership via join
    const { data: row, error: rowErr } = await admin
      .from("emails_sent")
      .select("id, user_id, subject, ai_draft, sent_at, lead:leads(email, name, company, job_title, country)")
      .eq("id", emailId)
      .single();
    if (rowErr || !row) throw new Error("Email not found");
    if (row.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!row.ai_draft && !customBody && !regenerate) throw new Error("No AI draft available for this email");

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

    // ✨ Regenerate: write a FRESH reply from the lead's latest actual message
    let replyBody = customBody;
    if (!replyBody && regenerate) {
      const { data: prof } = await admin.from("profiles").select("offer, booking_link, name").eq("id", userId).maybeSingle();
      const afterEpoch = Math.floor(new Date(row.sent_at ?? Date.now()).getTime() / 1000);
      const q = `from:${toEmail} is:inbox after:${afterEpoch}`;
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      let theirWords = "";
      if (searchRes.ok) {
        const hits = (await searchRes.json()).messages ?? [];
        if (hits[0]?.id) {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${hits[0].id}?format=full`,
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
          );
          if (mRes.ok) theirWords = extractGmailBody((await mRes.json())?.payload).slice(0, 900);
        }
      }
      const fresh = await groqChat([{
        role: "user",
        content: `A reply arrived to a cold email you sent.
Lead: ${sanitizeForPrompt(leadRow?.name ?? toEmail, 80)} (${sanitizeForPrompt(leadRow?.job_title, 80) || "professional"}) at ${sanitizeForPrompt(leadRow?.company, 120)}${leadRow?.country ? `, ${sanitizeForPrompt(String(leadRow.country), 40)}` : ""}
Their exact words: "${theirWords || "(no newer message found — write a gentle nudge referencing the original outreach)"}"
You originally offered: ${sanitizeForPrompt(prof?.offer ?? "our services")}${prof?.booking_link ? `
Their booking link: ${prof.booking_link} — invite them to book there.` : ""}

Write a 3-4 sentence human reply on behalf of ${prof?.name || "the sender"}. Warm, confident, zero fluff.
Rules: respond to something SPECIFIC they said. Ask exactly one question moving toward a call. Do NOT reuse generic phrasing like "I hope this finds you well". Sign off as "Best regards". Return only the reply text.`,
      }], { maxTokens: 600, temperature: 0.9 });
      if (fresh?.trim()) {
        replyBody = fresh.trim();
        await admin.from("emails_sent").update({ ai_draft: replyBody }).eq("id", emailId);
      }
    }

    if (!replyBody && !row.ai_draft) throw new Error("No AI draft available for this email");
    if (!replyBody) replyBody = row.ai_draft!;
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
