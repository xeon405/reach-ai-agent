import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/google/callback")({
  component: GoogleCallbackPage,
});

function GoogleCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // supabase-js exchanges the ?code= in the URL automatically
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        supabase.auth.getUser().then(async ({ data }) => {
          if (!data.user) return navigate({ to: "/auth" });
          // Credit referral if this Google signup came via an invite link
          const ref = localStorage.getItem("referral_code");
          if (ref) {
            const { data: pr } = await supabase
              .from("profiles")
              .select("referred_by, referral_code")
              .eq("id", data.user.id)
              .single();
            if (pr && !pr.referred_by && pr.referral_code !== ref) {
              await supabase.from("profiles").update({ referred_by: ref }).eq("id", data.user.id);
              localStorage.removeItem("referral_code");
            }
          }
          const { data: p } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", data.user.id)
            .single();
          navigate({ to: p?.onboarded ? "/dashboard" : "/onboarding" });
        });
      }
    });

    // Fallback if the session was already established before mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        subscription.unsubscribe();
        navigate({ to: "/dashboard" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
