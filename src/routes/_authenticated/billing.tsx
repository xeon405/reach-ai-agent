import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 37,
    cap: "50 emails/day · 1 campaign",
    badge: null,
    features: [
      "AI Lead Finder (open directories)",
      "Gmail integration",
      "Auto follow-ups (day 3)",
      "Personalized AI emails",
      "CSV import & export",
      "Email support",
    ],
    checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/c9a1d2d8-e87a-4942-aa82-8e402ebfe5d3",
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    cap: "200 emails/day · 5 campaigns",
    badge: "Most Popular",
    features: [
      "Everything in Starter",
      "5x daily sending limit",
      "AI Lead Finder (open directories)",
      "Reply detection & alerts",
      "CSV import & export",
      "Chat support",
    ],
    checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/4bb8c689-8b6b-465d-8d77-e371ec92a518",
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: 149,
    cap: "500 emails/day · Unlimited campaigns",
    badge: "Best Value",
    features: [
      "Everything in Growth",
      "Unlimited campaigns",
      "500 emails/day sending power",
      "Onboarding call",
      "Priority support",
      "Early access to new features",
    ],
    checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/c03bf0be-ab01-4694-a26f-f589c3e70664",
  },
];

function BillingPage() {
  const [plan, setPlan] = useState("starter");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", data.user.id)
        .single();
      if (p?.plan) setPlan(p.plan);
    });
  }, []);

  async function handleCheckout(checkoutUrl: string) {
    // Payments go live soon — collect interested users instead of dead checkout
    toast.info("💳 Payments are launching very soon! You're on the Starter plan meanwhile — enjoy higher limits on us.");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Simple pricing. No hidden fees. Cancel anytime.
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="text-sm text-muted-foreground">Current plan</div>
        <div className="mt-1 flex items-center gap-3">
          <h2 className="text-2xl font-bold capitalize">{plan}</h2>
          <Badge className="bg-success/15 text-success" variant="secondary">Active</Badge>
        </div>
        {plan === "free" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Free plan: 10 emails/day · 1 active campaign. Upgrade anytime for higher sending power.
          </p>
        )}
        {plan === "starter" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Starter: 50 emails/day · 1 active campaign.
          </p>
        )}
        {plan === "growth" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Growth: 200 emails/day · 5 active campaigns.
          </p>
        )}
        {plan === "agency" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Agency: 500 emails/day · unlimited campaigns.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card/60 px-6 py-4 text-sm text-muted-foreground">
        <span>✅ No hidden fees · taxes shown at checkout before you pay</span>
        <span>✅ Exact email caps — hard stop, never overage</span>
        <span>✅ Prices never change based on your activity</span>
        <span>✅ 14-day money-back, no questions asked</span>
        <a href="/honesty" target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">🤝 Our Honesty Charter →</a>
      </div>

      {/* Pricing */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border bg-card p-6 shadow-card relative flex flex-col ${
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
                <p className="mt-1 text-sm text-primary font-medium">{p.cap}</p>
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
                className={`mt-6 w-full ${!isCurrent ? "bg-gradient-primary shadow-glow" : ""}`}
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent}
                onClick={() => window.open(p.checkoutUrl, "_blank")}
              >
                {isCurrent ? (
                  <><Check className="mr-2 h-4 w-4" /> Current plan</>
                ) : (
                  <><Zap className="mr-2 h-4 w-4" /> Get {p.name} — ${p.price}/mo</>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Guarantee */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card text-center">
        <p className="text-sm text-muted-foreground">
          🔒 <strong>14-day money back guarantee.</strong> No questions asked. Cancel anytime from your dashboard.
        </p>
      </div>

      {/* Invoice History */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
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
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No invoices yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}