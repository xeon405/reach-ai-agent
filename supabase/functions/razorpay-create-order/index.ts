// ============================================================
// RAZORPAY CREATE-ORDER — server-side order creation.
//
// The browser sends a PLAN ID, never an amount. We look the amount
// up in the shared catalog and create the order with Razorpay, so a
// tampered client cannot choose what it pays. The order id is
// written to `payments` (status=created) with the user id resolved
// from the caller's session JWT — never from the request body.
//
// Auth: the caller's Supabase session JWT. The uid comes from
// getUser(), not from anything the client sent.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { razorpayPlan } from "../_shared/razorpay-plans.ts";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!keyId || !keySecret) return json({ error: "Razorpay not configured" }, 500);

  // Go-live gate. Until the Razorpay dashboard webhook is registered and a
  // real capture has been observed upgrading a plan, we refuse to mint an
  // order. Taking money we cannot yet deliver is worse than a dead button:
  // this makes the rollout fail-closed instead of fail-open.
  if (Deno.env.get("RAZORPAY_CHECKOUT_ENABLED") !== "true") {
    return json({ error: "Payments are being switched on. Please try again shortly." }, 503);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Not authenticated" }, 401);

  // Resolve the caller server-side; the body's user_id is never trusted.
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return json({ error: "Not authenticated" }, 401);
  const userId = authData.user.id;
  const userEmail = authData.user.email ?? null;

  const body = await req.json().catch(() => null);
  const plan = razorpayPlan(body?.plan);
  if (!plan) return json({ error: "Unknown plan" }, 400);

  // Idempotency: Razorpay order ids are unique, and a replayed create
  // with the same key must not mint a second charge. The client sends
  // a key derived from (user, plan, minute bucket).
  const idempotencyKey = typeof body?.idempotency_key === "string"
    ? body.idempotency_key.slice(0, 64)
    : `${userId}:${plan.id}:${Math.floor(Date.now() / 60000)}`;

  const { data: existing } = await admin
    .from("payments")
    .select("id, razorpay_order_id, amount_cents, currency, plan, status")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "created")
    .maybeSingle();
  if (existing?.razorpay_order_id) {
    return json({
      order_id: existing.razorpay_order_id,
      amount: existing.amount_cents,
      currency: existing.currency,
      plan: existing.plan,
      key_id: keyId,
      reused: true,
    });
  }

  let order: { id: string; amount: number; currency: string };
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: plan.amountCents,
        currency: plan.currency,
        // Deterministic receipt -> Razorpay rejects a duplicate, which is
        // our second line of defence behind idempotency_key.
        receipt: `ord_${idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`,
        notes: { user_id: userId, plan: plan.id },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[razorpay-create-order] razorpay error:", res.status, text.slice(0, 300));
      return json({ error: "Could not start checkout" }, 502);
    }
    order = await res.json();
  } catch (e) {
    console.error("[razorpay-create-order] fetch failed:", e instanceof Error ? e.message : e);
    return json({ error: "Could not reach Razorpay" }, 502);
  }

  const { error: insErr } = await admin.from("payments").insert({
    user_id: userId,
    razorpay_order_id: order.id,
    plan: plan.id,
    amount_cents: plan.amountCents,
    currency: plan.currency,
    status: "created",
    idempotency_key: idempotencyKey,
    notes: { email: userEmail },
  });
  if (insErr && !String(insErr.message ?? "").includes("duplicate key")) {
    console.error("[razorpay-create-order] payments insert failed:", insErr.message);
  }

  return json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    plan: plan.id,
    key_id: keyId,
  });
});
