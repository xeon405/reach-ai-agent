import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Email confirmation / magic-link flow (token hash or implicit hash tokens)
    const tokenHash = params.get("token_hash");
    const type = params.get("type");

    async function confirmEmail() {
      try {
        if (tokenHash && type) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "recovery" | "email_change",
          });
          if (otpError) throw otpError;
        } else {
          // Implicit/PKCE tokens are auto-detected by the client on load
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("no session from link");
        }
        toast.success("Email confirmed! Welcome to OutshipAi.");
        const redirectTo = params.get("redirect_to") || params.get("next");
        navigate({ to: redirectTo && redirectTo.startsWith("/") ? redirectTo : "/" });
      } catch {
        toast.error("This confirmation link is invalid or has expired.");
        navigate({ to: "/auth" });
      }
    }

    if (tokenHash || window.location.hash.includes("access_token")) {
      void confirmEmail();
      return;
    }

    navigate({ to: "/" });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Just a moment...</p>
      </div>
    </div>
  );
}
