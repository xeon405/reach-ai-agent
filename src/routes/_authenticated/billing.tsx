import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";
import { planSummary, type PlanId } from "@/lib/plan-limits";

interface PayPalButtonsOptions {
  style?: Record<string, string | number | boolean>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void> | void;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: PayPalButtonsOptions) => {
        render: (target: HTMLElement | string) => Promise<void>;
      };
    };
  }
}

/**
 * Paid checkout is gated twice: this build-time flag (is a PayPal client id
 * configured?) and the server's PAYPAL_CHECKOUT_ENABLED secret. A visible
 * button therefore never fires against an unconfigured backend.
 */
const PAYPAL_CLIENT_ID = (import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined) ?? "";
const CHECKOUT_LIVE = PAYPAL_CLIENT_ID.length > 0;

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 37,
    badge: null,
    features: [
      "AI Lead Finder (open directories)",
      "Gmail integration",
      "Auto follow-ups (day 3)",
      "Personalized AI emails",
      "CSV import & export",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    badge: "Most Popular",
    features: [
      "Everything in Starter",
      "5x daily sending limit",
      "AI Lead Finder (open directories)",
      "Reply detection & alerts",
      "CSV import & export",
      "Chat support",
    ],
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: 149,
    badge: "Best Value",
    features: [
      "Everything in Growth",
      "Unlimited campaigns",
      "500 emails/day sending power",
      "Onboarding call",
      "Priority support",
      "Early access to new features",
    ],
  },
];

/**
 * supabase-js collapses a non-2xx edge-function response into a generic
 * message. Our functions return a helpful `error` string, so pull it out of
 * the response body before falling back.
 */
