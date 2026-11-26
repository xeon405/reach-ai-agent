// ============================================================
// PAYPAL API CLIENT — shared OAuth + request helper.
//
// One place decides sandbox vs live and caches the OAuth token,
// so the three PayPal functions cannot drift apart (a stale
// sandbox URL in one of them would be invisible until a real
// payment failed).
//
// Credentials live in Supabase project secrets, never in the repo:
//   PAYPAL_ENV=sandbox|live
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
// ============================================================

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

export function paypalEnv(): "sandbox" | "live" {
  return (Deno.env.get("PAYPAL_ENV") ?? "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalBaseUrl(): string {
  return paypalEnv() === "live" ? LIVE_BASE : SANDBOX_BASE;
}

export function paypalConfigured(): boolean {
  return Boolean(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET"));
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function paypalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
  if (!clientId || !secret) throw new Error("paypal_not_configured");

  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${clientId}:${secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`paypal_auth_${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const expiresIn = Number(data?.expires_in) || 3000;
  cachedToken = {
    token: String(data.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedToken.token;
}

/** Authenticated JSON request against the PayPal REST API. */
export async function paypalRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await paypalAccessToken();
  return fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** PayPal caps PayPal-Request-Id at 108 characters. */
export function requestId(prefix: string, key: string): string {
  return `${prefix}-${key}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 100);
}
