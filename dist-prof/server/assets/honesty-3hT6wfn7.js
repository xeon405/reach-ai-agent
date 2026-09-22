import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { HeartHandshake, CheckCircle2, AlertTriangle } from "lucide-react";
import "react";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
const CHARTER = [{
  rule: "We disclose our flaws before you pay",
  detail: "Below is our complete list of current limitations. Read them before you buy — we would rather lose a sale than mislead a customer."
}, {
  rule: "We hide nothing",
  detail: "Our live statistics come straight from production data — real sends, real replies, updated continuously. If numbers look small, it's because we are young and honest, not because we rounded up.",
  link: {
    to: "/stats",
    label: "See the real numbers"
  }
}, {
  rule: "We never exaggerate",
  detail: "Every claim on this site maps to a shipped feature you can test today. Our ROI calculator is labelled as an estimate based on typical performance — your results may be better or worse."
}, {
  rule: "We take no false oaths",
  detail: "No fabricated testimonials. No fake user counters. No invented press logos. No countdown timers pretending things expire. What you see is everything there is."
}, {
  rule: "We honor our commitments",
  detail: "Support answers within 24 hours. Paid features work as described. If we ever fail this standard, tell us and we will make it right — including refunds.",
  link: {
    to: "/terms",
    label: "Read our Terms"
  }
}, {
  rule: "We give exact measures",
  detail: "Every plan states its exact daily and monthly email caps. Your agent hard-stops at the limit — you will never be silently throttled or surprised with overage charges."
}, {
  rule: "Our pricing is fully upfront",
  detail: "The price on the card is the entire price. All taxes and fees are shown clearly before you confirm payment. No hidden charges, no bait-and-switch.",
  link: {
    to: "/billing",
    label: "See plans"
  }
}, {
  rule: "We do not manipulate markets",
  detail: "No artificial scarcity ('only 3 spots left!'), no fake discounts from inflated 'original' prices, no dark patterns at checkout."
}, {
  rule: "Your right of return is guaranteed",
  detail: "14-day money-back guarantee, no questions asked — even without a hidden defect. Email us within 14 days of payment and receive a full refund.",
  link: {
    to: "/terms",
    label: "Refund policy"
  }
}, {
  rule: "Reviews will only ever be real",
  detail: "When we add customer reviews, they will come from verified paid accounts only. We will never delete a genuine negative review, incentivise positive ones, or seed fake testimonials. Until real customers exist, we show no reviews at all."
}, {
  rule: "Your data is a sacred trust",
  detail: "We never sell, rent, or share your data. Gmail tokens live in an isolated vault. Export or permanently delete everything with one click, anytime.",
  link: {
    to: "/security",
    label: "How we protect data"
  }
}];
const LIMITATIONS = ["AI-written drafts are strong but not perfect — we recommend reading the one-click AI replies before sending them.", "Open tracking uses a standard invisible pixel, so opens are approximate: contacts using strict privacy tools or text-only inboxes may not be counted. Replies, bounces and sentiment are tracked accurately.", "Inbox placement depends partly on your own domain reputation. Our warm-up ramp protects you, but no tool can guarantee 100% inbox delivery.", "The Arabic experience currently covers the marketing site and emails to Arab leads; parts of the app interior remain English-only for now.", "Support is handled by our team — we respond within 24 hours, occasionally slightly slower across time zones.", "Scheduled sending delivers into each lead's local business morning; exact minute-level timing cannot be controlled.", "This is a young product. Some rough edges exist. We fix reported issues fast and publicly credit reporters."];
function HonestyPage() {
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
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-3xl px-4 pb-10 pt-8 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(HeartHandshake, { className: "h-8 w-8 text-primary-foreground" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-extrabold tracking-tight sm:text-5xl", children: "Our Honesty Charter" }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: "Ten binding rules we hold ourselves to — written down so you can hold us to them." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-3xl space-y-4 px-4 pb-16", children: [
      CHARTER.map((c, i) => /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
        /* @__PURE__ */ jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15", children: /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4 text-success" }) }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxs("h2", { className: "font-semibold", children: [
            i + 1,
            ". ",
            c.rule
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-sm leading-relaxed text-muted-foreground", children: c.detail }),
          c.link && /* @__PURE__ */ jsxs(Link, { to: c.link.to, className: "mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80", children: [
            c.link.label,
            " →"
          ] })
        ] })
      ] }) }, c.rule)),
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-warning/40 bg-warning/5 p-7", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "h-5 w-5 text-warning" }),
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: "Full defect disclosure — what we can't do yet" })
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "mt-4 space-y-2.5", children: LIMITATIONS.map((l) => /* @__PURE__ */ jsxs("li", { className: "flex gap-2.5 text-sm leading-relaxed text-muted-foreground", children: [
          /* @__PURE__ */ jsx("span", { className: "mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" }),
          l
        ] }, l)) }),
        /* @__PURE__ */ jsx("p", { className: "mt-5 border-t border-warning/20 pt-4 text-xs text-muted-foreground", children: "This page is updated whenever a limitation is fixed or discovered. Last update: August 2026." })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "pt-2 text-center text-xs text-muted-foreground", children: [
        "Found us falling short of any rule? ",
        /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Falling%20short%20of%20the%20Charter", className: "underline hover:text-foreground", children: "contact our team" }),
        " and we will make it right."
      ] })
    ] })
  ] });
}
export {
  HonestyPage as component
};
//# sourceMappingURL=honesty-3hT6wfn7.js.map
