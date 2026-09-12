// Calendly webhook — confirmed bookings → meetings row + sequence stop.
//
// Trust model (Calendly's real scheme, verified against their docs + a live
// rejection proof):
//   * Header: Calendly-Webhook-Signature: t=<unix_ts>,v1=<hex>  (Stripe-style)
//   * Signed content is "{t}.{raw body}" (NOT just the body), HMAC-SHA256
//     hex, using the subscription signing key stored in CALENDLY_WEBHOOK_SECRET.
//   * Replay protection: reject if |now - t| > tolerance (300s).
//   * verify_jwt=false (Calendly can't forge our JWT), disabled via the
//     Management API immediately after first deploy.
//
// Attribution (owner-first, not global email match):
//   1. Resolve WHICH owner owns this event by matching the payload's
//      scheduling_url against profiles.booking_link. Both are normalized:
//      protocol stripped, case-folded, trailing slashes dropped, and scoped
//      to host + first path segment (the Calendly account key), so an
//      org-page booking link matches its own event pages.
//   2. Only then match invitee.email against that owner's leads. A lead
//      email that exists under a DIFFERENT owner (whose booking_link does
//      not match) can never produce a phantom meeting for the wrong owner.
//   3. Unmatched/untracked calendars (booking_link points elsewhere, or
//      points at Calendly accounts we are not subscribed to) stay blind —
//      we do nothing and return ok.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { insertAudit } from "../_shared/audit.ts";
import { nextLifecycle } from "../_shared/policy.ts";

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

/** Genuinely constant-time hex compare, runtime-robust.
 *
 *  Why not Buffer.from(hex)+timingSafeEqual: the edge runtime's Buffer
 *  polyfill throws on 'hex' decoding. Instead the two string digests are
 *  compared byte-by-byte with a SINGLE branch-free XOR accumulator, so no
 *  control flow depends on the digest VALUE (loop count is fixed by the
 *  validated length, no early exit, no value-dependent branches in the loop,
 *  no secret-dependent memory access — charCodeAt indexes sequentially).
 *
 *  The up-front anchored check on v1 (attacker-controlled) runs before any
 *  secret-dependent work and iterates only over v1's own characters, so its
 *  timing leaks nothing about `expected`. Both digests are lowercase hex
 *  (node/Calendly emit lowercase), so v1 is required to be exactly 64
 *  lowercase hex chars: uppercase is rejected. */
const V1_RE = /^[0-9a-f]{64}$/;

