import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { ArrowLeft, Sparkles, Plus, X, Loader2, Search, Mail, ShieldCheck, ShieldAlert, Shield, ShieldX, Filter, Globe, Map, Check, AlertTriangle, Phone, MapPin, Star, Building2 } from "lucide-react";
import { toast } from "sonner";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-select";
const PRESET_NICHES = [{
  label: "Dentists",
  value: "dentist"
}, {
  label: "Gyms",
  value: "gym"
}, {
  label: "Restaurants",
  value: "restaurant"
}, {
  label: "Salons",
  value: "salon"
}, {
  label: "Lawyers",
  value: "lawyer"
}, {
  label: "Real Estate",
  value: "real estate"
}, {
  label: "Insurance",
  value: "insurance"
}, {
  label: "Accountants",
  value: "accountant"
}, {
  label: "Veterinarians",
  value: "veterinarian"
}, {
  label: "Car Repair",
  value: "car repair"
}, {
  label: "Contractors",
  value: "contractor"
}, {
  label: "Photographers",
  value: "photographer"
}];
function LeadFinderPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [country, setCountry] = useState("United States");
  const [limit, setLimit] = useState("25");
  const [customNiche, setCustomNiche] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("");
  const [finding, setFinding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [network, setNetwork] = useState([]);
  const [networkRequested, setNetworkRequested] = useState(/* @__PURE__ */ new Set());
  const [sendingNetwork, setSendingNetwork] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState(false);
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [showCampaignInput, setShowCampaignInput] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [confirmCount, setConfirmCount] = useState(null);
  useEffect(() => {
    supabase.from("campaigns").select("id, name").then(({
      data
    }) => setCampaigns(data ?? []));
  }, []);
  const activeNiche = customNiche.trim() || selectedNiche;
  const filtered = useMemo(() => {
    return results.filter((lead) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const haystack = [lead.name, lead.email, lead.company, lead.city, lead.country, lead.category, lead.phone, lead.address].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter && lead.email_status !== statusFilter) return false;
      if (hasWebsiteFilter && !lead.website) return false;
      if (hasEmailFilter && !lead.email) return false;
      if (sourceFilter && lead.source !== sourceFilter) return false;
      return true;
    });
  }, [results, searchText, statusFilter, hasWebsiteFilter, hasEmailFilter, sourceFilter]);
  const stats = useMemo(() => {
    const total = results.length;
    const withEmail = results.filter((l) => !!l.email).length;
    const verified = results.filter((l) => l.email_status === "verified").length;
    const risky = results.filter((l) => l.email_status === "risky").length;
    const unknown = results.filter((l) => l.email_status === "unknown").length;
    const invalid = results.filter((l) => l.email_status === "invalid").length;
    const withWebsite = results.filter((l) => !!l.website).length;
    return {
      total,
      withEmail,
      verified,
      risky,
      unknown,
      invalid,
      withWebsite
    };
  }, [results]);
  async function search() {
    if (!activeNiche) {
      toast.error("Select or type a business type");
      return;
    }
    setFinding(true);
    setElapsed(0);
    setResults([]);
    setNetwork([]);
    setNetworkRequested(/* @__PURE__ */ new Set());
    setSelected(/* @__PURE__ */ new Set());
    setSaved(false);
    setSearchText("");
    setStatusFilter(null);
    setHasWebsiteFilter(false);
    setHasEmailFilter(false);
    setSourceFilter(null);
    setConfirmCount(null);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1e3);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("find-leads", {
        body: {
          campaignId: campaignId || null,
          jobTitle: activeNiche,
          country: country || "United States",
          limit: parseInt(limit)
        }
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      const leads = data.leads ?? [];
      setSource(data.source ?? "");
      setNetwork(data.network ?? []);
      if (leads.length === 0) {
        toast.info(data.message ?? "No leads found. Try a different niche or country.");
      } else {
        setResults(leads);
        setSelected(new Set(leads.map((_, i) => i)));
        toast.success(`Found ${leads.length} leads`);
      }
    } catch (e) {
      toast.error(e.message ?? "Search failed");
    } finally {
      clearInterval(timer);
      setFinding(false);
    }
  }
  async function saveSelected() {
    if (selected.size === 0) {
      toast.error("Select at least one lead");
      return;
    }
    let targetCampaignId = campaignId;
    if (showCampaignInput && newCampaignName.trim()) {
      setCreatingCampaign(true);
      try {
        const {
          data: u
        } = await supabase.auth.getUser();
        if (!u.user) return;
        const {
          data: newCampaign,
          error: cErr
        } = await supabase.from("campaigns").insert({
          user_id: u.user.id,
          name: newCampaignName.trim(),
          status: "draft"
        }).select("id").single();
        if (cErr) throw new Error(cErr.message);
        targetCampaignId = newCampaign.id;
        setCampaignId(targetCampaignId);
        setCampaigns((prev) => [...prev, {
          id: targetCampaignId,
          name: newCampaignName.trim()
        }]);
        setNewCampaignName("");
        setShowCampaignInput(false);
      } catch (e) {
        toast.error(e.message ?? "Failed to create campaign");
        setCreatingCampaign(false);
        return;
      }
      setCreatingCampaign(false);
    }
    setSaving(true);
    try {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return;
      const replaceable = [...selected].filter((i) => !!results[i]?.email);
      const selectedEmails = replaceable.map((i) => results[i].email.toLowerCase());
      const {
        data: existingLeads
      } = await supabase.from("leads").select("email").eq("user_id", u.user.id).in("normalized_email", selectedEmails).limit(5e3);
      const existingEmails = new Set((existingLeads ?? []).map((l) => l.email?.toLowerCase() ?? ""));
      const rows = replaceable.filter((i) => !existingEmails.has(results[i].email.toLowerCase())).map((i) => ({
        user_id: u.user.id,
        name: results[i].name || null,
        email: results[i].email,
        company: results[i].company || null,
        job_title: results[i].job_title || null,
        country: results[i].country || null,
        city: results[i].city || null,
        phone: results[i].phone || null,
        address: results[i].address || null,
        website: results[i].website || null,
        rating: results[i].rating ?? null,
        campaign_id: targetCampaignId || null,
        status: "new",
        category: results[i].category || null,
        place_id: results[i].place_id || null,
        lead_source: results[i].source || null,
        email_source: results[i].email_source || null,
        email_source_url: results[i].email_source_url || null,
        email_status: results[i].email_status || null,
        email_confidence: results[i].email_confidence ?? null,
        email_is_role: results[i].email_is_role ?? null,
        email_is_disposable: results[i].email_is_disposable ?? null,
        email_verification_reason: results[i].email_verification_reason || null
      }));
      let savedCount = 0;
      let dupeCount = existingEmails.size;
      for (const row of rows) {
        const {
          error
        } = await supabase.from("leads").insert(row);
        if (!error) savedCount++;
        else if (error.code === "23505") dupeCount++;
      }
      setConfirmCount(savedCount);
      if (dupeCount > 0) {
        toast.warning(`${savedCount} added, ${dupeCount} duplicate${dupeCount !== 1 ? "s" : ""} skipped`);
      } else {
        toast.success(`Added ${savedCount} lead${savedCount !== 1 ? "s" : ""}!`);
      }
      setSaved(true);
      setSelected(/* @__PURE__ */ new Set());
    } catch (e) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }
  function toggle(i) {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  }
  function removeLead(i) {
    const nextResults = results.filter((_, idx) => idx !== i);
    const nextSelected = /* @__PURE__ */ new Set();
    for (const s of selected) {
      if (s < i) nextSelected.add(s);
      else if (s > i) nextSelected.add(s - 1);
    }
    setResults(nextResults);
    setSelected(nextSelected);
  }
  const selectedInvalid = [...selected].filter((i) => results[i]?.email_status === "invalid").length;
  async function requestIntro(m) {
    setSendingNetwork(m.target_user_id);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("network-intros", {
        body: {
          action: "request",
          target_user_id: m.target_user_id
        }
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      setNetworkRequested((prev) => new Set(prev).add(m.target_user_id));
      toast.success(data.message ?? "Intro request sent — they'll be notified");
    } catch (e) {
      toast.error(e.message ?? "Could not send intro request");
    } finally {
      setSendingNetwork(null);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate({
        to: "/leads"
      }), children: /* @__PURE__ */ jsx(ArrowLeft, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-2xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "h-5 w-5 text-primary" }),
          " AI Lead Finder"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Discover real businesses, verify emails, review and add to campaigns" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Business Type *" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "e.g. dentist, gym, restaurant", value: customNiche, onChange: (e) => {
            setCustomNiche(e.target.value);
            setSelectedNiche("");
          }, className: "flex-1" }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: PRESET_NICHES.map((n) => /* @__PURE__ */ jsx("button", { onClick: () => {
            setSelectedNiche(n.value);
            setCustomNiche("");
          }, className: `rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedNiche === n.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`, children: n.label }, n.value)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Country" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "e.g. United States, United Kingdom", value: country, onChange: (e) => setCountry(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Number of leads" }),
          /* @__PURE__ */ jsxs(Select, { value: limit, onValueChange: setLimit, children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "10", children: "10 leads" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "25", children: "25 leads" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "50", children: "50 leads" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Assign to campaign" }),
          /* @__PURE__ */ jsxs(Select, { value: showCampaignInput ? "__new__" : campaignId, onValueChange: (v) => {
            if (v === "__new__") {
              setShowCampaignInput(true);
              setCampaignId("");
            } else {
              setShowCampaignInput(false);
              setCampaignId(v);
            }
          }, children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Optional — skip to add as unassigned" }) }),
            /* @__PURE__ */ jsxs(SelectContent, { className: "max-w-[300px]", children: [
              campaigns.map((c) => /* @__PURE__ */ jsx(SelectItem, { value: c.id, children: /* @__PURE__ */ jsx("span", { className: "block truncate", children: c.name }) }, c.id)),
              /* @__PURE__ */ jsx(SelectItem, { value: "__new__", children: /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-primary", children: [
                /* @__PURE__ */ jsx(Plus, { className: "h-3 w-3" }),
                " Create new campaign"
              ] }) })
            ] })
          ] }),
          showCampaignInput && /* @__PURE__ */ jsxs("div", { className: "flex gap-2 mt-1", children: [
            /* @__PURE__ */ jsx(Input, { placeholder: "Campaign name", value: newCampaignName, onChange: (e) => setNewCampaignName(e.target.value), className: "flex-1", autoFocus: true }),
            /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
              setShowCampaignInput(false);
              setNewCampaignName("");
            }, children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 flex items-center gap-3", children: [
        /* @__PURE__ */ jsx(Button, { onClick: search, disabled: finding || !activeNiche, className: "bg-gradient-primary px-6", children: finding ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
          " Searching..."
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Search, { className: "mr-2 h-4 w-4" }),
          " Find Leads"
        ] }) }),
        finding && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [
          /* @__PURE__ */ jsx("div", { className: "h-1.5 w-32 overflow-hidden rounded-full bg-muted", children: /* @__PURE__ */ jsx("div", { className: "h-full rounded-full bg-primary/40 transition-all duration-1000", style: {
            width: `${Math.min(elapsed / 45 * 100, 100)}%`
          } }) }),
          elapsed,
          "s"
        ] })
      ] })
    ] }),
    results.length > 0 && !finding && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
          stats.total,
          " total"
        ] }),
        /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
          /* @__PURE__ */ jsx(Mail, { className: "mr-1 h-3 w-3" }),
          stats.withEmail,
          " with email"
        ] }),
        stats.verified > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { className: "mr-1 h-3 w-3" }),
          stats.verified,
          " verified"
        ] }),
        stats.risky > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800", children: [
          /* @__PURE__ */ jsx(ShieldAlert, { className: "mr-1 h-3 w-3" }),
          stats.risky,
          " risky"
        ] }),
        stats.unknown > 0 && /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
          /* @__PURE__ */ jsx(Shield, { className: "mr-1 h-3 w-3" }),
          stats.unknown,
          " unknown"
        ] }),
        stats.invalid > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800", children: [
          /* @__PURE__ */ jsx(ShieldX, { className: "mr-1 h-3 w-3" }),
          stats.invalid,
          " invalid"
        ] }),
        source && /* @__PURE__ */ jsx(Badge, { variant: source === "google-maps" ? "default" : "secondary", className: "ml-auto", children: source === "google-maps" ? "Google Maps" : "OpenStreetMap" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3", children: [
        /* @__PURE__ */ jsx(Filter, { className: "h-4 w-4 text-muted-foreground shrink-0" }),
        /* @__PURE__ */ jsx(Input, { placeholder: "Search leads...", value: searchText, onChange: (e) => setSearchText(e.target.value), className: "h-8 w-48 text-xs" }),
        ["verified", "risky", "unknown", "invalid"].map((s) => /* @__PURE__ */ jsx("button", { onClick: () => setStatusFilter(statusFilter === s ? null : s), className: `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${statusFilter === s ? s === "verified" ? "bg-emerald-600 text-white" : s === "risky" ? "bg-amber-600 text-white" : s === "invalid" ? "bg-red-600 text-white" : "bg-muted-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`, children: s.charAt(0).toUpperCase() + s.slice(1) }, s)),
        /* @__PURE__ */ jsx("div", { className: "h-4 w-px bg-border" }),
        /* @__PURE__ */ jsxs("button", { onClick: () => setHasWebsiteFilter(!hasWebsiteFilter), className: `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${hasWebsiteFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`, children: [
          /* @__PURE__ */ jsx(Globe, { className: "mr-1 h-3 w-3 inline" }),
          "Has website"
        ] }),
        /* @__PURE__ */ jsxs("button", { onClick: () => setHasEmailFilter(!hasEmailFilter), className: `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${hasEmailFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`, children: [
          /* @__PURE__ */ jsx(Mail, { className: "mr-1 h-3 w-3 inline" }),
          "Has email"
        ] }),
        /* @__PURE__ */ jsxs("button", { onClick: () => setSourceFilter(sourceFilter === "google-maps" ? null : "google-maps"), className: `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${sourceFilter === "google-maps" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`, children: [
          /* @__PURE__ */ jsx(Map, { className: "mr-1 h-3 w-3 inline" }),
          "Google Maps"
        ] }),
        (statusFilter || hasWebsiteFilter || hasEmailFilter || sourceFilter || searchText) && /* @__PURE__ */ jsx("button", { onClick: () => {
          setStatusFilter(null);
          setHasWebsiteFilter(false);
          setHasEmailFilter(false);
          setSourceFilter(null);
          setSearchText("");
        }, className: "rounded-full px-2.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors", children: "Clear all" }),
        /* @__PURE__ */ jsxs("span", { className: "ml-auto text-xs text-muted-foreground", children: [
          "Showing ",
          filtered.length,
          " of ",
          results.length
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("h2", { className: "text-lg font-semibold", children: [
          filtered.length,
          " lead",
          filtered.length !== 1 ? "s" : "",
          filtered.length !== results.length && ` (filtered from ${results.length})`
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => setSelected(new Set(filtered.map((_, fi) => results.indexOf(filtered[fi])))), children: "Select all" }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => setSelected(/* @__PURE__ */ new Set()), children: "Deselect all" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: filtered.map((lead) => {
        const i = results.indexOf(lead);
        const isInvalid = lead.email_status === "invalid";
        const isRisky = lead.email_status === "risky";
        return /* @__PURE__ */ jsxs("div", { onClick: () => toggle(i), className: `relative cursor-pointer rounded-xl border p-4 transition-all ${isInvalid ? selected.has(i) ? "border-red-400 bg-red-50/50 dark:bg-red-950/20 shadow-sm" : "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10" : selected.has(i) ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-muted-foreground/30"}`, children: [
          /* @__PURE__ */ jsx("div", { className: "absolute right-3 top-3", children: /* @__PURE__ */ jsx("div", { className: `flex h-5 w-5 items-center justify-center rounded-md border ${selected.has(i) ? isInvalid ? "border-red-500 bg-red-500 text-white" : "border-primary bg-primary text-primary-foreground" : "border-input"}`, children: selected.has(i) && /* @__PURE__ */ jsx(Check, { className: "h-3 w-3" }) }) }),
          /* @__PURE__ */ jsx("button", { onClick: (e) => {
            e.stopPropagation();
            removeLead(i);
          }, className: "absolute right-3 top-9 text-muted-foreground/40 hover:text-destructive transition-colors", title: "Remove lead", children: /* @__PURE__ */ jsx(X, { className: "h-3.5 w-3.5" }) }),
          isInvalid && /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { className: "h-3 w-3 shrink-0" }),
            "Not recommended for sending"
          ] }),
          isRisky && !isInvalid && /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { className: "h-3 w-3 shrink-0" }),
            "Use with caution"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pr-8", children: [
            /* @__PURE__ */ jsx("h3", { className: "font-semibold text-foreground truncate", children: lead.company || lead.name }),
            lead.category && /* @__PURE__ */ jsx("p", { className: "text-xs text-primary/80 truncate", children: lead.category }),
            lead.company && lead.name !== lead.company && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground truncate", children: lead.name })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-2 space-y-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsx(Mail, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: lead.email })
            ] }),
            lead.email_status && /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-1.5 text-xs font-medium ${lead.email_status === "verified" ? "text-emerald-600 dark:text-emerald-400" : lead.email_status === "risky" ? "text-amber-600 dark:text-amber-400" : lead.email_status === "invalid" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`, children: [
              lead.email_status === "verified" ? /* @__PURE__ */ jsx(ShieldCheck, { className: "h-3.5 w-3.5 shrink-0" }) : lead.email_status === "risky" ? /* @__PURE__ */ jsx(ShieldAlert, { className: "h-3.5 w-3.5 shrink-0" }) : lead.email_status === "invalid" ? /* @__PURE__ */ jsx(ShieldX, { className: "h-3.5 w-3.5 shrink-0" }) : /* @__PURE__ */ jsx(Shield, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
                lead.email_status === "verified" && `Verified (${lead.email_confidence}%)`,
                lead.email_status === "risky" && `Risky (${lead.email_confidence}%)`,
                lead.email_status === "invalid" && `Invalid`,
                lead.email_status === "unknown" && "Unknown"
              ] })
            ] }),
            lead.email_source && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: /* @__PURE__ */ jsx("span", { className: "text-[10px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400", children: lead.email_source === "website-mailto" ? "mailto" : "website" }) }),
            lead.phone && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsx(Phone, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: lead.phone })
            ] }),
            lead.city && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
                lead.city,
                lead.country ? `, ${lead.country}` : ""
              ] })
            ] }),
            lead.address && !lead.city && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: lead.address })
            ] }),
            lead.website && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsx(Globe, { className: "h-3.5 w-3.5 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "") })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-center gap-2", children: [
            lead.rating && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: [
              /* @__PURE__ */ jsx(Star, { className: "h-3 w-3 fill-yellow-400 text-yellow-400" }),
              lead.rating.toFixed(1)
            ] }),
            lead.source && /* @__PURE__ */ jsx("span", { className: `text-xs px-1.5 py-0.5 rounded ${lead.source === "google-maps" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" : "bg-muted text-muted-foreground"}`, children: lead.source === "google-maps" ? "Google Maps" : "OSM" })
          ] })
        ] }, i);
      }) }),
      selected.size > 0 && !saved && /* @__PURE__ */ jsxs("div", { className: "sticky bottom-0 flex items-center justify-between rounded-xl border border-primary/20 bg-card p-4 shadow-glow", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs("span", { className: "text-sm font-medium", children: [
            selected.size,
            " lead",
            selected.size !== 1 ? "s" : "",
            " selected"
          ] }),
          selectedInvalid > 0 && /* @__PURE__ */ jsxs("span", { className: "text-xs text-red-600 dark:text-red-400 flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { className: "h-3 w-3" }),
            selectedInvalid,
            " invalid — will be added but not recommended for sending"
          ] })
        ] }),
        /* @__PURE__ */ jsx(Button, { onClick: saveSelected, disabled: saving || creatingCampaign, className: "bg-gradient-primary", children: saving || creatingCampaign ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
          " ",
          creatingCampaign ? "Creating campaign..." : "Adding..."
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Check, { className: "mr-2 h-4 w-4" }),
          " Add to Campaign"
        ] }) })
      ] }),
      saved && confirmCount !== null && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-success/20 bg-success/5 p-6 text-center space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2 text-success font-semibold", children: [
          /* @__PURE__ */ jsx(Check, { className: "h-5 w-5" }),
          confirmCount,
          " lead",
          confirmCount !== 1 ? "s" : "",
          " added successfully!"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: campaignId ? `Assigned to campaign. Go to Campaigns to launch when ready.` : `Added as unassigned leads. Assign them to a campaign from the Leads page.` }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2", children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
            setSaved(false);
            setConfirmCount(null);
          }, children: "Search again" }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate({
            to: "/leads"
          }), children: "View all leads →" }),
          campaignId && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate({
            to: "/campaigns"
          }), children: "Go to campaigns →" })
        ] })
      ] })
    ] }),
    network.length > 0 && !finding && /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsx(Building2, { className: "h-4 w-4 text-primary" }),
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: "Warm network matches" }),
        /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", children: "No cold email needed" })
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
        'Businesses already on OutreachAI matching "',
        activeNiche,
        '". Their email stays private — request a warm intro and they choose to accept (so does the steady drip cadence you know).'
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: network.map((m) => /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-card p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-foreground truncate", children: m.business }),
          m.matched.length > 0 && /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400", children: m.matched.join(", ") })
        ] }),
        m.offer && /* @__PURE__ */ jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: m.offer }),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-center gap-3 text-xs text-muted-foreground", children: [
          m.country && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(MapPin, { className: "h-3 w-3" }),
            m.country
          ] }),
          m.niche && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(Building2, { className: "h-3 w-3" }),
            m.niche
          ] })
        ] }),
        m.website_url && /* @__PURE__ */ jsxs("a", { href: m.website_url, target: "_blank", rel: "noreferrer", onClick: (e) => e.stopPropagation(), className: "mt-2 flex items-center gap-1.5 text-sm text-primary hover:underline", children: [
          /* @__PURE__ */ jsx(Globe, { className: "h-3.5 w-3.5" }),
          /* @__PURE__ */ jsx("span", { className: "truncate", children: m.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "") })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-3", children: networkRequested.has(m.target_user_id) ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400", children: [
          /* @__PURE__ */ jsx(Check, { className: "h-3.5 w-3.5" }),
          " Intro requested — they'll be notified"
        ] }) : /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "w-full bg-gradient-primary text-primary-foreground hover:bg-gradient-primary/90", disabled: sendingNetwork !== null, onClick: () => requestIntro(m), children: sendingNetwork === m.target_user_id ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-3.5 w-3.5 animate-spin" }),
          " Sending..."
        ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Request warm intro" }) }) })
      ] }, m.target_user_id)) })
    ] }),
    !finding && results.length === 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-dashed border-border p-12 text-center", children: [
      /* @__PURE__ */ jsx(Sparkles, { className: "mx-auto h-10 w-10 text-muted-foreground/40" }),
      /* @__PURE__ */ jsxs("p", { className: "mt-3 text-sm text-muted-foreground", children: [
        "Select a business type above and click ",
        /* @__PURE__ */ jsx("strong", { children: "Find Leads" }),
        " to discover businesses with public emails."
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-muted-foreground/60", children: "Powered by Google Maps + email verification · 10,000 free searches/month" })
    ] })
  ] });
}
export {
  LeadFinderPage as component
};
//# sourceMappingURL=lead-finder-BGxHz0zN.js.map
