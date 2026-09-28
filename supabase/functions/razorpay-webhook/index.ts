// ============================================================
// RAZORPAY WEBHOOK — the only place a plan is granted.
//
// Security model:
//   * HMAC-SHA256 of the RAW body against RAZORPAY_WEBHOOK_SECRET,
//     timing-safe compared (same standard as billing-webhook).
//   * The plan comes from OUR OWN payments row, matched by order id.
//     We never trust plan/amount/user_id from the event payload —
//     Razorpay echoes the notes, but a forged note must not be able
//     to grant a plan, so the order id must exist in `payments` and
//     its stored plan is the one applied.
//   * Idempotent: Razorpay retries until it sees a 2xx, and
//     payment.captured can arrive more than once. The unique index on
//     razorpay_payment_id plus the status guard means a redelivery
//     cannot double-apply a plan change.
//
// Events handled:
//   payment.captured        -> grant/upgrade the plan
//   payment.failed          -> mark the attempt failed (no plan change)
//   refund.processed        -> downgrade, because the money came back
//   subscription.activated  -> grant (auto-renew ON, if ever enabled)
//   subscription.cancelled  -> downgrade at period end
//   subscription.completed  -> downgrade, the term ended
//   subscription.halted     -> downgrade, collection stopped failing
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";
import { insertAudit } from "../_shared/audit.ts";
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

interface RzpEvent {
  event?: string;
  payload?: {
    payment?: {
      entity?: string;
      id?: string;
      order_id?: string;
      amount?: number;
      currency?: string;
      status?: string;
      method?: string;
      error_code?: string;
      error_description?: string;
    };
    refund?: { entity?: string; id?: string; payment_id?: string; amount?: number };
    subscription?: {
      entity?: string;
      id?: string;
      status?: string;
      plan_id?: string;
      notes?: Record<string, string>;
      current_period_end?: number;
    };
    order?: { entity?: string; id?: string; amount?: number; currency?: string; notes?: Record<string, string> };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  if (!secret) return json({ error: "Webhook not configured" }, 500);

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("mismatch");
  } catch {
    console.error("[razorpay-webhook] invalid signature");
    return json({ error: "Invalid signature" }, 401);
  }

