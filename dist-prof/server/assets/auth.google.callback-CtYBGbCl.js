import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { Loader2 } from "lucide-react";
import "@supabase/supabase-js";
function GoogleCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        supabase.auth.getUser().then(async ({
          data
        }) => {
          if (!data.user) return navigate({
            to: "/auth"
          });
          const ref = localStorage.getItem("referral_code");
          if (ref) {
            try {
              const {
                data: rd,
                error: rErr
              } = await supabase.functions.invoke("referral-claim", {
                body: {
                  ref
                }
              });
              if (!rd?.error && !rErr && rd?.ok) localStorage.removeItem("referral_code");
            } catch {
            }
          }
          const {
            data: p
          } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).single();
          navigate({
            to: p?.onboarded ? "/dashboard" : "/onboarding"
          });
        });
      }
    });
    supabase.auth.getSession().then(({
      data
    }) => {
      if (data.session) {
        subscription.unsubscribe();
        navigate({
          to: "/dashboard"
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsx(Loader2, { className: "mx-auto h-8 w-8 animate-spin text-primary" }),
    /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm text-muted-foreground", children: "Signing you in..." })
  ] }) });
}
export {
  GoogleCallbackPage as component
};
//# sourceMappingURL=auth.google.callback-CtYBGbCl.js.map
