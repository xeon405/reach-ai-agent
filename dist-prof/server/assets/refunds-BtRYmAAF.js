import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { Undo2, ShieldCheck, Clock } from "lucide-react";
import "react";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
function RefundsPage() {
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-background", children: [
    /* @__PURE__ */ jsx(EnOnlyNotice, {}),
    /* @__PURE__ */ jsxs("header", { className: "mx-auto flex max-w-5xl items-center justify-between px-4 py-5", children: [
      /* @__PURE__ */ jsxs(Link, { to: "/", className: "text-lg font-bold", children: [
        "Outreach",
        /* @__PURE__ */ jsx("span", { className: "text-primary", children: "AI" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(ThemeToggle, {}),
        /* @__PURE__ */ jsx(Link, { to: "/auth", children: /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", children: "Open app" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-2xl px-4 pb-10 pt-8 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Undo2, { className: "h-8 w-8 text-primary-foreground" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-extrabold tracking-tight", children: "Return & Refund Policy" }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: "Short version: if you're not happy, you get your money back. Here are the exact terms." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-2xl space-y-4 px-4 pb-20", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-success/30 bg-success/5 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { className: "h-5 w-5 text-success" }),
          /* @__PURE__ */ jsx("h2", { className: "font-semibold", children: "14-day money-back guarantee" })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "mt-2.5 text-sm leading-relaxed text-muted-foreground", children: [
          "Every paid plan includes a full refund within ",
          /* @__PURE__ */ jsx("strong", { children: "14 calendar days of payment" }),
          " — no questions asked, no reason required, no forms to fight with. One email is enough."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-semibold", children: "Hidden-defect guarantee (anytime)" }),
        /* @__PURE__ */ jsxs("p", { className: "mt-2.5 text-sm leading-relaxed text-muted-foreground", children: [
          "If a flaw exists that we failed to disclose — a feature that doesn't work as described, a limitation not listed on our",
          " ",
          /* @__PURE__ */ jsx(Link, { to: "/honesty", className: "text-primary underline underline-offset-4", children: "Honesty Charter" }),
          " — you are entitled to a ",
          /* @__PURE__ */ jsx("strong", { children: "full refund at any point during your subscription" }),
          ", even beyond the 14-day window. What we know, you know; what we missed, we pay for."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx(Clock, { className: "h-5 w-5 text-primary" }),
          /* @__PURE__ */ jsx("h2", { className: "font-semibold", children: "Timelines & process" })
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "mt-3 space-y-2 text-sm text-muted-foreground", children: [
          /* @__PURE__ */ jsxs("li", { children: [
            "• ",
            /* @__PURE__ */ jsx("strong", { children: "Request:" }),
            " email ",
            /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Refund%20request", className: "text-primary underline underline-offset-4", children: "outreachai.team@gmail.com" }),
            ' with the subject "Refund request"'
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "• ",
            /* @__PURE__ */ jsx("strong", { children: "Response:" }),
            " within 24 hours with confirmation"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "• ",
            /* @__PURE__ */ jsx("strong", { children: "Processing:" }),
            " refunds are issued to your original payment method within 5–10 business days "
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "• ",
            /* @__PURE__ */ jsx("strong", { children: "Your data:" }),
            " refunding never locks you out early — your plan stays active until the period you paid for ends, and you can export or delete your data anytime"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-semibold", children: "Cancelling without a refund" }),
        /* @__PURE__ */ jsx("p", { className: "mt-2.5 text-sm leading-relaxed text-muted-foreground", children: "You can cancel anytime from Settings → Billing. Cancellation stops all future charges immediately; nothing else changes until your paid period ends." })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "pt-2 text-center text-xs text-muted-foreground", children: [
        "This policy is part of our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/terms", className: "underline hover:text-foreground", children: "Terms of Service" }),
        " and our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/honesty", className: "underline hover:text-foreground", children: "Honesty Charter" }),
        "."
      ] })
    ] })
  ] });
}
export {
  RefundsPage as component
};
//# sourceMappingURL=refunds-BtRYmAAF.js.map
