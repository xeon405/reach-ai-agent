import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { Check, Zap } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const PLANS = [{
  id: "starter",
  name: "Starter",
  price: 37,
  cap: "50 emails/day · 1 campaign",
  badge: null,
  features: ["AI Lead Finder (open directories)", "Gmail integration", "Auto follow-ups (day 3)", "Personalized AI emails", "CSV import & export", "Email support"],
  checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/c9a1d2d8-e87a-4942-aa82-8e402ebfe5d3"
}, {
  id: "growth",
  name: "Growth",
  price: 79,
  cap: "200 emails/day · 5 campaigns",
  badge: "Most Popular",
  features: ["Everything in Starter", "5x daily sending limit", "AI Lead Finder (open directories)", "Reply detection & alerts", "CSV import & export", "Chat support"],
  checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/4bb8c689-8b6b-465d-8d77-e371ec92a518",
  popular: true
}, {
  id: "agency",
  name: "Agency",
  price: 149,
  cap: "500 emails/day · Unlimited campaigns",
  badge: "Best Value",
  features: ["Everything in Growth", "Unlimited campaigns", "500 emails/day sending power", "Onboarding call", "Priority support", "Early access to new features"],
  checkoutUrl: "https://outreach-ai.lemonsqueezy.com/checkout/buy/c03bf0be-ab01-4694-a26f-f589c3e70664"
}];
function BillingPage() {
  const [plan, setPlan] = useState("starter");
  useEffect(() => {
    supabase.auth.getUser().then(async ({
      data
    }) => {
      if (!data.user) return;
      const {
        data: p
      } = await supabase.from("profiles").select("plan").eq("id", data.user.id).single();
      if (p?.plan) setPlan(p.plan);
    });
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Billing" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Simple pricing. No hidden fees. Cancel anytime." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
      /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: "Current plan" }),
      /* @__PURE__ */ jsxs("div", { className: "mt-1 flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold capitalize", children: plan }),
        /* @__PURE__ */ jsx(Badge, { className: "bg-success/15 text-success", variant: "secondary", children: "Active" })
      ] }),
      plan === "free" && /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Free plan: 10 emails/day · 1 active campaign. Upgrade anytime for higher sending power." }),
      plan === "starter" && /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Starter: 50 emails/day · 1 active campaign." }),
      plan === "growth" && /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Growth: 200 emails/day · 5 active campaigns." }),
      plan === "agency" && /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Agency: 500 emails/day · unlimited campaigns." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card/60 px-6 py-4 text-sm text-muted-foreground", children: [
      /* @__PURE__ */ jsx("span", { children: "✅ No hidden fees · taxes shown at checkout before you pay" }),
      /* @__PURE__ */ jsx("span", { children: "✅ Exact email caps — hard stop, never overage" }),
      /* @__PURE__ */ jsx("span", { children: "✅ Prices never change based on your activity" }),
      /* @__PURE__ */ jsx("span", { children: "✅ 14-day money-back, no questions asked" }),
      /* @__PURE__ */ jsx("a", { href: "/honesty", target: "_blank", rel: "noreferrer", className: "font-medium text-primary underline underline-offset-4", children: "🤝 Our Honesty Charter →" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid gap-4 md:grid-cols-3", children: PLANS.map((p) => {
      const isCurrent = p.id === plan;
      return /* @__PURE__ */ jsxs("div", { className: `rounded-2xl border bg-card p-6 shadow-card relative flex flex-col ${p.popular ? "border-primary ring-1 ring-primary/40" : "border-border"}`, children: [
        p.badge && /* @__PURE__ */ jsx("div", { className: "absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap", children: p.badge }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold", children: p.name }),
          /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-end gap-1", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-4xl font-bold", children: [
              "$",
              p.price
            ] }),
            /* @__PURE__ */ jsx("span", { className: "text-base text-muted-foreground mb-1", children: "/mo" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-primary font-medium", children: p.cap })
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "mt-5 space-y-2 flex-1", children: p.features.map((f, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [
          /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-primary shrink-0" }),
          f
        ] }, i)) }),
        /* @__PURE__ */ jsx(Button, { className: `mt-6 w-full ${!isCurrent ? "bg-gradient-primary shadow-glow" : ""}`, variant: isCurrent ? "outline" : "default", disabled: isCurrent, onClick: () => window.open(p.checkoutUrl, "_blank"), children: isCurrent ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Check, { className: "mr-2 h-4 w-4" }),
          " Current plan"
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Zap, { className: "mr-2 h-4 w-4" }),
          " Get ",
          p.name,
          " — $",
          p.price,
          "/mo"
        ] }) })
      ] }, p.id);
    }) }),
    /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card text-center", children: /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
      "🔒 ",
      /* @__PURE__ */ jsx("strong", { children: "14-day money back guarantee." }),
      " No questions asked. Cancel anytime from your dashboard."
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
      /* @__PURE__ */ jsx("h2", { className: "mb-4 text-lg font-semibold", children: "Invoice history" }),
      /* @__PURE__ */ jsx("div", { className: "overflow-x-auto rounded-xl border border-border", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Date" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Plan" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Amount" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 4, className: "px-4 py-10 text-center text-muted-foreground", children: "No invoices yet." }) }) })
      ] }) })
    ] })
  ] });
}
export {
  BillingPage as component
};
//# sourceMappingURL=billing-Dbkn7yjs.js.map
