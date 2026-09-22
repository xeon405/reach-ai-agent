import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { useState } from "react";
import { MailCheck, Loader2, Check, X, Sparkles, Copy } from "lucide-react";
import { L as Logo } from "./Logo-BQ39Aiqa.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { L as Label } from "./label-C8WJLhmR.js";
import "./router-DM9FrBM_.js";
import "@tanstack/react-query";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
function ToolsPage() {
  const [listText, setListText] = useState("");
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState(null);
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  async function callTools(payload) {
    const res = await fetch(`${"https://zvohdvopmvzsujktrdmu.supabase.co"}/functions/v1/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  async function validate() {
    const emails = listText.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean).slice(0, 25);
    if (emails.length === 0) return;
    setValidating(true);
    setResults(null);
    const data = await callTools({
      action: "validate",
      emails
    });
    setValidating(false);
    setResults(data.results ?? []);
  }
  async function generate() {
    if (!offer.trim() || !audience.trim()) return;
    setGenerating(true);
    setSubjects([]);
    const data = await callTools({
      action: "subjects",
      offer,
      audience
    });
    setGenerating(false);
    setSubjects(data.subjects ?? []);
  }
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-background", children: [
    /* @__PURE__ */ jsx(EnOnlyNotice, {}),
    /* @__PURE__ */ jsx("header", { className: "border-b border-border/50", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-5xl items-center justify-between px-6 py-4", children: [
      /* @__PURE__ */ jsx(Logo, {}),
      /* @__PURE__ */ jsx(Button, { asChild: true, size: "sm", className: "bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: "Start free" }) })
    ] }) }),
    /* @__PURE__ */ jsxs("main", { className: "mx-auto max-w-5xl space-y-14 px-6 py-14", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold tracking-tight md:text-5xl", children: "Free email tools" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 text-muted-foreground", children: "No signup. No credit card. Just useful." })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xl font-semibold", children: [
          /* @__PURE__ */ jsx(MailCheck, { className: "h-5 w-5 text-primary" }),
          "Email list validator"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Paste up to 25 emails — we check each domain's mail server live (the same check our agent runs before every send)." }),
        /* @__PURE__ */ jsx("textarea", { className: "mt-4 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary", placeholder: "jane@company.com\njohn@othercorp.com", value: listText, onChange: (e) => setListText(e.target.value) }),
        /* @__PURE__ */ jsxs(Button, { onClick: validate, disabled: validating || !listText.trim(), className: "mt-3 bg-gradient-primary", children: [
          validating ? /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }) : null,
          "Validate list"
        ] }),
        results && /* @__PURE__ */ jsx("div", { className: "mt-4 space-y-1.5", children: results.map((r) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm", children: [
          r.deliverable ? /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ jsx(X, { className: "h-4 w-4 text-red-500" }),
          /* @__PURE__ */ jsx("span", { children: r.email }),
          !r.deliverable && /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground", children: [
            "(",
            r.reason,
            ")"
          ] })
        ] }, r.email)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xl font-semibold", children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "h-5 w-5 text-primary" }),
          "Subject line generator"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Describe what you sell and who you're emailing — get 5 open-worthy subject lines." }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { htmlFor: "t-offer", children: "What you offer" }),
            /* @__PURE__ */ jsx(Input, { id: "t-offer", placeholder: "AI bookkeeping for freelancers", value: offer, onChange: (e) => setOffer(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { htmlFor: "t-audience", children: "Who you're emailing" }),
            /* @__PURE__ */ jsx(Input, { id: "t-audience", placeholder: "agency owners", value: audience, onChange: (e) => setAudience(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: generate, disabled: generating || !offer.trim() || !audience.trim(), className: "mt-3 bg-gradient-primary", children: [
          generating ? /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }) : null,
          "Generate subjects"
        ] }),
        subjects.length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-4 space-y-2", children: subjects.map((s, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm", children: [
          /* @__PURE__ */ jsx("span", { children: s }),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            navigator.clipboard.writeText(s);
            setCopiedIdx(i);
            setTimeout(() => setCopiedIdx(null), 1500);
          }, className: "text-muted-foreground hover:text-foreground", children: copiedIdx === i ? /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ jsx(Copy, { className: "h-4 w-4" }) })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold", children: "Like these? The full agent does everything." }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-2 max-w-xl text-sm text-muted-foreground", children: "Finds leads worldwide, validates them, writes and sends personalized emails at the perfect hour, follows up three times, sorts replies — automatically." }),
        /* @__PURE__ */ jsx(Button, { asChild: true, size: "lg", className: "mt-5 bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Link, { to: "/auth", children: "Start free — no card needed" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("footer", { className: "border-t border-border/50 py-6 text-center text-xs text-muted-foreground", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "hover:text-foreground", children: "Home" }),
      " · ",
      /* @__PURE__ */ jsx("a", { href: "/terms", className: "hover:text-foreground", children: "Terms" }),
      " · ",
      /* @__PURE__ */ jsx("a", { href: "/privacy", className: "hover:text-foreground", children: "Privacy" })
    ] })
  ] });
}
export {
  ToolsPage as component
};
//# sourceMappingURL=tools-BtJeRQIh.js.map
