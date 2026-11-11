import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ClipboardCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Kept in step with supabase/functions/_shared/review-mode.ts. The server is
 *  the authority; this constant only labels the progress bar. */
const REVIEW_FIRST_SENDS = 5;

type ReviewMode = "first_5" | "always" | "off";

type Option = { value: ReviewMode; label: string; body: string };

const OPTIONS: Option[] = [
  {
    value: "first_5",
    label: "First 5 emails",
    body: "Hold my first 5 so I can read each one. After that it sends on its own.",
  },
  {
    value: "always",
    label: "Every email",
    body: "Hold every new first email until I approve it.",
  },
  {
    value: "off",
    label: "No review",
    body: "Send on its own from the first email.",
  },
];

/** Unknown values mean review, exactly like the worker. "first_20" is the old
 *  default and is shown (and saved) as the first 5. */
function normalize(mode: unknown): ReviewMode {
  return mode === "always" || mode === "off" ? mode : "first_5";
}

/**
 * One card, one decision. Shows where the account is in its unknown-sender
 * period, the three modes with what each actually does, and saves the moment a
 * mode is chosen. Used on /review and in Settings so the two can never drift.
 */
export function ReviewModeCard({
  onSaved,
  className,
}: {
  onSaved?: (mode: ReviewMode) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReviewMode>("first_5");
  const [savedMode, setSavedMode] = useState<ReviewMode>("first_5");
  const [lifetimeSends, setLifetimeSends] = useState(0);
  const [held, setHeld] = useState(0);
  const [saving, setSaving] = useState<ReviewMode | null>(null);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    const [profileRes, sentRes, heldRes] = await Promise.all([
      supabase.from("profiles").select("review_mode").eq("id", uid).maybeSingle(),
      supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase
        .from("send_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "awaiting_review"),
    ]);
    const current = normalize(profileRes.data?.review_mode);
    setMode(current);
    setSavedMode(current);
    setLifetimeSends(sentRes.count ?? 0);
    setHeld(heldRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(next: ReviewMode) {
    if (next === savedMode || saving) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const previous = savedMode;
    setSaving(next);
    setMode(next);
    const { error } = await supabase.from("profiles").update({ review_mode: next }).eq("id", uid);
    setSaving(null);
    if (error) {
      setMode(previous);
      toast.error("Could not save that setting. Nothing was changed.");
      return;
    }
    setSavedMode(next);
    onSaved?.(next);
    toast.success(
      next === "off"
        ? "Saved. New emails will send on their own."
        : next === "always"
          ? "Saved. Every new email will wait for your OK."
          : "Saved. Your first 5 emails will wait for your OK.",
    );
    // A held draft was written under the old setting. Turning review off must
    // not send text the owner has never read, so it stays in Review.
    if (next === "off" && held > 0) {
      toast.message(`${held} draft${held === 1 ? "" : "s"} already waiting are still held. Approve or skip each one.`);
    }
  }

  if (loading) {
    return <Skeleton className={cn("h-48 w-full rounded-xl", className)} />;
  }

  const remaining = Math.max(0, REVIEW_FIRST_SENDS - lifetimeSends);
  const inFirstRun = mode === "first_5" && remaining > 0;
  const finishedFirstRun = mode === "first_5" && remaining === 0;

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Review before sending
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {inFirstRun
              ? `${lifetimeSends} of your first ${REVIEW_FIRST_SENDS} emails sent. After ${REVIEW_FIRST_SENDS}, new emails send on their own.`
              : finishedFirstRun
                ? `Your first ${REVIEW_FIRST_SENDS} are done. New emails send on their own.`
                : mode === "always"
                  ? "On. Every new email waits for your OK."
                  : "Off. New emails send on their own."}
          </p>
        </div>
        {inFirstRun && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {remaining} left in review
          </span>
        )}
      </div>

      {inFirstRun && (
        <Progress
          value={(Math.min(lifetimeSends, REVIEW_FIRST_SENDS) / REVIEW_FIRST_SENDS) * 100}
          className="mt-3 h-1.5"
        />
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={saving !== null}
              onClick={() => void choose(option.value)}
              className={cn(
                "relative rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-background hover:border-primary/30 hover:bg-muted/40",
                saving !== null && "opacity-70",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {option.label}
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{option.body}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Why {REVIEW_FIRST_SENDS}? A new account is the unknown-sender period. {REVIEW_FIRST_SENDS} emails is
        enough to catch a bad opener, tone or offer in your first session, and short enough that it never
        becomes paperwork. Approving sends exactly the text you read — nothing is rewritten after approval.
      </p>

      {held > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ClipboardCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span>
            {held} draft{held === 1 ? "" : "s"} already waiting {held === 1 ? "is" : "are"} still held.
            Changing this setting does not release {held === 1 ? "it" : "them"} — you still decide each one.{" "}
            <Link to="/review" className="font-medium text-primary underline-offset-2 hover:underline">
              Open Review
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
