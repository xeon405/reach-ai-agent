import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
});

type Email = {
  id: string; subject: string | null; body: string | null; sent_at: string;
  opened: boolean; replied: boolean;
  lead?: { name: string | null; email: string | null } | null;
};

function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  useEffect(() => {
    supabase.from("emails_sent")
      .select("id, subject, body, sent_at, opened, replied, lead:leads(name,email)")
      .order("sent_at", { ascending: false })
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
            </div>
            {e.body && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{e.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
