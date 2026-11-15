// Shared developer-surface helpers: API keys, user rules, webhook signing.
// Used by public-api, mcp, webhook-drainer and send-worker so the rules mean
// the same thing everywhere.

export const API_KEY_PREFIX = "osk_";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ApiIdentity = {
  userId: string;
  keyId: string;
  rateLimited: boolean;
};

/** Authenticates `Authorization: Bearer osk_...`. Returns null for any bad key. */
export async function authenticateApiKey(
  admin: any,
  req: Request,
): Promise<ApiIdentity | null> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith(API_KEY_PREFIX) || key.length < 24) return null;

  const hash = await sha256Hex(key);
  const { data } = await admin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;

  // 120 requests/minute per key. A missed limit is better than a lost request,
  // so a failing rate-limit RPC does not block the call.
  let rateLimited = false;
  try {
    const { data: allowed } = await admin.rpc("bump_api_rate", {
      p_key: data.id,
      p_limit: 120,
    });
    rateLimited = allowed === false;
  } catch { /* limit is best-effort */ }

  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});

  return { userId: data.user_id, keyId: data.id, rateLimited };
}

export type UserRules = {
  daily_cap: number | null;
  quiet_start: string | null;
  quiet_end: string | null;
  timezone: string;
  never_emails: string[];
};

export const DEFAULT_RULES: UserRules = {
  daily_cap: null,
  quiet_start: null,
  quiet_end: null,
  timezone: "UTC",
  never_emails: [],
};

/** Reads rules for one user; missing row means "no extra rules". */
export async function getUserRules(admin: any, userId: string): Promise<UserRules> {
  const { data } = await admin
    .from("user_rules")
    .select("daily_cap, quiet_start, quiet_end, timezone, never_emails")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_RULES;
  return {
    daily_cap: data.daily_cap ?? null,
    quiet_start: data.quiet_start ?? null,
    quiet_end: data.quiet_end ?? null,
    timezone: data.timezone || "UTC",
    never_emails: Array.isArray(data.never_emails) ? data.never_emails : [],
  };
}

/**
 * A bare entry blocks that domain (and its subdomains); a full address blocks
 * just that address. Case and surrounding spaces never matter.
 */
export function isNeverEmail(email: string, list: string[]): boolean {
  const address = (email ?? "").trim().toLowerCase();
  if (!address.includes("@")) return false;
  const domain = address.split("@")[1] ?? "";
  return list.some((raw) => {
    const entry = String(raw ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!entry) return false;
    if (entry.includes("@")) return entry === address;
    return entry === domain || domain.endsWith("." + entry);
  });
}

function parseHm(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Local minutes since midnight in the account's timezone, or null if invalid. */
export function minutesInZone(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    return null;
  }
}

/** True while the account's quiet window is open. Handles windows that cross midnight. */
export function inQuietHours(rules: UserRules, now: Date): boolean {
  const start = parseHm(rules.quiet_start);
  const end = parseHm(rules.quiet_end);
  if (start === null || end === null || start === end) return false;
  const current = minutesInZone(now, rules.timezone || "UTC");
  if (current === null) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
