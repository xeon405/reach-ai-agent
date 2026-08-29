// Gmail access layer: token lifecycle + raw send with ID capture.
// Credentials are decrypted transparently; tokens never leave the server.
import { decryptSecret } from "../_shared/crypto.ts";
import { insertAudit } from "../_shared/audit.ts";

export interface GmailTokenRow {
  user_id: string;
  refresh_token: string;
  gmail_email: string | null;
  connected_at?: string;
}

export async function getGmailTokenRow(
  admin: { from(t: string): any },
  userId: string
): Promise<GmailTokenRow | null> {
  const { data, error } = await admin
    .from("gmail_tokens")
    .select("profile_id, refresh_token")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    user_id: data.profile_id,
    refresh_token: data.refresh_token,
    gmail_email: null,
    connected_at: undefined,
  } as GmailTokenRow;
}

export async function mintAccessToken(refreshTokenPlain: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: refreshTokenPlain,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    // Revoked/expired refresh tokens surface as invalid_grant — callers treat as disconnected.
    throw new Error(`token_refresh_failed:${res.status}:${detail.slice(0, 180)}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

/** Decrypts stored credential and mints a fresh access token. */
export async function getAccessToken(
  admin: { from(t: string): any },
  userId: string
): Promise<{ accessToken: string; row: GmailTokenRow } | null> {
  const row = await getGmailTokenRow(admin, userId);
  if (!row) return null;
  let plain: string;
  try {
    plain = await decryptSecret(row.refresh_token);
  } catch (_e) {
    throw new Error("credential_decrypt_failed");
  }
  try {
    const accessToken = await mintAccessToken(plain);
    // Successful mint → connection healthy again; clear any degraded state.
    try {
      await admin.from("profiles").update({ gmail_state: "CONNECTED" }).eq("id", userId);
    } catch (_e) { /* cosmetic only */ }
    return { accessToken, row };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("token_refresh_failed:400") && msg.includes("invalid_grant")) {
      // Google revoked/expired the grant — user must re-consent.
      try {
        await admin.from("gmail_tokens").delete().eq("profile_id", userId);
        await admin.from("profiles").update({ gmail_connected: false, gmail_state: "ACCESS_REVOKED" }).eq("id", userId);
      } catch (_e) { /* best effort */ }
      throw new Error("GMAIL_ACCESS_REVOKED");
    }
    if (msg === "credential_decrypt_failed") {
      try {
        await admin.from("profiles").update({ gmail_state: "REAUTH_REQUIRED" }).eq("id", userId);
      } catch (_e) { /* best effort */ }
      throw new Error("OAUTH_REAUTH_REQUIRED");
    }
    // Transient (network/5xx/401) — keep credentials, mark degraded, retryable.
    try {
      await admin.from("profiles").update({ gmail_state: "TOKEN_REFRESH_FAILED" }).eq("id", userId);
    } catch (_e) { /* best effort */ }
    throw new Error(`GMAIL_TOKEN_REFRESH_FAILED:${msg.slice(0, 120)}`);
  }
}

export interface SentMessageIds {
  id: string | null;
  threadId: string | null;
}

/** Sends a RFC-2822 raw message; returns Gmail message/thread IDs for the audit trail. */
export async function sendGmailRaw(accessToken: string, raw: string): Promise<SentMessageIds> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`gmail_send_failed:${res.status}:${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { id: json.id ?? null, threadId: json.threadId ?? null };
}

/** RFC 2047-encodes a header value when it contains non-ASCII characters.
 *  Sending a raw 8-bit Subject header makes providers (Gmail included) guess
 *  the charset and mangle it (Arabic/emoji become "Ã¢Â˜Â€" / "Ã™Â…" garbage).
 *  Encoded-words "=?UTF-8?B?...?=" are unambiguous and always display right. */
export function encodeHeaderValue(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

/** Back-compat fire-and-forget send. */
export async function sendGmail(accessToken: string, raw: string): Promise<void> {
  await sendGmailRaw(accessToken, raw);
}

export function buildRawEmail(to: string, subject: string, body: string, from: string, unsubUrl?: string): string {
  let header = `To: ${to}\r\nFrom: ${from}\r\nSubject: ${encodeHeaderValue(subject)}\r\nContent-Type: text/plain; charset="UTF-8"\r\n`;
  if (unsubUrl) {
    // RFC 2369 + RFC 8058 one-click (provider POSTs this URL directly).
    header += `List-Unsubscribe: <mailto:${to}?subject=unsubscribe>, <${unsubUrl}>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`;
  }
  return btoa(unescape(encodeURIComponent(header + "\r\n" + body)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeB64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    escape(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)))
  );
}

export function extractGmailBody(payload: GmailPart): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const text = extractGmailBody(part);
    if (text) return text;
  }
  return payload.body?.data ? decodeB64Url(payload.body.data) : "";
}

/** Records an OAuth failure in the audit trail without throwing. */
export async function auditGmailFailure(
  admin: { from(t: string): any },
  userId: string,
  where: string,
  err: unknown
): Promise<void> {
  await insertAudit(admin, {
    user_id: userId,
    event: "email.failed",
    payload: { where, error: err instanceof Error ? err.message : String(err) },
  });
}
