import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
});

type Email = {
  id: string; subject: string | null; body: string | null; sent_at: string;
  opened: boolean; replied: boolean; reply_sentiment: string | null;
  lead?: { name: string | null; email: string | null } | null;
};

const SENTIMENT_STYLE: Record<string, { label: string; cls: string }> = {
  INTERESTED: { label: "🔥 Interested", cls: "bg-green-500/10 text-green-500 border-green-500/30" },
  MAYBE: { label: "😴 Maybe later", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  NOT_INTERESTED: { label: "❌ Not interested", cls: "bg-red-500/10 text-red-500 border-red-500/30" },
};

function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  useEffect(() => {
    supabase.from("emails_sent")
      .select("id, subject, body, sent_at, opened, replied, reply_sentiment, lead:leads(name,email)")
      .order("sent_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setEmails((data as Email[]) ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Emails Sent</h1>
        <p className="text-sm text-muted-foreground">{emails.length} emails</p>
      </div>

      <div className="space-y-3">
        {emails.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No emails sent yet.
          </div>
        ) : emails.map((e) => (
          <div key={e.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
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
          </div>
        ))}
      </div>
    </div>
  );
}
