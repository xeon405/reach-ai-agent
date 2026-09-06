import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lead-edit/$leadId")({
  component: LeadEditPage,
});

type Campaign = { id: string; name: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LeadEditPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    </div>
  );
}
