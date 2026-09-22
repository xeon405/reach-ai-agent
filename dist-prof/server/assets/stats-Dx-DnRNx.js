import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Activity, Users, Flame } from "lucide-react";
import { L as Logo } from "./Logo-BQ39Aiqa.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@supabase/supabase-js";
function StatCard({
  icon,
  value,
  label
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-8 text-center shadow-card", children: [
    /* @__PURE__ */ jsx("div", { className: "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary", children: icon }),
    /* @__PURE__ */ jsx("div", { className: "text-4xl font-bold tracking-tight md:text-5xl", children: value }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 text-sm text-muted-foreground", children: label })
  ] });
}
function StatsPage() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    supabase.rpc("public_stats").then(({
      data
    }) => {
      if (data) setStats(Array.isArray(data) ? data[0] : data);
    });
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-background", children: [
    /* @__PURE__ */ jsx("header", { className: "border-b border-border/50", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-5xl items-center justify-between px-6 py-4", children: [
      /* @__PURE__ */ jsx(Logo, {}),
      /* @__PURE__ */ jsx(Button, { asChild: true, size: "sm", className: "bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: "Start free" }) })
    ] }) }),
    /* @__PURE__ */ jsxs("main", { className: "mx-auto max-w-5xl px-6 py-14", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsxs("h1", { className: "flex items-center justify-center gap-2 text-4xl font-bold tracking-tight md:text-5xl", children: [
          /* @__PURE__ */ jsx(Activity, { className: "h-9 w-9 text-primary" }),
          " Live stats"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 text-muted-foreground", children: "Real numbers, updated the moment they change. No marketing math." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-12 grid gap-6 sm:grid-cols-3", children: [
        /* @__PURE__ */ jsx(StatCard, { icon: /* @__PURE__ */ jsx(Users, { className: "h-5 w-5" }), value: String(stats?.agents ?? "—"), label: "AI agents running" }),
        /* @__PURE__ */ jsx(StatCard, { icon: /* @__PURE__ */ jsx(Flame, { className: "h-5 w-5" }), value: String(stats?.emails_sent ?? "—"), label: "Cold emails sent" }),
        /* @__PURE__ */ jsx(StatCard, { icon: /* @__PURE__ */ jsx(Activity, { className: "h-5 w-5" }), value: String(stats?.replies_detected ?? "—"), label: "Replies detected & sorted" })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "mt-16 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold", children: "Your agent could be part of these numbers" }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-2 max-w-xl text-sm text-muted-foreground", children: "Free to start, no credit card, delete your data anytime. The stats above include every send our community's agents make." }),
        /* @__PURE__ */ jsx(Button, { asChild: true, size: "lg", className: "mt-5 bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: "Launch my agent" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("footer", { className: "border-t border-border/50 py-6 text-center text-xs text-muted-foreground", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "hover:text-foreground", children: "Home" }),
      " · ",
      /* @__PURE__ */ jsx("a", { href: "/tools", className: "hover:text-foreground", children: "Free tools" }),
      " · ",
      /* @__PURE__ */ jsx("a", { href: "/terms", className: "hover:text-foreground", children: "Terms" }),
      " · ",
      /* @__PURE__ */ jsx("a", { href: "/privacy", className: "hover:text-foreground", children: "Privacy" })
    ] })
  ] });
}
export {
  StatsPage as component
};
//# sourceMappingURL=stats-Dx-DnRNx.js.map
