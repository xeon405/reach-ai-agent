import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Sparkles, Flame, ArrowRight, ShieldCheck, CreditCard, Trash2, MailX, Bot, Mail, Repeat, Check } from "lucide-react";
import { L as Logo } from "./Logo-BQ39Aiqa.js";
import { u as useLang, L as LangToggle, T as ThemeToggle } from "./router-DM9FrBM_.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import "@tanstack/react-query";
import "sonner";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@supabase/supabase-js";
const features = [{
  icon: Bot,
  tKey: "feat1_tt",
  dKey: "feat1_dd"
}, {
  icon: Mail,
  tKey: "feat2_tt",
  dKey: "feat2_dd"
}, {
  icon: Repeat,
  tKey: "feat3_tt",
  dKey: "feat3_dd"
}];
const plans = [{
  nameKey: "plan_starter",
  price: 37,
  capKey: "cap_starter",
  perkKeys: ["perk_ai", "perk_fu", "perk_warm", "perk_spam"]
}, {
  nameKey: "plan_growth",
  price: 79,
  capKey: "cap_growth",
  perkKeys: ["perk_ai", "perk_5camp", "perk_reply", "perk_ab", "perk_tz"],
  featured: true
}, {
  nameKey: "plan_agency",
  price: 149,
  capKey: "cap_agency",
  perkKeys: ["perk_unlim", "perk_arabic", "perk_bulk", "perk_auto", "badge_support"]
}];
function Landing() {
  const {
    lang,
    t
  } = useLang();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    supabase.rpc("public_stats").then(({
      data
    }) => {
      if (data && data.length > 0) setStats(data[0]);
    });
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-background", children: [
    /* @__PURE__ */ jsx("header", { className: "sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-6xl items-center justify-between px-6 py-4", children: [
      /* @__PURE__ */ jsx(Logo, {}),
      /* @__PURE__ */ jsxs("nav", { className: "hidden items-center gap-8 text-sm text-muted-foreground md:flex", children: [
        /* @__PURE__ */ jsx("a", { href: "#features", className: "hover:text-foreground", children: t("nav_features") }),
        /* @__PURE__ */ jsx("a", { href: "#pricing", className: "hover:text-foreground", children: t("nav_pricing") }),
        /* @__PURE__ */ jsx(Link, { to: "/tools", className: "hover:text-foreground", children: t("nav_tools") }),
        /* @__PURE__ */ jsx(Link, { to: "/agency", className: "font-medium text-primary hover:text-foreground", children: t("nav_hire") }),
        /* @__PURE__ */ jsx(Link, { to: "/stats", className: "hover:text-foreground", children: t("nav_stats") })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(LangToggle, {}),
        /* @__PURE__ */ jsx(ThemeToggle, {}),
        /* @__PURE__ */ jsx(Button, { asChild: true, variant: "ghost", size: "sm", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: t("nav_login") }) }),
        /* @__PURE__ */ jsx(Button, { asChild: true, size: "sm", className: "bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: t("start_free") }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "relative overflow-hidden bg-hero", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl px-6 pt-24 pb-32 text-center", children: [
      /* @__PURE__ */ jsxs("div", { className: "mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary", children: [
        /* @__PURE__ */ jsx(Sparkles, { className: "h-3.5 w-3.5" }),
        t("hero_badge")
      ] }),
      stats && stats.emails_sent >= 100 && /* @__PURE__ */ jsxs("div", { className: "mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold text-orange-400", children: [
        /* @__PURE__ */ jsx(Flame, { className: "h-3.5 w-3.5" }),
        stats.emails_sent.toLocaleString(),
        " cold emails already sent by OutreachAI agents"
      ] }),
      /* @__PURE__ */ jsxs("h1", { className: "text-balance text-5xl font-bold tracking-tight md:text-7xl", children: [
        t("hero_title_a"),
        " ",
        /* @__PURE__ */ jsx("span", { className: "text-gradient", children: t("hero_title_b") })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl", children: t("hero_sub") }),
      /* @__PURE__ */ jsxs("div", { className: "mt-10 flex flex-wrap items-center justify-center gap-3", children: [
        /* @__PURE__ */ jsx(Button, { asChild: true, size: "lg", className: "bg-gradient-primary shadow-glow text-base h-12 px-7", children: /* @__PURE__ */ jsxs(Link, { to: "/auth", children: [
          t("hero_cta"),
          " ",
          /* @__PURE__ */ jsx(ArrowRight, { className: "ml-2 h-4 w-4" })
        ] }) }),
        /* @__PURE__ */ jsx(Button, { asChild: true, variant: "outline", size: "lg", className: "h-12 px-7", children: /* @__PURE__ */ jsx("a", { href: "#pricing", children: t("nav_pricing") }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { className: "h-4 w-4 text-primary" }),
          " ",
          t("chip_data")
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(CreditCard, { className: "h-4 w-4 text-primary" }),
          " ",
          t("chip_card")
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4 text-primary" }),
          " ",
          t("chip_delete")
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(MailX, { className: "h-4 w-4 text-primary" }),
          " ",
          t("chip_unsub")
        ] })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "mt-3 text-xs text-muted-foreground", children: [
        t("stats_pre"),
        /* @__PURE__ */ jsx(Link, { to: "/stats", className: "underline hover:text-foreground", children: t("stats_link") }),
        t("stats_post")
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("section", { id: "features", className: "mx-auto max-w-6xl px-6 py-24", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-16 text-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-4xl font-bold tracking-tight md:text-5xl", children: "Your full outbound team, automated" }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: "Three AI workers running 24/7 so you can focus on closing." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-6 md:grid-cols-3", children: features.map((f, i) => /* @__PURE__ */ jsxs("div", { className: "group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card transition-transform hover:-translate-y-1", style: {
        animation: `fadeUp 0.6s ease ${i * 0.1}s both`
      }, children: [
        /* @__PURE__ */ jsx("div", { className: "mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(f.icon, { className: "h-6 w-6 text-primary-foreground" }) }),
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-semibold", children: t(f.tKey) }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: t(f.dKey) })
      ] }, f.tKey)) })
    ] }),
    /* @__PURE__ */ jsx("section", { id: "pricing", className: "border-t border-border/50 bg-card/30", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl px-6 py-24", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-16 text-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-4xl font-bold tracking-tight md:text-5xl", children: t("sec_pricing_title") }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: t("sec_pricing_sub") })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mb-10 text-center text-lg font-semibold text-primary", children: t("pricing_anchor") }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-6 md:grid-cols-3", children: plans.map((p) => /* @__PURE__ */ jsxs("div", { className: `relative rounded-2xl border bg-card p-8 shadow-card ${p.featured ? "border-primary shadow-glow ring-1 ring-primary/40" : "border-border"}`, children: [
        p.featured && /* @__PURE__ */ jsx("div", { className: "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground", children: t("plan_popular") }),
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold", children: t(p.nameKey) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 flex items-baseline gap-1", children: [
          /* @__PURE__ */ jsxs("span", { className: "text-5xl font-bold tracking-tight", children: [
            "$",
            p.price
          ] }),
          /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: t("per_month") })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm font-medium text-primary", children: t(p.capKey) }),
        /* @__PURE__ */ jsx("ul", { className: "mt-6 space-y-3 text-sm", children: p.perkKeys.map((perkKey) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsx(Check, { className: "mt-0.5 h-4 w-4 shrink-0 text-success" }),
          /* @__PURE__ */ jsx("span", { children: t(perkKey) })
        ] }, perkKey)) }),
        /* @__PURE__ */ jsx(Button, { asChild: true, className: `mt-8 w-full ${p.featured ? "bg-gradient-primary shadow-glow" : ""}`, variant: p.featured ? "default" : "outline", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: t("start_free") }) })
      ] }, p.nameKey)) }),
      /* @__PURE__ */ jsxs("div", { className: "mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card/60 px-6 py-5 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsx("span", { className: "flex items-center gap-2", children: t("badge_guarantee") }),
        /* @__PURE__ */ jsx("span", { className: "flex items-center gap-2", children: t("badge_cancel") }),
        /* @__PURE__ */ jsx("span", { className: "flex items-center gap-2", children: t("badge_support") })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "mt-8 text-center text-sm text-muted-foreground", children: [
        t("free_pre"),
        /* @__PURE__ */ jsx("strong", { className: "text-foreground", children: t("free_num") }),
        t("free_post")
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-4 text-center text-sm", children: /* @__PURE__ */ jsx(Link, { to: "/security", className: "text-primary underline underline-offset-4 hover:opacity-80", children: t("security_link") }) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "border-t border-border/50", children: /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-4xl px-6 py-24", children: (() => {
      const [leads, setLeads] = useState(50);
      const [replyPct, setReplyPct] = useState(5);
      const [closePct, setClosePct] = useState(20);
      const [deal, setDeal] = useState(1e3);
      const monthlyMeetings = Math.round(leads * 30 * (replyPct / 100) * (closePct / 100));
      const revenue = monthlyMeetings * deal;
      const Slider = ({
        label,
        value,
        set,
        min,
        max,
        suffix
      }) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-1.5 flex items-center justify-between text-sm", children: [
          /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: label }),
          /* @__PURE__ */ jsxs("span", { className: "font-semibold text-primary", children: [
            value,
            suffix
          ] })
        ] }),
        /* @__PURE__ */ jsx("input", { type: "range", min, max, value, onChange: (e) => set(Number(e.target.value)), className: "w-full accent-primary" })
      ] });
      return /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-10 text-center", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-3xl font-bold tracking-tight md:text-4xl", children: "🧮 What could this do for YOU?" }),
          /* @__PURE__ */ jsx("p", { className: "mx-auto mt-3 max-w-xl text-muted-foreground", children: t("roi_sub") })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-8 rounded-2xl border border-border bg-card p-8 shadow-card md:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
            /* @__PURE__ */ jsx(Slider, { label: "Leads contacted per day", value: leads, set: setLeads, min: 10, max: 200, suffix: "" }),
            /* @__PURE__ */ jsx(Slider, { label: "Expected reply rate", value: replyPct, set: setReplyPct, min: 1, max: 15, suffix: "%" }),
            /* @__PURE__ */ jsx(Slider, { label: "Replies that become meetings", value: closePct, set: setClosePct, min: 5, max: 60, suffix: "%" }),
            /* @__PURE__ */ jsx(Slider, { label: "Average deal value", value: deal, set: setDeal, min: 100, max: 1e4, suffix: "$" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col justify-center rounded-2xl bg-gradient-primary p-8 text-center text-primary-foreground", children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium opacity-80", children: t("roi_result") }),
            /* @__PURE__ */ jsx("div", { className: "mt-4 text-5xl font-extrabold tracking-tight", children: monthlyMeetings }),
            /* @__PURE__ */ jsx("div", { className: "text-sm opacity-90", children: t("roi_meetings") }),
            /* @__PURE__ */ jsxs("div", { className: "mt-6 border-t border-white/20 pt-5", children: [
              /* @__PURE__ */ jsxs("div", { className: "text-2xl font-bold", children: [
                "$",
                revenue.toLocaleString()
              ] }),
              /* @__PURE__ */ jsx("div", { className: "text-xs opacity-80", children: t("roi_rev") })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-6 text-center text-xs text-muted-foreground", children: t("roi_note") })
      ] });
    })() }) }),
    /* @__PURE__ */ jsx("section", { className: "border-t border-border/50", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl px-6 py-24 text-center", children: [
      /* @__PURE__ */ jsx("p", { className: "text-2xl font-medium leading-relaxed tracking-tight md:text-3xl", children: t("founder_quote") }),
      /* @__PURE__ */ jsxs("div", { className: "mt-8 flex items-center justify-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary font-bold text-primary-foreground", children: "O" }),
        /* @__PURE__ */ jsxs("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold", children: t("founder_role") }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: t("founder_note") })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("footer", { className: "border-t border-border/50", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row", children: [
      /* @__PURE__ */ jsx(Logo, {}),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-center gap-6 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsx("a", { href: "#features", className: "hover:text-foreground", children: t("nav_features") }),
        /* @__PURE__ */ jsx("a", { href: "#pricing", className: "hover:text-foreground", children: t("nav_pricing") }),
        /* @__PURE__ */ jsx(Link, { to: "/security", className: "hover:text-foreground", children: t("footer_security") }),
        /* @__PURE__ */ jsx(Link, { to: "/status", className: "hover:text-foreground", children: t("footer_status") }),
        /* @__PURE__ */ jsx(Link, { to: "/honesty", className: "hover:text-foreground", children: "Honesty" }),
        /* @__PURE__ */ jsx(Link, { to: "/refunds", className: "hover:text-foreground", children: "Refunds" }),
        /* @__PURE__ */ jsx(Link, { to: "/about", className: "hover:text-foreground", children: "About" }),
        /* @__PURE__ */ jsx(Link, { to: "/terms", className: "hover:text-foreground", children: t("footer_terms") }),
        /* @__PURE__ */ jsx(Link, { to: "/privacy", className: "hover:text-foreground", children: t("footer_privacy") }),
        /* @__PURE__ */ jsx(Link, { to: "/auth", className: "hover:text-foreground", children: t("nav_login") })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "© 2026 OutreachAI" })
    ] }) }),
    /* @__PURE__ */ jsx("style", { children: `@keyframes fadeUp { from { opacity:0; transform: translateY(20px);} to {opacity:1; transform:none;} }` })
  ] });
}
export {
  Landing as component
};
//# sourceMappingURL=index-CXvHTdbV.js.map