async function invokeJson<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        if (parsed?.error) message = String(parsed.error);
      }
    } catch {
      // Keep the generic message when the body is not JSON.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

function BillingPage() {
  const [plan, setPlan] = useState("starter");
  const [userId, setUserId] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [payments, setPayments] = useState<
    Array<{
      id: string;
      plan: string;
      amount_cents: number;
      currency: string;
      status: string;
      created_at: string;
    }>
  >([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", data.user.id)
        .single();
      if (p?.plan) setPlan(p.plan);

      const { data: rows } = await supabase
        .from("payments")
        .select("id, plan, amount_cents, currency, status, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(24);
      setPayments(rows ?? []);
    });
  }, []);

  // Load the PayPal SDK once. The client id decides sandbox vs live, so the
  // same host serves both.
  useEffect(() => {
    if (!CHECKOUT_LIVE) return;
    if (window.paypal) {
      setSdkReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk="1"]');
    if (existing) {
      existing.addEventListener("load", () => setSdkReady(true));
      return;
    }
    const script = document.createElement("script");
    script.dataset.paypalSdk = "1";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      PAYPAL_CLIENT_ID,
    )}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () =>
      toast.error("PayPal checkout failed to load. Check your connection and try again.");
    document.body.appendChild(script);
  }, []);

  /**
   * The amount is decided on the server: we send a plan id, PayPal charges
   * what our catalog says. The browser never states a price.
   */
  const startCheckout = useCallback(
    async (planId: string): Promise<string | null> => {
      if (!userId) {
        toast.error("Please sign in first.");
        return null;
      }
      setPaying(planId);
      try {
        const data = await invokeJson<{ order_id?: string }>("paypal-create-order", {
          plan: planId,
          idempotency_key: `${userId}:${planId}:${Math.floor(Date.now() / 60000)}`,
        });
        if (!data?.order_id) throw new Error("Could not start checkout");
        return data.order_id;
      } catch (e) {
        setPaying(null);
        toast.error(e instanceof Error ? e.message : "Checkout failed");
        return null;
      }
    },
    [userId],
  );

  /** Capture server-side. The webhook is the durable record, this is the UX. */
  const completeCheckout = useCallback(
    async (planId: string, planName: string, orderId: string) => {
      try {
        const data = await invokeJson<{ ok?: boolean; plan?: string }>("paypal-capture-order", {
          order_id: orderId,
        });
        if (!data?.ok) throw new Error("Payment could not be confirmed");
        setPlan(planId);
        toast.success(`You're on the ${planName} plan. Welcome aboard!`);
        const { data: rows } = await supabase
          .from("payments")
          .select("id, plan, amount_cents, currency, status, created_at")
          .order("created_at", { ascending: false })
          .limit(24);
        setPayments(rows ?? []);
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Payment could not be confirmed. Contact support if you were charged.",
        );
      } finally {
        setPaying(null);
      }
    },
    [],
  );

  // Render one PayPal button per upgradable plan. Re-renders on plan change so
  // the card the customer just bought stops offering a button.
  useEffect(() => {
    if (!CHECKOUT_LIVE || !sdkReady || !userId || !window.paypal) return;
    for (const p of PLANS) {
      if (p.id === plan) continue;
      const container = document.getElementById(`paypal-btn-${p.id}`);
      if (!container) continue;
      container.innerHTML = "";
      void window.paypal
        .Buttons({
          style: { layout: "vertical", shape: "rect", label: "paypal", height: 40, tagline: false },
          createOrder: async () => {
            const orderId = await startCheckout(p.id);
            // Throwing aborts the PayPal flow; onError stays quiet for this.
            if (!orderId) throw new Error("checkout aborted");
            return orderId;
          },
          onApprove: async (data) => {
            await completeCheckout(p.id, p.name, data.orderID);
          },
          onCancel: () => setPaying(null),
          onError: (err) => {
            setPaying(null);
            if (String(err instanceof Error ? err.message : err).includes("aborted")) return;
            toast.error("PayPal checkout failed. Please try again.");
          },
        })
        .render(container)
        .catch((err: unknown) => {
          console.error("[billing] paypal render failed:", err);
        });
    }
  }, [sdkReady, userId, plan, startCheckout, completeCheckout]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Simple pricing. No hidden fees. One-time payment. No auto-renewal.
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">Current plan</div>
        <div className="mt-1 flex items-center gap-3">
          <h2 className="text-2xl font-bold capitalize">{plan}</h2>
          <Badge className="bg-success/15 text-success" variant="secondary">
            Active
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your plan includes {planSummary(plan as PlanId)}.
        </p>
        {plan === "free" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrade anytime for higher sending power.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card/60 px-6 py-4 text-sm text-muted-foreground">
        <span>No hidden fees · taxes shown at checkout before you pay</span>
        <span>Exact email caps — hard stop, never overage</span>
        <span>Prices never change based on your activity</span>
        <span>14-day money-back on your first purchase</span>
        <a
          href="/honesty"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline underline-offset-4"
        >
          Our Honesty Charter →
        </a>
      </div>

      {/* Pricing */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          return (
            <div
              key={p.id}
              className={`rounded-lg border bg-card p-4 relative flex flex-col ${
                p.popular ? "border-primary ring-1 ring-primary/40" : "border-border"
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  {p.badge}
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-4xl font-bold">${p.price}</span>
                  <span className="text-base text-muted-foreground mb-1">one-time</span>
                </div>
                <p className="mt-1 text-sm text-primary font-medium">
                  {planSummary(p.id as PlanId)}
                </p>
              </div>

              <ul className="mt-5 space-y-2 flex-1">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Button className="mt-6 w-full" variant="outline" disabled>
                  <Check className="mr-2 h-4 w-4" /> Current plan
                </Button>
              ) : CHECKOUT_LIVE ? (
                <div className="mt-6 space-y-2">
                  <div id={`paypal-btn-${p.id}`} />
                  {!sdkReady && (
                    <Button className="w-full" disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading checkout…
                    </Button>
                  )}
                  {paying === p.id && (
                    <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Opening PayPal…
                    </p>
                  )}
                  <p className="text-center text-[11px] text-muted-foreground">
                    Secure checkout by PayPal · one-time payment
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">
                  Paid checkout is temporarily closed. Start free — no card needed.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Guarantee */}
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>14-day money-back guarantee</strong> on your first purchase — no forms, no reason
          needed. Payments are one-time — you are never auto-charged, and your plan stays active
          until you change it or a refund is processed.
        </p>
      </div>

      {/* Invoice History — real payment rows (RLS scopes these to the owner) */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Invoice history</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 capitalize">{p.plan}</td>
                    <td className="px-4 py-3">
                      {p.currency === "INR"
                        ? `₹${(p.amount_cents / 100).toLocaleString("en-IN")}`
                        : `$${(p.amount_cents / 100).toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          p.status === "paid"
                            ? "text-success"
                            : p.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});
