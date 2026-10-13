import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Loader2 } from "lucide-react";
import { planSummary, type PlanId } from "@/lib/plan-limits";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

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

function BillingPage() {
  const [plan, setPlan] = useState("starter");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
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
      setEmail(data.user.email ?? "");
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
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  /**
   * The amount is decided on the server: we send a plan id, Razorpay
   * charges what our catalog says. The browser never states a price.
   * On success we show the plan immediately — the webhook is the
   * durable record and will agree, but waiting for it would look
   * broken to a paying customer.
   */
  async function startCheckout(planId: string, planName: string) {
    if (!userId) return toast.error("Please sign in first.");
    setPaying(planId);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
        body: { plan: planId, idempotency_key: `${userId}:${planId}:${Date.now()}` },
      });
      if (error) throw new Error(error.message);
      if (!data?.order_id) throw new Error(data?.error ?? "Could not start checkout");

      if (!window.Razorpay) {
        // Script still loading (or blocked) — retry once after a tick.
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (!window.Razorpay)
        throw new Error("Payment window failed to load. Check your connection and try again.");

      const rz = new window.Razorpay({
        key: data.key_id,
        order_id: data.order_id,
        amount: data.amount,
        currency: data.currency,
        name: "OutshipAi",
        description: `${planName} plan`,
        // Prefill the signed-in email and let a declined card try another
        // method. International cards are declined more often than domestic
        // ones, so a dead-end failure wastes a sale; retry keeps it alive.
        prefill: { email },
        retry: { enabled: true },
        handler: async (response: Record<string, string>) => {
          setPlan(planId);
          setPaying(null);
          toast.success(`You're on the ${planName} plan. Welcome aboard!`);
          void response;
        },
        modal: {
          ondismiss: () => setPaying(null),
        },
        theme: { color: "#6366f1" },
      });
      rz.open();
    } catch (e) {
      setPaying(null);
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Simple pricing. No hidden fees. Cancel anytime.
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
                  <span className="text-base text-muted-foreground mb-1">/mo</span>
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

              <Button
                className={`mt-6 w-full ${!isCurrent ? "bg-primary" : ""}`}
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || paying !== null}
                onClick={() => startCheckout(p.id, p.name)}
              >
                {isCurrent ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Current plan
                  </>
                ) : paying === p.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening checkout…
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" /> Get {p.name} — ${p.price}/mo
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Guarantee */}
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>14-day money-back guarantee</strong> on your first purchase — no forms, no reason
          needed. Payments are one-time — you are never auto-charged, and your plan runs until the end
          of the period you paid for.
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
