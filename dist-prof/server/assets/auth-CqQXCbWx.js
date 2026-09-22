import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { u as useLang } from "./router-DM9FrBM_.js";
import { c as cn, B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { L as Label } from "./label-C8WJLhmR.js";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { L as Logo } from "./Logo-BQ39Aiqa.js";
import { Loader2 } from "lucide-react";
import "@supabase/supabase-js";
import "@tanstack/react-query";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.List,
  {
    ref,
    className: cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = TabsPrimitive.List.displayName;
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Trigger,
  {
    ref,
    className: cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    ),
    ...props
  }
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
const TabsContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Content,
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Min 6 characters").max(72)
});
function AuthPage() {
  const {
    t
  } = useLang();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({
      data
    }) => {
      if (data.session) navigate({
        to: "/dashboard"
      });
    });
  }, [navigate]);
  async function handleSignIn(e) {
    e.preventDefault();
    const parsed = schema.safeParse({
      email,
      password
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const {
      error
    } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({
      to: "/dashboard"
    });
  }
  async function handleSignUp(e) {
    e.preventDefault();
    const parsed = schema.safeParse({
      email,
      password
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const {
      data,
      error
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`
      }
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    await creditReferral();
    toast.success("Check your email to confirm your account.");
  }
  async function creditReferral() {
    const ref = new URLSearchParams(window.location.search).get("ref") ?? localStorage.getItem("referral_code");
    if (!ref) return;
    localStorage.setItem("referral_code", ref);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("referral-claim", {
        body: {
          ref
        }
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      if (data?.ok) localStorage.removeItem("referral_code");
    } catch {
    }
  }
  async function handleGoogle() {
    setLoading(true);
    const {
      error
    } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/google/callback`
      }
    });
    if (error) {
      toast.error(error.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-hero px-4", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md", children: [
    /* @__PURE__ */ jsx("div", { className: "mb-8 flex justify-center", children: /* @__PURE__ */ jsx(Logo, {}) }),
    /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-border bg-card p-8 shadow-card", children: /* @__PURE__ */ jsxs(Tabs, { defaultValue: "signin", children: [
      /* @__PURE__ */ jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [
        /* @__PURE__ */ jsx(TabsTrigger, { value: "signin", children: t("auth_signin") }),
        /* @__PURE__ */ jsx(TabsTrigger, { value: "signup", children: t("auth_signup") })
      ] }),
      /* @__PURE__ */ jsxs(Button, { type: "button", variant: "outline", className: "mt-6 w-full", onClick: handleGoogle, disabled: loading, children: [
        /* @__PURE__ */ jsx(GoogleIcon, {}),
        " ",
        t("auth_google")
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "my-5 flex items-center gap-3 text-xs text-muted-foreground", children: [
        /* @__PURE__ */ jsx("div", { className: "h-px flex-1 bg-border" }),
        " ",
        t("auth_or"),
        " ",
        /* @__PURE__ */ jsx("div", { className: "h-px flex-1 bg-border" })
      ] }),
      /* @__PURE__ */ jsx(TabsContent, { value: "signin", children: /* @__PURE__ */ jsxs("form", { onSubmit: handleSignIn, className: "space-y-4", children: [
        /* @__PURE__ */ jsx(Field, { id: "email", label: t("auth_email"), value: email, onChange: setEmail, type: "email" }),
        /* @__PURE__ */ jsx(Field, { id: "password", label: t("auth_pass"), value: password, onChange: setPassword, type: "password" }),
        /* @__PURE__ */ jsxs(Button, { type: "submit", className: "w-full bg-gradient-primary shadow-glow", disabled: loading, children: [
          loading && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
          " ",
          t("auth_signin")
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(TabsContent, { value: "signup", children: /* @__PURE__ */ jsxs("form", { onSubmit: handleSignUp, className: "space-y-4", children: [
        /* @__PURE__ */ jsx(Field, { id: "email2", label: "Email", value: email, onChange: setEmail, type: "email" }),
        /* @__PURE__ */ jsx(Field, { id: "password2", label: "Password", value: password, onChange: setPassword, type: "password" }),
        /* @__PURE__ */ jsxs(Button, { type: "submit", className: "w-full bg-gradient-primary shadow-glow", disabled: loading, children: [
          loading && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
          " Create account"
        ] })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxs("p", { className: "mt-6 text-center text-xs text-muted-foreground", children: [
      "By continuing you agree to our",
      " ",
      /* @__PURE__ */ jsx("a", { href: "/terms", className: "underline hover:text-foreground", children: "Terms" }),
      " &",
      " ",
      /* @__PURE__ */ jsx("a", { href: "/privacy", className: "underline hover:text-foreground", children: "Privacy Policy" }),
      "."
    ] })
  ] }) });
}
function Field({
  id,
  label,
  value,
  onChange,
  type
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx(Label, { htmlFor: id, children: label }),
    /* @__PURE__ */ jsx(Input, { id, type, value, onChange: (e) => onChange(e.target.value), required: true })
  ] });
}
function GoogleIcon() {
  return /* @__PURE__ */ jsxs("svg", { className: "mr-2 h-4 w-4", viewBox: "0 0 48 48", children: [
    /* @__PURE__ */ jsx("path", { fill: "#FFC107", d: "M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" }),
    /* @__PURE__ */ jsx("path", { fill: "#FF3D00", d: "M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" }),
    /* @__PURE__ */ jsx("path", { fill: "#4CAF50", d: "M24 43.5c5 0 9.5-1.7 13-4.6l-6-5c-1.9 1.3-4.3 2.1-7 2.1-5.3 0-9.8-3-11.3-7.4l-6.5 5C9.5 39 16.2 43.5 24 43.5z" }),
    /* @__PURE__ */ jsx("path", { fill: "#1976D2", d: "M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6 5c-.4.4 6.4-4.7 6.4-14 0-1.2-.1-2.4-.4-3.5z" })
  ] });
}
export {
  AuthPage as component
};
//# sourceMappingURL=auth-CqQXCbWx.js.map
