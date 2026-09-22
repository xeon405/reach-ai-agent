import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { B as Button } from "./button-DjOZMqFS.js";
import "@tanstack/react-query";
import "react";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const INCLUDED = [{
  icon: "🎯",
  title: "Lead research",
  desc: "We build your ideal-customer list every week — country, niche, company size, you choose."
}, {
  icon: "✍️",
  title: "AI-personalized emails",
  desc: "Every prospect gets an email written specifically for them. No templates that read like spam."
}, {
  icon: "🔁",
  title: "Automated follow-ups",
  desc: "Gentle persistence until they answer — up to 5 touches, perfectly timed."
}, {
  icon: "🤖",
  title: "AI reply handling",
  desc: "Replies classified and answered instantly; hot leads land on your calendar."
}, {
  icon: "📊",
  title: "Weekly report",
  desc: "Emails sent, opens, replies, meetings booked — one clean email every Monday."
}, {
  icon: "🛡️",
  title: "Deliverability guard",
  desc: "Safe sending limits, spam-word screening, and unsubscribe handling built in."
}];
function AgencyPage() {
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-background", children: [
    /* @__PURE__ */ jsx(EnOnlyNotice, {}),
    /* @__PURE__ */ jsxs("header", { className: "mx-auto flex max-w-6xl items-center justify-between px-4 py-5", children: [
      /* @__PURE__ */ jsxs(Link, { to: "/", className: "text-lg font-bold", children: [
        "Outreach",
        /* @__PURE__ */ jsx("span", { className: "text-primary", children: "AI" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(ThemeToggle, {}),
        /* @__PURE__ */ jsx(Link, { to: "/auth", children: /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", children: "Open app" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-4xl px-4 pb-16 pt-10 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 w-fit rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary", children: "Done-For-You Service" }),
      /* @__PURE__ */ jsxs("h1", { className: "text-4xl font-extrabold tracking-tight sm:text-5xl", children: [
        "We book sales calls into your calendar.",
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("span", { className: "text-gradient", children: "You just show up." })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "mx-auto mt-6 max-w-2xl text-lg text-muted-foreground", children: [
        "Our AI outreach team finds your ideal customers worldwide, writes them personal emails from your own address, follows up automatically, and hands you warm conversations — starting at",
        " ",
        /* @__PURE__ */ jsx("strong", { className: "text-foreground", children: "$299/month" }),
        ". No ads. No cold calls."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-8 flex flex-wrap justify-center gap-3", children: [
        /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=I%20want%20more%20sales%20calls&body=Tell%20me%20about%20your%20industry%2C%20target%20country%20and%20offer.%0A%0AIndustry:%0ACountry:%0AOffer:", children: /* @__PURE__ */ jsx(Button, { size: "lg", className: "bg-gradient-primary px-8 text-base shadow-lg", children: "Get my first campaign 🚀" }) }),
        /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Question%20about%20DFY%20service", children: /* @__PURE__ */ jsx(Button, { size: "lg", variant: "outline", className: "px-8 text-base", children: "Ask a question" }) })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-4 text-xs text-muted-foreground", children: "Setup in 48 hours · Cancel anytime · Your data stays yours" })
    ] }),
    /* @__PURE__ */ jsx("section", { className: "border-t border-border bg-muted/30 py-16", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl px-4", children: [
      /* @__PURE__ */ jsx("h2", { className: "mb-10 text-center text-3xl font-bold", children: "Everything handled for you" }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: INCLUDED.map((f) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsx("div", { className: "text-2xl", children: f.icon }),
        /* @__PURE__ */ jsx("h3", { className: "mt-3 font-semibold", children: f.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-sm leading-relaxed text-muted-foreground", children: f.desc })
      ] }, f.title)) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "py-16", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl px-4 text-center", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-3xl font-bold", children: "Simple pricing" }),
      /* @__PURE__ */ jsxs("div", { className: "mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-3xl border border-border bg-card p-8 shadow-card", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold uppercase tracking-wide text-muted-foreground", children: "Launch" }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 text-4xl font-extrabold", children: [
            "$299",
            /* @__PURE__ */ jsx("span", { className: "text-base font-medium text-muted-foreground", children: "/mo" })
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "mt-6 space-y-2.5 text-left text-sm", children: [
            /* @__PURE__ */ jsx("li", { children: "✅ 500 AI emails / month" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Weekly lead research" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Automated follow-ups" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Weekly report" })
          ] }),
          /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Launch%20plan%20—%20$299/mo", children: /* @__PURE__ */ jsx(Button, { className: "mt-7 w-full", variant: "outline", children: "Start Launch" }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative rounded-3xl border-2 border-primary bg-card p-8 shadow-glow", children: [
          /* @__PURE__ */ jsx("div", { className: "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-bold text-white", children: "MOST POPULAR" }),
          /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold uppercase tracking-wide text-primary", children: "Growth" }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 text-4xl font-extrabold", children: [
            "$699",
            /* @__PURE__ */ jsx("span", { className: "text-base font-medium text-muted-foreground", children: "/mo" })
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "mt-6 space-y-2.5 text-left text-sm", children: [
            /* @__PURE__ */ jsx("li", { children: "✅ 2,000 AI emails / month" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Multi-country targeting" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Spam-checked AI subject lines" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Priority reply handling" }),
            /* @__PURE__ */ jsx("li", { children: "✅ Dedicated manager" })
          ] }),
          /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Growth%20plan%20—%20$699/mo", children: /* @__PURE__ */ jsx(Button, { className: "mt-7 w-full bg-gradient-primary", children: "Start Growth" }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-6 text-xs text-muted-foreground", children: "One-time setup $199 · Prices in USD · Pause or cancel anytime" })
    ] }) }),
    /* @__PURE__ */ jsxs("footer", { className: "border-t border-border py-8 text-center text-xs text-muted-foreground", children: [
      "© ",
      (/* @__PURE__ */ new Date()).getFullYear(),
      " OutreachAI ·",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/privacy", className: "underline", children: "Privacy" }),
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/terms", className: "ml-2 underline", children: "Terms" })
    ] })
  ] });
}
export {
  AgencyPage as component
};
//# sourceMappingURL=agency-BhnrMeP5.js.map
