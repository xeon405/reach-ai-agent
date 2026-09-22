import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { toast } from "sonner";
import { Loader2, Bell, RefreshCw, MessageSquare, Hand, Bot, Send, User, Clock, Shield, Eye, XCircle, ShieldAlert, CheckCircle } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
const INTENT_STYLE = {
  interested: {
    label: "Interested",
    icon: /* @__PURE__ */ jsx(CheckCircle, { className: "h-3.5 w-3.5" }),
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
  },
  booking: {
    label: "Booking",
    icon: /* @__PURE__ */ jsx(Clock, { className: "h-3.5 w-3.5" }),
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
  },
  question: {
    label: "Question",
    icon: /* @__PURE__ */ jsx(MessageSquare, { className: "h-3.5 w-3.5" }),
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
  },
  objection: {
    label: "Objection",
    icon: /* @__PURE__ */ jsx(ShieldAlert, { className: "h-3.5 w-3.5" }),
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
  },
  not_interested: {
    label: "Not Interested",
    icon: /* @__PURE__ */ jsx(XCircle, { className: "h-3.5 w-3.5" }),
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  },
  unsubscribe: {
    label: "Unsubscribe",
    icon: /* @__PURE__ */ jsx(XCircle, { className: "h-3.5 w-3.5" }),
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  },
  unclear: {
    label: "Unclear",
    icon: /* @__PURE__ */ jsx(Eye, { className: "h-3.5 w-3.5" }),
    cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
  },
  autoresponder: {
    label: "Auto-reply",
    icon: /* @__PURE__ */ jsx(Bot, { className: "h-3.5 w-3.5" }),
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
  },
  other: {
    label: "Other",
    icon: /* @__PURE__ */ jsx(Shield, { className: "h-3.5 w-3.5" }),
    cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
  }
};
const LIFECYCLE_STYLE = {
  CONTACTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  REPLIED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  INTERESTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  BOOKING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  UNSUBSCRIBED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  BOUNCED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HUMAN_TAKEOVER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
};
function EmailsPage() {
  const [emails, setEmails] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState({});
  const [sending, setSending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAlerts, setShowAlerts] = useState(false);
  useEffect(() => {
    loadAll();
  }, []);
  async function loadAll() {
    setLoading(true);
    try {
      const [emailRes, clsRes, alertRes, auditRes] = await Promise.all([supabase.from("emails_sent").select("id, subject, body, sent_at, opened, replied, reply_sentiment, ai_draft, ai_turns, ai_paused, autoreplied, gmail_thread_id, last_lead_msg_at, last_ai_msg_at, lead_id, campaign_id, lead:leads(id, name, email, company, status, lifecycle, conv_mode)").order("sent_at", {
        ascending: false
      }).limit(100), supabase.from("ai_classifications").select("*").order("created_at", {
        ascending: false
      }).limit(200), supabase.from("owner_alerts").select("*").order("created_at", {
        ascending: false
      }).limit(100), supabase.from("audit_events").select("id, lead_id, event, payload, created_at").order("created_at", {
        ascending: false
      }).limit(200)]);
      setEmails(emailRes.data ?? []);
      setClassifications(clsRes.data ?? []);
      setAlerts(alertRes.data ?? []);
      setAuditEvents(auditRes.data ?? []);
    } catch (e) {
      console.error("emails: failed to load inbox", e);
    } finally {
      setLoading(false);
    }
  }
  const selectedEmail = useMemo(() => emails.find((e) => e.id === selected), [emails, selected]);
  const selectedClassifications = useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return classifications.filter((c) => c.lead_id === selectedEmail.lead_id);
  }, [classifications, selectedEmail]);
  useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return alerts.filter((a) => a.lead_id === selectedEmail.lead_id);
  }, [alerts, selectedEmail]);
  const selectedAudit = useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return auditEvents.filter((a) => a.lead_id === selectedEmail.lead_id);
  }, [auditEvents, selectedEmail]);
  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);
  async function sendReply(e) {
    const text = editing[e.id] ?? "";
    const usingCustom = text.trim().length > 0;
    setSending(e.id);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-reply", {
        body: usingCustom ? {
          emailId: e.id,
          body: text
        } : {
          emailId: e.id,
          regenerate: true
        }
      });
      if (error) throw new Error(error.message);
      toast.success(`Reply sent to ${e.lead?.email ?? "lead"}`);
      setEditing((p) => ({
        ...p,
        [e.id]: ""
      }));
      await loadAll();
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setSending(null);
    }
  }
  async function markAlertRead(id) {
    await supabase.from("owner_alerts").update({
      read: true
    }).eq("id", id);
    setAlerts((prev) => prev.map((a) => a.id === id ? {
      ...a,
      read: true
    } : a));
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsx(Loader2, { className: "h-6 w-6 animate-spin text-primary" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Conversations" }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
          emails.length,
          " threads · ",
          emails.filter((e) => e.replied).length,
          " replied · ",
          emails.filter((e) => e.ai_draft).length,
          " drafts ready · ",
          emails.filter((e) => e.ai_paused).length,
          " paused"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: () => setShowAlerts(!showAlerts), children: [
          /* @__PURE__ */ jsx(Bell, { className: "mr-2 h-4 w-4" }),
          "Alerts",
          unreadAlerts > 0 && /* @__PURE__ */ jsx(Badge, { className: "ml-2 bg-destructive text-white", children: unreadAlerts })
        ] }),
        /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: loadAll, children: /* @__PURE__ */ jsx(RefreshCw, { className: "h-4 w-4" }) })
      ] })
    ] }),
    showAlerts && /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-4 shadow-card space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold uppercase text-muted-foreground", children: "Owner Alerts" }),
      alerts.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No alerts yet." }) : /* @__PURE__ */ jsx("div", { className: "divide-y divide-border", children: alerts.map((a) => /* @__PURE__ */ jsxs("div", { className: `flex items-start gap-3 py-2 ${a.read ? "opacity-50" : ""}`, children: [
        /* @__PURE__ */ jsx("div", { className: `mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.read ? "bg-muted" : a.priority === "high" ? "bg-red-500" : "bg-blue-500"}` }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: a.title }),
            /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs", children: a.kind }),
            !a.read && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", className: "h-6 text-xs", onClick: () => markAlertRead(a.id), children: "Mark read" })
          ] }),
          a.body && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground mt-0.5 line-clamp-2", children: a.body }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: new Date(a.created_at).toLocaleString() })
        ] })
      ] }, a.id)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_420px]", children: [
      /* @__PURE__ */ jsx("div", { className: "space-y-2", children: emails.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground", children: "No emails sent yet." }) : emails.map((e) => {
        const lead = e.lead;
        const latestCls = classifications.find((c) => c.lead_id === e.lead_id);
        const hasDraft = !!e.ai_draft;
        e.replied || e.ai_turns;
        return /* @__PURE__ */ jsxs("button", { onClick: () => {
          setSelected(e.id);
          setShowAlerts(false);
        }, className: `w-full text-left rounded-2xl border p-4 transition-all hover:border-primary/40 ${selected === e.id ? "border-primary bg-primary/5 shadow-glow" : "border-border bg-card shadow-card"} ${hasDraft ? "ring-2 ring-emerald-500/30" : ""}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
              lead?.lifecycle && LIFECYCLE_STYLE[lead.lifecycle] ? /* @__PURE__ */ jsx(Badge, { className: `text-xs shrink-0 ${LIFECYCLE_STYLE[lead.lifecycle]}`, children: lead.lifecycle }) : /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs shrink-0", children: lead?.status ?? "sent" }),
              /* @__PURE__ */ jsx("span", { className: "font-medium text-sm truncate", children: lead?.company ?? lead?.name ?? "Unknown" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
              e.ai_turns != null && e.ai_turns > 0 && /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground flex items-center gap-1", children: [
                /* @__PURE__ */ jsx(MessageSquare, { className: "h-3 w-3" }),
                " ",
                e.ai_turns
              ] }),
              e.ai_paused && /* @__PURE__ */ jsx(Hand, { className: "h-3.5 w-3.5 text-amber-500" }),
              hasDraft && /* @__PURE__ */ jsx(Bot, { className: "h-3.5 w-3.5 text-emerald-500" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-1 flex items-center gap-2 text-xs text-muted-foreground", children: /* @__PURE__ */ jsx("span", { className: "truncate", children: e.subject ?? "(no subject)" }) }),
          /* @__PURE__ */ jsxs("div", { className: "mt-1 flex items-center gap-2 text-xs text-muted-foreground", children: [
            /* @__PURE__ */ jsx("span", { children: lead?.email }),
            e.replied && /* @__PURE__ */ jsx("span", { className: "text-emerald-600", children: "· Replied" }),
            latestCls && /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${INTENT_STYLE[latestCls.intent ?? "other"]?.cls ?? ""}`, children: [
              INTENT_STYLE[latestCls.intent ?? "other"]?.icon,
              INTENT_STYLE[latestCls.intent ?? "other"]?.label ?? latestCls.intent
            ] }),
            /* @__PURE__ */ jsx("span", { className: "ml-auto", children: new Date(e.sent_at).toLocaleDateString() })
          ] })
        ] }, e.id);
      }) }),
      /* @__PURE__ */ jsx("div", { className: "space-y-4", children: selectedEmail ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-4 shadow-card space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold uppercase text-muted-foreground", children: "Lead" }),
            selectedEmail.lead?.conv_mode && /* @__PURE__ */ jsx(Badge, { variant: selectedEmail.lead.conv_mode === "HUMAN" || selectedEmail.lead.conv_mode === "AI_OVERRIDDEN" ? "destructive" : selectedEmail.lead.conv_mode === "PAUSED" ? "secondary" : "default", children: selectedEmail.lead.conv_mode === "HUMAN" ? "🤝 Owner taking over" : selectedEmail.lead.conv_mode === "AI_OVERRIDDEN" ? "⚠️ Needs owner" : selectedEmail.lead.conv_mode === "PAUSED" ? "⏸️ Paused" : selectedEmail.lead.conv_mode === "AI_AUTOPILOT" ? "🤖 AI Autopilot" : selectedEmail.lead.conv_mode })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "Name:" }),
              " ",
              selectedEmail.lead?.name ?? "—"
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "Email:" }),
              " ",
              selectedEmail.lead?.email ?? "—"
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "Company:" }),
              " ",
              selectedEmail.lead?.company ?? "—"
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "Lifecycle:" }),
              " ",
              selectedEmail.lead?.lifecycle ?? "—"
            ] })
          ] }),
          (selectedEmail.lead?.conv_mode === "HUMAN" || selectedEmail.lead?.conv_mode === "AI_OVERRIDDEN") && /* @__PURE__ */ jsx("div", { className: "rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400", children: selectedEmail.lead.conv_mode === "HUMAN" ? "AI has stopped replying — you took over this conversation manually." : "Booking intent detected but no website link configured. AI stepped back — reply from your Gmail." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-4 shadow-card space-y-3", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold uppercase text-muted-foreground", children: "Conversation" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs(TimelineEvent, { icon: /* @__PURE__ */ jsx(Send, { className: "h-3.5 w-3.5" }), label: "You sent", time: selectedEmail.sent_at, color: "text-blue-500", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-medium", children: selectedEmail.subject ?? "(no subject)" }),
              selectedEmail.body && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground line-clamp-3 mt-1", children: selectedEmail.body })
            ] }),
            selectedEmail.ai_draft && /* @__PURE__ */ jsxs(TimelineEvent, { icon: /* @__PURE__ */ jsx(Bot, { className: "h-3.5 w-3.5" }), label: selectedEmail.autoreplied ? "AI replied" : "AI drafted", time: selectedEmail.last_ai_msg_at ?? void 0, color: "text-emerald-500", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm whitespace-pre-wrap", children: selectedEmail.ai_draft }),
              selectedEmail.ai_turns != null && selectedEmail.ai_turns > 0 && /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: [
                "Turn ",
                selectedEmail.ai_turns,
                "/3"
              ] })
            ] }),
            selectedEmail.replied && selectedEmail.last_lead_msg_at && /* @__PURE__ */ jsx(TimelineEvent, { icon: /* @__PURE__ */ jsx(User, { className: "h-3.5 w-3.5" }), label: `${selectedEmail.lead?.name ?? "Lead"} replied`, time: selectedEmail.last_lead_msg_at, color: "text-orange-500", children: selectedClassifications.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-1", children: selectedClassifications.slice(0, 5).map((c) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
              /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${INTENT_STYLE[c.intent ?? "other"]?.cls ?? ""}`, children: [
                INTENT_STYLE[c.intent ?? "other"]?.icon,
                INTENT_STYLE[c.intent ?? "other"]?.label ?? c.intent
              ] }),
              c.confidence != null && /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground", children: [
                Math.round(c.confidence * 100),
                "%"
              ] }),
              c.requires_human && /* @__PURE__ */ jsx(Badge, { variant: "destructive", className: "text-xs", children: "Needs human" }),
              /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: new Date(c.created_at).toLocaleString() })
            ] }, c.id)) }) }),
            selectedAudit.length > 0 && /* @__PURE__ */ jsx(TimelineEvent, { icon: /* @__PURE__ */ jsx(Clock, { className: "h-3.5 w-3.5" }), label: "Events", color: "text-gray-500", children: /* @__PURE__ */ jsx("div", { className: "space-y-1", children: selectedAudit.slice(0, 10).map((a) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs", children: [
              /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs", children: a.event }),
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground/60", children: new Date(a.created_at).toLocaleString() })
            ] }, a.id)) }) })
          ] })
        ] }),
        selectedEmail.replied && !selectedEmail.ai_paused && selectedEmail.lead?.conv_mode !== "HUMAN" && /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-card space-y-3", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold text-emerald-600", children: "Send Reply" }),
          /* @__PURE__ */ jsx("textarea", { value: editing[selectedEmail.id] ?? selectedEmail.ai_draft ?? "", onChange: (ev) => setEditing((p) => ({
            ...p,
            [selectedEmail.id]: ev.target.value
          })), rows: 5, placeholder: "Type a custom reply or edit the AI draft...", className: "w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" }),
          /* @__PURE__ */ jsx(Button, { onClick: () => sendReply(selectedEmail), disabled: sending === selectedEmail.id, className: "w-full bg-gradient-primary", children: sending === selectedEmail.id ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
            " Sending..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Send, { className: "mr-2 h-4 w-4" }),
            " Send from my Gmail"
          ] }) }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground text-center", children: "This marks you as the conversation owner. AI will stop auto-replying." })
        ] }),
        selectedEmail.ai_paused && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-center", children: [
          /* @__PURE__ */ jsx(Hand, { className: "h-5 w-5 text-amber-500 mx-auto mb-2" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-amber-700 dark:text-amber-400", children: "AI Paused" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: selectedEmail.lead?.conv_mode === "AI_OVERRIDDEN" ? "Booking detected without a website link. Reply from your Gmail." : "Owner took over or turn budget exhausted. AI is standing down." })
        ] })
      ] }) : /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground", children: [
        /* @__PURE__ */ jsx(MessageSquare, { className: "h-8 w-8 mx-auto mb-3 opacity-30" }),
        /* @__PURE__ */ jsx("p", { children: "Select a conversation to view details" })
      ] }) })
    ] })
  ] });
}
function TimelineEvent({
  icon,
  label,
  time,
  color,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
      /* @__PURE__ */ jsx("div", { className: `flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background ${color}`, children: icon }),
      /* @__PURE__ */ jsx("div", { className: "h-full w-px bg-border" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0 pb-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase text-muted-foreground", children: label }),
        time && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: new Date(time).toLocaleString() })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mt-1", children })
    ] })
  ] });
}
export {
  EmailsPage as component
};
//# sourceMappingURL=emails-B6E502ma.js.map
