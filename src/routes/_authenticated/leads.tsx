import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Download, Search, Plus, Upload, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string; name: string | null; company: string | null; job_title: string | null;
  country: string | null; email: string | null; status: string; created_at: string;
  campaign_id: string | null;
};

type Campaign = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  emailed: "bg-secondary text-secondary-foreground",
  replied: "bg-success/15 text-success",
  won: "bg-success text-success-foreground font-semibold",
  booked: "bg-warning/15 text-warning",
};

const PIPELINE_STATUSES = ["new", "emailed", "replied", "won"] as const;
const SYSTEM_STATUSES = ["bounced", "unsubscribed", "invalid", "skipped"];

function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [q, setQ] = useState("");

  async function setLeadStatus(id: string, next: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)));
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", id);
    if (error) {
      toast.error("Could not update status");
      void load();
    } else if (next === "won") {
      toast.success("🏆 Marked as won — great job!");
    }
  }
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", company: "", job_title: "", country: "", campaign_id: ""
  });
  const [bulkText, setBulkText] = useState("");
  const [findForm, setFindForm] = useState({
    jobTitle: "Marketing Manager",
    industry: "",
    country: "United States",
    limit: "25",
    campaign_id: "",
  });

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500);
    setLeads((data as Lead[]) ?? []);
    const { data: camps } = await supabase.from("campaigns").select("id, name");
    setCampaigns((camps as Campaign[]) ?? []);
  }

  async function addLead() {
    if (!form.email && !bulkText.trim()) { toast.error("Email is required"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    // Bulk import: one lead per line — "email" or "name, email" or "name, email, company"
    if (bulkText.trim()) {
      const rows = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 500);
      const inserts = rows.map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const email = parts.find((p) => p.includes("@")) ?? "";
        const rest = parts.filter((p) => p !== email);
        return {
          user_id: u.user!.id,
          name: rest[0] || null,
          email,
          company: rest[1] || null,
          campaign_id: form.campaign_id || null,
          status: "new",
        };
      }).filter((r) => r.email.includes("@"));
      if (inserts.length === 0) { toast.error("No valid emails found"); return; }
      const { error } = await supabase.from("leads").insert(inserts);
      if (error) { toast.error(error.message); return; }
      toast.success(`${inserts.length} leads imported!`);
      setBulkText("");
      setForm({ ...form, email: "" });
      setAddOpen(false);
      load();
      return;
    }

    const { error } = await supabase.from("leads").insert({
      user_id: u.user.id,
      name: form.name || null,
      email: form.email,
      company: form.company || null,
      job_title: form.job_title || null,
      country: form.country || null,
      campaign_id: form.campaign_id || null,
      status: "new",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Lead added!");
    setForm({ name: "", email: "", company: "", job_title: "", country: "", campaign_id: "" });
    setAddOpen(false);
    load();
  }

  async function findLeads() {
    if (!findForm.jobTitle) { toast.error("Job title is required"); return; }

    setFinding(true);
    toast.info("AI is searching for leads...");

    try {
      const { data, error } = await supabase.functions.invoke("find-leads", {
        body: {
          campaignId: findForm.campaign_id || null,
          jobTitle: findForm.jobTitle,
          country: findForm.country || null,
          limit: parseInt(findForm.limit),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success(`✅ Found ${data.found} leads, added ${data.added} new ones!`);
      setFindOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to find leads");
    } finally {
      setFinding(false);
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const text = await file.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      return obj;
    });

    let imported = 0;
    for (const row of rows) {
      const email = row["email"] || row["email address"] || row["e-mail"];
      if (!email) continue;
      await supabase.from("leads").insert({
        user_id: u.user.id,
        email,
        name: row["name"] || row["full name"] || null,
        company: row["company"] || row["organization"] || null,
        job_title: row["job title"] || row["title"] || row["position"] || null,
        country: row["country"] || null,
        status: "new",
      });
      imported++;
    }

    toast.success(`Imported ${imported} leads!`);
    setImporting(false);
    load();
    e.target.value = "";
  }

  const countries = useMemo(() => Array.from(new Set(leads.map((l) => l.country).filter(Boolean))) as string[], [leads]);

  const filtered = leads.filter((l) => {
    const matchQ = !q || [l.name, l.company, l.email].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
    const matchC = country === "all" || l.country === country;
    const matchS = status === "all" || l.status === status;
    return matchQ && matchC && matchS;
  });

  function exportCsv() {
    const header = ["Name", "Company", "Job Title", "Country", "Email", "Status", "Date Added"];
    const rows = filtered.map((l) => [l.name, l.company, l.job_title, l.country, l.email, l.status, l.created_at]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} leads</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <label>
            <Button variant="outline" disabled={importing} asChild>
              <span><Upload className="mr-2 h-4 w-4" /> {importing ? "Importing..." : "Import CSV"}</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
          </label>

          {/* AI Find Leads */}
          <Dialog open={findOpen} onOpenChange={setFindOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-primary text-primary">
                <Sparkles className="mr-2 h-4 w-4" /> Find Leads with AI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>✨ AI Lead Finder</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">
                Searches open business directories for real businesses with public email
                addresses — 100% free, no credits needed. Best niches: dentists, doctors,
                gyms, restaurants, salons, lawyers, real estate, insurance, accountants,
                vets, schools, car services, construction, photographers, IT agencies.
              </p>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-sm font-medium">Business Type *</label>
                  <Input placeholder="e.g. dentist, gym, restaurant, salon, lawyer" value={findForm.jobTitle}
                    onChange={(e) => setFindForm({ ...findForm, jobTitle: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Country</label>
                  <Input placeholder="e.g. United States, United Kingdom" value={findForm.country}
                    onChange={(e) => setFindForm({ ...findForm, country: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Number of leads</label>
                  <Select value={findForm.limit} onValueChange={(v) => setFindForm({ ...findForm, limit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 leads</SelectItem>
                      <SelectItem value="25">25 leads</SelectItem>
                      <SelectItem value="50">50 leads</SelectItem>
                      <SelectItem value="100">100 leads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Assign to campaign (optional)</label>
                  <Select value={findForm.campaign_id} onValueChange={(v) => setFindForm({ ...findForm, campaign_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={findLeads} disabled={finding} className="w-full bg-gradient-primary">
                  {finding
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</>
                    : <><Sparkles className="mr-2 h-4 w-4" /> Find Leads</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary shadow-glow">
                <Plus className="mr-2 h-4 w-4" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Full name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Email address *" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input placeholder="Company" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })} />
                <Input placeholder="Job title" value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
                <Input placeholder="Country" value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })} />
                <Select value={form.campaign_id} onValueChange={(v) => setForm({ ...form, campaign_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to campaign (optional)" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="rounded-xl border border-dashed border-border p-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    📥 Bulk import — paste a list (up to 500)
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={5}
                    placeholder={"john@acme.com\nSarah Miller, sarah@bigco.com, BigCo"}
                    className="mt-2 w-full rounded-lg border border-input bg-background p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    One lead per line: email — or name, email, company
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addLead} className="bg-gradient-primary">Add Lead</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, email..." className="pl-9" />
        </div>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="emailed">Emailed</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="won">🏆 Won</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                No leads yet. Use "Find Leads with AI" or add manually.
              </td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{l.name ?? "—"}</td>
                <td className="px-4 py-3">{l.company ?? "—"}</td>
                <td className="px-4 py-3">{l.job_title ?? "—"}</td>
                <td className="px-4 py-3">{l.country ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.email ?? "—"}</td>
                <td className="px-4 py-3">
                  {SYSTEM_STATUSES.includes(l.status) ? (
                    <Badge className={STATUS_COLORS[l.status] ?? ""} variant="secondary">{l.status}</Badge>
                  ) : (
                    <select
                      value={PIPELINE_STATUSES.includes(l.status as never) ? l.status : "new"}
                      onChange={(e) => void setLeadStatus(l.id, e.target.value)}
                      className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${STATUS_COLORS[l.status] ?? "bg-primary/15 text-primary"}`}
                    >
                      <option value="new">New</option>
                      <option value="emailed">Contacted</option>
                      <option value="replied">Replied</option>
                      <option value="won">🏆 Won</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}