import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Download, Search, Plus, Upload, Sparkles, Trash2, Pencil } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string; name: string | null; company: string | null; job_title: string | null;
  country: string | null; email: string | null; status: string; created_at: string;
  campaign_id: string | null;
  followup_step: number | null; followup_status: string | null; next_followup_at: string | null;
};

type Campaign = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  emailed: "bg-secondary text-secondary-foreground",
  replied: "bg-success/15 text-success",
  won: "bg-success text-success-foreground font-semibold",
  booked: "bg-warning/15 text-warning",
};

const PIPELINE_STATUSES = ["new", "emailed", "replied", "booked", "won"] as const;
const SYSTEM_STATUSES = ["bounced", "unsubscribed", "invalid", "skipped"];

function temperature(l: { status: string }): { label: string; cls: string } {
  if (l.status === "won") return { label: "Closed", cls: "bg-success/15 text-success" };
  if (l.status === "replied") return { label: "Hot", cls: "bg-destructive/10 text-destructive" };
  if (l.status === "emailed" || l.status === "booked") return { label: "Warm", cls: "bg-warning/15 text-warning" };
  if (SYSTEM_STATUSES.includes(l.status)) return { label: "—", cls: "text-muted-foreground" };
  return { label: "Cold", cls: "bg-primary/10 text-primary" };
}

function burstConfetti() {
  const colors = ["#7c3aed", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#10b981"];
  confetti({ particleCount: 160, spread: 100, origin: { x: 0.5, y: 0.6 }, colors, zIndex: 9999 });
  setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, zIndex: 9999 }), 250);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, zIndex: 9999 }), 400);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function invokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  if (typeof ctx?.json === "function") {
    const payload = await ctx.json().catch(() => null);
    if (payload?.error) return payload.error;
  }
  return (error as { message?: string })?.message ?? "Request failed";
}

