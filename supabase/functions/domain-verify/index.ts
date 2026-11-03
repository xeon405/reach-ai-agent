// ============================================================
// DOMAIN-VERIFY — proof of ownership for a flagged account.
//
// A text box is not proof: anyone can type "google.com". The only thing someone
// cannot fake is control of the domain's DNS. So we ask for one TXT record and
// check it ourselves.
//
// Chosen over an emailed code because OutshipAi has no system mailer — every
// outgoing message today goes through the USER's own Gmail. Adding Resend or
// Postmark to send one verification link would mean a new paid service, a new
// secret, and a new failure mode, to prove something DNS already proves better.
// It also works for businesses with no mailbox at admin@.
//
// Actions:
//   POST { action: "start", domain }  -> token + exact TXT record to publish
//   POST { action: "check", domain }  -> looks the record up and verifies it
//
// Invariants:
//   * one domain can be VERIFIED to exactly one account (unique index), so a
//     domain can never be reused to farm a second trial;
//   * a user may hold several domains in the schema even though the MVP UI asks
//     for one;
//   * nothing here grants anything else — it only clears the duplicate flag.
// ============================================================

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

const DOH = [
  "https://dns.google/resolve",
  "https://cloudflare-dns.com/dns-query",
];

/** "https://www.Example.com/path" -> "example.com". Rejects anything that is
 *  not a plausible registrable domain, so we never send a query for garbage. */
export function normalizeDomain(raw: string): string | null {
  let d = String(raw ?? "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/:\d+$/, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  if (d.includes("..") || d.startsWith("-") || d.length > 253) return null;
  return d;
}

/** Public suffix-ish guard: a bare "com" or a shared host (gmail.com) is not a
 *  business domain. Prevents verifying ownership of a freemail provider in
 *  order to launder the duplicate flag. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "yandex.com", "zoho.com",
]);

export function isVerifiableDomain(d: string): boolean {
  if (FREEMAIL.has(d)) return false;
  // no verification at all on public suffixes themselves
  if (!d.includes(".")) return false;
  return true;
}

export const RECORD_PREFIX = "_outshipai";

/** Read the TXT records for a name from public DNS-over-HTTPS. Two providers so
 *  a single resolver outage cannot make a real customer look like a faker. */
export async function txtRecords(name: string): Promise<string[]> {
  for (const base of DOH) {
    try {
      const res = await fetch(`${base}?name=${encodeURIComponent(name)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
      });
      if (!res.ok) continue;
      const body = await res.json();
      const answers = Array.isArray(body?.Answer) ? body.Answer : [];
      const out = answers
        .filter((a: any) => a?.type === 16)
        .map((a: any) => String(a.data ?? "").replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
      if (out.length) return out;
    } catch {
      /* try the next resolver */
    }
  }
  return [];
}

function newToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return `outshipai-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

async function authedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId: string;
  try {
    userId = await authedUserId(req);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { action?: string; domain?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const action = String(body.action ?? "start");
  const domain = normalizeDomain(String(body.domain ?? ""));
  if (!domain) return json({ error: "invalid_domain" }, 400);
  if (!isVerifiableDomain(domain)) return json({ error: "freemail_not_allowed" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const recordName = `${RECORD_PREFIX}.${domain}`;

  // ---- START ------------------------------------------------------------
  if (action === "start") {
    // A domain verified to somebody else is untouchable. We do NOT say who —
    // that would leak another customer's identity.
    //
    // `user_id != me` matters: without it the caller's own verified row counts
    // as "taken" and the person who already proved the domain is told it is
    // unavailable, which is a dead end. The unique index is on (domain) for
    // verified rows, so at most one other account can hold it.
    const { data: taken } = await db
      .from("domains")
      .select("id")
      .ilike("domain", domain)
      .not("verified_at", "is", null)
      .neq("user_id", userId)
      .maybeSingle();
    if (taken) return json({ error: "domain_unavailable" }, 409);

    const { data: existing } = await db
      .from("domains")
      .select("id, verification_token, verified_at")
      .eq("user_id", userId)
      .ilike("domain", domain)
      .maybeSingle();

    if (existing?.verified_at) {
      // Already proved. Say so AND clear the flag: a verified account can be
      // flagged again later (an address edit that matches another business, or
      // an admin action). Returning early without clearing it would leave the
      // user looking at "verified" while every send is refused.
      await db
        .from("profiles")
        .update({ domain_verified: true, domain_required: false })
        .eq("id", userId);
      return json({ ok: true, verified: true, domain });
    }

    const token = existing?.verification_token ?? newToken();
    if (existing) {
      await db.from("domains").update({ verification_token: token }).eq("id", existing.id);
    } else {
      const { error } = await db
        .from("domains")
        .insert({ user_id: userId, domain, verification_token: token });
      if (error) return json({ error: "save_failed" }, 500);
    }

    return json({
      ok: true,
      verified: false,
      domain,
      record_type: "TXT",
      record_name: recordName,
      record_value: token,
      note: "Add this TXT record with your domain provider, then press Verify. DNS can take a few minutes to propagate.",
    });
  }

  // ---- CHECK ------------------------------------------------------------
  if (action === "check") {
    const { data: row } = await db
      .from("domains")
      .select("id, verification_token, verified_at")
      .eq("user_id", userId)
      .ilike("domain", domain)
      .maybeSingle();

    if (!row) return json({ error: "start_verification_first" }, 400);
    if (row.verified_at) {
      // Same reason as in `start`: never report "verified" while the account is
      // still flagged, or the page is a dead end that looks like success.
      await db
        .from("profiles")
        .update({ domain_verified: true, domain_required: false })
        .eq("id", userId);
      return json({ ok: true, verified: true, domain });
    }

    const records = await txtRecords(recordName);
    if (!records.length) {
      return json({ ok: true, verified: false, reason: "record_not_found", record_name: recordName }, 200);
    }

    const found = records.some((r) => r.trim() === String(row.verification_token).trim());
    if (!found) {
      return json({ ok: true, verified: false, reason: "record_mismatch", record_name: recordName }, 200);
    }

    // Someone else may have verified this domain while we were waiting.
    const { data: taken } = await db
      .from("domains")
      .select("id")
      .ilike("domain", domain)
      .not("verified_at", "is", null)
      .neq("id", row.id)
      .maybeSingle();
    if (taken) return json({ error: "domain_unavailable" }, 409);

    const { error: upErr } = await db
      .from("domains")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) return json({ error: "verify_failed" }, 500);

    // Clear the challenge. This is the ONLY thing that clears it.
    await db
      .from("profiles")
      .update({ domain_verified: true, domain_required: false })
      .eq("id", userId);

    return json({ ok: true, verified: true, domain });
  }

  return json({ error: "unknown_action" }, 400);
});
