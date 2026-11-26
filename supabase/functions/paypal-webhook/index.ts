// ============================================================
// PAYPAL WEBHOOK — the durable settlement record.
//
// Security model:
//   * Every delivery is verified with PayPal's own
//     /v1/notifications/verify-webhook-signature endpoint against
//     PAYPAL_WEBHOOK_ID. We never trust an unverified body.
//   * The plan comes from OUR OWN payments row, matched by order id.
//     We never trust plan/amount/user_id from the event payload: a
//     forged body must not be able to grant a plan.
//   * The captured amount must equal the amount we stored.
//   * Idempotent: the unique index on provider_payment_id plus the
//     status guard means a redelivery cannot double-apply a change.
//
// Events handled:
//   PAYMENT.CAPTURE.COMPLETED -> grant/upgrade the plan
//   PAYMENT.CAPTURE.DENIED    -> mark the attempt failed (no plan change)
//   PAYMENT.CAPTURE.REFUNDED  -> downgrade, the money came back
//   PAYMENT.CAPTURE.REVERSED  -> downgrade, PayPal reversed the capture
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { centsFromValue, paypalPlan } from "../_shared/paypal-plans.ts";
import { paypalConfigured, paypalRequest } from "../_shared/paypal-api.ts";

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

interface PayPalEvent {
  id?: string;
  event_type?: string;
  resource?: Record<string, any>;
}