function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  // Bulk selection. Only ever holds ids the owner ticked by hand or via
  // "select all" on the rows currently visible, so a filter can never make
  // hidden contacts disappear along with the visible ones.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState(0);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  async function deleteLead(id: string) {
    if (!window.confirm("Delete this lead? This permanently removes it AND all its history (memory, emails, meetings, tracking, scores). This cannot be undone.")) return;
    setDeleting((s) => new Set(s).add(id));
    const { data, error } = await supabase.functions.invoke("lead-erasure", {
      body: { action: "delete", leadId: id },
    });
    setDeleting((s) => { const n = new Set(s); n.delete(id); return n; });
    if (error) {
      toast.error(await invokeError(error));
      void load();
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const counts = (data as { row_counts?: Record<string, number> } | null)?.row_counts ?? {};
    const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    toast.success(`Contact deleted — ${total} history rows erased`);
  }

  async function setLeadStatus(id: string, next: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)));
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", id);
    if (error) {
      toast.error("Could not update status");
      void load();
    } else if (next === "won") {
      burstConfetti();
      toast.success("Marked as won — great job!");
    }
  }
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", company: "", job_title: "", country: "", campaign_id: ""
  });
  const [bulkText, setBulkText] = useState("");

  useEffect(() => { void load(); }, []);

  // Deep link from the agent menu ("Add a lead" -> /leads?add=1). Open the
  // dialog straight away, then strip the param so a refresh doesn't reopen it
  // or leave a stray query string behind.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") !== "1") return;
    setAddOpen(true);
    params.delete("add");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  async function load() {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500);
    setLeads((data as Lead[]) ?? []);
    const { data: camps } = await supabase.from("campaigns").select("id, name");
    setCampaigns((camps as Campaign[]) ?? []);
  }

  async function addLead() {
    if (!form.email) { toast.error("Email is required"); return; }
    if (!EMAIL_RE.test(form.email)) { toast.error("Please enter a valid email address"); return; }
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
      }).filter((r) => r.email.includes("@") && EMAIL_RE.test(r.email));
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
    toast.success("Contact added!");
    setForm({ name: "", email: "", company: "", job_title: "", country: "", campaign_id: "" });
    setAddOpen(false);
    load();
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
    let capped = false;
    for (const row of rows) {
      const email = row["email"] || row["email address"] || row["e-mail"];
      if (!email || !EMAIL_RE.test(email)) continue;
      const { error } = await supabase.from("leads").insert({
        user_id: u.user.id,
        email,
        name: row["name"] || row["full name"] || null,
        company: row["company"] || row["organization"] || null,
        job_title: row["job title"] || row["title"] || row["position"] || null,
        country: row["country"] || null,
        status: "new",
      });
      if (error) {
        if (error.code === "P0001") { capped = true; break; }
        continue;
      }
      imported++;
    }

    if (capped) {
      toast.error(`Imported ${imported}, then reached your plan's lead limit. Delete some leads or upgrade to import the rest.`);
    } else {
      toast.success(`Imported ${imported} leads!`);
    }
    setImporting(false);
    load();
    e.target.value = "";
  }

  const countries = useMemo(() => Array.from(new Set(leads.map((l) => l.country).filter(Boolean))) as string[], [leads]);

  const campaignMap = useMemo(() => {
    const map: Record<string, string> = {};
    campaigns.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [campaigns]);

  const filtered = leads.filter((l) => {
    const matchQ = !q || [l.name, l.company, l.email].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
    const matchC = country === "all" || l.country === country;
    const matchS = status === "all" || l.status === status;
    const matchCamp = campaignFilter === "all" || l.campaign_id === campaignFilter;
    return matchQ && matchC && matchS && matchCamp;
  });

  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Select-all works on the rows in view only: what you see is what you get. */
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const l of filtered) next.delete(l.id);
      else for (const l of filtered) next.add(l.id);
      return next;
    });
  }

  /** Erasure is one lead per call, so bulk runs a small pool of workers and
   *  reports honestly: successes are removed from the list, failures keep
   *  their rows and trigger a reload so the screen matches the database. */
  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkProgress({ done: 0, total: ids.length });

    let ok = 0, failed = 0, rows = 0;
    const queue = [...ids];
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        const { data, error } = await supabase.functions.invoke("lead-erasure", {
          body: { action: "delete", leadId: id },
        });
        if (error) {
          failed++;
        } else {
          ok++;
          setLeads((prev) => prev.filter((l) => l.id !== id));
          setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
          const counts = (data as { row_counts?: Record<string, number> } | null)?.row_counts ?? {};
          rows += Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
        }
        setBulkProgress({ done: ok + failed, total: ids.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));

    setBulkProgress(null);
    setBulkOpen(false);
    if (failed > 0) {
      toast.error(`${ok} deleted, ${failed} failed — the list has been refreshed`);
      void load();
      return;
    }
    toast.success(`${ok} ${ok === 1 ? "contact" : "contacts"} deleted — ${rows} history rows erased`);
  }

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
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Contacts</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} contacts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <label>
            <Button variant="outline" disabled={importing} asChild>
              <span><Upload className="mr-1.5 h-3.5 w-3.5" /> {importing ? "Importing..." : "Import CSV"}</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
          </label>

          {/* AI Find Leads */}
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/lead-finder" })}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Find Leads with AI
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-lg">
              <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Full name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Email address *" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input placeholder="Company" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })} />
                <Input placeholder="Job title" value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Country (recommended)</option>
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
                  <option value="Saudi Arabia">Saudi Arabia 🇸🇦</option>
                  <option value="UAE">UAE 🇦🇪</option>
                  <option value="Egypt">Egypt</option>
                  <option value="Pakistan">Pakistan</option>
                  <option value="Singapore">Singapore</option>
                  <option value="Brazil">Brazil</option>
                  <option value="Turkey">Turkey</option>
                </select>
                <Select value={form.campaign_id} onValueChange={(v) => setForm({ ...form, campaign_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to campaign (optional)" /></SelectTrigger>
                  <SelectContent className="max-w-[400px]">
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="block truncate">{c.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-xl border border-dashed border-border p-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bulk import — paste a list (up to 500)
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
                <Button onClick={addLead}>Add Contact</Button>
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
            <SelectItem value="won">Won</SelectItem>
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Campaign" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { setBulkCount(selected.size); setBulkOpen(true); }}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete selected
            </Button>
          </div>
        </div>
      )}

      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!bulkProgress) setBulkOpen(o); }}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {bulkCount} {bulkCount === 1 ? "contact" : "contacts"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes {bulkCount === 1 ? "it" : "them"} AND all history (memory,
            emails, meetings, tracking, scores). This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={!!bulkProgress}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void deleteSelected()} disabled={!!bulkProgress}>
              {bulkProgress
                ? `Deleting ${bulkProgress.done} of ${bulkProgress.total}…`
                : `Delete ${bulkCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all contacts in view"
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Temp</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-16 text-center text-muted-foreground">
                No contacts yet. Use "Find Leads with AI" or add manually.
              </td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className={`border-t border-border hover:bg-muted/20 ${selected.has(l.id) ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggleSelected(l.id)}
                    aria-label={`Select ${l.name ?? l.email ?? "contact"}`}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                </td>
                <td className="max-w-[160px] truncate px-4 py-3 font-medium" title={l.name ?? ""}>{l.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${temperature(l).cls}`}>
                    {temperature(l).label}
                  </span>
                </td>
                <td className="max-w-[140px] truncate px-4 py-3" title={l.company ?? ""}>{l.company ?? "—"}</td>
                <td className="max-w-[120px] truncate px-4 py-3" title={l.job_title ?? ""}>{l.job_title ?? "—"}</td>
                <td className="px-4 py-3">{l.country ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.email ?? "—"}</td>
                <td className="px-4 py-3">
                  {l.campaign_id && campaignMap[l.campaign_id] ? (
                    <span className="inline-block max-w-[140px] truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" title={campaignMap[l.campaign_id]}>
                      {campaignMap[l.campaign_id]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.followup_status === "active" ? (
                    <span className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400" title={l.next_followup_at ? `Next: ${new Date(l.next_followup_at).toLocaleDateString()}` : ""}>
                      Step {l.followup_step ?? 0}
                    </span>
                  ) : l.followup_status === "completed" ? (
                    <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Complete
                    </span>
                  ) : l.followup_status === "cancelled" ? (
                    <span className="inline-block rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      Stopped
                    </span>
                  ) : l.followup_step && l.followup_step > 0 ? (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Step {l.followup_step}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
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
                      <option value="booked">Booked</option>
                      <option value="won">Won</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => navigate({ to: "/lead-edit/$leadId", params: { leadId: l.id } })}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      aria-label="Edit contact"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void deleteLead(l.id)}
                      disabled={deleting.has(l.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      aria-label="Delete contact"
                    >
                      {deleting.has(l.id) ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}