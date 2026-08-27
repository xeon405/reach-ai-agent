import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Send, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Shield,
  MessageSquare, User, Bot, AlertTriangle, Bell, CheckCircle, XCircle,
  Hand, Clock, Eye, RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
});

type EmailRow = {
  id: string; subject: string | null; body: string | null; sent_at: string;
  opened: boolean; replied: boolean; reply_sentiment: string | null;
  ai_draft: string | null; ai_turns: number | null; ai_paused: boolean;
  autoreplied: boolean; gmail_thread_id: string | null;
  last_lead_msg_at: string | null; last_ai_msg_at: string | null;
  lead_id: string | null; campaign_id: string | null;
  lead?: {
    id: string; name: string | null; email: string | null; company: string | null;
    status: string; lifecycle: string | null; conv_mode: string | null;
  } | null;
};

type Classification = {
  id: number; lead_id: string | null; message_id: string | null;
  intent: string | null; confidence: number | null;
  interested: boolean | null; booking_intent: boolean | null;
  unsubscribe: boolean | null; sentiment: string | null;
  requires_human: boolean | null; suggested_action: string | null;
  created_at: string;
};

type OwnerAlert = {
  id: number; lead_id: string | null; kind: string; title: string;
  body: string | null; priority: string; read: boolean; created_at: string;
};

type AuditEvent = {
  id: number; lead_id: string | null; event: string;
  payload: Record<string, unknown> | null; created_at: string;
};

