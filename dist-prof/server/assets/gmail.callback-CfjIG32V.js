import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { c as consumeGmailState } from "./gmail-oauth-qlLqUCnj.js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import "@supabase/supabase-js";
function GmailCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const state = params.get("state");
    if (error) {
      toast.error("Gmail connection cancelled.");
      navigate({
        to: "/settings"
      });
      return;
    }
    if (!code || !consumeGmailState(state)) {
      toast.error("Invalid Gmail callback. Please try connecting again.");
      navigate({
        to: "/settings"
      });
      return;
    }
    async function exchangeCode() {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        navigate({
          to: "/auth"
        });
        return;
      }
      const {
        data,
        error: fnError
      } = await supabase.functions.invoke("gmail-oauth", {
        body: {
          code
        }
      });
      if (fnError || data?.error) {
        toast.error(data?.error ?? "Failed to connect Gmail. Please try again.");
        navigate({
          to: "/settings"
        });
        return;
      }
      toast.success(`Gmail connected: ${data.email}`);
      navigate({
        to: "/settings"
      });
    }
    void exchangeCode();
  }, [navigate]);
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsx(Loader2, { className: "mx-auto h-8 w-8 animate-spin text-primary" }),
    /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm text-muted-foreground", children: "Connecting your Gmail..." })
  ] }) });
}
export {
  GmailCallbackPage as component
};
//# sourceMappingURL=gmail.callback-CfjIG32V.js.map
