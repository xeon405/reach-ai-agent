import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { E as EnOnlyNotice } from "./EnOnlyNotice-B_714PD4.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { T as ThemeToggle } from "./router-DM9FrBM_.js";
import { ShieldCheck, KeyRound, Lock, Eye, FileJson, Trash2 } from "lucide-react";
import "react";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "sonner";
import "./client-Bf7kAZ3f.js";
import "@supabase/supabase-js";
const SECTIONS = [{
  icon: KeyRound,
  title: "Your Gmail. Your control.",
  points: ["We never see or store your Google password — connection happens through Google's official OAuth flow.", "We request only two permissions: send emails and read replies to your own sent messages.", "Disconnect anytime in Settings → Connected accounts. This instantly revokes our access.", "You can also revoke from your Google Account → Third-party access, anytime."]
}, {
  icon: Lock,
  title: "Token vault isolation",
  points: ["Gmail access tokens are stored in an isolated vault table protected by Row Level Security.", "Your regular login can NOT read this vault — not from the app, not from the API, not with any browser trickery.", "Only the sending engine (server-side) can use them, and only to send YOUR campaigns.", "Tokens are rotated on every send session and old values are overwritten within seconds."]
}, {
  icon: Eye,
  title: "What we see — and what we don't",
  points: ["Stored: your account email, campaign settings, lead lists you create, subjects/bodies of emails your agent sends, reply sentiment labels.", "NOT stored: your Gmail password, emails from other senders in your inbox, your contacts outside outreach, browsing history.", "We never sell, rent, or share your data with third parties. Period."]
}, {
  icon: FileJson,
  title: "Your data belongs to you",
  points: ["Export everything as JSON: Settings → Download my data. It's a single click, no support ticket needed.", "Permanent deletion: Settings → Danger zone → Delete account removes profile, campaigns, leads, email history AND token vault rows in one shot.", "Unsubscribed leads are permanently suppressed across all your campaigns automatically."]
}, {
  icon: ShieldCheck,
  title: "Built-in compliance",
  points: ["Every campaign email includes a working unsubscribe path (reply-to opt-out honored automatically).", "A physical sender address is included in all commercial emails (CAN-SPAM requirement).", "Safe daily sending caps protect your domain reputation and recipients' inboxes.", "MX verification ensures we never waste sends on dead addresses."]
}];
function SecurityPage() {
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
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(ShieldCheck, { className: "h-8 w-8 text-primary-foreground" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-extrabold tracking-tight sm:text-5xl", children: "Security at OutreachAI" }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-xl text-muted-foreground", children: "We treat your Gmail account like it's our own. Here is exactly how your data is protected — in plain English." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-3xl space-y-5 px-4 pb-20", children: [
      SECTIONS.map((s) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10", children: /* @__PURE__ */ jsx(s.icon, { className: "h-5 w-5 text-primary" }) }),
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: s.title })
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "mt-4 space-y-2.5", children: s.points.map((p) => /* @__PURE__ */ jsxs("li", { className: "flex gap-2.5 text-sm leading-relaxed text-muted-foreground", children: [
          /* @__PURE__ */ jsx("span", { className: "mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" }),
          p
        ] }, p)) })
      ] }, s.title)),
      /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-7 text-center shadow-card", children: [
        /* @__PURE__ */ jsx(Trash2, { className: "mx-auto h-6 w-6 text-muted-foreground" }),
        /* @__PURE__ */ jsx("h2", { className: "mt-3 text-lg font-semibold", children: "Questions about your data?" }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-2 max-w-md text-sm text-muted-foreground", children: "Write to us — our team responds within 24 hours." }),
        /* @__PURE__ */ jsx("a", { href: "mailto:outreachai.team@gmail.com?subject=Security%20question", children: /* @__PURE__ */ jsx(Button, { className: "mt-5 bg-gradient-primary", children: "Contact us" }) })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "pt-2 text-center text-xs text-muted-foreground", children: [
        "Read also our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/privacy", className: "underline hover:text-foreground", children: "Privacy Policy" }),
        " and",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/terms", className: "underline hover:text-foreground", children: "Terms of Service" }),
        "."
      ] })
    ] })
  ] });
}
export {
  SecurityPage as component
};
//# sourceMappingURL=security-BYknbV-m.js.map