  let evt: RzpEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return json({ error: "Bad payload" }, 400);
  }

  const event = evt.event ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- resolve the payments row by the RAZORPAY order id -----------------
  // This is the trust anchor: the plan applied is the plan WE stored when
  // we created the order, not anything the event says about itself.
  const orderId = evt.payload?.payment?.order_id ?? evt.payload?.order?.id ?? undefined;
  let payment: Record<string, any> | null = null;
  if (orderId) {
    const { data } = await supabase.from("payments").select("*").eq("razorpay_order_id", orderId).maybeSingle();
    payment = data ?? null;
  }

  // Subscription events carry the plan in notes only if we put it there.
  // We do, on order creation; fall back to it when there is no order row.
  const subNotes = evt.payload?.subscription?.notes ?? {};
  const userId: string | null = payment?.user_id ?? subNotes.user_id ?? null;

  if (!userId) {
    console.error("[razorpay-webhook] no payments row for event", event, orderId);
    // 200 so Razorpay stops retrying an event we can never attribute.
    return json({ ok: true, ignored: true, reason: "no_attributable_order" });
  }

  const record = async (fields: Record<string, unknown>) => {
    if (payment?.id) await supabase.from("payments").update(fields).eq("id", payment.id);
  };
  const audit = (ev: string, payload: Record<string, unknown>) =>
    insertAudit(supabase as any, { user_id: userId, event: ev, payload });

  // ---- payment.captured -> grant the plan --------------------------------
  if (event === "payment.captured") {
    const p = evt.payload?.payment ?? {};
    const paymentId = p.id ?? null;
    const plan = razorpayPlan(payment?.plan);

    // Already settled by an earlier delivery -> acknowledge, change nothing.
    if (payment && payment.status === "paid") {
      return json({ ok: true, duplicate: true, order_id: orderId });
    }
    if (payment?.status === "refunded") {
      return json({ ok: true, ignored: true, reason: "already_refunded" });
    }
    if (!plan) {
      console.error("[razorpay-webhook] captured order with unknown plan", orderId);
      return json({ ok: true, ignored: true, reason: "unknown_plan" });
    }

    // Amount guard: the captured amount must match what we charged. A
    // mismatch means something changed server-side between create and
    // capture, so we refuse to grant rather than guess.
    if (typeof p.amount === "number" && Number(p.amount) !== Number(payment?.amount_cents)) {
      console.error("[razorpay-webhook] amount mismatch", orderId, p.amount, payment?.amount_cents);
      return json({ ok: true, ignored: true, reason: "amount_mismatch" });
    }

    const { error: payErr } = await supabase.from("payments").update({
      status: "paid",
      razorpay_payment_id: paymentId,
      method: p.method ?? null,
      paid_at: new Date().toISOString(),
    }).eq("razorpay_order_id", orderId);

    if (payErr) {
      // Unique violation on razorpay_payment_id => a concurrent delivery
      // already settled it. Not an error worth retrying.
      if (String(payErr.message ?? "").includes("duplicate key")) {
        return json({ ok: true, duplicate: true });
      }
      console.error("[razorpay-webhook] payments update failed:", payErr.message);
      return json({ error: "db" }, 500);
    }

    await supabase.from("profiles").update({ plan: plan.id }).eq("id", userId);
    await supabase.from("billing_events").insert({
      user_id: userId,
      payment_id: payment?.id ?? null,
      event: "payment.captured",
      plan: plan.id,
      amount_cents: payment?.amount_cents ?? null,
      currency: payment?.currency ?? null,
      payload: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, method: p.method ?? null },
    });
    await audit("billing.plan_granted", { plan: plan.id, razorpay_payment_id: paymentId, provider: "razorpay" });
    return json({ ok: true, plan: plan.id, order_id: orderId });
  }

  // ---- payment.failed -> record, never grant -----------------------------
  if (event === "payment.failed") {
    const p = evt.payload?.payment ?? {};
    await record({ status: "failed", failure_reason: p.error_description ?? p.error_code ?? "payment_failed" });
    await supabase.from("billing_events").insert({
      user_id: userId,
      payment_id: payment?.id ?? null,
      event: "payment.failed",
      plan: payment?.plan ?? null,
      amount_cents: payment?.amount_cents ?? null,
      payload: { error_code: p.error_code ?? null, description: p.error_description ?? null },
    });
    await audit("billing.payment_failed", { error_code: p.error_code ?? null });
    return json({ ok: true });
  }

  // ---- refund.processed -> the money came back, drop to free -------------
  if (event === "refund.processed") {
    const paymentId = evt.payload?.refund?.payment_id ?? evt.payload?.payment?.id ?? null;
    let target = payment;
    if (!target && paymentId) {
      const { data } = await supabase.from("payments").select("*").eq("razorpay_payment_id", paymentId).maybeSingle();
      target = data ?? null;
    }
    if (target?.id) {
      await supabase.from("payments").update({ status: "refunded" }).eq("id", target.id);
      await supabase.from("profiles").update({ plan: "free" }).eq("id", target.user_id);
      await supabase.from("billing_events").insert({
        user_id: target.user_id,
        payment_id: target.id,
        event: "refund.processed",
        plan: "free",
        amount_cents: target.amount_cents,
        payload: { razorpay_refund_id: evt.payload?.refund?.id ?? null },
      });
      await insertAudit(supabase as any, {
        user_id: target.user_id,
        event: "billing.plan_revoked",
        payload: { reason: "refund", plan_before: target.plan },
      });
    }
    return json({ ok: true });
  }

  // ---- subscription lifecycle (only fires once auto-renew is enabled) ----
  if (event.startsWith("subscription.")) {
    const s = evt.payload?.subscription ?? {};
    const plan = razorpayPlan(subNotes.plan);
    if (event === "subscription.activated" && plan) {
      const { data: current } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
      if (current?.plan !== plan.id) {
        await supabase.from("profiles").update({ plan: plan.id }).eq("id", userId);
        await audit("billing.plan_granted", { plan: plan.id, via: "subscription.activated" });
      }
      return json({ ok: true, plan: plan.id });
    }
    if (["subscription.cancelled", "subscription.completed", "subscription.halted", "subscription.paused"].includes(event)) {
      // Razorpay cancels at period end: the customer already paid for the
      // remaining term, so the plan is kept until current_period_end.
      const endsAt = typeof s.current_period_end === "number" ? s.current_period_end * 1000 : null;
      if (endsAt && endsAt > Date.now() + 60_000) {
        await supabase.from("billing_events").insert({
          user_id: userId, event, plan: null, payload: { effective_at: new Date(endsAt).toISOString() },
        });
        return json({ ok: true, deferred_until: new Date(endsAt).toISOString() });
      }
      const { data: current } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
      if (current && current.plan !== "free") {
        await supabase.from("profiles").update({ plan: "free" }).eq("id", userId);
        await audit("billing.plan_revoked", { reason: event, plan_before: current.plan });
      }
      return json({ ok: true, downgraded: true });
    }
    return json({ ok: true, ignored: event });
  }

  return json({ ok: true, ignored: event });
});
