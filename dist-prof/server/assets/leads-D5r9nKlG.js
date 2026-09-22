import { jsxs, jsx } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { D as Dialog, e as DialogTrigger, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter } from "./dialog-Bq_UdvUi.js";
import { Download, Upload, Sparkles, Plus, Search, Pencil, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-select";
import "@radix-ui/react-dialog";
const STATUS_COLORS = {
  new: "bg-primary/15 text-primary",
  emailed: "bg-secondary text-secondary-foreground",
  replied: "bg-success/15 text-success",
  won: "bg-success text-success-foreground font-semibold",
  booked: "bg-warning/15 text-warning"
};
const PIPELINE_STATUSES = ["new", "emailed", "replied", "booked", "won"];
const SYSTEM_STATUSES = ["bounced", "unsubscribed", "invalid", "skipped"];
function temperature(l) {
  if (l.status === "won") return {
    label: "🏆 Closed",
    cls: "bg-success/15 text-success"
  };
  if (l.status === "replied") return {
    label: "🔥 Hot",
    cls: "bg-destructive/10 text-destructive"
  };
  if (l.status === "emailed" || l.status === "booked") return {
    label: "🌤 Warm",
    cls: "bg-warning/15 text-warning"
  };
  if (SYSTEM_STATUSES.includes(l.status)) return {
    label: "—",
    cls: "text-muted-foreground"
  };
  return {
    label: "❄️ Cold",
    cls: "bg-primary/10 text-primary"
  };
}
function burstConfetti() {
  const colors = ["#7c3aed", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#10b981"];
  confetti({
    particleCount: 160,
    spread: 100,
    origin: {
      x: 0.5,
      y: 0.6
    },
    colors,
    zIndex: 9999
  });
  setTimeout(() => confetti({
    particleCount: 80,
    angle: 60,
    spread: 70,
    origin: {
      x: 0,
      y: 0.7
    },
    colors,
    zIndex: 9999
  }), 250);
  setTimeout(() => confetti({
    particleCount: 80,
    angle: 120,
    spread: 70,
    origin: {
      x: 1,
      y: 0.7
    },
    colors,
    zIndex: 9999
  }), 400);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [q, setQ] = useState("");
  async function deleteLead(id) {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const {
      error
    } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete lead");
      void load();
    } else toast.success("Lead deleted");
  }
  async function setLeadStatus(id, next) {
    setLeads((prev) => prev.map((l) => l.id === id ? {
      ...l,
      status: next
    } : l));
    const {
      error
    } = await supabase.from("leads").update({
      status: next
    }).eq("id", id);
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
    name: "",
    email: "",
    company: "",
    job_title: "",
    country: "",
    campaign_id: ""
  });
  const [bulkText, setBulkText] = useState("");
  useEffect(() => {
    void load();
  }, []);
  async function load() {
    const {
      data
    } = await supabase.from("leads").select("*").order("created_at", {
      ascending: false
    }).limit(500);
    setLeads(data ?? []);
    const {
      data: camps
    } = await supabase.from("campaigns").select("id, name");
    setCampaigns(camps ?? []);
  }
  async function addLead() {
    if (!form.email) {
      toast.error("Email is required");
      return;
    }
    if (!EMAIL_RE.test(form.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) return;
    if (bulkText.trim()) {
      const rows = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 500);
      const inserts = rows.map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const email = parts.find((p) => p.includes("@")) ?? "";
        const rest = parts.filter((p) => p !== email);
        return {
          user_id: u.user.id,
          name: rest[0] || null,
          email,
          company: rest[1] || null,
          campaign_id: form.campaign_id || null,
          status: "new"
        };
      }).filter((r) => r.email.includes("@") && EMAIL_RE.test(r.email));
      if (inserts.length === 0) {
        toast.error("No valid emails found");
        return;
      }
      const {
        error: error2
      } = await supabase.from("leads").insert(inserts);
      if (error2) {
        toast.error(error2.message);
        return;
      }
      toast.success(`${inserts.length} leads imported!`);
      setBulkText("");
      setForm({
        ...form,
        email: ""
      });
      setAddOpen(false);
      load();
      return;
    }
    const {
      error
    } = await supabase.from("leads").insert({
      user_id: u.user.id,
      name: form.name || null,
      email: form.email,
      company: form.company || null,
      job_title: form.job_title || null,
      country: form.country || null,
      campaign_id: form.campaign_id || null,
      status: "new"
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lead added!");
    setForm({
      name: "",
      email: "",
      company: "",
      job_title: "",
      country: "",
      campaign_id: ""
    });
    setAddOpen(false);
    load();
  }
  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) return;
    const text = await file.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i] ?? "";
      });
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
        status: "new"
      });
      imported++;
    }
    toast.success(`Imported ${imported} leads!`);
    setImporting(false);
    load();
    e.target.value = "";
  }
  const countries = useMemo(() => Array.from(new Set(leads.map((l) => l.country).filter(Boolean))), [leads]);
  const campaignMap = useMemo(() => {
    const map = {};
    campaigns.forEach((c) => {
      map[c.id] = c.name;
    });
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
    const blob = new Blob([csv], {
      type: "text/csv"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Leads" }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
          filtered.length,
          " leads"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2 flex-wrap", children: [
        /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: exportCsv, children: [
          /* @__PURE__ */ jsx(Download, { className: "mr-2 h-4 w-4" }),
          " Export CSV"
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          /* @__PURE__ */ jsx(Button, { variant: "outline", disabled: importing, asChild: true, children: /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Upload, { className: "mr-2 h-4 w-4" }),
            " ",
            importing ? "Importing..." : "Import CSV"
          ] }) }),
          /* @__PURE__ */ jsx("input", { type: "file", accept: ".csv", className: "hidden", onChange: importCsv })
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", className: "border-primary text-primary", onClick: () => navigate({
          to: "/lead-finder"
        }), children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "mr-2 h-4 w-4" }),
          " Find Leads with AI"
        ] }),
        /* @__PURE__ */ jsxs(Dialog, { open: addOpen, onOpenChange: setAddOpen, children: [
          /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { className: "bg-gradient-primary shadow-glow", children: [
            /* @__PURE__ */ jsx(Plus, { className: "mr-2 h-4 w-4" }),
            " Add Lead"
          ] }) }),
          /* @__PURE__ */ jsxs(DialogContent, { className: "w-full max-w-lg", children: [
            /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Add Lead" }) }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
              /* @__PURE__ */ jsx(Input, { placeholder: "Full name", value: form.name, onChange: (e) => setForm({
                ...form,
                name: e.target.value
              }) }),
              /* @__PURE__ */ jsx(Input, { placeholder: "Email address *", value: form.email, onChange: (e) => setForm({
                ...form,
                email: e.target.value
              }) }),
              /* @__PURE__ */ jsx(Input, { placeholder: "Company", value: form.company, onChange: (e) => setForm({
                ...form,
                company: e.target.value
              }) }),
              /* @__PURE__ */ jsx(Input, { placeholder: "Job title", value: form.job_title, onChange: (e) => setForm({
                ...form,
                job_title: e.target.value
              }) }),
              /* @__PURE__ */ jsxs("select", { value: form.country, onChange: (e) => setForm({
                ...form,
                country: e.target.value
              }), className: "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring", children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Country (recommended)" }),
                /* @__PURE__ */ jsx("option", { value: "United States", children: "United States" }),
                /* @__PURE__ */ jsx("option", { value: "United Kingdom", children: "United Kingdom" }),
                /* @__PURE__ */ jsx("option", { value: "Canada", children: "Canada" }),
                /* @__PURE__ */ jsx("option", { value: "Australia", children: "Australia" }),
                /* @__PURE__ */ jsx("option", { value: "India", children: "India" }),
                /* @__PURE__ */ jsx("option", { value: "Germany", children: "Germany" }),
                /* @__PURE__ */ jsx("option", { value: "France", children: "France" }),
                /* @__PURE__ */ jsx("option", { value: "Spain", children: "Spain" }),
                /* @__PURE__ */ jsx("option", { value: "Italy", children: "Italy" }),
                /* @__PURE__ */ jsx("option", { value: "Netherlands", children: "Netherlands" }),
                /* @__PURE__ */ jsx("option", { value: "Saudi Arabia", children: "Saudi Arabia 🇸🇦" }),
                /* @__PURE__ */ jsx("option", { value: "UAE", children: "UAE 🇦🇪" }),
                /* @__PURE__ */ jsx("option", { value: "Egypt", children: "Egypt" }),
                /* @__PURE__ */ jsx("option", { value: "Pakistan", children: "Pakistan" }),
                /* @__PURE__ */ jsx("option", { value: "Singapore", children: "Singapore" }),
                /* @__PURE__ */ jsx("option", { value: "Brazil", children: "Brazil" }),
                /* @__PURE__ */ jsx("option", { value: "Turkey", children: "Turkey" })
              ] }),
              /* @__PURE__ */ jsxs(Select, { value: form.campaign_id, onValueChange: (v) => setForm({
                ...form,
                campaign_id: v
              }), children: [
                /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Assign to campaign (optional)" }) }),
                /* @__PURE__ */ jsx(SelectContent, { className: "max-w-[400px]", children: campaigns.map((c) => /* @__PURE__ */ jsx(SelectItem, { value: c.id, children: /* @__PURE__ */ jsx("span", { className: "block truncate", children: c.name }) }, c.id)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-dashed border-border p-3", children: [
                /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-muted-foreground", children: "📥 Bulk import — paste a list (up to 500)" }),
                /* @__PURE__ */ jsx("textarea", { value: bulkText, onChange: (e) => setBulkText(e.target.value), rows: 5, placeholder: "john@acme.com\nSarah Miller, sarah@bigco.com, BigCo", className: "mt-2 w-full rounded-lg border border-input bg-background p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" }),
                /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-muted-foreground", children: "One lead per line: email — or name, email, company" })
              ] })
            ] }),
            /* @__PURE__ */ jsx(DialogFooter, { children: /* @__PURE__ */ jsx(Button, { onClick: addLead, className: "bg-gradient-primary", children: "Add Lead" }) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative flex-1 min-w-[200px]", children: [
        /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
        /* @__PURE__ */ jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search name, company, email...", className: "pl-9" })
      ] }),
      /* @__PURE__ */ jsxs(Select, { value: country, onValueChange: setCountry, children: [
        /* @__PURE__ */ jsx(SelectTrigger, { className: "w-[160px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Country" }) }),
        /* @__PURE__ */ jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "All countries" }),
          countries.map((c) => /* @__PURE__ */ jsx(SelectItem, { value: c, children: c }, c))
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Select, { value: status, onValueChange: setStatus, children: [
        /* @__PURE__ */ jsx(SelectTrigger, { className: "w-[160px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Status" }) }),
        /* @__PURE__ */ jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "All statuses" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "new", children: "New" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "emailed", children: "Emailed" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "replied", children: "Replied" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "booked", children: "Booked" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "won", children: "🏆 Won" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Select, { value: campaignFilter, onValueChange: setCampaignFilter, children: [
        /* @__PURE__ */ jsx(SelectTrigger, { className: "w-[180px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Campaign" }) }),
        /* @__PURE__ */ jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "All campaigns" }),
          campaigns.map((c) => /* @__PURE__ */ jsx(SelectItem, { value: c.id, children: c.name }, c.id))
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-x-auto rounded-2xl border border-border bg-card shadow-card", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Name" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Temp" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Company" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Job Title" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Country" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Email" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Campaign" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Follow-up" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Status" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Date" }),
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: filtered.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 10, className: "px-4 py-16 text-center text-muted-foreground", children: 'No leads yet. Use "Find Leads with AI" or add manually.' }) }) : filtered.map((l) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-border hover:bg-muted/20", children: [
        /* @__PURE__ */ jsx("td", { className: "max-w-[160px] truncate px-4 py-3 font-medium", title: l.name ?? "", children: l.name ?? "—" }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${temperature(l).cls}`, children: temperature(l).label }) }),
        /* @__PURE__ */ jsx("td", { className: "max-w-[140px] truncate px-4 py-3", title: l.company ?? "", children: l.company ?? "—" }),
        /* @__PURE__ */ jsx("td", { className: "max-w-[120px] truncate px-4 py-3", title: l.job_title ?? "", children: l.job_title ?? "—" }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: l.country ?? "—" }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-muted-foreground", children: l.email ?? "—" }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: l.campaign_id && campaignMap[l.campaign_id] ? /* @__PURE__ */ jsx("span", { className: "inline-block max-w-[140px] truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary", title: campaignMap[l.campaign_id], children: campaignMap[l.campaign_id] }) : /* @__PURE__ */ jsx("span", { className: "text-muted-foreground/50", children: "—" }) }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: l.followup_status === "active" ? /* @__PURE__ */ jsxs("span", { className: "inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400", title: l.next_followup_at ? `Next: ${new Date(l.next_followup_at).toLocaleDateString()}` : "", children: [
          "Step ",
          l.followup_step ?? 0,
          " / 14"
        ] }) : l.followup_status === "completed" ? /* @__PURE__ */ jsx("span", { className: "inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400", children: "Complete" }) : l.followup_status === "cancelled" ? /* @__PURE__ */ jsx("span", { className: "inline-block rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400", children: "Stopped" }) : l.followup_step && l.followup_step > 0 ? /* @__PURE__ */ jsxs("span", { className: "inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground", children: [
          "Step ",
          l.followup_step
        ] }) : /* @__PURE__ */ jsx("span", { className: "text-muted-foreground/50", children: "—" }) }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: SYSTEM_STATUSES.includes(l.status) ? /* @__PURE__ */ jsx(Badge, { className: STATUS_COLORS[l.status] ?? "", variant: "secondary", children: l.status }) : /* @__PURE__ */ jsxs("select", { value: PIPELINE_STATUSES.includes(l.status) ? l.status : "new", onChange: (e) => void setLeadStatus(l.id, e.target.value), className: `cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${STATUS_COLORS[l.status] ?? "bg-primary/15 text-primary"}`, children: [
          /* @__PURE__ */ jsx("option", { value: "new", children: "New" }),
          /* @__PURE__ */ jsx("option", { value: "emailed", children: "Contacted" }),
          /* @__PURE__ */ jsx("option", { value: "replied", children: "Replied" }),
          /* @__PURE__ */ jsx("option", { value: "booked", children: "Booked" }),
          /* @__PURE__ */ jsx("option", { value: "won", children: "🏆 Won" })
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-muted-foreground", children: new Date(l.created_at).toLocaleDateString() }),
        /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
          /* @__PURE__ */ jsx("button", { onClick: () => navigate({
            to: "/lead-edit/$leadId",
            params: {
              leadId: l.id
            }
          }), className: "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary", "aria-label": "Edit lead", children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsx("button", { onClick: () => void deleteLead(l.id), className: "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive", "aria-label": "Delete lead", children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4" }) })
        ] }) })
      ] }, l.id)) })
    ] }) })
  ] });
}
export {
  LeadsPage as component
};
//# sourceMappingURL=leads-D5r9nKlG.js.map
