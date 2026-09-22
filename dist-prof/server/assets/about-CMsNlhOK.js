import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { Compass } from "lucide-react";
import "react";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
const PRINCIPLES = [{
  title: "Absolute honesty",
  body: "We publish our product's flaws on a public page. Our statistics come live from real data. If we ever fall short of a claim we made, we make it right — including refunds."
}, {
  title: "Fair trade",
  body: "The price you see is the entire price. No hidden fees, no dynamic pricing tricks, no artificial scarcity. Plans state their exact limits and the system respects them — for you and for everyone."
}, {
  title: "Mutual respect",
  body: "Your inbox, your data, your decision. Unsubscribing is one click. Exporting your data is one click. Deleting everything is one click. A business should be easy to leave — that's how trust is earned."
}];
function AboutPage() {
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
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Compass, { className: "h-8 w-8 text-primary-foreground" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-extrabold tracking-tight sm:text-5xl", children: "About OutreachAI" }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: "We build an AI sales agent so small teams can reach the world without hiring a sales department." })
    ] }),
    /* @__PURE__ */ jsx("section", { className: "mx-auto max-w-2xl px-4 pb-10", children: /* @__PURE__ */ jsx("p", { className: "text-center text-lg leading-relaxed text-muted-foreground", children: "OutreachAI started with a simple observation: great products lose to louder competitors because outreach is expensive, slow, and uncomfortable. We believed an AI agent — one that finds the right people, writes like a human, and respects every rule of good emailing — could level that field." }) }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-3xl space-y-4 px-4 pb-16", children: [
      PRINCIPLES.map((p) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-7 shadow-card", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-semibold", children: p.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm leading-relaxed text-muted-foreground", children: p.body })
      ] }, p.title)),
      /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-primary/30 bg-primary/5 p-7 text-center", children: /* @__PURE__ */ jsxs("p", { className: "text-sm leading-relaxed text-muted-foreground", children: [
        "We run this business on a simple standard:",
        " ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-foreground", children: "deal only in what you know, promise only what you deliver, and treat the other side the way you'd want to be treated." }),
        " ",
        "That standard shows up in our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/honesty", className: "text-primary underline underline-offset-4", children: "Honesty Charter" }),
        ", our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/refunds", className: "text-primary underline underline-offset-4", children: "refund policy" }),
        ", and every email our agents send."
      ] }) }),
      /* @__PURE__ */ jsxs("p", { className: "pt-2 text-center text-xs text-muted-foreground", children: [
        "Questions? Our team responds at ",
        /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com", className: "underline hover:text-foreground", children: "outreachai.team@gmail.com" }),
        " within 24 hours."
      ] })
    ] })
  ] });
}
export {
  AboutPage as component
};
//# sourceMappingURL=about-CMsNlhOK.js.map
