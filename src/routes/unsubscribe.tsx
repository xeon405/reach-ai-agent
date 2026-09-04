import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get("l");
    if (!l) { setState("error"); return; }
    const t = params.get("t") ?? "";
    fetch(
      `https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/unsubscribe?l=${encodeURIComponent(l)}&c=${encodeURIComponent(params.get("c") ?? "")}&t=${encodeURIComponent(t)}`,
      { method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string } }
    )
      .then((r) => setState(r.ok ? "done" : "error"))
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        {state === "working" && (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-5 text-sm text-muted-foreground">Processing your request…</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-4 text-2xl font-bold">You're unsubscribed</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You won't receive any further emails from this sender.
              We respect inboxes — one click and it's done.
            </p>
            <Link to="/" className="mt-6 inline-block text-sm text-primary underline underline-offset-4">
              What is OutshipAi? →
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-xl font-semibold">This link looks broken</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The link may be incomplete. If you keep receiving emails you don't want,
              simply reply with the word UNSUBSCRIBE.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