function hexEqual(expected: string, v1: string): boolean {
  if (!V1_RE.test(v1)) return false;
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < v1.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

/** True if `v1` is the hex HMAC-SHA256 of `content` under `secret`. Never
 *  throws; malformed v1 simply fails. */
function sigMatches(secret: string, content: string, v1: string): boolean {
  const expected = createHmac("sha256", secret).update(content).digest("hex");
  return hexEqual(expected, v1);
}

/** Normalize a URL for owner comparison: strip protocol/www/trailing slash,
 *  case-fold, and scope to host + first path segment (the Calendly account
 *  key) so "calendly.com/jane" matches "calendly.com/JANE/15min". */
function ownerKey(raw: string): string {
  let s = String(raw ?? "").trim();
  try {
    const u = new URL(s);
    s = u.hostname.replace(/^www\./, "").toLowerCase() + u.pathname.toLowerCase();
  } catch {
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  }
  const [host, seg] = s.split("/");
  return seg ? `${host}/${seg}` : host;
}

const TERMINAL_LIFECYCLES = new Set([
  "UNSUBSCRIBED",
  "BOUNCED",
  "SUPPRESSED",
  "LOST",
  "HUMAN_TAKEOVER",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("CALENDLY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 500);

  const rawBody = await req.text();
  const sigHeader = req.headers.get("Calendly-Webhook-Signature") ?? "";
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=").map((x) => x.trim()))
  );
  const ts = Number(parts["t"]);
  const v1 = String(parts["v1"] ?? "");
  const valid = Number.isFinite(ts) && v1.length > 0
    && Math.abs(Date.now() / 1000 - ts) <= 300
    && sigMatches(secret, `${ts}.${rawBody}`, v1);

  if (!valid) {
    console.error("[calendly-webhook] Invalid signature");
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Bad payload" }, 400);
  }

  const eventName = payload.event ?? "";
  if (eventName !== "invitee.created" && eventName !== "invitee.canceled") {
    return json({ ok: true, ignored: eventName });
  }

  const p = payload.payload ?? {};
  const scheduled = p.scheduled_event ?? {};
  const invitee = p.invitee ?? {};
  const schedulingUrl = String(p.scheduling_url ?? "");
  const eventUuid = String(scheduled.uuid ?? "");
  const inviteeEmail = String(invitee.email ?? "");

  // A usable event must identify its calendar page, event and invitee.
  if (!schedulingUrl || !eventUuid || !inviteeEmail) {
    return json({ ok: true, ignored: "missing_fields" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── 1. Owner scoping: which of our users' booking_link matches this event? ──
  const targetKey = ownerKey(schedulingUrl);
  if (!targetKey) return json({ ok: true, ignored: "no_owner_key" });

  const { data: allProfiles } = await admin.from("profiles").select("id, booking_link");
  const owners: string[] = (allProfiles ?? [])
    .filter((pr: any) => pr.booking_link && ownerKey(pr.booking_link) === targetKey)
    .map((pr: any) => pr.id);

  if (owners.length === 0) {
    // Untracked calendar — this booking is not ours to record. Blind by design.
    return json({ ok: true, no_owner: true });
  }

  const isCancel = eventName === "invitee.canceled";
  const startTime = scheduled.start_time ? new Date(scheduled.start_time).toISOString() : null;
  const endTime = scheduled.end_time ? new Date(scheduled.end_time).toISOString() : null;
  const timezone = String(scheduled.timezone ?? invitee.timezone ?? null) || null;
  const name = String(invitee.name ?? invitee.first_name ?? "") || null;

  const results: string[] = [];

  for (const ownerId of owners) {
    // ── 2. Match the invitee only within this owner's leads (normalized). ──
    const normalized = inviteeEmail.trim().toLowerCase();
    const { data: leads } = await admin
      .from("leads")
      .select("id, campaign_id, user_id, name, lifecycle")
      .eq("user_id", ownerId)
      .eq("normalized_email", normalized);

    const matched = (leads ?? []).filter(
      (l: any) => !TERMINAL_LIFECYCLES.has(String(l.lifecycle ?? "").toUpperCase())
    );

    if (matched.length === 0) {
      results.push(`owner:${ownerId}:no_lead`);
      continue;
    }

    // ── 3. Idempotent write of the meetings row. ──
    if (isCancel) {
      // Cancellation updates whatever row exists; never inserts a new one.
      const { data: existing } = await admin
        .from("meetings")
        .select("id, status")
        .eq("provider", "calendly")
        .eq("provider_event_id", eventUuid)
        .maybeSingle();
      if (!existing || existing.status === "cancelled") {
        results.push(`owner:${ownerId}:cancel_noop`);
        continue;
      }
      const { error: upErr } = await admin
        .from("meetings")
        .update({ status: "cancelled", end_time: endTime })
        .eq("id", existing.id);
      if (upErr) return json({ error: upErr.message }, 500);
      await insertAudit(admin, {
        user_id: ownerId,
        lead_id: matched[0].id,
        campaign_id: matched[0].campaign_id ?? null,
        event: "booking.cancelled",
        payload: { provider: "calendly", provider_event_id: eventUuid, invitee_email: inviteeEmail },
      });
      results.push(`owner:${ownerId}:cancelled`);
      continue;
    }

    // invitee.created — insert only if genuinely new (retries can't replay).
    try {
      const { error: insErr } = await admin.from("meetings").insert({
        user_id: ownerId,
        lead_id: matched[0].id,
        campaign_id: matched[0].campaign_id ?? null,
        provider: "calendly",
        provider_event_id: eventUuid,
        start_time: startTime,
        end_time: endTime,
        timezone,
        status: "scheduled",
        invitee_email: inviteeEmail,
        metadata: {
          scheduling_url: schedulingUrl,
          invitee_uri: p.uri ?? null,
          cancel_url: invitee.cancel_url ?? null,
          reschedule_url: invitee.reschedule_url ?? null,
          event_slug: p.event_type?.slug ?? null,
          questions: invitee.questions_and_answers ?? null,
        },
      });
      if (insErr) throw insErr;
    } catch (err: any) {
      const code = String(err?.code ?? err?.message ?? "");
      if (code.includes("23505") || /duplicate key/i.test(code)) {
        results.push(`owner:${ownerId}:duplicate`);
        continue;
      }
      return json({ error: err?.message ?? "insert failed" }, 500);
    }

    // ── 4. Sequence stop + pipeline advance + owner alert (one-time only). ──
    const { error: leadErr } = await admin
      .from("leads")
      .update({
        lifecycle: nextLifecycle(String(matched[0].lifecycle ?? "REPLIED"), "booking.detected"),
        status: "booked",
        followup_status: "cancelled",
        next_followup_at: null,
      })
      .eq("id", matched[0].id);
    if (leadErr) return json({ error: leadErr.message }, 500);

    const when = startTime
      ? new Date(startTime).toLocaleString(undefined, {
          timeZone: timezone ?? undefined,
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "unspecified time";
    const { error: alertErr } = await admin.from("owner_alerts").insert({
      user_id: ownerId,
      lead_id: matched[0].id,
      kind: "booking",
      title: `✅ Meeting booked for ${name ?? matched[0].name ?? inviteeEmail}`,
      body: `${name ?? inviteeEmail} booked ${when} (${timezone ?? "—"}). Lead: ${matched[0].name ?? inviteeEmail}.${invitee.cancel_url ? `\nCancel: ${invitee.cancel_url}` : ""}`,
      priority: "high",
    });
    if (alertErr) return json({ error: alertErr.message }, 500);

    await insertAudit(admin, {
      user_id: ownerId,
      lead_id: matched[0].id,
      campaign_id: matched[0].campaign_id ?? null,
      event: "booking.confirmed",
      payload: {
        provider: "calendly",
        provider_event_id: eventUuid,
        start_time: startTime,
        end_time: endTime,
        invitee_email: inviteeEmail,
        timezone,
      },
    });

    results.push(`owner:${ownerId}:booked`);
  }

  const booked = results.filter((r) => r.endsWith(":booked"));
  return json({
    ok: true,
    event: eventName,
    owners: owners.length,
    results,
    booked: booked.length,
  });
});