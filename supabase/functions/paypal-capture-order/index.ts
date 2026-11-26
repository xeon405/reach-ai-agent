// ============================================================
// PAYPAL CAPTURE-ORDER — settle the payment and grant the plan.
//
// The browser sends ORDER ID only. We look up our own `payments` row
// (scoped to the caller) to learn the plan and the amount, capture
// with PayPal, and then verify the captured amount matches what we
// stored before granting anything.
//
// Idempotent: a double click, a retried request, or a webhook that
// already settled the row all return success without re-granting.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { centsFromValue, paypalPlan } from "../_shared/paypal-plans.ts";
import { paypalConfigured, paypalRequest, requestId } from "../_shared/paypal-api.ts";

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

interface CaptureEntity {
  id?: string;
  status?: string;
  amount?: { value?: string; currency_code?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!paypalConfigured()) return json({ error: "PayPal not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return json({ error: "Not authenticated" }, 401);
  const userId = authData.user.id;

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
  if (!orderId) return json({ error: "Missing order id" }, 400);

  // The order must belong to the caller. This is what stops user A from
  // capturing (and being granted) user B's order id.
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("provider", "paypal")
    .eq("provider_order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!payment) return json({ error: "Order not found" }, 404);

  const plan = paypalPlan(payment.plan);
  if (!plan) {
    console.error("[paypal-capture-order] stored row has unknown plan", orderId, payment.plan);
    return json({ error: "Order has an unknown plan" }, 409);
  }

  // Already settled — by an earlier click or by the webhook.
  if (payment.status === "paid") {
    return json({ ok: true, plan: plan.id, duplicate: true });
  }
  if (payment.status === "refunded") {
    return json({ error: "This payment was refunded" }, 409);
  }
  if (payment.status === "failed") {
    return json({ error: "This payment attempt failed. Please start a new checkout." }, 409);
  }

  let captured: CaptureEntity | null = null;
  try {
    const res = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId("capture", orderId) },
      body: "{}",
    });

    if (res.status === 422 || res.status === 409) {
      // Already captured (e.g. the buyer retried, or the webhook won the race).
      // Read the order back instead of failing a paying customer.
      const detail = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      if (!detail.ok) {
        const text = await res.text();
        console.error("[paypal-capture-order] capture rejected:", res.status, text.slice(0, 300));
        return json({ error: "Payment could not be confirmed" }, 502);
      }
      const order = await detail.json();
      captured = order?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
      if (!captured) return json({ error: "Payment could not be confirmed" }, 502);
    } else if (!res.ok) {
      const text = await res.text();
      console.error("[paypal-capture-order] paypal error:", res.status, text.slice(0, 300));
      await admin.from("payments").update({
        status: "failed",
        failure_reason: text.slice(0, 200) || `capture_${res.status}`,
      }).eq("id", payment.id);
      await insertAudit(admin as any, {
        user_id: userId,
        event: "billing.payment_failed",
        payload: { provider: "paypal", order_id: orderId, status: res.status },
      });
      return json({ error: "Payment was declined. Nothing was charged." }, 402);
    } else {
      const order = await res.json();
      captured = order?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
    }
  } catch (e) {
    console.error("[paypal-capture-order] fetch failed:", e instanceof Error ? e.message : e);
    return json({ error: "Could not reach PayPal" }, 502);
  }

  if (!captured?.id || captured.status !== "COMPLETED") {
    console.error("[paypal-capture-order] capture not completed:", captured?.id, captured?.status);
    return json({ error: "Payment is still pending. Please refresh in a moment." }, 409);
  }

  // Amount guard: the captured money must equal the price we stored. A
  // mismatch means something changed between create and capture, so we
  // refuse to grant rather than guess.
  const capturedCents = centsFromValue(captured.amount?.value);
  const capturedCurrency = captured.amount?.currency_code ?? "";
  if (capturedCents !== Number(payment.amount_cents) || capturedCurrency !== payment.currency) {
    console.error(
      "[paypal-capture-order] amount mismatch",
      orderId,
      captured.amount?.value,
      captured.amount?.currency_code,
      payment.amount_cents,
      payment.currency,
    );
    return json({ error: "Payment amount mismatch — please contact support." }, 409);
  }

  const { error: payErr } = await admin.from("payments").update({
    status: "paid",
    provider_payment_id: captured.id,
    method: "paypal",
    paid_at: new Date().toISOString(),
  }).eq("id", payment.id);

  if (payErr) {
    // Unique violation on provider_payment_id => the webhook settled it
    // concurrently. That is success, not failure.
    if (String(payErr.message ?? "").includes("duplicate key")) {
      return json({ ok: true, plan: plan.id, duplicate: true });
    }
    console.error("[paypal-capture-order] payments update failed:", payErr.message);
    return json({ error: "Payment captured but not recorded — contact support." }, 500);
  }

  await admin.from("profiles").update({ plan: plan.id }).eq("id", userId);
  await admin.from("billing_events").insert({
    user_id: userId,
    payment_id: payment.id,
    event: "payment.captured",
    plan: plan.id,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    payload: { provider: "paypal", paypal_capture_id: captured.id, paypal_order_id: orderId },
  });
  await insertAudit(admin as any, {
    user_id: userId,
    event: "billing.plan_granted",
    payload: { plan: plan.id, provider: "paypal", capture_id: captured.id },
  });

  return json({ ok: true, plan: plan.id, capture_id: captured.id });
});
