import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Download, Search, Plus, Upload, Sparkles, Trash2, Pencil } from "lucide-react";
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

function temperature(l: { status: string }): { label: string; cls: string } {
  if (l.status === "won") return { label: "🏆 Closed", cls: "bg-success/15 text-success" };
  if (l.status === "replied") return { label: "🔥 Hot", cls: "bg-destructive/10 text-destructive" };
  if (l.status === "emailed" || l.status === "booked") return { label: "🌤 Warm", cls: "bg-warning/15 text-warning" };
  if (SYSTEM_STATUSES.includes(l.status)) return { label: "—", cls: "text-muted-foreground" };
  return { label: "❄️ Cold", cls: "bg-primary/10 text-primary" };
}

function burstConfetti() {
  const EMOJI = ["🎉", "🎊", "✨", "🏆", "🥳"];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement("span");
    el.textContent = EMOJI[Math.floor(Math.random() * EMOJI.length)];
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-40px;font-size:${14 + Math.random() * 18}px;z-index:9999;pointer-events:none;transition:transform ${1.6 + Math.random()}s cubic-bezier(.2,.6,.4,1),opacity 2.4s ease-in;will-change:transform`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translateY(${window.innerHeight + 80}px) rotate(${Math.random() * 720 - 360}deg)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 2600);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [q, setQ] = useState("");

  async function deleteLead(id: string) {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) { toast.error("Could not delete lead"); void load(); }
    else toast.success("Lead deleted");
  }

  async function setLeadStatus(id: string, next: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)));
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", id);
    if (error) {
      toast.error("Could not update status");
      void load();
    } else if (next === "won") {
      burstConfetti();
      toast.success("🏆 Marked as won — great job!");
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
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editForm, setEditForm] = useState({
    name: "", email: "", company: "", job_title: "", country: "", campaign_id: "", status: "new",
  });

  function openEdit(l: Lead) {
    setEditId(l.id);
    setEditForm({
      name: l.name ?? "",
      email: l.email ?? "",
      company: l.company ?? "",
      job_title: l.job_title ?? "",
      country: l.country ?? "",
      campaign_id: l.campaign_id ?? "",
      status: l.status,
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editForm.email || !EMAIL_RE.test(editForm.email)) { toast.error("Valid email is required"); return; }
    const patch = {
      name: editForm.name || null,
      email: editForm.email,
      company: editForm.company || null,
      job_title: editForm.job_title || null,
      country: editForm.country || null,
      campaign_id: editForm.campaign_id || null,
      status: editForm.status,
    };
    setLeads((prev) => prev.map((l) => l.id === editId ? { ...l, ...patch } : l));
    const { error } = await supabase.from("leads").update(patch).eq("id", editId);
    if (error) { toast.error("Could not update lead"); void load(); }
    else toast.success("Lead updated");
    setEditOpen(false);
  }

  useEffect(() => { void load(); }, []);

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
    toast.success("Lead added!");
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
    for (const row of rows) {
      const email = row["email"] || row["email address"] || row["e-mail"];
      if (!email || !EMAIL_RE.test(email)) continue;
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
          <Button
            variant="outline"
            className="border-primary text-primary"
            onClick={() => navigate({ to: "/lead-finder" })}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Find Leads with AI
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary shadow-glow">
                <Plus className="mr-2 h-4 w-4" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-lg">
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
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Campaign" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Temp</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                No leads yet. Use "Find Leads with AI" or add manually.
              </td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/20">
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
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(l)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      aria-label="Edit lead"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void deleteLead(l.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete lead"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name" value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input placeholder="Email address" value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <Input placeholder="Company" value={editForm.company}
              onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            <Input placeholder="Job title" value={editForm.job_title}
              onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })} />
            <select
              value={editForm.country}
              onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
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
            <Select value={editForm.campaign_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, campaign_id: v === "none" ? "" : v })}>
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
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-gradient-primary">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}