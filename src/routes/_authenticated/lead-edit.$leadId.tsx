import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Eraser } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/lead-edit/$leadId")({
  component: LeadEditPage,
});

type Campaign = { id: string; name: string };

type RowCounts = Record<string, number>;
type ErasureResult = { forgot: boolean; suppressed?: boolean; row_counts: RowCounts };

const COUNT_LABELS: Array<[string, string]> = [
  ["thread_memory", "Thread memories"],
  ["ai_classifications", "AI classifications"],
  ["owner_alerts", "Owner alerts"],
  ["emails_sent", "Emails"],
  ["meetings", "Meetings"],
  ["tracking_events", "Tracking events"],
  ["audit_events", "Audit events"],
  ["ai_spend_ledger", "Spend ledger rows"],
  ["lead_score", "Lead scores"],
  ["send_queue_cancelled", "Queued sends cancelled"],
  ["email_threads_tombstoned", "Threads tombstoned"],
  ["saved_businesses_purged", "Saved businesses purged"],
];

async function invokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  if (typeof ctx?.json === "function") {
    const payload = await ctx.json().catch(() => null);
    if (payload?.error) return payload.error;
  }
  return (error as { message?: string })?.message ?? "Request failed";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LeadEditPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<ErasureResult | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState({
    name: "", email: "", company: "", job_title: "", country: "", campaign_id: "", status: "new",
  });

  useEffect(() => {
    (async () => {
      const [{ data: lead }, { data: camps }] = await Promise.all([
        supabase.from("leads").select("*").eq("id", leadId).single(),
        supabase.from("campaigns").select("id, name"),
      ]);
      setCampaigns((camps as Campaign[]) ?? []);
      if (lead) {
        setForm({
          name: lead.name ?? "",
          email: lead.email ?? "",
          company: lead.company ?? "",
          job_title: lead.job_title ?? "",
          country: lead.country ?? "",
          campaign_id: lead.campaign_id ?? "",
          status: lead.status ?? "new",
        });
      }
      setLoading(false);
    })();
  }, [leadId]);

  async function save() {
    if (!form.email || !EMAIL_RE.test(form.email)) {
      toast.error("Valid email is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").update({
      name: form.name || null,
      email: form.email,
      company: form.company || null,
      job_title: form.job_title || null,
      country: form.country || null,
      campaign_id: form.campaign_id || null,
      status: form.status,
    }).eq("id", leadId);
    setSaving(false);
    if (error) toast.error("Could not update lead");
    else {
      toast.success("Lead updated");
      navigate({ to: "/leads" });
    }
  }

  async function runForget() {
    setForgetting(true);
    const { data, error } = await supabase.functions.invoke("lead-erasure", {
      body: { action: "forget", leadId },
    });
    setForgetting(false);
    if (error) {
      toast.error(await invokeError(error));
      setForgetOpen(false);
      return;
    }
    if (!data?.row_counts) {
      toast.error("Forget failed");
      setForgetOpen(false);
      return;
    }
    setForgetOpen(false);
    setResult(data as ErasureResult);
    setResultOpen(true);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/leads" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Lead</h1>
          <p className="text-sm text-muted-foreground">{form.email}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <Input placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email *</label>
            <Input placeholder="email@example.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Company</label>
            <Input placeholder="Company name" value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Job Title</label>
            <Input placeholder="Marketing Manager" value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Country</label>
            <select
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Country</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="India">India</option>
              <option value="Germany">Germany</option>
              <option value="France">France</option>
              <option value="Spain">Spain</option>
              <option value="Italy">Italy</option>
              <option value="Netherlands">Netherlands</option>
              <option value="Saudi Arabia">Saudi Arabia</option>
              <option value="UAE">UAE</option>
              <option value="Egypt">Egypt</option>
              <option value="Pakistan">Pakistan</option>
              <option value="Singapore">Singapore</option>
              <option value="Brazil">Brazil</option>
              <option value="Turkey">Turkey</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="emailed">Contacted</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">Campaign</label>
            <Select value={form.campaign_id || "none"} onValueChange={(v) => setForm({ ...form, campaign_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Assign to campaign" /></SelectTrigger>
              <SelectContent className="max-w-[400px]">
                <SelectItem value="none">No campaign</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="block truncate">{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={() => navigate({ to: "/leads" })}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">
            {saving ? (
              <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save Changes</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
        <div>
          <h2 className="text-base font-bold text-destructive">Danger zone</h2>
          <p className="text-sm text-muted-foreground">
            Erases every trace of this lead's history from the AI layer — memories, emails,
            meetings, alerts, tracking, spend ledger, queued sends, and the inferred
            saved-business email. The lead row stays; this is irreversible.
          </p>
        </div>
        <AlertDialog open={forgetOpen} onOpenChange={setForgetOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Eraser className="mr-2 h-4 w-4" /> Forget this lead
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Forget this lead? This cannot be undone.</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently erases the lead's AI history: thread memories, AI classifications,
                owner alerts, all emails and meetings, tracking events, spend ledger rows,
                lead score, and any queued sends (cancelled). Threads are tombstoned and the
                inferred saved-business email attribution is purged.{" "}
                <span className="font-semibold">The lead row itself is kept</span> — only its
                history goes. No suppression (PECR opt-out) is applied; that is a separate,
                explicit action.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={forgetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="destructive"
                  disabled={forgetting}
                  onClick={(e) => { e.preventDefault(); void runForget(); }}
                >
                  {forgetting ? "Erasing…" : "Erase memory"}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <AlertDialog open={resultOpen} onOpenChange={setResultOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Memory erased</AlertDialogTitle>
            <AlertDialogDescription>
              The lead row is kept. Here is exactly what was erased:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 font-mono text-sm">
            {COUNT_LABELS.filter(([k]) => (result?.row_counts?.[k] ?? 0) > 0).map(([k, label]) => (
              <div key={k} className="flex justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">{result?.row_counts?.[k] ?? 0}</span>
              </div>
            ))}
            {COUNT_LABELS.every(([k]) => (result?.row_counts?.[k] ?? 0) === 0) && (
              <div className="text-muted-foreground">Nothing to erase — no history found for this lead.</div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResultOpen(false)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
