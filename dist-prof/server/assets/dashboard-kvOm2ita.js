import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { c as cn, B as Button } from "./button-DjOZMqFS.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { Loader2, Bell, Filter, ChevronDown, Users, Send, Eye, Reply, CheckCircle, CalendarCheck, Bot, Hand, AlertTriangle, Shield, ArrowRight, TrendingUp, Mail, BarChart3, ShieldX, Zap, Clock, XCircle, ShieldAlert, MessageSquare, Rocket, Pause, Globe } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const Progress = React.forwardRef(({ className, value, ...props }, ref) => /* @__PURE__ */ jsx(
  ProgressPrimitive.Root,
  {
    ref,
    className: cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className),
    ...props,
    children: /* @__PURE__ */ jsx(
      ProgressPrimitive.Indicator,
      {
        className: "h-full w-full flex-1 bg-primary transition-all",
        style: { transform: `translateX(-${100 - (value || 0)}%)` }
      }
    )
  }
));
Progress.displayName = ProgressPrimitive.Root.displayName;
const DATE_RANGES = [{
  label: "Today",
  days: 1
}, {
  label: "7 days",
  days: 7
}, {
  label: "30 days",
  days: 30
}, {
  label: "90 days",
  days: 90
}, {
  label: "All time",
  days: 3650
}];
const INTENT_META = {
  interested: {
    label: "Interested",
    icon: /* @__PURE__ */ jsx(CheckCircle, { className: "h-3.5 w-3.5" }),
    color: "text-emerald-600 dark:text-emerald-400"
  },
  booking: {
    label: "Booking",
    icon: /* @__PURE__ */ jsx(CalendarCheck, { className: "h-3.5 w-3.5" }),
    color: "text-orange-600 dark:text-orange-400"
  },
  question: {
    label: "Question",
    icon: /* @__PURE__ */ jsx(MessageSquare, { className: "h-3.5 w-3.5" }),
    color: "text-blue-600 dark:text-blue-400"
  },
  objection: {
    label: "Objection",
    icon: /* @__PURE__ */ jsx(ShieldAlert, { className: "h-3.5 w-3.5" }),
    color: "text-amber-600 dark:text-amber-400"
  },
  not_interested: {
    label: "Not Interested",
    icon: /* @__PURE__ */ jsx(XCircle, { className: "h-3.5 w-3.5" }),
    color: "text-red-600 dark:text-red-400"
  },
  unsubscribe: {
    label: "Unsubscribe",
    icon: /* @__PURE__ */ jsx(ShieldX, { className: "h-3.5 w-3.5" }),
    color: "text-red-600 dark:text-red-400"
  },
  unclear: {
    label: "Unclear",
    icon: /* @__PURE__ */ jsx(Eye, { className: "h-3.5 w-3.5" }),
    color: "text-gray-500"
  },
  autoresponder: {
    label: "Auto-reply",
    icon: /* @__PURE__ */ jsx(Bot, { className: "h-3.5 w-3.5" }),
    color: "text-purple-600 dark:text-purple-400"
  },
  other: {
    label: "Other",
    icon: /* @__PURE__ */ jsx(Shield, { className: "h-3.5 w-3.5" }),
    color: "text-gray-400"
  }
};
function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [emails, setEmails] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [suppressions, setSuppressions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(3650);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  useEffect(() => {
    loadAll();
  }, []);
  async function loadAll() {
    setLoading(true);
    try {
      const [leadsR, emailsR, campsR, clsR, auditR, alertR, trackR, supR] = await Promise.all([supabase.from("leads").select("id, user_id, campaign_id, status, lifecycle, conv_mode, email_status, email_confidence, unsubscribed, created_at, lead_source").order("created_at", {
        ascending: false
      }).limit(1e3), supabase.from("emails_sent").select("id, user_id, lead_id, campaign_id, sent_at, opened, replied, autoreplied, ai_paused, ai_turns, reply_sentiment, follow_up_sent, gmail_message_id").order("sent_at", {
        ascending: false
      }).limit(1e3), supabase.from("campaigns").select("id, name, status, autopilot, created_at").order("created_at", {
        ascending: false
      }), supabase.from("ai_classifications").select("id, lead_id, intent, confidence, sentiment, requires_human, booking_intent, interested, created_at").order("created_at", {
        ascending: false
      }).limit(500), supabase.from("audit_events").select("id, lead_id, campaign_id, event, payload, created_at").order("created_at", {
        ascending: false
      }).limit(500), supabase.from("owner_alerts").select("id, lead_id, kind, title, body, priority, read, created_at").order("created_at", {
        ascending: false
      }).limit(100), supabase.from("tracking_events").select("id, email_id, event, occurred_at").order("occurred_at", {
        ascending: false
      }).limit(500), supabase.from("suppressions").select("id, email, reason, created_at").order("created_at", {
        ascending: false
      }).limit(100)]);
      setLeads(leadsR.data ?? []);
      setEmails(emailsR.data ?? []);
      setCampaigns(campsR.data ?? []);
      setClassifications(clsR.data ?? []);
      setAuditEvents(auditR.data ?? []);
      setAlerts(alertR.data ?? []);
      setTracking(trackR.data ?? []);
      setSuppressions(supR.data ?? []);
    } catch (e) {
      console.error("dashboard: failed to load analytics", e);
    } finally {
      setLoading(false);
    }
  }
  const cutoff = useMemo(() => new Date(Date.now() - dateRange * 864e5).toISOString(), [dateRange]);
  const fLeads = useMemo(() => leads.filter((l) => l.created_at >= cutoff && (campaignFilter === "all" || l.campaign_id === campaignFilter)), [leads, cutoff, campaignFilter]);
  const fEmails = useMemo(() => emails.filter((e) => e.sent_at >= cutoff && (campaignFilter === "all" || e.campaign_id === campaignFilter)), [emails, cutoff, campaignFilter]);
  const fCls = useMemo(() => classifications.filter((c) => c.created_at >= cutoff), [classifications, cutoff]);
  const fAudit = useMemo(() => auditEvents.filter((a) => a.created_at >= cutoff), [auditEvents, cutoff]);
  const fAlerts = useMemo(() => alerts.filter((a) => a.created_at >= cutoff), [alerts, cutoff]);
  const fTracking = useMemo(() => tracking.filter((t) => t.occurred_at >= cutoff), [tracking, cutoff]);
  const fSuppressions = useMemo(() => suppressions.filter((s) => s.created_at >= cutoff), [suppressions, cutoff]);
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
    const bounces = fAudit.filter((a) => a.event === "email.bounced").length;
    const suppressed = fSuppressions.length;
    const aiReplies = fAudit.filter((a) => a.event === "ai.reply_sent").length;
    const humanHandoffs = fAudit.filter((a) => a.event === "agent.handoff").length;
    const takeovers = fAudit.filter((a) => a.event === "human.takeover").length;
    return {
      totalLeads,
      verifiedLeads,
      totalSent,
      sentSuccess,
      opens,
      clicks,
      replies,
      positiveReplies,
      bookingIntents,
      bounces,
      suppressed,
      aiReplies,
      humanHandoffs,
      takeovers
    };
  }, [fLeads, fEmails, fCls, fAudit, fSuppressions, fTracking]);
  const humanConversion = useMemo(() => {
    const handoffs = fAudit.filter((a) => a.event === "agent.handoff").length;
    const takeovers = fAudit.filter((a) => a.event === "human.takeover").length;
    const bookingDetected = fAudit.filter((a) => a.event === "booking.detected").length;
    const totalHumanActions = handoffs + takeovers + bookingDetected;
    const repliedLeads = new Set(fEmails.filter((e) => e.replied).map((e) => e.lead_id).filter(Boolean)).size;
    const humanManagedLeads = new Set(fAudit.filter((a) => (a.event === "agent.handoff" || a.event === "human.takeover" || a.event === "booking.detected") && a.lead_id).map((a) => a.lead_id)).size;
    const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
    return {
      handoffs,
      takeovers,
      bookingDetected,
      totalHumanActions,
      repliedLeads,
      humanManagedLeads,
      humanConversionRate: pct(humanManagedLeads, repliedLeads),
      handoffRate: pct(handoffs, repliedLeads),
      takeoverRate: pct(takeovers, repliedLeads),
      bookingRate: pct(bookingDetected, repliedLeads)
    };
  }, [fAudit, fEmails]);
  const funnel = useMemo(() => {
    const found = fLeads.length;
    const verified = fLeads.filter((l) => l.email_status === "verified" || l.email_status === "risky").length;
    const inCampaign = fLeads.filter((l) => !!l.campaign_id).length;
    const sent = fEmails.length;
    const opened = kpis.opens;
    const replied = kpis.replies;
    const interested = kpis.positiveReplies;
    const booking = kpis.bookingIntents;
    const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
    return [{
      label: "Leads Found",
      value: found,
      pct: 100
    }, {
      label: "Verified",
      value: verified,
      pct: pct(verified, found)
    }, {
      label: "In Campaigns",
      value: inCampaign,
      pct: pct(inCampaign, found)
    }, {
      label: "Emails Sent",
      value: sent,
      pct: pct(sent, found)
    }, {
      label: "Opens",
      value: opened,
      pct: pct(opened, sent)
    }, {
      label: "Replies",
      value: replied,
      pct: pct(replied, sent)
    }, {
      label: "Interested",
      value: interested,
      pct: pct(interested, sent)
    }, {
      label: "Bookings",
      value: booking,
      pct: pct(booking, sent)
    }, {
      label: "Human Conversion",
      value: humanConversion.humanManagedLeads,
      pct: humanConversion.humanConversionRate
    }];
  }, [fLeads, fEmails, kpis, humanConversion]);
  const emailPerf = useMemo(() => {
    const sent = fEmails.length;
    const opened = fEmails.filter((e) => e.opened).length;
    const clicked = fTracking.filter((t) => t.event === "click").length;
    const replied = fEmails.filter((e) => e.replied).length;
    const bounced = kpis.bounces;
    const positive = fCls.filter((c) => c.interested || c.booking_intent).length;
    const booking = kpis.bookingIntents;
    const r = (n) => sent > 0 ? (n / sent * 100).toFixed(1) : "0.0";
    return {
      sent,
      openRate: r(opened),
      clickRate: r(clicked),
      replyRate: r(replied),
      bounceRate: r(bounced),
      positiveRate: r(positive),
      bookingRate: r(booking)
    };
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
      const rr = sent > 0 ? (replies / sent * 100).toFixed(1) : "0.0";
      const br = sent > 0 ? (positives / sent * 100).toFixed(1) : "0.0";
      return {
        ...c,
        cLeads,
        sent,
        opens,
        replies,
        positives,
        bounces,
        replyRate: rr,
        bookingRate: br
      };
    });
  }, [campaigns, fLeads, fEmails, fCls, fAudit]);
  const aiPerf = useMemo(() => {
    const totalCls = fCls.length;
    const intentDist = {};
    fCls.forEach((c) => {
      intentDist[c.intent ?? "other"] = (intentDist[c.intent ?? "other"] || 0) + 1;
    });
    const lowConf = fCls.filter((c) => (c.confidence ?? 1) < 0.55).length;
    const requiresHuman = fCls.filter((c) => c.requires_human).length;
    return {
      totalCls,
      intentDist,
      lowConf,
      requiresHuman,
      aiReplies: kpis.aiReplies,
      handoffs: kpis.humanHandoffs,
      takeovers: kpis.takeovers
    };
  }, [fCls, kpis]);
  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsx(Loader2, { className: "h-6 w-6 animate-spin text-primary" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Dashboard" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Outreach performance overview" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: () => setAlertPanelOpen(!alertPanelOpen), children: [
        /* @__PURE__ */ jsx(Bell, { className: "mr-2 h-4 w-4" }),
        " Alerts",
        unreadAlerts > 0 && /* @__PURE__ */ jsx(Badge, { className: "ml-2 bg-destructive text-white", children: unreadAlerts })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card", children: [
      /* @__PURE__ */ jsx(Filter, { className: "h-4 w-4 text-muted-foreground" }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: DATE_RANGES.map((dr) => /* @__PURE__ */ jsx(Button, { variant: dateRange === dr.days ? "default" : "ghost", size: "sm", onClick: () => setDateRange(dr.days), className: dateRange === dr.days ? "bg-primary text-primary-foreground" : "", children: dr.label }, dr.days)) }),
      /* @__PURE__ */ jsx("div", { className: "h-4 w-px bg-border" }),
      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxs("select", { value: campaignFilter, onChange: (e) => setCampaignFilter(e.target.value), className: "appearance-none rounded-lg border border-border bg-background px-3 py-1.5 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring", children: [
          /* @__PURE__ */ jsx("option", { value: "all", children: "All campaigns" }),
          campaigns.map((c) => /* @__PURE__ */ jsx("option", { value: c.id, children: c.name }, c.id))
        ] }),
        /* @__PURE__ */ jsx(ChevronDown, { className: "pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" })
      ] })
    ] }),
    alertPanelOpen && /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-4 shadow-card space-y-3 max-h-96 overflow-y-auto", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold uppercase text-muted-foreground", children: "Recent Alerts" }),
      fAlerts.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No alerts in this period." }) : /* @__PURE__ */ jsx("div", { className: "divide-y divide-border", children: fAlerts.slice(0, 20).map((a) => /* @__PURE__ */ jsxs("div", { className: `flex items-start gap-3 py-2 ${a.read ? "opacity-50" : ""}`, children: [
        /* @__PURE__ */ jsx("div", { className: `mt-1 h-2 w-2 shrink-0 rounded-full ${a.read ? "bg-muted" : a.priority === "high" ? "bg-red-500" : "bg-blue-500"}` }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: a.title }),
          a.body && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground line-clamp-1 mt-0.5", children: a.body }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: new Date(a.created_at).toLocaleString() })
        ] })
      ] }, a.id)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5", children: [
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Users, { className: "h-4 w-4" }), label: "Total Leads", value: kpis.totalLeads }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Send, { className: "h-4 w-4" }), label: "Emails Sent", value: kpis.totalSent }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Eye, { className: "h-4 w-4" }), label: "Opens", value: kpis.opens }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Reply, { className: "h-4 w-4" }), label: "Replies", value: kpis.replies, accent: kpis.replies > 0 }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4 text-emerald-500" }), label: "Interested", value: kpis.positiveReplies }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(CalendarCheck, { className: "h-4 w-4 text-orange-500" }), label: "Bookings", value: kpis.bookingIntents, accent: kpis.bookingIntents > 0 }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Bot, { className: "h-4 w-4 text-purple-500" }), label: "AI Replies", value: kpis.aiReplies }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Hand, { className: "h-4 w-4 text-amber-500" }), label: "Handoffs", value: kpis.humanHandoffs }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 text-red-500" }), label: "Bounces", value: kpis.bounces }),
      /* @__PURE__ */ jsx(KpiCard, { icon: /* @__PURE__ */ jsx(Shield, { className: "h-4 w-4 text-red-500" }), label: "Suppressed", value: kpis.suppressed })
    ] }),
    /* @__PURE__ */ jsxs(Section, { title: "Conversion Funnel", icon: /* @__PURE__ */ jsx(TrendingUp, { className: "h-4 w-4" }), children: [
      /* @__PURE__ */ jsx("div", { className: "space-y-3", children: funnel.map((stage, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("div", { className: "w-36 shrink-0 text-sm text-muted-foreground", children: stage.label }),
        /* @__PURE__ */ jsx("div", { className: "flex-1", children: /* @__PURE__ */ jsx(Progress, { value: stage.pct, className: "h-3" }) }),
        /* @__PURE__ */ jsx("div", { className: "w-20 text-right text-sm font-medium", children: stage.value }),
        /* @__PURE__ */ jsxs("div", { className: "w-14 text-right text-xs text-muted-foreground", children: [
          stage.pct,
          "%"
        ] }),
        /* @__PURE__ */ jsx(ArrowRight, { className: "h-3 w-3 text-muted-foreground/40 shrink-0" })
      ] }, stage.label)) }),
      funnel[0].value === 0 && /* @__PURE__ */ jsx("p", { className: "mt-4 text-center text-sm text-muted-foreground", children: "No leads found in this period. Start a campaign to see your funnel." })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Human Conversion Analytics", icon: /* @__PURE__ */ jsx(Hand, { className: "h-4 w-4" }), children: fAudit.length === 0 && fEmails.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-center text-sm text-muted-foreground", children: "No data yet. Human conversion analytics appear after replies are received." }) : /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
        /* @__PURE__ */ jsx(StatCard, { label: "Replied Leads", value: humanConversion.repliedLeads }),
        /* @__PURE__ */ jsx(StatCard, { label: "Human-Managed Leads", value: humanConversion.humanManagedLeads, accent: humanConversion.humanManagedLeads > 0 }),
        /* @__PURE__ */ jsx(StatCard, { label: "Human Conversion Rate", value: `${humanConversion.humanConversionRate}%`, accent: humanConversion.humanConversionRate > 20 }),
        /* @__PURE__ */ jsx(StatCard, { label: "Total Human Actions", value: humanConversion.totalHumanActions })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-muted/30 p-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
            /* @__PURE__ */ jsx(Hand, { className: "h-3.5 w-3.5 text-amber-500" }),
            " AI Handoffs"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-1.5 text-2xl font-bold", children: humanConversion.handoffs }),
          /* @__PURE__ */ jsxs("div", { className: "mt-0.5 text-xs text-muted-foreground", children: [
            humanConversion.handoffRate,
            "% of replies"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-muted-foreground/70", children: "AI detected complex intent and transferred to human" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-muted/30 p-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
            /* @__PURE__ */ jsx(Users, { className: "h-3.5 w-3.5 text-orange-500" }),
            " Owner Takeovers"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-1.5 text-2xl font-bold", children: humanConversion.takeovers }),
          /* @__PURE__ */ jsxs("div", { className: "mt-0.5 text-xs text-muted-foreground", children: [
            humanConversion.takeoverRate,
            "% of replies"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-muted-foreground/70", children: "Owner manually took control of the conversation" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-muted/30 p-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
            /* @__PURE__ */ jsx(CalendarCheck, { className: "h-3.5 w-3.5 text-emerald-500" }),
            " Bookings Detected"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-1.5 text-2xl font-bold", children: humanConversion.bookingDetected }),
          /* @__PURE__ */ jsxs("div", { className: "mt-0.5 text-xs text-muted-foreground", children: [
            humanConversion.bookingRate,
            "% of replies"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-muted-foreground/70", children: "Lead confirmed or requested a meeting booking" })
        ] })
      ] }),
      humanConversion.repliedLeads > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-muted/30 p-4", children: [
        /* @__PURE__ */ jsx("h3", { className: "mb-2 text-xs font-semibold uppercase text-muted-foreground", children: "Conversion Breakdown" }),
        /* @__PURE__ */ jsx("div", { className: "space-y-2", children: [{
          label: "AI-Handled (auto-reply)",
          count: humanConversion.repliedLeads - humanConversion.humanManagedLeads,
          color: "bg-purple-500"
        }, {
          label: "AI Handoff to Human",
          count: humanConversion.handoffs,
          color: "bg-amber-500"
        }, {
          label: "Owner Takeover",
          count: humanConversion.takeovers,
          color: "bg-orange-500"
        }, {
          label: "Booking Confirmed",
          count: humanConversion.bookingDetected,
          color: "bg-emerald-500"
        }].map((row) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: `h-2.5 w-2.5 shrink-0 rounded-full ${row.color}` }),
          /* @__PURE__ */ jsx("span", { className: "text-sm flex-1", children: row.label }),
          /* @__PURE__ */ jsx("span", { className: "text-sm font-medium w-12 text-right", children: row.count }),
          /* @__PURE__ */ jsx("div", { className: "w-32", children: /* @__PURE__ */ jsx(Progress, { value: humanConversion.repliedLeads > 0 ? Math.round(row.count / humanConversion.repliedLeads * 100) : 0, className: "h-2" }) }),
          /* @__PURE__ */ jsxs("span", { className: "w-10 text-right text-xs text-muted-foreground", children: [
            humanConversion.repliedLeads > 0 ? Math.round(row.count / humanConversion.repliedLeads * 100) : 0,
            "%"
          ] })
        ] }, row.label)) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs(Section, { title: "Email Performance", icon: /* @__PURE__ */ jsx(Mail, { className: "h-4 w-4" }), children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [
        /* @__PURE__ */ jsx(StatCard, { label: "Sent", value: emailPerf.sent }),
        /* @__PURE__ */ jsx(StatCard, { label: "Open Rate", value: `${emailPerf.openRate}%` }),
        /* @__PURE__ */ jsx(StatCard, { label: "Reply Rate", value: `${emailPerf.replyRate}%`, accent: parseFloat(emailPerf.replyRate) > 5 }),
        /* @__PURE__ */ jsx(StatCard, { label: "Bounce Rate", value: `${emailPerf.bounceRate}%`, warn: parseFloat(emailPerf.bounceRate) > 5 }),
        /* @__PURE__ */ jsx(StatCard, { label: "Click Rate", value: `${emailPerf.clickRate}%` }),
        /* @__PURE__ */ jsx(StatCard, { label: "Positive Rate", value: `${emailPerf.positiveRate}%` }),
        /* @__PURE__ */ jsx(StatCard, { label: "Booking Rate", value: `${emailPerf.bookingRate}%` })
      ] }),
      emailPerf.sent === 0 && /* @__PURE__ */ jsx("p", { className: "mt-3 text-center text-sm text-muted-foreground", children: "No emails sent in this period." })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Campaign Performance", icon: /* @__PURE__ */ jsx(BarChart3, { className: "h-4 w-4" }), children: campaignPerf.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-center text-sm text-muted-foreground", children: "No campaigns created yet." }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground", children: [
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4", children: "Campaign" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Leads" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Sent" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Opens" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Replies" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Interested" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Bounces" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Reply %" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 pr-4 text-right", children: "Booking %" }),
        /* @__PURE__ */ jsx("th", { className: "pb-2 text-right", children: "Status" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-border", children: campaignPerf.map((c) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-muted/30", children: [
        /* @__PURE__ */ jsxs("td", { className: "py-2.5 pr-4", children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: c.name }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: c.autopilot ? "Autopilot" : "Manual" })
        ] }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.cLeads }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.sent }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.opens }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.replies }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.positives }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 pr-4 text-right", children: c.bounces }),
        /* @__PURE__ */ jsxs("td", { className: "py-2.5 pr-4 text-right", children: [
          c.replyRate,
          "%"
        ] }),
        /* @__PURE__ */ jsxs("td", { className: "py-2.5 pr-4 text-right", children: [
          c.bookingRate,
          "%"
        ] }),
        /* @__PURE__ */ jsx("td", { className: "py-2.5 text-right", children: /* @__PURE__ */ jsx(Badge, { variant: c.status === "active" ? "default" : "secondary", className: c.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "", children: c.status }) })
      ] }, c.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsx(Section, { title: "AI Performance", icon: /* @__PURE__ */ jsx(Bot, { className: "h-4 w-4" }), children: /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsx(StatCard, { label: "Classifications", value: aiPerf.totalCls }),
          /* @__PURE__ */ jsx(StatCard, { label: "AI Replies Sent", value: aiPerf.aiReplies }),
          /* @__PURE__ */ jsx(StatCard, { label: "Human Handoffs", value: aiPerf.handoffs }),
          /* @__PURE__ */ jsx(StatCard, { label: "Owner Takeovers", value: aiPerf.takeovers }),
          /* @__PURE__ */ jsx(StatCard, { label: "Low Confidence", value: aiPerf.lowConf, warn: aiPerf.lowConf > 0 }),
          /* @__PURE__ */ jsx(StatCard, { label: "Requires Human", value: aiPerf.requiresHuman })
        ] }),
        aiPerf.totalCls > 0 && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "mb-2 text-xs font-semibold uppercase text-muted-foreground", children: "Intent Distribution" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-1.5", children: Object.entries(aiPerf.intentDist).sort(([, a], [, b]) => b - a).map(([intent, count]) => {
            const meta = INTENT_META[intent] ?? INTENT_META.other;
            const pct = Math.round(count / aiPerf.totalCls * 100);
            return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: `w-4 ${meta.color}`, children: meta.icon }),
              /* @__PURE__ */ jsx("span", { className: "text-sm flex-1", children: meta.label }),
              /* @__PURE__ */ jsx("div", { className: "w-24", children: /* @__PURE__ */ jsx(Progress, { value: pct, className: "h-2" }) }),
              /* @__PURE__ */ jsx("span", { className: "w-10 text-right text-xs text-muted-foreground", children: count }),
              /* @__PURE__ */ jsxs("span", { className: "w-10 text-right text-xs text-muted-foreground", children: [
                pct,
                "%"
              ] })
            ] }, intent);
          }) })
        ] }),
        aiPerf.totalCls === 0 && /* @__PURE__ */ jsx("p", { className: "text-center text-sm text-muted-foreground", children: "No AI classifications yet." })
      ] }) }),
      /* @__PURE__ */ jsx(Section, { title: "Reply Intelligence", icon: /* @__PURE__ */ jsx(Zap, { className: "h-4 w-4" }), children: /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx(IntelligenceGroup, { title: "Hot Leads", icon: /* @__PURE__ */ jsx(CheckCircle, { className: "h-3.5 w-3.5 text-emerald-500" }), items: fCls.filter((c) => c.interested && !c.booking_intent).slice(0, 5).map((c) => ({
          id: String(c.id),
          label: `Interested (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
          link: "/emails",
          color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        })), empty: "No hot leads in this period." }),
        /* @__PURE__ */ jsx(IntelligenceGroup, { title: "Booking Requests", icon: /* @__PURE__ */ jsx(CalendarCheck, { className: "h-3.5 w-3.5 text-orange-500" }), items: fCls.filter((c) => c.booking_intent).slice(0, 5).map((c) => ({
          id: String(c.id),
          label: `Booking (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
          link: "/emails",
          color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        })), empty: "No booking requests." }),
        /* @__PURE__ */ jsx(IntelligenceGroup, { title: "Needs Human Attention", icon: /* @__PURE__ */ jsx(Hand, { className: "h-3.5 w-3.5 text-amber-500" }), items: fCls.filter((c) => c.requires_human).slice(0, 5).map((c) => ({
          id: String(c.id),
          label: `${c.intent ?? "unknown"} (conf: ${Math.round((c.confidence ?? 0) * 100)}%)`,
          link: "/emails",
          color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        })), empty: "No items requiring human attention." }),
        /* @__PURE__ */ jsx(IntelligenceGroup, { title: "Suppressed / Unsubscribed", icon: /* @__PURE__ */ jsx(ShieldX, { className: "h-3.5 w-3.5 text-red-500" }), items: fSuppressions.slice(0, 5).map((s) => ({
          id: s.id,
          label: `${s.email} (${s.reason})`,
          link: "/leads",
          color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        })), empty: "No suppressions." })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Activity Timeline", icon: /* @__PURE__ */ jsx(Clock, { className: "h-4 w-4" }), children: fAudit.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-center text-sm text-muted-foreground", children: "No activity in this period." }) : /* @__PURE__ */ jsx("div", { className: "space-y-0 max-h-96 overflow-y-auto", children: fAudit.slice(0, 50).map((a) => {
      const icon = auditIcon(a.event);
      return /* @__PURE__ */ jsxs("div", { className: "flex gap-3 py-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx("div", { className: `flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs ${icon.color}`, children: icon.node }),
          /* @__PURE__ */ jsx("div", { className: "h-full w-px bg-border" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase text-muted-foreground", children: a.event }),
            a.campaign_id && /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs", children: "campaign" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: new Date(a.created_at).toLocaleString() })
          ] }),
          a.payload && typeof a.payload === "object" && Object.keys(a.payload).length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-0.5 flex flex-wrap gap-1", children: Object.entries(a.payload).slice(0, 3).map(([k, v]) => /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground/70", children: [
            k,
            ": ",
            String(v).slice(0, 40)
          ] }, k)) })
        ] })
      ] }, a.id);
    }) }) })
  ] });
}
function Section({
  title,
  icon,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
    /* @__PURE__ */ jsxs("h2", { className: "mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground", children: [
      icon,
      " ",
      title
    ] }),
    children
  ] });
}
function KpiCard({
  icon,
  label,
  value,
  accent,
  warn
}) {
  return /* @__PURE__ */ jsxs("div", { className: `rounded-xl border p-4 ${accent ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : warn ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : "border-border bg-card"}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
      icon,
      " ",
      label
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 text-2xl font-bold", children: value })
  ] });
}
function StatCard({
  label,
  value,
  accent,
  warn
}) {
  return /* @__PURE__ */ jsxs("div", { className: `rounded-xl border p-3 ${warn ? "border-amber-200 dark:border-amber-800 bg-amber-50/30" : "border-border bg-muted/30"}`, children: [
    /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: `mt-0.5 text-lg font-bold ${accent ? "text-emerald-600 dark:text-emerald-400" : warn ? "text-amber-600 dark:text-amber-400" : ""}`, children: value })
  ] });
}
function IntelligenceGroup({
  title,
  icon,
  items,
  empty
}) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("h3", { className: "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground", children: [
      icon,
      " ",
      title
    ] }),
    items.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground/60 pl-5", children: empty }) : /* @__PURE__ */ jsx("ul", { className: "space-y-1", children: items.map((item) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: item.link, className: "flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/50 transition-colors", children: /* @__PURE__ */ jsx(Badge, { className: `text-xs ${item.color}`, children: item.label }) }) }, item.id)) })
  ] });
}
function auditIcon(event) {
  if (event.includes("lead.created") || event.includes("lead.searched")) return {
    node: /* @__PURE__ */ jsx(Users, { className: "h-3 w-3" }),
    color: "text-blue-500"
  };
  if (event.includes("email.sent") || event.includes("email.queued")) return {
    node: /* @__PURE__ */ jsx(Send, { className: "h-3 w-3" }),
    color: "text-blue-500"
  };
  if (event.includes("email.opened")) return {
    node: /* @__PURE__ */ jsx(Eye, { className: "h-3 w-3" }),
    color: "text-blue-400"
  };
  if (event.includes("email.replied")) return {
    node: /* @__PURE__ */ jsx(Reply, { className: "h-3 w-3" }),
    color: "text-emerald-500"
  };
  if (event.includes("ai.classified")) return {
    node: /* @__PURE__ */ jsx(Bot, { className: "h-3 w-3" }),
    color: "text-purple-500"
  };
  if (event.includes("ai.reply_sent")) return {
    node: /* @__PURE__ */ jsx(Bot, { className: "h-3 w-3" }),
    color: "text-purple-500"
  };
  if (event.includes("ai.reply_generated")) return {
    node: /* @__PURE__ */ jsx(Bot, { className: "h-3 w-3" }),
    color: "text-purple-400"
  };
  if (event.includes("booking.detected")) return {
    node: /* @__PURE__ */ jsx(CalendarCheck, { className: "h-3 w-3" }),
    color: "text-orange-500"
  };
  if (event.includes("email.bounced")) return {
    node: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-3 w-3" }),
    color: "text-red-500"
  };
  if (event.includes("lead.suppressed") || event.includes("lead.unsubscribed")) return {
    node: /* @__PURE__ */ jsx(ShieldX, { className: "h-3 w-3" }),
    color: "text-red-500"
  };
  if (event.includes("human.takeover") || event.includes("agent.handoff")) return {
    node: /* @__PURE__ */ jsx(Hand, { className: "h-3 w-3" }),
    color: "text-amber-500"
  };
  if (event.includes("campaign")) return {
    node: /* @__PURE__ */ jsx(Rocket, { className: "h-3 w-3" }),
    color: "text-blue-500"
  };
  if (event.includes("loop")) return {
    node: /* @__PURE__ */ jsx(Pause, { className: "h-3 w-3" }),
    color: "text-amber-500"
  };
  if (event.includes("gmail")) return {
    node: /* @__PURE__ */ jsx(Globe, { className: "h-3 w-3" }),
    color: "text-gray-500"
  };
  if (event.includes("email.failed")) return {
    node: /* @__PURE__ */ jsx(XCircle, { className: "h-3 w-3" }),
    color: "text-red-400"
  };
  return {
    node: /* @__PURE__ */ jsx(Clock, { className: "h-3 w-3" }),
    color: "text-gray-400"
  };
}
export {
  Dashboard as component
};
//# sourceMappingURL=dashboard-kvOm2ita.js.map
