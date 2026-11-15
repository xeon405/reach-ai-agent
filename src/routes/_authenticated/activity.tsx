import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  MailCheck,
  MailQuestion,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

const ACTIVITY_EVENTS = [
  "email.sent",
  "email.held_for_review",
  "email.review_approved",
  "email.review_skipped",
  "email.deferred",
  "email.cancelled",
  "email.failed",
  "email.replied",
  "email.bounced",
  "email.unsubscribed",
  "followup.sent",
  "followup.cancelled",
  "booking.confirmed",
];

type AuditRow = {
  id: number;
  event: string;
  lead_id: string | null;
  campaign_id: string | null;
  payload: Record<string, any> | null;
  created_at: string;
};

type LeadRow = { id: string; name: string | null; company: string | null; email: string | null };
type CampaignRow = { id: string; name: string };

const REASONS: Record<string, string> = {
  lead_suppressed: "The lead is marked suppressed.",
  lead_suppressed_db: "The address is on your suppression list.",
  lead_unsubscribed: "The lead unsubscribed.",
  lead_bounced: "A previous email to this address bounced.",
  human_takeover: "You took this conversation over by hand.",
  campaign_not_active: "The campaign is paused.",
  campaign_missing: "The campaign no longer exists.",
  lead_missing: "The lead record no longer exists.",
  daily_limit: "Today's sending cap is already used.",
  quiet_hours: "It is inside your quiet hours, so the send waited.",
  never_email: "The address or domain is on your never-email list.",
  gmail_disconnected: "Gmail is not connected.",
  invalid_email: "The address is not valid.",
  mx_fail: "The address domain cannot receive mail.",
  lead_state: "The lead is unsubscribed, bounced or suppressed.",
  lifecycle: "The lead lifecycle blocks sending.",
  followups_disabled: "Follow-ups are off for this campaign.",
  already_replied: "The lead already replied, so the follow-up stopped.",
  suppression_list: "The address is on the suppression list.",
  campaign_inactive: "The campaign was paused before this send.",
  completed: "The follow-up sequence finished.",
  learned_tail: "The learned cutoff says later follow-ups do not get replies.",
  completed_no_sequence: "No further follow-up step exists.",
  endpoint_paused: "The webhook endpoint is paused.",
};

function reasonText(code: string | null | undefined): string {
  if (!code) return "No reason was recorded.";
  return REASONS[code] ?? code;
}

function kindOf(event: string): "sent" | "held" | "blocked" | "reply" | "other" {
  if (event === "email.sent" || event === "followup.sent") return "sent";
  if (
    event === "email.held_for_review" ||
    event === "email.deferred" ||
    event === "email.review_approved" ||
    event === "email.review_skipped"
  ) return "held";
  if (
    event === "email.cancelled" ||
    event === "email.failed" ||
    event === "followup.cancelled" ||
    event === "email.bounced" ||
    event === "email.unsubscribed"
  ) return "blocked";
  if (event === "email.replied" || event === "booking.confirmed") return "reply";
  return "other";
}

const KIND_META = {
  sent: { label: "Sent", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400" },
  held: { label: "Held", icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  blocked: { label: "Blocked", icon: Ban, cls: "text-red-600 dark:text-red-400" },
  reply: { label: "Reply", icon: MailCheck, cls: "text-blue-600 dark:text-blue-400" },
  other: { label: "Event", icon: FileText, cls: "text-muted-foreground" },
} as const;

function ActivityPage() {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [leads, setLeads] = useState<Record<string, LeadRow>>({});
  const [campaigns, setCampaigns] = useState<Record<string, CampaignRow>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "sent" | "held" | "blocked">("all");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("audit_events")
      .select("id, event, lead_id, campaign_id, payload, created_at")
      .in("event", ACTIVITY_EVENTS)
      .order("created_at", { ascending: false })
      .limit(300);

    const rows = (data as AuditRow[]) ?? [];
    setEvents(rows);

    const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
    const campaignIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))] as string[];

    const [leadRes, campRes] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id, name, company, email").in("id", leadIds)
        : Promise.resolve({ data: [] as LeadRow[] }),
      campaignIds.length
        ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
        : Promise.resolve({ data: [] as CampaignRow[] }),
    ]);

    setLeads(Object.fromEntries(((leadRes.data ?? []) as LeadRow[]).map((l) => [l.id, l])));
    setCampaigns(Object.fromEntries(((campRes.data ?? []) as CampaignRow[]).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((event) => kindOf(event.event) === filter);
  }, [events, filter]);

  const counts = useMemo(() => {
    const c = { all: events.length, sent: 0, held: 0, blocked: 0 };
    for (const event of events) {
      const kind = kindOf(event.event);
      if (kind === "sent") c.sent++;
      else if (kind === "held") c.held++;
      else if (kind === "blocked") c.blocked++;
    }
    return c;
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Email log</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Why each email was written, held or blocked. This is the audit trail the sender writes
            before it acts, not a summary. A new account can honestly have nothing here yet.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["all", "All"],
          ["sent", "Written and sent"],
          ["held", "Held"],
          ["blocked", "Blocked"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {label} <span className="tabular-nums opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <MailQuestion className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing has reached this stage yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is a real empty state, not a loading state. The first queued email will appear here
            with its reason.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {visible.map((event) => {
            const kind = kindOf(event.event);
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const lead = event.lead_id ? leads[event.lead_id] : null;
            const campaign = event.campaign_id ? campaigns[event.campaign_id] : null;
            const payload = event.payload ?? {};
            const subject = typeof payload.subject === "string" ? payload.subject : "";
            const reason = payload.reason ?? payload.reasons?.[0] ?? null;
            const proof =
              kind === "sent"
                ? `${payload.facts_used ?? 0} facts cited · ${payload.claims ?? 0} sentences checked${
                    payload.blocked ? ` · ${payload.blocked} unsupported removed` : ""
                  }${payload.template ? " · fixed template" : ""}`
                : null;

            return (
              <li key={event.id} className="flex gap-3 p-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">{event.event}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-1 text-xs">
                    <span className="font-medium">
                      {lead?.name ?? lead?.email ?? "Lead"}
                      {lead?.company ? ` · ${lead.company}` : ""}
                    </span>
                    {campaign ? <span className="text-muted-foreground"> · {campaign.name}</span> : null}
                  </div>

                  {subject && (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      Subject: “{subject}”
                    </div>
                  )}

                  {kind === "blocked" && (
                    <div className="mt-1 text-xs text-muted-foreground">{reasonText(reason)}</div>
                  )}
                  {kind === "held" && event.event === "email.held_for_review" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Held for your review (send {payload.lifetime_sends ?? "?"} of the first 5).{" "}
                      <Link to="/review" className="text-primary hover:underline">Open review</Link>
                    </div>
                  )}
                  {kind === "held" && event.event === "email.deferred" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Waited for quiet hours ({payload.window?.join("–")}, {payload.timezone}). Nothing
                      was cancelled.
                    </div>
                  )}
                  {kind === "held" && event.event === "email.review_approved" && (
                    <div className="mt-1 text-xs text-muted-foreground">You approved this exact draft.</div>
                  )}
                  {kind === "held" && event.event === "email.review_skipped" && (
                    <div className="mt-1 text-xs text-muted-foreground">You skipped this draft.</div>
                  )}
                  {proof && <div className="mt-1 text-[11px] text-muted-foreground">{proof}</div>}
                  {kind === "sent" && payload.tone && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Tone: {payload.tone}</div>
                  )}

                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                      Recorded details
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-relaxed">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
