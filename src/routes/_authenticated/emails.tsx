import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
});

type Email = {
  id: string; subject: string | null; body: string | null; sent_at: string;
  opened: boolean; replied: boolean; reply_sentiment: string | null; ai_draft: string | null;
  lead?: { name: string | null; email: string | null } | null;
};

const SENTIMENT_STYLE: Record<string, { label: string; cls: string }> = {
  INTERESTED: { label: "🔥 Interested", cls: "bg-green-500/10 text-emerald-700 dark:text-green-400 border-current" },
  MAYBE: { label: "😴 Maybe later", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  NOT_INTERESTED: { label: "❌ Not interested", cls: "bg-red-500/10 text-red-500 border-red-500/30" },
};

function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase.from("emails_sent")
      .select("id, subject, body, sent_at, opened, replied, reply_sentiment, ai_draft, lead:leads(name,email)")
      .order("sent_at", { ascending: false })
      .limit(200);
    setEmails((data as Email[]) ?? []);
  }

  async function sendReply(e: Email) {
    const text = editing[e.id] ?? e.ai_draft ?? "";
    if (!text.trim()) return;
    setSending(e.id);
    try {
      const { error } = await supabase.functions.invoke("send-reply", {
        body: { emailId: e.id, body: text },
      });
      if (error) throw new Error(error.message);
      toast.success(`Reply sent to ${e.lead?.email ?? "lead"} ✅`);
      setEditing((p) => ({ ...p, [e.id]: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Emails Sent</h1>
        <p className="text-sm text-muted-foreground">
          {emails.length} emails · {emails.filter((e) => e.ai_draft).length} AI replies waiting to send
        </p>
      </div>

      <div className="space-y-3">
        {emails.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No emails sent yet.
          </div>
        ) : emails.map((e) => (
          <div key={e.id} className={`rounded-2xl border bg-card p-5 shadow-card ${e.ai_draft ? "border-green-500/40" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{e.subject ?? "(no subject)"}</div>
              <div className="text-xs text-muted-foreground">{new Date(e.sent_at).toLocaleString()}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              To {e.lead?.name ?? e.lead?.email ?? "lead"}
              {e.opened && <span className="ml-2 text-primary">· Opened</span>}
              {e.replied && <span className="ml-2 text-success">· Replied</span>}
              {e.reply_sentiment && SENTIMENT_STYLE[e.reply_sentiment] && (
                <span className={`ml-2 inline-block rounded-full border px-2 py-0.5 font-medium ${SENTIMENT_STYLE[e.reply_sentiment].cls}`}>
                  {SENTIMENT_STYLE[e.reply_sentiment].label}
                </span>
              )}
            </div>
            {e.body && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{e.body}</p>}

            {e.ai_draft && (
              <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success">
                  🤖 AI-drafted reply — ready to send
                </div>
                <textarea
                  value={editing[e.id] ?? e.ai_draft}
                  onChange={(ev) => setEditing((p) => ({ ...p, [e.id]: ev.target.value }))}
                  rows={6}
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  onClick={() => sendReply(e)}
                  disabled={sending === e.id}
                  className="mt-3 w-full bg-primary sm:w-auto"
                >
                  {sending === e.id
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                    : <><Send className="mr-2 h-4 w-4" /> Send from my Gmail</>}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