const INTENT_STYLE: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  interested: { label: "Interested", icon: <CheckCircle className="h-3.5 w-3.5" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  booking: { label: "Booking", icon: <Clock className="h-3.5 w-3.5" />, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  question: { label: "Question", icon: <MessageSquare className="h-3.5 w-3.5" />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  objection: { label: "Objection", icon: <ShieldAlert className="h-3.5 w-3.5" />, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  not_interested: { label: "Not Interested", icon: <XCircle className="h-3.5 w-3.5" />, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unsubscribe: { label: "Unsubscribe", icon: <XCircle className="h-3.5 w-3.5" />, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unclear: { label: "Unclear", icon: <Eye className="h-3.5 w-3.5" />, cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
  autoresponder: { label: "Auto-reply", icon: <Bot className="h-3.5 w-3.5" />, cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  other: { label: "Other", icon: <Shield className="h-3.5 w-3.5" />, cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

const LIFECYCLE_STYLE: Record<string, string> = {
  CONTACTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  REPLIED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  INTERESTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  BOOKING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  UNSUBSCRIBED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  BOUNCED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HUMAN_TAKEOVER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function EmailsPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAlerts, setShowAlerts] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [emailRes, clsRes, alertRes, auditRes] = await Promise.all([
      supabase.from("emails_sent")
        .select("id, subject, body, sent_at, opened, replied, reply_sentiment, ai_draft, ai_turns, ai_paused, autoreplied, gmail_thread_id, last_lead_msg_at, last_ai_msg_at, lead_id, campaign_id, lead:leads(id, name, email, company, status, lifecycle, conv_mode)")
        .order("sent_at", { ascending: false })
        .limit(100),
      supabase.from("ai_classifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("owner_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("audit_events")
        .select("id, lead_id, event, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setEmails((emailRes.data as EmailRow[]) ?? []);
    setClassifications((clsRes.data as Classification[]) ?? []);
    setAlerts((alertRes.data as OwnerAlert[]) ?? []);
    setAuditEvents((auditRes.data as AuditEvent[]) ?? []);
    setLoading(false);
  }

  const selectedEmail = useMemo(() => emails.find((e) => e.id === selected), [emails, selected]);

  const selectedClassifications = useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return classifications.filter((c) => c.lead_id === selectedEmail.lead_id);
  }, [classifications, selectedEmail]);

  const selectedAlerts = useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return alerts.filter((a) => a.lead_id === selectedEmail.lead_id);
  }, [alerts, selectedEmail]);

  const selectedAudit = useMemo(() => {
    if (!selectedEmail?.lead_id) return [];
    return auditEvents.filter((a) => a.lead_id === selectedEmail.lead_id);
  }, [auditEvents, selectedEmail]);

  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  async function sendReply(e: EmailRow) {
    const text = editing[e.id] ?? "";
    const usingCustom = text.trim().length > 0;
    setSending(e.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-reply", {
        body: usingCustom ? { emailId: e.id, body: text } : { emailId: e.id, regenerate: true },
      });
      if (error) throw new Error(error.message);
      toast.success(`Reply sent to ${e.lead?.email ?? "lead"}`);
      setEditing((p) => ({ ...p, [e.id]: "" }));
      await loadAll();
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setSending(null);
    }
  }

  async function markAlertRead(id: number) {
    await supabase.from("owner_alerts").update({ read: true }).eq("id", id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversations</h1>
          <p className="text-sm text-muted-foreground">
            {emails.length} threads · {emails.filter((e) => e.replied).length} replied · {emails.filter((e) => e.ai_draft).length} drafts ready · {emails.filter((e) => e.ai_paused).length} paused
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAlerts(!showAlerts)}>
            <Bell className="mr-2 h-4 w-4" />
            Alerts
            {unreadAlerts > 0 && <Badge className="ml-2 bg-destructive text-white">{unreadAlerts}</Badge>}
          </Button>
          <Button variant="ghost" size="sm" onClick={loadAll}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Alerts Panel */}
      {showAlerts && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Owner Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((a) => (
                <div key={a.id} className={`flex items-start gap-3 py-2 ${a.read ? "opacity-50" : ""}`}>
                  <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.read ? "bg-muted" : a.priority === "high" ? "bg-red-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.title}</span>
                      <Badge variant="secondary" className="text-xs">{a.kind}</Badge>
                      {!a.read && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => markAlertRead(a.id)}>
                          Mark read
                        </Button>
                      )}
                    </div>
                    {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>}
                    <span className="text-xs text-muted-foreground/60">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Email list */}
        <div className="space-y-2">
          {emails.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No emails sent yet.
            </div>
          ) : emails.map((e) => {
            const lead = e.lead;
            const latestCls = classifications.find((c) => c.lead_id === e.lead_id);
            const hasDraft = !!e.ai_draft;
            const isActive = e.replied || e.ai_turns;
            return (
              <button
                key={e.id}
                onClick={() => { setSelected(e.id); setShowAlerts(false); }}
                className={`w-full text-left rounded-2xl border p-4 transition-all hover:border-primary/40 ${
                  selected === e.id ? "border-primary bg-primary/5 shadow-glow" : "border-border bg-card shadow-card"
                } ${hasDraft ? "ring-2 ring-emerald-500/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {lead?.lifecycle && LIFECYCLE_STYLE[lead.lifecycle] ? (
                      <Badge className={`text-xs shrink-0 ${LIFECYCLE_STYLE[lead.lifecycle]}`}>{lead.lifecycle}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0">{lead?.status ?? "sent"}</Badge>
                    )}
                    <span className="font-medium text-sm truncate">{lead?.company ?? lead?.name ?? "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.ai_turns != null && e.ai_turns > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {e.ai_turns}
                      </span>
                    )}
                    {e.ai_paused && <Hand className="h-3.5 w-3.5 text-amber-500" />}
                    {hasDraft && <Bot className="h-3.5 w-3.5 text-emerald-500" />}
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{e.subject ?? "(no subject)"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{lead?.email}</span>
                  {e.replied && <span className="text-emerald-600">· Replied</span>}
                  {latestCls && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${INTENT_STYLE[latestCls.intent ?? "other"]?.cls ?? ""}`}>
                      {INTENT_STYLE[latestCls.intent ?? "other"]?.icon}
                      {INTENT_STYLE[latestCls.intent ?? "other"]?.label ?? latestCls.intent}
                    </span>
                  )}
                  <span className="ml-auto">{new Date(e.sent_at).toLocaleDateString()}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          {selectedEmail ? (
            <>
              {/* Lead info */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase text-muted-foreground">Lead</h2>
                  {selectedEmail.lead?.conv_mode && (
                    <Badge variant={
                      selectedEmail.lead.conv_mode === "HUMAN" || selectedEmail.lead.conv_mode === "AI_OVERRIDDEN" ? "destructive"
                        : selectedEmail.lead.conv_mode === "PAUSED" ? "secondary"
                        : "default"
                    }>
                      {selectedEmail.lead.conv_mode === "HUMAN" ? "Owner taking over" :
                       selectedEmail.lead.conv_mode === "AI_OVERRIDDEN" ? "Needs owner" :
                       selectedEmail.lead.conv_mode === "PAUSED" ? "Paused" :
                       selectedEmail.lead.conv_mode === "AI_AUTOPILOT" ? "AI Autopilot" :
                       selectedEmail.lead.conv_mode}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> {selectedEmail.lead?.name ?? "—"}</div>
                  <div><span className="text-muted-foreground">Email:</span> {selectedEmail.lead?.email ?? "—"}</div>
                  <div><span className="text-muted-foreground">Company:</span> {selectedEmail.lead?.company ?? "—"}</div>
                  <div><span className="text-muted-foreground">Lifecycle:</span> {selectedEmail.lead?.lifecycle ?? "—"}</div>
                </div>
                {/* Takeover status */}
                {(selectedEmail.lead?.conv_mode === "HUMAN" || selectedEmail.lead?.conv_mode === "AI_OVERRIDDEN") && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400">
                    {selectedEmail.lead.conv_mode === "HUMAN"
                      ? "AI has stopped replying — you took over this conversation manually."
                      : "Booking intent detected but no website link configured. AI stepped back — reply from your Gmail."}
                  </div>
                )}
              </div>

              {/* Conversation timeline */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
                <h2 className="text-sm font-semibold uppercase text-muted-foreground">Conversation</h2>
                <div className="space-y-3">
                  {/* Original email */}
                  <TimelineEvent
                    icon={<Send className="h-3.5 w-3.5" />}
                    label="You sent"
                    time={selectedEmail.sent_at}
                    color="text-blue-500"
                  >
                    <p className="text-sm font-medium">{selectedEmail.subject ?? "(no subject)"}</p>
                    {selectedEmail.body && <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{selectedEmail.body}</p>}
                  </TimelineEvent>

                  {/* AI reply (if any) */}
                  {selectedEmail.ai_draft && (
                    <TimelineEvent
                      icon={<Bot className="h-3.5 w-3.5" />}
                      label={selectedEmail.autoreplied ? "AI replied" : "AI drafted"}
                      time={selectedEmail.last_ai_msg_at ?? undefined}
                      color="text-emerald-500"
                    >
                      <p className="text-sm whitespace-pre-wrap">{selectedEmail.ai_draft}</p>
                      {selectedEmail.ai_turns != null && selectedEmail.ai_turns > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">Turn {selectedEmail.ai_turns}/3</p>
                      )}
                    </TimelineEvent>
                  )}

                  {/* Lead reply (if any) */}
                  {selectedEmail.replied && selectedEmail.last_lead_msg_at && (
                    <TimelineEvent
                      icon={<User className="h-3.5 w-3.5" />}
                      label={`${selectedEmail.lead?.name ?? "Lead"} replied`}
                      time={selectedEmail.last_lead_msg_at}
                      color="text-orange-500"
                    >
                      {selectedClassifications.length > 0 && (
                        <div className="space-y-1">
                          {selectedClassifications.slice(0, 5).map((c) => (
                            <div key={c.id} className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${INTENT_STYLE[c.intent ?? "other"]?.cls ?? ""}`}>
                                {INTENT_STYLE[c.intent ?? "other"]?.icon}
                                {INTENT_STYLE[c.intent ?? "other"]?.label ?? c.intent}
                              </span>
                              {c.confidence != null && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(c.confidence * 100)}%
                                </span>
                              )}
                              {c.requires_human && <Badge variant="destructive" className="text-xs">Needs human</Badge>}
                              <span className="text-xs text-muted-foreground/60">{new Date(c.created_at).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TimelineEvent>
                  )}

                  {/* Audit trail */}
                  {selectedAudit.length > 0 && (
                    <TimelineEvent
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Events"
                      color="text-gray-500"
                    >
                      <div className="space-y-1">
                        {selectedAudit.slice(0, 10).map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-xs">{a.event}</Badge>
                            <span className="text-muted-foreground/60">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </TimelineEvent>
                  )}
                </div>
              </div>

              {/* Send reply */}
              {selectedEmail.replied && !selectedEmail.ai_paused && selectedEmail.lead?.conv_mode !== "HUMAN" && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-card space-y-3">
                  <h2 className="text-sm font-semibold text-emerald-600">Send Reply</h2>
                  <textarea
                    value={editing[selectedEmail.id] ?? selectedEmail.ai_draft ?? ""}
                    onChange={(ev) => setEditing((p) => ({ ...p, [selectedEmail.id]: ev.target.value }))}
                    rows={5}
                    placeholder="Type a custom reply or edit the AI draft..."
                    className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    onClick={() => sendReply(selectedEmail)}
                    disabled={sending === selectedEmail.id}
                    className="w-full bg-gradient-primary"
                  >
                    {sending === selectedEmail.id
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                      : <><Send className="mr-2 h-4 w-4" /> Send from my Gmail</>}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    This marks you as the conversation owner. AI will stop auto-replying.
                  </p>
                </div>
              )}

              {/* Takeover badge */}
              {selectedEmail.ai_paused && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-center">
                  <Hand className="h-5 w-5 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">AI Paused</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEmail.lead?.conv_mode === "AI_OVERRIDDEN"
                      ? "Booking detected without a website link. Reply from your Gmail."
                      : "Owner took over or turn budget exhausted. AI is standing down."}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>Select a conversation to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ icon, label, time, color, children }: {
  icon: React.ReactNode; label: string; time?: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background ${color}`}>
          {icon}
        </div>
        <div className="h-full w-px bg-border" />
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
          {time && <span className="text-xs text-muted-foreground/60">{new Date(time).toLocaleString()}</span>}
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
