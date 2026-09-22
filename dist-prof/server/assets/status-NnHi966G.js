import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { Activity, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "sonner";
const FN = "https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1";
function StatusPage() {
  const [rows, setRows] = useState([{
    name: "Website",
    detail: "Landing page & app shell",
    state: "checking",
    ms: null
  }, {
    name: "Authentication",
    detail: "Supabase GoTrue login service",
    state: "checking",
    ms: null
  }, {
    name: "Database",
    detail: "Campaigns, leads, email history",
    state: "checking",
    ms: null
  }, {
    name: "AI Sending Engine",
    detail: "send-campaign edge function",
    state: "checking",
    ms: null
  }, {
    name: "AI Reply Engine",
    detail: "reply classification & drafts",
    state: "checking",
    ms: null
  }, {
    name: "Follow-up Autopilot",
    detail: "scheduled follow-up runner",
    state: "checking",
    ms: null
  }]);
  const [checkedAt, setCheckedAt] = useState(null);
  async function ping(index, fn) {
    const t0 = performance.now();
    try {
      await fn();
      setRows((r) => r.map((x, i) => i === index ? {
        ...x,
        state: "up",
        ms: Math.round(performance.now() - t0)
      } : x));
    } catch {
      setRows((r) => r.map((x, i) => i === index ? {
        ...x,
        state: "down",
        ms: null
      } : x));
    }
  }
  async function runAll() {
    setRows((r) => r.map((x) => ({
      ...x,
      state: "checking",
      ms: null
    })));
    const key = {
      apikey: "sb_publishable_HzeVbGj6DI3klatdPuQnhA_qqTzZ0uM",
      Authorization: "Bearer sb_publishable_HzeVbGj6DI3klatdPuQnhA_qqTzZ0uM"
    };
    await Promise.allSettled([ping(0, () => fetch(window.location.origin).then((res) => {
      if (!res.ok) throw new Error();
    })), ping(1, () => fetch("https://zvohdvopmvzsujktrdmu.supabase.co/auth/v1/health", {
      headers: key
    }).then((res) => {
      if (!res.ok) throw new Error();
    })), ping(2, async () => {
      await supabase.rpc("public_stats");
    }), ping(3, () => fetch(`${FN}/send-worker?health=1`).then((res) => {
      if (!res.ok) throw new Error();
    })), ping(4, () => fetch(`${FN}/inbox-agent?health=1`).then((res) => {
      if (!res.ok) throw new Error();
    })), ping(5, () => fetch(`${FN}/send-worker?health=1&engine=followups`).then((res) => {
      if (!res.ok) throw new Error();
    }))]);
    setCheckedAt(/* @__PURE__ */ new Date());
  }
  useEffect(() => {
    void runAll();
    const t = setInterval(() => void runAll(), 6e4);
    return () => clearInterval(t);
  }, []);
  const allUp = rows.every((r) => r.state === "up");
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
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-2xl px-4 pt-10 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: `mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${allUp ? "bg-success/15" : checkedAt ? "bg-warning/15" : "bg-primary/10"}`, children: /* @__PURE__ */ jsx(Activity, { className: `h-8 w-8 ${allUp ? "text-success" : checkedAt ? "text-warning" : "text-primary"}` }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight sm:text-4xl", children: checkedAt === null ? "Checking systems…" : allUp ? "All systems operational" : "Partial degradation" }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm text-muted-foreground", children: "Live health checks · auto-refreshes every 60 seconds" }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", className: "mt-4", onClick: () => void runAll(), children: [
        /* @__PURE__ */ jsx(RefreshCw, { className: "mr-2 h-3.5 w-3.5" }),
        " Refresh now"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-2xl space-y-3 px-4 pb-24 pt-10", children: [
      rows.map((r) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          r.state === "up" && /* @__PURE__ */ jsx(CheckCircle2, { className: "h-5 w-5 text-success" }),
          r.state === "down" && /* @__PURE__ */ jsx(XCircle, { className: "h-5 w-5 text-destructive" }),
          r.state === "checking" && /* @__PURE__ */ jsx(Loader2, { className: "h-5 w-5 animate-spin text-muted-foreground" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold", children: r.name }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: r.detail })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "text-xs font-medium text-muted-foreground", children: r.state === "up" ? `Operational${r.ms !== null ? ` · ${r.ms}ms` : ""}` : r.state === "down" ? "Investigating" : "…" })
      ] }, r.name)),
      /* @__PURE__ */ jsx("p", { className: "pt-4 text-center text-xs text-muted-foreground", children: "Questions? Contact our team — we respond within 24 hours." })
    ] })
  ] });
}
export {
  StatusPage as component
};
//# sourceMappingURL=status-NnHi966G.js.map
