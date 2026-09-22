import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
function UnsubscribePage() {
  const [state, setState] = useState("working");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get("l");
    if (!l) {
      setState("error");
      return;
    }
    fetch(`https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/unsubscribe?l=${encodeURIComponent(l)}&c=${encodeURIComponent(params.get("c") ?? "")}`, {
      method: "POST",
      headers: {
        apikey: "sb_publishable_HzeVbGj6DI3klatdPuQnhA_qqTzZ0uM"
      }
    }).then((r) => setState(r.ok ? "done" : "error")).catch(() => setState("error"));
  }, []);
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-card", children: [
    state === "working" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" }),
      /* @__PURE__ */ jsx("p", { className: "mt-5 text-sm text-muted-foreground", children: "Processing your request…" })
    ] }),
    state === "done" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(CheckCircle2, { className: "mx-auto h-14 w-14 text-success" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-4 text-2xl font-bold", children: "You're unsubscribed" }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm leading-relaxed text-muted-foreground", children: "You won't receive any further emails from this sender. We respect inboxes — one click and it's done." }),
      /* @__PURE__ */ jsx(Link, { to: "/", className: "mt-6 inline-block text-sm text-primary underline underline-offset-4", children: "What is OutreachAI? →" })
    ] }),
    state === "error" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold", children: "This link looks broken" }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm text-muted-foreground", children: "The link may be incomplete. If you keep receiving emails you don't want, simply reply with the word UNSUBSCRIBE." })
    ] })
  ] }) });
}
export {
  UnsubscribePage as component
};
//# sourceMappingURL=unsubscribe-DWqCbIa5.js.map
