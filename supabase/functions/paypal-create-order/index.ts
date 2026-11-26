// ============================================================
// PAYPAL CREATE-ORDER — server-side order creation.
//
// The browser sends a PLAN ID, never an amount. We look the amount
// up in the shared catalog and create the order with PayPal, so a
// tampered client cannot choose what it pays. The order id is
// written to `payments` (status=created) with the user id resolved
// from the caller's session JWT — never from the request body.
//
// Auth: the caller's Supabase session JWT. The uid comes from
// getUser(), not from anything the client sent.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { amountValue, paypalPlan } from "../_shared/paypal-plans.ts";
import { paypalConfigured, paypalEnv, paypalRequest, requestId } from "../_shared/paypal-api.ts";

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

  if (!paypalConfigured()) return json({ error: "PayPal not configured" }, 500);

  // Go-live gate. Until checkout has been proven end to end in this
  // environment, we refuse to mint an order. Taking money we cannot yet
  // deliver is worse than a dead button: fail-closed, not fail-open.
  if (Deno.env.get("PAYPAL_CHECKOUT_ENABLED") !== "true") {
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
  const plan = paypalPlan(body?.plan);
  if (!plan) return json({ error: "Unknown plan" }, 400);

  // Idempotency: a replayed create with the same key must not mint a
  // second chargeable order. The client sends a key derived from
  // (user, plan, minute bucket); we also fall back to the same shape.
  const idempotencyKey = typeof body?.idempotency_key === "string"
    ? body.idempotency_key.slice(0, 64)
    : `${userId}:${plan.id}:${Math.floor(Date.now() / 60000)}`;

  const { data: existing } = await admin
    .from("payments")
    .select("id, provider_order_id, amount_cents, currency, plan, status")
    .eq("user_id", userId)
    .eq("provider", "paypal")
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "created")
    .maybeSingle();
  if (existing?.provider_order_id) {
    return json({
      order_id: existing.provider_order_id,
      amount_cents: existing.amount_cents,
      currency: existing.currency,
      plan: existing.plan,
      reused: true,
    });
  }

  let order: { id?: string; status?: string };
  try {
    const res = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId("create", idempotencyKey) },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: `OutshipAi ${plan.name} plan (one-time)`,
            // custom_id is echoed back in the capture and the webhook, so it
            // is a second way to attribute an event to a user if the order
            // id ever goes missing. The trust anchor is still our payments row.
            custom_id: userId,
            amount: { currency_code: plan.currency, value: amountValue(plan.amountCents) },
          },
        ],
        application_context: {
          brand_name: "OutshipAi",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[paypal-create-order] paypal error:", res.status, text.slice(0, 300));
      return json({ error: "Could not start checkout" }, 502);
    }
    order = await res.json();
  } catch (e) {
    console.error("[paypal-create-order] fetch failed:", e instanceof Error ? e.message : e);
    return json({ error: "Could not reach PayPal" }, 502);
  }

  if (!order?.id) {
    console.error("[paypal-create-order] missing order id in response");
    return json({ error: "Could not start checkout" }, 502);
  }

  const { error: insErr } = await admin.from("payments").insert({
    user_id: userId,
    provider: "paypal",
    provider_order_id: order.id,
    plan: plan.id,
    amount_cents: plan.amountCents,
    currency: plan.currency,
    status: "created",
    idempotency_key: idempotencyKey,
    notes: { email: userEmail, paypal_env: paypalEnv() },
  });
  if (insErr && !String(insErr.message ?? "").includes("duplicate key")) {
    console.error("[paypal-create-order] payments insert failed:", insErr.message);
  }

  return json({
    order_id: order.id,
    plan: plan.id,
    amount_cents: plan.amountCents,
    currency: plan.currency,
    // Client ids are public by design; the browser SDK needs one. We return
    // the server's value so the deployed page cannot silently use a stale
    // build-time id after a sandbox -> live switch.
    client_id: Deno.env.get("PAYPAL_CLIENT_ID") ?? "",
    env: paypalEnv(),
  });
});
