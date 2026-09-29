import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Send, Mail, Reply, MousePointerClick, CalendarCheck, AlertTriangle,
  Bot, Hand, Eye, TrendingUp, ArrowRight, BarChart3, Bell, Clock,
  Filter, ChevronDown, Rocket, Shield, MessageSquare, CheckCircle,
  XCircle, ShieldAlert, ShieldX, Zap, Pause, Globe,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type LeadRow = {
  id: string; user_id: string; campaign_id: string | null; status: string;
  lifecycle: string | null; conv_mode: string | null; email_status: string | null;
  email_confidence: number | null; unsubscribed: boolean; created_at: string;
  lead_source: string | null;
};

type EmailRow = {
  id: string; user_id: string; lead_id: string | null; campaign_id: string | null;
  sent_at: string; opened: boolean; replied: boolean; autoreplied: boolean;
  ai_paused: boolean; ai_turns: number; reply_sentiment: string | null;
  follow_up_sent: boolean; gmail_message_id: string | null;
};

type CampaignRow = {
  id: string; name: string; status: string; autopilot: boolean; created_at: string;
};

type ClsRow = {
  id: number; lead_id: string | null; intent: string | null; confidence: number | null;
  sentiment: string | null; requires_human: boolean | null; booking_intent: boolean | null;
  interested: boolean | null; created_at: string;
};

type AuditRow = {
  id: number; lead_id: string | null; campaign_id: string | null;
  event: string; payload: Record<string, unknown> | null; created_at: string;
};

type AlertRow = {
  id: number; lead_id: string | null; kind: string; title: string;
  body: string | null; priority: string; read: boolean; created_at: string;
};

type TrackRow = {
  id: number; email_id: string | null; event: string; occurred_at: string;
};

type SuppressRow = {
  id: string; email: string; reason: string; created_at: string;
};

type MeetingRow = {
  id: string; campaign_id: string | null; status: string;
  booked_at: string; start_time: string | null; provider: string | null;
};

const DATE_RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: 3650 },
] as const;

const INTENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  interested: { label: "Interested", icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-emerald-600 dark:text-emerald-400" },
  booking: { label: "Booking", icon: <CalendarCheck className="h-3.5 w-3.5" />, color: "text-orange-600 dark:text-orange-400" },
  question: { label: "Question", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-blue-600 dark:text-blue-400" },
  objection: { label: "Objection", icon: <ShieldAlert className="h-3.5 w-3.5" />, color: "text-amber-600 dark:text-amber-400" },
  not_interested: { label: "Not Interested", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-600 dark:text-red-400" },
  unsubscribe: { label: "Unsubscribe", icon: <ShieldX className="h-3.5 w-3.5" />, color: "text-red-600 dark:text-red-400" },
  unclear: { label: "Unclear", icon: <Eye className="h-3.5 w-3.5" />, color: "text-gray-500" },
  autoresponder: { label: "Auto-reply", icon: <Bot className="h-3.5 w-3.5" />, color: "text-purple-600 dark:text-purple-400" },
  other: { label: "Other", icon: <Shield className="h-3.5 w-3.5" />, color: "text-gray-400" },
};

function Dashboard() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [classifications, setClassifications] = useState<ClsRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [tracking, setTracking] = useState<TrackRow[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<number>(3650);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
    const [leadsR, emailsR, campsR, clsR, auditR, alertR, trackR, supR, meetR] = await Promise.all([
      supabase.from("leads").select("id, user_id, campaign_id, status, lifecycle, conv_mode, email_status, email_confidence, unsubscribed, created_at, lead_source").order("created_at", { ascending: false }).limit(1000),
      supabase.from("emails_sent").select("id, user_id, lead_id, campaign_id, sent_at, opened, replied, autoreplied, ai_paused, ai_turns, reply_sentiment, follow_up_sent, gmail_message_id").order("sent_at", { ascending: false }).limit(1000),
      supabase.from("campaigns").select("id, name, status, autopilot, created_at").order("created_at", { ascending: false }),
      supabase.from("ai_classifications").select("id, lead_id, intent, confidence, sentiment, requires_human, booking_intent, interested, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("audit_events").select("id, lead_id, campaign_id, event, payload, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("owner_alerts").select("id, lead_id, kind, title, body, priority, read, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("tracking_events").select("id, email_id, event, occurred_at").order("occurred_at", { ascending: false }).limit(500),
      supabase.from("suppressions").select("id, email, reason, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("meetings").select("id, campaign_id, status, provider, booked_at, start_time").order("booked_at", { ascending: false }).limit(500),
    ]);
    setLeads((leadsR.data as LeadRow[]) ?? []);
    setEmails((emailsR.data as EmailRow[]) ?? []);
    setCampaigns((campsR.data as CampaignRow[]) ?? []);
    setClassifications((clsR.data as ClsRow[]) ?? []);
    setAuditEvents((auditR.data as AuditRow[]) ?? []);
    setAlerts((alertR.data as AlertRow[]) ?? []);
    setTracking((trackR.data as TrackRow[]) ?? []);
    setSuppressions((supR.data as SuppressRow[]) ?? []);
    setMeetings((meetR.data as MeetingRow[]) ?? []);
    } catch (e) {
      console.error("dashboard: failed to load analytics", e);
    } finally {
      setLoading(false);
    }
  }

  const cutoff = useMemo(() => new Date(Date.now() - dateRange * 86400000).toISOString(), [dateRange]);

  const fLeads = useMemo(() => leads.filter((l) => l.created_at >= cutoff && (campaignFilter === "all" || l.campaign_id === campaignFilter)), [leads, cutoff, campaignFilter]);
  const fEmails = useMemo(() => emails.filter((e) => e.sent_at >= cutoff && (campaignFilter === "all" || e.campaign_id === campaignFilter)), [emails, cutoff, campaignFilter]);
  const fCls = useMemo(() => classifications.filter((c) => c.created_at >= cutoff), [classifications, cutoff]);
  const fAudit = useMemo(() => auditEvents.filter((a) => a.created_at >= cutoff), [auditEvents, cutoff]);
  const fAlerts = useMemo(() => alerts.filter((a) => a.created_at >= cutoff), [alerts, cutoff]);
  const fTracking = useMemo(() => tracking.filter((t) => t.occurred_at >= cutoff), [tracking, cutoff]);
  const fSuppressions = useMemo(() => suppressions.filter((s) => s.created_at >= cutoff), [suppressions, cutoff]);
  const fMeetings = useMemo(() => meetings.filter((m) => m.booked_at >= cutoff), [meetings, cutoff]);

  const kpis = useMemo(() => {
    const totalLeads = fLeads.length;
    const verifiedLeads = fLeads.filter((l) => l.email_status === "verified").length;
    const totalSent = fEmails.length;
    const sentSuccess = fEmails.filter((e) => !!e.gmail_message_id).length;
    const opens = fTracking.filter((t) => t.event === "open").length + fEmails.filter((e) => e.opened).length;
    const clicks = fTracking.filter((t) => t.event === "click").length;
    const replies = fEmails.filter((e) => e.replied).length;
    const positiveReplies = fCls.filter((c) => c.interested || c.booking_intent).length;
    const bookingIntents = fCls.filter((c) => c.booking_intent).length;
    const confirmedBookings = fMeetings.filter((m) => m.status === "scheduled").length;
    const bounces = fAudit.filter((a) => a.event === "email.bounced").length;
    const suppressed = fSuppressions.length;
    const aiReplies = fAudit.filter((a) => a.event === "ai.reply_sent").length;
    const humanHandoffs = fAudit.filter((a) => a.event === "agent.handoff").length;
    const takeovers = fAudit.filter((a) => a.event === "human.takeover").length;
    return { totalLeads, verifiedLeads, totalSent, sentSuccess, opens, clicks, replies, positiveReplies, bookingIntents, confirmedBookings, bounces, suppressed, aiReplies, humanHandoffs, takeovers };
  }, [fLeads, fEmails, fCls, fAudit, fSuppressions, fTracking, fMeetings]);

  const humanConversion = useMemo(() => {
    const handoffs = fAudit.filter((a) => a.event === "agent.handoff").length;
    const takeovers = fAudit.filter((a) => a.event === "human.takeover").length;
    const bookingConfirmed = fMeetings.filter((m) => m.status === "scheduled").length;
    const totalHumanActions = handoffs + takeovers + bookingConfirmed;
    const repliedLeads = new Set(
      fEmails.filter((e) => e.replied).map((e) => e.lead_id).filter(Boolean)
    ).size;
    const humanManagedLeads = new Set(
      fAudit.filter((a) =>
        (a.event === "agent.handoff" || a.event === "human.takeover" || a.event === "booking.detected") &&
        a.lead_id
      ).map((a) => a.lead_id)
    ).size;
    const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
    return {
      handoffs,
      takeovers,
      bookingConfirmed,
      totalHumanActions,
      repliedLeads,
      humanManagedLeads,
      humanConversionRate: pct(humanManagedLeads, repliedLeads),
      handoffRate: pct(handoffs, repliedLeads),
      takeoverRate: pct(takeovers, repliedLeads),
      bookingRate: pct(bookingConfirmed, repliedLeads),
    };
  }, [fAudit, fEmails, fMeetings]);

  const funnel = useMemo(() => {
    const found = fLeads.length;
    const verified = fLeads.filter((l) => l.email_status === "verified" || l.email_status === "risky").length;
    const inCampaign = fLeads.filter((l) => !!l.campaign_id).length;
    const sent = fEmails.length;
    const opened = kpis.opens;
    const replied = kpis.replies;
    const interested = kpis.positiveReplies;
    const booking = kpis.confirmedBookings;
    const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
    return [
      { label: "Leads Found", value: found, pct: 100 },
      { label: "Verified", value: verified, pct: pct(verified, found) },
      { label: "In Campaigns", value: inCampaign, pct: pct(inCampaign, found) },
      { label: "Emails Sent", value: sent, pct: pct(sent, found) },
      { label: "Opens", value: opened, pct: pct(opened, sent) },
      { label: "Replies", value: replied, pct: pct(replied, sent) },
      { label: "Interested", value: interested, pct: pct(interested, sent) },
      { label: "Bookings", value: booking, pct: pct(booking, sent) },
      { label: "Human Conversion", value: humanConversion.humanManagedLeads, pct: humanConversion.humanConversionRate },
    ];
  }, [fLeads, fEmails, kpis, humanConversion]);

  const emailPerf = useMemo(() => {
    const sent = fEmails.length;
    const opened = fEmails.filter((e) => e.opened).length;
    const clicked = fTracking.filter((t) => t.event === "click").length;
    const replied = fEmails.filter((e) => e.replied).length;
    const bounced = kpis.bounces;
    const positive = fCls.filter((c) => c.interested || c.booking_intent).length;
    const booking = kpis.confirmedBookings;
    const r = (n: number) => sent > 0 ? ((n / sent) * 100).toFixed(1) : "0.0";
    return { sent, openRate: r(opened), clickRate: r(clicked), replyRate: r(replied), bounceRate: r(bounced), positiveRate: r(positive), bookingRate: r(booking) };
  }, [fEmails, fCls, kpis, fTracking]);

  const campaignPerf = useMemo(() => {
    return campaigns.map((c) => {
      const cLeads = fLeads.filter((l) => l.campaign_id === c.id).length;
      const cEmails = fEmails.filter((e) => e.campaign_id === c.id);
      const sent = cEmails.length;
      const opens = cEmails.filter((e) => e.opened).length;
      const replies = cEmails.filter((e) => e.replied).length;
      const positives = fCls.filter((cl) => {
        const leadInCampaign = fLeads.some((l) => l.id === cl.lead_id && l.campaign_id === c.id);
        return leadInCampaign && (cl.interested || cl.booking_intent);
      }).length;
      const bounces = fAudit.filter((a) => a.campaign_id === c.id && a.event === "email.bounced").length;
      const bookings = fMeetings.filter((m) => m.campaign_id === c.id && m.status === "scheduled").length;
      const rr = sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0";
      const br = sent > 0 ? ((bookings / sent) * 100).toFixed(1) : "0.0";
      return { ...c, cLeads, sent, opens, replies, positives, bounces, bookings, replyRate: rr, bookingRate: br };
    });
  }, [campaigns, fLeads, fEmails, fCls, fAudit, fMeetings]);

  const aiPerf = useMemo(() => {
    const totalCls = fCls.length;
    const intentDist: Record<string, number> = {};
    fCls.forEach((c) => { intentDist[c.intent ?? "other"] = (intentDist[c.intent ?? "other"] || 0) + 1; });
    const lowConf = fCls.filter((c) => (c.confidence ?? 1) < 0.55).length;
    const requiresHuman = fCls.filter((c) => c.requires_human).length;
    return { totalCls, intentDist, lowConf, requiresHuman, aiReplies: kpis.aiReplies, handoffs: kpis.humanHandoffs, takeovers: kpis.takeovers };
  }, [fCls, kpis]);

  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Outreach performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAlertPanelOpen(!alertPanelOpen)}>
            <Bell className="mr-1.5 h-3.5 w-3.5" /> Alerts
            {unreadAlerts > 0 && <Badge variant="secondary" className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">{unreadAlerts}</Badge>}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.days}
              onClick={() => setDateRange(dr.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dateRange === dr.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {dr.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="relative">
            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-3 pr-7 text-xs outline-none focus:ring-2 focus:ring-ring">
              <option value="all">All campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Alerts Panel */}
      {alertPanelOpen && (
        <div className="space-y-3 max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Recent Alerts</h2>
          {fAlerts.length === 0 ? <p className="text-sm text-muted-foreground">No alerts in this period.</p> : (
            <div className="divide-y divide-border">
              {fAlerts.slice(0, 20).map((a) => (
                <div key={a.id} className={`flex items-start gap-3 py-2 ${a.read ? "opacity-50" : ""}`}>
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.read ? "bg-muted" : a.priority === "high" ? "bg-red-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{a.title}</span>
                    {a.body && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.body}</p>}
                    <span className="text-xs text-muted-foreground/60">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Total Leads" value={kpis.totalLeads} />
        <KpiCard icon={<Send className="h-4 w-4" />} label="Emails Sent" value={kpis.totalSent} />
        <KpiCard icon={<Eye className="h-4 w-4" />} label="Opens" value={kpis.opens} />
        <KpiCard icon={<Reply className="h-4 w-4" />} label="Replies" value={kpis.replies} accent={kpis.replies > 0} />
        <KpiCard icon={<CheckCircle className="h-4 w-4 text-emerald-500" />} label="Interested" value={kpis.positiveReplies} />
        <KpiCard icon={<CalendarCheck className="h-4 w-4 text-orange-500" />} label="Bookings" value={kpis.confirmedBookings} accent={kpis.confirmedBookings > 0} />
        <KpiCard icon={<Bot className="h-4 w-4 text-purple-500" />} label="AI Replies" value={kpis.aiReplies} />
        <KpiCard icon={<Hand className="h-4 w-4 text-amber-500" />} label="Handoffs" value={kpis.humanHandoffs} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-red-500" />} label="Bounces" value={kpis.bounces} />
        <KpiCard icon={<Shield className="h-4 w-4 text-red-500" />} label="Suppressed" value={kpis.suppressed} />
      </div>

      {/* Two-column workspace */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4">
      {/* Conversion Funnel */}
      <Section title="Conversion Funnel" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="space-y-3">
          {funnel.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-4">
              <div className="w-36 shrink-0 text-sm text-muted-foreground">{stage.label}</div>
              <div className="flex-1">
                <Progress value={stage.pct} className="h-3" />
              </div>
              <div className="w-20 text-right text-sm font-medium">{stage.value}</div>
              <div className="w-14 text-right text-xs text-muted-foreground">{stage.pct}%</div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            </div>
          ))}
        </div>
        {funnel[0].value === 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">Nothing found in this period. Start a campaign to see your results.</p>
        )}
      </Section>

      {/* Human Conversion Analytics */}
      <Section title="Human Conversion Analytics" icon={<Hand className="h-4 w-4" />}>
        {fAudit.length === 0 && fEmails.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No data yet. Human conversion analytics appear after replies are received.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Replied Leads" value={humanConversion.repliedLeads} />
              <StatCard label="Human-Managed Leads" value={humanConversion.humanManagedLeads} accent={humanConversion.humanManagedLeads > 0} />
              <StatCard label="Human Conversion Rate" value={`${humanConversion.humanConversionRate}%`} accent={humanConversion.humanConversionRate > 20} />
              <StatCard label="Total Human Actions" value={humanConversion.totalHumanActions} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Hand className="h-3.5 w-3.5 text-amber-500" /> AI Handoffs
                </div>
                <div className="mt-1.5 text-lg font-semibold tabular-nums">{humanConversion.handoffs}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{humanConversion.handoffRate}% of replies</div>
                <p className="mt-2 text-xs text-muted-foreground/70">AI detected complex intent and transferred to human</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-orange-500" /> Owner Takeovers
                </div>
                <div className="mt-1.5 text-lg font-semibold tabular-nums">{humanConversion.takeovers}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{humanConversion.takeoverRate}% of replies</div>
                <p className="mt-2 text-xs text-muted-foreground/70">Owner manually took control of the conversation</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" /> Bookings Confirmed
                </div>
                <div className="mt-1.5 text-lg font-semibold tabular-nums">{humanConversion.bookingConfirmed}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{humanConversion.bookingRate}% of replies</div>
                <p className="mt-2 text-xs text-muted-foreground/70">Confirmed bookings from tracked calendars</p>
              </div>
            </div>

            {humanConversion.repliedLeads > 0 && (
              <div className="rounded-lg border border-border bg-card p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Conversion Breakdown</h3>
                <div className="space-y-2">
                  {[
                    { label: "AI-Handled (auto-reply)", count: humanConversion.repliedLeads - humanConversion.humanManagedLeads, color: "bg-purple-500" },
                    { label: "AI Handoff to Human", count: humanConversion.handoffs, color: "bg-amber-500" },
                    { label: "Owner Takeover", count: humanConversion.takeovers, color: "bg-orange-500" },
                    { label: "Booking Confirmed", count: humanConversion.bookingConfirmed, color: "bg-emerald-500" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.color}`} />
                      <span className="text-sm flex-1">{row.label}</span>
                      <span className="text-sm font-medium w-12 text-right">{row.count}</span>
                      <div className="w-32">
                        <Progress
                          value={humanConversion.repliedLeads > 0 ? Math.round((row.count / humanConversion.repliedLeads) * 100) : 0}
                          className="h-2"
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {humanConversion.repliedLeads > 0 ? Math.round((row.count / humanConversion.repliedLeads) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Email Performance */}
      <Section title="Email Performance" icon={<Mail className="h-4 w-4" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sent" value={emailPerf.sent} />
          <StatCard label="Open Rate" value={`${emailPerf.openRate}%`} />
          <StatCard label="Reply Rate" value={`${emailPerf.replyRate}%`} accent={parseFloat(emailPerf.replyRate) > 5} />
          <StatCard label="Bounce Rate" value={`${emailPerf.bounceRate}%`} warn={parseFloat(emailPerf.bounceRate) > 5} />
          <StatCard label="Click Rate" value={`${emailPerf.clickRate}%`} />
          <StatCard label="Positive Rate" value={`${emailPerf.positiveRate}%`} />
          <StatCard label="Booking Rate" value={`${emailPerf.bookingRate}%`} />
        </div>
        {emailPerf.sent === 0 && <p className="mt-3 text-center text-sm text-muted-foreground">No emails sent in this period.</p>}
      </Section>
        </div>
        <div className="flex min-h-0 flex-col gap-4">

      {/* AI Performance + Reply Intelligence */}
      <div className="flex flex-col gap-4">
        <Section title="AI Performance" icon={<Bot className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Classifications" value={aiPerf.totalCls} />
              <StatCard label="AI Replies Sent" value={aiPerf.aiReplies} />
              <StatCard label="Human Handoffs" value={aiPerf.handoffs} />
              <StatCard label="Owner Takeovers" value={aiPerf.takeovers} />
              <StatCard label="Low Confidence" value={aiPerf.lowConf} warn={aiPerf.lowConf > 0} />
              <StatCard label="Requires Human" value={aiPerf.requiresHuman} />
            </div>
            {aiPerf.totalCls > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Intent Distribution</h3>
                <div className="space-y-1.5">
                  {Object.entries(aiPerf.intentDist).sort(([, a], [, b]) => b - a).map(([intent, count]) => {
                    const meta = INTENT_META[intent] ?? INTENT_META.other;
                    const pct = Math.round((count / aiPerf.totalCls) * 100);
                    return (
                      <div key={intent} className="flex items-center gap-2">
                        <span className={`w-4 ${meta.color}`}>{meta.icon}</span>
                        <span className="text-sm flex-1">{meta.label}</span>
                        <div className="w-24"><Progress value={pct} className="h-2" /></div>
                        <span className="w-10 text-right text-xs text-muted-foreground">{count}</span>
                        <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {aiPerf.totalCls === 0 && <p className="text-center text-sm text-muted-foreground">No AI classifications yet.</p>}
          </div>
        </Section>

        <Section title="Reply Intelligence" icon={<Zap className="h-4 w-4" />}>
          <div className="space-y-4">
            {/* Hot leads */}
            <IntelligenceGroup
              title="Hot Leads"
              icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
              items={fCls.filter((c) => c.interested && !c.booking_intent).slice(0, 5).map((c) => ({
                id: String(c.id), label: `Interested (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
                link: "/emails", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
              }))}
              empty="No interested people in this period."
            />
            <IntelligenceGroup
              title="Booking Requests"
              icon={<CalendarCheck className="h-3.5 w-3.5 text-orange-500" />}
              items={fCls.filter((c) => c.booking_intent).slice(0, 5).map((c) => ({
                id: String(c.id), label: `Booking (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
                link: "/emails", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
              }))}
              empty="No booking requests."
            />
            <IntelligenceGroup
              title="Needs Human Attention"
              icon={<Hand className="h-3.5 w-3.5 text-amber-500" />}
              items={fCls.filter((c) => c.requires_human).slice(0, 5).map((c) => ({
                id: String(c.id), label: `${c.intent ?? "unknown"} (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
                link: "/emails", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              }))}
              empty="No items requiring human attention."
            />
            <IntelligenceGroup
              title="Suppressed / Unsubscribed"
              icon={<ShieldX className="h-3.5 w-3.5 text-red-500" />}
              items={fSuppressions.slice(0, 5).map((s) => ({
                id: s.id, label: `${s.email} (${s.reason})`,
                link: "/leads", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              }))}
              empty="No suppressions."
            />
          </div>
        </Section>
      </div>
        </div>
      </div>

      {/* Campaign Performance */}
      <Section title="Campaign Performance" icon={<BarChart3 className="h-4 w-4" />}>
        {campaignPerf.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No campaigns created yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4 text-right">Leads</th>
                  <th className="pb-2 pr-4 text-right">Sent</th>
                  <th className="pb-2 pr-4 text-right">Opens</th>
                  <th className="pb-2 pr-4 text-right">Replies</th>
                  <th className="pb-2 pr-4 text-right">Interested</th>
                  <th className="pb-2 pr-4 text-right">Bookings</th>
                  <th className="pb-2 pr-4 text-right">Bounces</th>
                  <th className="pb-2 pr-4 text-right">Reply %</th>
                  <th className="pb-2 pr-4 text-right">Booking %</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaignPerf.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.autopilot ? "Autopilot" : "Manual"}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-right">{c.cLeads}</td>
                    <td className="py-2.5 pr-4 text-right">{c.sent}</td>
                    <td className="py-2.5 pr-4 text-right">{c.opens}</td>
                    <td className="py-2.5 pr-4 text-right">{c.replies}</td>
                    <td className="py-2.5 pr-4 text-right">{c.positives}</td>
                    <td className="py-2.5 pr-4 text-right">{c.bookings}</td>
                    <td className="py-2.5 pr-4 text-right">{c.bounces}</td>
                    <td className="py-2.5 pr-4 text-right">{c.replyRate}%</td>
                    <td className="py-2.5 pr-4 text-right">{c.bookingRate}%</td>
                    <td className="py-2.5 text-right">
                      <Badge variant={c.status === "active" ? "default" : "secondary"}
                        className={c.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Activity Timeline */}
      <Section title="Activity Timeline" icon={<Clock className="h-4 w-4" />}>
        {fAudit.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No activity in this period.</p>
        ) : (
          <div className="space-y-0 max-h-96 overflow-y-auto">
            {fAudit.slice(0, 50).map((a) => {
              const icon = auditIcon(a.event);
              return (
                <div key={a.id} className="flex gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs ${icon.color}`}>
                      {icon.node}
                    </div>
                    <div className="h-full w-px bg-border" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">{a.event}</span>
                      {a.campaign_id && <Badge variant="secondary" className="text-xs">campaign</Badge>}
                      <span className="text-xs text-muted-foreground/60">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    {a.payload && typeof a.payload === "object" && Object.keys(a.payload).length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {Object.entries(a.payload).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="text-xs text-muted-foreground/70">{k}: {String(v).slice(0, 40)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function KpiCard({ icon, label, value, accent, warn }: {
  icon: React.ReactNode; label: string; value: number; accent?: boolean; warn?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${
      accent ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
        : warn ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
        : "border-border bg-card"
    }`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: string | number; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${warn ? "border-amber-200 dark:border-amber-800 bg-amber-50/30" : "border-border bg-card"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${accent ? "text-emerald-600 dark:text-emerald-400" : warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}

function IntelligenceGroup({ title, icon, items, empty }: {
  title: string; icon: React.ReactNode;
  items: Array<{ id: string; label: string; link: string; color: string }>;
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">{icon} {title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 pl-5">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.link} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/50 transition-colors">
                <Badge className={`text-xs ${item.color}`}>{item.label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function auditIcon(event: string): { node: React.ReactNode; color: string } {
  if (event.includes("lead.created") || event.includes("lead.searched")) return { node: <Users className="h-3 w-3" />, color: "text-blue-500" };
  if (event.includes("email.sent") || event.includes("email.queued")) return { node: <Send className="h-3 w-3" />, color: "text-blue-500" };
  if (event.includes("email.opened")) return { node: <Eye className="h-3 w-3" />, color: "text-blue-400" };
  if (event.includes("email.replied")) return { node: <Reply className="h-3 w-3" />, color: "text-emerald-500" };
  if (event.includes("ai.classified")) return { node: <Bot className="h-3 w-3" />, color: "text-purple-500" };
  if (event.includes("ai.reply_sent")) return { node: <Bot className="h-3 w-3" />, color: "text-purple-500" };
  if (event.includes("ai.reply_generated")) return { node: <Bot className="h-3 w-3" />, color: "text-purple-400" };
  if (event.includes("booking.confirmed")) return { node: <CalendarCheck className="h-3 w-3" />, color: "text-emerald-500" };
  if (event.includes("booking.detected")) return { node: <CalendarCheck className="h-3 w-3" />, color: "text-orange-500" };
  if (event.includes("email.bounced")) return { node: <AlertTriangle className="h-3 w-3" />, color: "text-red-500" };
  if (event.includes("lead.suppressed") || event.includes("lead.unsubscribed")) return { node: <ShieldX className="h-3 w-3" />, color: "text-red-500" };
  if (event.includes("human.takeover") || event.includes("agent.handoff")) return { node: <Hand className="h-3 w-3" />, color: "text-amber-500" };
  if (event.includes("campaign")) return { node: <Rocket className="h-3 w-3" />, color: "text-blue-500" };
  if (event.includes("loop")) return { node: <Pause className="h-3 w-3" />, color: "text-amber-500" };
  if (event.includes("gmail")) return { node: <Globe className="h-3 w-3" />, color: "text-gray-500" };
  if (event.includes("email.failed")) return { node: <XCircle className="h-3 w-3" />, color: "text-red-400" };
  return { node: <Clock className="h-3 w-3" />, color: "text-gray-400" };
}
