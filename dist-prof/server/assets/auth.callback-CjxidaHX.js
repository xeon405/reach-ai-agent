import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import "@supabase/supabase-js";
function GmailCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    async function confirmEmail() {
      try {
        if (tokenHash && type) {
          const {
            error: otpError
          } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type
          });
          if (otpError) throw otpError;
        } else {
          const {
            data: {
              user
            }
          } = await supabase.auth.getUser();
          if (!user) throw new Error("no session from link");
        }
        toast.success("Email confirmed! Welcome to OutreachAI.");
        const redirectTo = params.get("redirect_to") || params.get("next");
        navigate({
          to: redirectTo && redirectTo.startsWith("/") ? redirectTo : "/"
        });
      } catch {
        toast.error("This confirmation link is invalid or has expired.");
        navigate({
          to: "/auth"
        });
      }
    }
    if (tokenHash || window.location.hash.includes("access_token")) {
      void confirmEmail();
      return;
    }
    if (error) {
      toast.error("Gmail connection cancelled.");
      navigate({
        to: "/settings"
      });
      return;
    }
    if (!code) {
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
          code,
          userId: user.id
        }
      });
      if (fnError || data?.error) {
        toast.error("Failed to connect Gmail. Please try again.");
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
//# sourceMappingURL=auth.callback-CjxidaHX.js.map
