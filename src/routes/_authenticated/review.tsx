import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhyThisEmail, type ProofBlocked, type ProofClaim, type ProofFact } from "@/components/why-this-email";
import { Check, Clock, Loader2, MailQuestion, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [{ title: "Review before sending — OutshipAi" }],
  }),
  component: ReviewPage,
});

type ReviewMode = "first_20" | "always" | "off";

type DraftMeta = {
  facts?: ProofFact[];
  claims?: ProofClaim[];
  blocked?: ProofBlocked[];
  template?: boolean;
  held_at?: string;
};

type QueueRow = {
  id: string;
  created_at: string;
  draft_subject: string | null;
  draft_body: string | null;
  draft_meta: DraftMeta | null;
  campaign_id: string;
  lead_id: string;
  lead: {
    id: string;
    name: string | null;
    company: string | null;
    email: string | null;
    city: string | null;
  } | null;
  campaign: { name: string | null } | null;
};

const MODE_COPY: Record<ReviewMode, { label: string; body: string }> = {
  first_20: {
    label: "First 20 emails (default)",
    body: "Hold my first 20 emails so I can read each one. After that, send automatically.",
  },
  always: {
    label: "Every email",
    body: "Hold every new first-touch email until I approve it.",
  },
  off: {
    label: "No review",
    body: "Send automatically. I can still preview an email from the campaign page.",
  },
};

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [mode, setMode] = useState<ReviewMode>("first_20");
  const [savedMode, setSavedMode] = useState<ReviewMode>("first_20");
  const [lifetimeSends, setLifetimeSends] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [queueRes, profileRes, sentRes] = await Promise.all([
        supabase
          .from("send_queue")
          .select(
            "id, created_at, draft_subject, draft_body, draft_meta, campaign_id, lead_id, lead:leads(id, name, company, email, city), campaign:campaigns(name)",
          )
          .eq("user_id", user.id)
          .eq("status", "awaiting_review")
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("review_mode").eq("id", user.id).maybeSingle(),
        supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      if (queueRes.error) throw queueRes.error;
      const queue = ((queueRes.data ?? []) as unknown as QueueRow[]).map((r) => ({
        ...r,
        lead: Array.isArray(r.lead) ? r.lead[0] ?? null : r.lead,
        campaign: Array.isArray(r.campaign) ? r.campaign[0] ?? null : r.campaign,
      }));
      setRows(queue);

      const current = (profileRes.data?.review_mode ?? "first_20") as ReviewMode;
      setMode(current);
      setSavedMode(current);
      setLifetimeSends(sentRes.count ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load drafts waiting for review.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  async function chooseMode(next: ReviewMode) {
    if (!user) return;
    const previous = mode;
    setMode(next);
    const { error } = await supabase.from("profiles").update({ review_mode: next }).eq("id", user.id);
    if (error) {
      setMode(previous);
      toast.error("Could not save that setting.");
      return;
    }
    setSavedMode(next);
    toast.success("Review setting saved.");
    // Turning review off does not release drafts already held: the owner still
    // decides each one, because a draft they have not read should never send
    // itself just because a setting changed.
    if (next === "off" && rows.length > 0) {
      toast.message("Your held drafts are still here. Approve or skip each one.");
    }
  }

  async function decide(id: string, action: "approve" | "skip") {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("review-queue", {
        body: { id, action },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (action === "approve") {
        toast.success("Approved. It will be sent shortly. If today's limit is reached, it waits for tomorrow.");
      } else {
        toast.success("Skipped. Nothing was sent to this contact.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that decision.");
      void load();
    } finally {
      setBusy(null);
    }
  }

  const firstRun = savedMode === "first_20" && (lifetimeSends ?? 0) < 20;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <MailQuestion className="h-5 w-5 text-muted-foreground" />
            Review before sending
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A new account is the unknown-sender period. Each email is written in full, then held here until you read
            it. Approving sends exactly the text you see — nothing is rewritten after approval.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {rows.length} waiting
        </Badge>
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Review setting</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{MODE_COPY[mode].body}</p>
          </div>
          <Select value={mode} onValueChange={(v) => void chooseMode(v as ReviewMode)}>
            <SelectTrigger className="w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_COPY) as ReviewMode[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {MODE_COPY[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {firstRun && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            <span>
              You have sent {lifetimeSends ?? 0} of your first 20. Review turns itself off after 20 approved sends
              unless you keep it on.
            </span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <MailQuestion className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing is waiting for review.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            When a campaign runs and your account still needs review, each finished email appears here with the facts
            behind every sentence. Zero drafts is a normal, healthy state — it is not a silent failure.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const meta = row.draft_meta ?? {};
            const stale = meta.held_at ? Date.now() - new Date(meta.held_at).getTime() > 7 * 86_400_000 : false;
            const name = row.lead?.company || row.lead?.name || row.lead?.email || "this contact";
            return (
              <article key={row.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.campaign?.name ? `${row.campaign.name} · ` : ""}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        held {relative(row.draft_meta?.held_at ?? row.created_at)}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === row.id}
                      onClick={() => void decide(row.id, "skip")}
                    >
                      {busy === row.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
                      Skip
                    </Button>
                    <Button size="sm" disabled={busy === row.id} onClick={() => void decide(row.id, "approve")}>
                      {busy === row.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                      Approve and send
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subject</p>
                  <p className="mt-0.5 text-sm font-medium">{row.draft_subject ?? "(no subject)"}</p>
                  <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Email, exactly as it will send
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                    {row.draft_body ?? "(no body was stored — skip this draft)"}
                  </p>
                </div>

                {meta.template && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    No generated sentence passed the fact check, so this is our fixed template. It states only the
                    contact's name, your company and your offer. Skip it if that is not worth sending.
                  </p>
                )}

                <div className="mt-3 border-t border-border pt-3">
                  <WhyThisEmail
                    facts={meta.facts ?? []}
                    claims={meta.claims ?? []}
                    blocked={meta.blocked ?? []}
                    template={meta.template === true}
                  />
                </div>

                {stale && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    This draft is over a week old. The business details may have changed — skip it and run the campaign
                    again if you are unsure.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
