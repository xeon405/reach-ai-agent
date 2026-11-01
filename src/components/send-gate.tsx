import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * One banner, one reason. Uses send_block_reason() so the app can never disagree
 * with the database about why sending stopped — the same function the send path
 * checks, instead of a second copy of the rule in the UI.
 *
 * Nothing renders when sending is possible, so this costs one small read and
 * no visual noise for healthy accounts.
 */

type Reason = "domain_required" | "lifetime_limit" | "business_identity_required" | "daily_limit" | null;

const COPY: Record<Exclude<Reason, null>, { title: string; body: string; cta?: string; to?: string }> = {
  domain_required: {
    title: "Sending is paused — confirm your domain",
    body: "Another account already registered your business name and address. Verify the domain your business owns to start sending again.",
    cta: "Verify domain",
    to: "/verify-domain",
  },
  business_identity_required: {
    title: "Add your business name and address",
    body: "Emails need a truthful sender identity, so we ask for your business name and address before the first send. It takes a minute.",
    cta: "Open settings",
    to: "/settings",
  },
  lifetime_limit: {
    title: "You've used your free emails",
    body: "Your free allowance is spent. Upgrade and the agent keeps sending from the same Gmail — nothing you've built is lost.",
    cta: "See plans",
    to: "/billing",
  },
  daily_limit: {
    title: "Today's limit reached",
    body: "Sending resumes automatically tomorrow. We cap the daily volume to protect your Gmail reputation.",
  },
};

export function SendGate({ className = "" }: { className?: string }) {
  const [reason, setReason] = useState<Reason>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data, error } = await supabase.rpc("send_block_reason", { p_user: u.user.id });
      if (!alive || error) return;
      const r = (data as Reason) ?? null;
      setReason(r);
    })();
    return () => { alive = false; };
  }, []);

  if (!reason) return null;
  const c = COPY[reason];

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-900/15 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <div className="font-medium text-amber-900 dark:text-amber-200">{c.title}</div>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/80">{c.body}</p>
        </div>
      </div>
      {c.cta && c.to && (
        <Link to={c.to} className="self-start">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            {c.cta} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}
    </div>
  );
}