/** The capture id a refund/reversal points back to, via its `up` link. */
function captureIdFromLinks(resource: Record<string, any> | undefined): string | null {
  const links = Array.isArray(resource?.links) ? resource!.links : [];
  for (const link of links) {
    const match = String(link?.href ?? "").match(/\/v2\/payments\/captures\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!paypalConfigured()) return json({ error: "Webhook not configured" }, 500);

  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "";
  if (!webhookId) return json({ error: "Webhook id not configured" }, 500);

  const rawBody = await req.text();
  let evt: PayPalEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return json({ error: "Bad payload" }, 400);
  }

  // ---- 1. verify the delivery with PayPal --------------------------------
  // The signature is checked by PayPal, not by us: their verification
  // endpoint resolves the certificate and validates the transmission.
  let verified = false;
  try {
    const res = await paypalRequest("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: req.headers.get("paypal-auth-algo") ?? "",
        cert_url: req.headers.get("paypal-cert-url") ?? "",
        transmission_id: req.headers.get("paypal-transmission-id") ?? "",
        transmission_sig: req.headers.get("paypal-transmission-sig") ?? "",
        transmission_time: req.headers.get("paypal-transmission-time") ?? "",
        webhook_id: webhookId,
        webhook_event: evt,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      verified = body?.verification_status === "SUCCESS";
    } else {
      console.error("[paypal-webhook] verify failed:", res.status, (await res.text()).slice(0, 200));
    }
  } catch (e) {
    console.error("[paypal-webhook] verify threw:", e instanceof Error ? e.message : e);
  }
  if (!verified) {
    console.error("[paypal-webhook] signature verification failed", evt?.id, evt?.event_type);
    return json({ error: "Invalid signature" }, 401);
  }

  const event = evt.event_type ?? "";
  const resource = evt.resource ?? {};
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- 2. resolve OUR payments row (never trust the payload's plan) ------
  const orderId = resource?.supplementary_data?.related_ids?.order_id ?? null;
  let payment: Record<string, any> | null = null;

  if (orderId) {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("provider", "paypal")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    payment = data ?? null;
  }

  // Refunds/reversals identify the capture, not always the order.
  if (!payment) {
    const captureId = event === "PAYMENT.CAPTURE.REVERSED"
      ? resource?.id
      : captureIdFromLinks(resource) ?? resource?.id;
    if (captureId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("provider", "paypal")
        .eq("provider_payment_id", captureId)
        .maybeSingle();
      payment = data ?? null;
    }
  }

  if (!payment) {
    console.error("[paypal-webhook] no payments row for event", event, orderId, resource?.id);
    // 200 so PayPal stops retrying an event we can never attribute.
    return json({ ok: true, ignored: true, reason: "no_attributable_payment" });
  }

  const userId: string = payment.user_id;
  const audit = (ev: string, payload: Record<string, unknown>) =>
    insertAudit(supabase as any, { user_id: userId, event: ev, payload });

  // ---- 3. capture completed -> grant the plan ---------------------------
  if (event === "PAYMENT.CAPTURE.COMPLETED") {
    const captureId = resource?.id ?? null;

    if (payment.status === "paid") {
      return json({ ok: true, duplicate: true, order_id: orderId });
    }
    if (payment.status === "refunded") {
      return json({ ok: true, ignored: true, reason: "already_refunded" });
    }

    const plan = paypalPlan(payment.plan);
    if (!plan) {
      console.error("[paypal-webhook] stored row has unknown plan", payment.id, payment.plan);
      return json({ ok: true, ignored: true, reason: "unknown_plan" });
    }

    // Amount guard: the captured money must match what we charged.
    const capturedCents = centsFromValue(resource?.amount?.value);
    const capturedCurrency = String(resource?.amount?.currency_code ?? "");
    if (capturedCents !== Number(payment.amount_cents) || capturedCurrency !== payment.currency) {
      console.error(
        "[paypal-webhook] amount mismatch",
        payment.id,
        resource?.amount?.value,
        capturedCurrency,
        payment.amount_cents,
        payment.currency,
      );
      return json({ ok: true, ignored: true, reason: "amount_mismatch" });
    }

    const { error: payErr } = await supabase.from("payments").update({
      status: "paid",
      provider_payment_id: captureId,
      method: "paypal",
      paid_at: new Date().toISOString(),
    }).eq("id", payment.id);

    if (payErr) {
      if (String(payErr.message ?? "").includes("duplicate key")) {
        return json({ ok: true, duplicate: true });
      }
      console.error("[paypal-webhook] payments update failed:", payErr.message);
      return json({ error: "db" }, 500);
    }

    await supabase.from("profiles").update({ plan: plan.id }).eq("id", userId);
    await supabase.from("billing_events").insert({
      user_id: userId,
      payment_id: payment.id,
      event: "payment.captured",
      plan: plan.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      payload: { provider: "paypal", paypal_capture_id: captureId, paypal_order_id: orderId },
    });
    await audit("billing.plan_granted", { plan: plan.id, provider: "paypal", capture_id: captureId });
    return json({ ok: true, plan: plan.id, order_id: orderId });
  }

  // ---- 4. capture denied -> record, never grant -------------------------
  if (event === "PAYMENT.CAPTURE.DENIED") {
    await supabase.from("payments").update({
      status: "failed",
      failure_reason: String(resource?.status_details?.reason ?? "capture_denied").slice(0, 200),
    }).eq("id", payment.id);
    await supabase.from("billing_events").insert({
      user_id: userId,
      payment_id: payment.id,
      event: "payment.failed",
      plan: payment.plan,
      amount_cents: payment.amount_cents,
      payload: { provider: "paypal", reason: resource?.status_details?.reason ?? null },
    });
    await audit("billing.payment_failed", { provider: "paypal", reason: resource?.status_details?.reason ?? null });
    return json({ ok: true });
  }

  // ---- 5. refund / reversal -> the money came back, drop to free --------
  if (event === "PAYMENT.CAPTURE.REFUNDED" || event === "PAYMENT.CAPTURE.REVERSED") {
    if (payment.status !== "refunded") {
      await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);
      await supabase.from("profiles").update({ plan: "free" }).eq("id", userId);
      await supabase.from("billing_events").insert({
        user_id: userId,
        payment_id: payment.id,
        event: "refund.processed",
        plan: "free",
        amount_cents: payment.amount_cents,
        currency: payment.currency,
        payload: { provider: "paypal", paypal_refund_id: resource?.id ?? null, kind: event },
      });
      await audit("billing.plan_revoked", {
        reason: "refund",
        provider: "paypal",
        plan_before: payment.plan,
        refund_id: resource?.id ?? null,
      });
    }
    return json({ ok: true, downgraded: true });
  }

  return json({ ok: true, ignored: event });
});
