import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Sparkles, Loader2, Check, MapPin, Phone, Star, Globe, Mail,
  Search, Shield, ShieldCheck, ShieldAlert, ShieldX, X, Building2, Map,
  Filter, Plus, ChevronDown, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lead-finder")({
  component: LeadFinderPage,
});

type Campaign = { id: string; name: string };
type FoundLead = {
  name: string; email: string; company: string; job_title: string;
  country: string; city?: string; website: string; phone?: string;
  address?: string; rating?: number | null; source?: string;
  category?: string; place_id?: string;
  email_source?: string; email_source_url?: string;
  email_status?: string; email_confidence?: number;
  email_is_role?: boolean; email_is_disposable?: boolean;
  email_verification_reason?: string;
};

type NetworkMatch = {
  target_user_id: string; business: string; company: string | null;
  offer: string; website_url: string | null; country: string | null; niche: string | null;
  matched: string[];
};

type AreaSuggestion = {
  city: string; region: string; businesses: number;
  with_websites: number; score: number;
};

const PRESET_NICHES = [
  { label: "Dentists", value: "dentist" },
  { label: "Gyms", value: "gym" },
  { label: "Restaurants", value: "restaurant" },
  { label: "Salons", value: "salon" },
  { label: "Lawyers", value: "lawyer" },
  { label: "Real Estate", value: "real estate" },
  { label: "Insurance", value: "insurance" },
  { label: "Accountants", value: "accountant" },
  { label: "Veterinarians", value: "veterinarian" },
  { label: "Car Repair", value: "car repair" },
  { label: "Contractors", value: "contractor" },
  { label: "Photographers", value: "photographer" },
];

function LeadFinderPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [country, setCountry] = useState("United States");
  const [limit, setLimit] = useState("25");
  const [location, setLocation] = useState("");
  const [suggestingAreas, setSuggestingAreas] = useState(false);
  const [areaSuggestions, setAreaSuggestions] = useState<AreaSuggestion[]>([]);
  const [areaError, setAreaError] = useState("");
  const [autoBadges, setAutoBadges] = useState(false);
  const [customNiche, setCustomNiche] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("");
  const [finding, setFinding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<FoundLead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [network, setNetwork] = useState<NetworkMatch[]>([]);
  const [networkRequested, setNetworkRequested] = useState<Set<string>>(new Set());
  const [sendingNetwork, setSendingNetwork] = useState<string | null>(null);

  // Phase 3: review/filter state
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState(false);
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showCampaignInput, setShowCampaignInput] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").then(({ data }) => setCampaigns((data as Campaign[]) ?? []));
  }, []);

  const activeNiche = customNiche.trim() || selectedNiche;

  // --- Filtered results ---
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

  // --- Statistics ---
  const stats = useMemo(() => {
    const total = results.length;
    const withEmail = results.filter((l) => !!l.email).length;
    const verified = results.filter((l) => l.email_status === "verified").length;
    const risky = results.filter((l) => l.email_status === "risky").length;
    const unknown = results.filter((l) => l.email_status === "unknown").length;
    const invalid = results.filter((l) => l.email_status === "invalid").length;
    const withWebsite = results.filter((l) => !!l.website).length;
    return { total, withEmail, verified, risky, unknown, invalid, withWebsite };
  }, [results]);

  // --- Search ---
  async function suggestAreas(auto = false) {
    if (!activeNiche || suggestingAreas) return;
    setSuggestingAreas(true);
    setAreaError("");
    try {
      const { data, error } = await supabase.functions.invoke("suggest-areas", {
        body: { jobTitle: activeNiche, country: country || "United States" },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      const areas: AreaSuggestion[] = data?.areas ?? [];
      setAreaSuggestions(areas);
      if (auto) setAutoBadges(true);
      if (!auto && areas.length === 0 && data?.message) toast.info(data.message);
    } catch (err) {
      console.error("suggest-areas failed", err);
      if (!auto) setAreaError(err instanceof Error ? err.message : "Could not load area suggestions");
    } finally {
      setSuggestingAreas(false);
    }
  }

  function applyArea(city: string) {
    setLocation(city);
    setAreaSuggestions([]);
    setAreaError("");
    setAutoBadges(false);
  }

  async function search() {
    if (!activeNiche) { toast.error("Select or type a business type"); return; }
    setFinding(true);
    setElapsed(0);
    setResults([]);
    setNetwork([]);
    setNetworkRequested(new Set());
    setSelected(new Set());
    setSaved(false);
    setSearchText("");
    setStatusFilter(null);
    setHasWebsiteFilter(false);
    setHasEmailFilter(false);
    setSourceFilter(null);
    setConfirmCount(null);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const { data, error } = await supabase.functions.invoke("find-leads", {
        body: {
          campaignId: campaignId || null,
          jobTitle: activeNiche,
          country: country || "United States",
          location: location.trim() || undefined,
          limit: parseInt(limit),
        },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);

      const leads: FoundLead[] = data.leads ?? [];
      setSource(data.source ?? "");
      setNetwork((data.network ?? []) as NetworkMatch[]);
      if (leads.length === 0) {
        toast.info(data.message ?? "No leads found. Try a different niche or country.");
      } else {
        setResults(leads);
        setSelected(new Set(leads.map((_, i) => i)));
        toast.success(`Found ${leads.length} leads`);
        if (!location.trim()) suggestAreas(true);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Search failed");
    } finally {
      clearInterval(timer);
      setFinding(false);
    }
  }

  // --- Save ---
  async function saveSelected() {
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }

    let targetCampaignId = campaignId;

    // Create new campaign if requested
    if (showCampaignInput && newCampaignName.trim()) {
      setCreatingCampaign(true);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data: newCampaign, error: cErr } = await supabase
          .from("campaigns")
          .insert({ user_id: u.user.id, name: newCampaignName.trim(), status: "draft" })
          .select("id")
          .single();
        if (cErr) throw new Error(cErr.message);
        targetCampaignId = newCampaign.id;
        setCampaignId(targetCampaignId);
        setCampaigns((prev) => [...prev, { id: targetCampaignId, name: newCampaignName.trim() }]);
        setNewCampaignName("");
        setShowCampaignInput(false);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to create campaign");
        setCreatingCampaign(false);
        return;
      }
      setCreatingCampaign(false);
    }

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      // Pre-check: which emails already exist for this user (skips email-less leads)
      const replaceable = [...selected].filter((i) => !!results[i]?.email);
      const selectedEmails = replaceable.map((i) => results[i].email.toLowerCase());
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("email")
        .eq("user_id", u.user.id)
        .in("normalized_email", selectedEmails)
        .limit(5000);
      const existingEmails = new Set((existingLeads ?? []).map((l: { email: string | null }) => l.email?.toLowerCase() ?? ""));

      const rows = replaceable
        .filter((i) => !existingEmails.has(results[i].email!.toLowerCase()))
        .map((i) => ({
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
          status: "new" as const,
          category: results[i].category || null,
          place_id: results[i].place_id || null,
          lead_source: results[i].source || null,
          email_source: results[i].email_source || null,
          email_source_url: results[i].email_source_url || null,
          email_status: results[i].email_status || null,
          email_confidence: results[i].email_confidence ?? null,
          email_is_role: results[i].email_is_role ?? null,
          email_is_disposable: results[i].email_is_disposable ?? null,
          email_verification_reason: results[i].email_verification_reason || null,
        }));

      let savedCount = 0;
      let dupeCount = existingEmails.size;
      for (const row of rows) {
        const { error } = await supabase.from("leads").insert(row);
        if (!error) savedCount++;
        else if (error.code === "23505") dupeCount++; // unique constraint violation
      }

      setConfirmCount(savedCount);
      if (dupeCount > 0) {
        toast.warning(`${savedCount} added, ${dupeCount} duplicate${dupeCount !== 1 ? "s" : ""} skipped`);
      } else {
        toast.success(`Added ${savedCount} lead${savedCount !== 1 ? "s" : ""}!`);
      }
      setSaved(true);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggle(i: number) {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  }

  function removeLead(i: number) {
    const nextResults = results.filter((_, idx) => idx !== i);
    const nextSelected = new Set<number>();
    for (const s of selected) {
      if (s < i) nextSelected.add(s);
      else if (s > i) nextSelected.add(s - 1);
    }
    setResults(nextResults);
    setSelected(nextSelected);
  }

  const selectedInvalid = [...selected].filter((i) => results[i]?.email_status === "invalid").length;

  async function requestIntro(m: NetworkMatch) {
    setSendingNetwork(m.target_user_id);
    try {
      const { data, error } = await supabase.functions.invoke("network-intros", {
        body: { action: "request", target_user_id: m.target_user_id },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      setNetworkRequested((prev) => new Set(prev).add(m.target_user_id));
      toast.success(data.message ?? "Intro request sent — they'll be notified");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send intro request");
    } finally {
      setSendingNetwork(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/leads" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI Lead Finder
          </h1>
          <p className="text-sm text-muted-foreground">
            Discover real businesses, verify emails, review and add to campaigns
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Business Type *</label>
            <Input
              placeholder="e.g. dentist, gym, restaurant"
              value={customNiche}
              onChange={(e) => { setCustomNiche(e.target.value); setSelectedNiche(""); }}
              className="flex-1"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_NICHES.map((n) => (
                <button
                  key={n.value}
                  onClick={() => { setSelectedNiche(n.value); setCustomNiche(""); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedNiche === n.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              City / Area <span className="font-normal text-muted-foreground">(optional — target a metro)</span>
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Austin, Jackson Heights, London"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setAutoBadges(false); }}
              />
              <Button
                variant="outline"
                onClick={() => suggestAreas(false)}
                disabled={suggestingAreas || !activeNiche}
                className="shrink-0"
              >
                {suggestingAreas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Suggest areas
              </Button>
            </div>
            {suggestingAreas && <p className="text-xs text-muted-foreground">Probing top metros for this niche…</p>}
            {areaSuggestions.length > 0 && !autoBadges && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {areaSuggestions.map((a, i) => (
                  <button
                    key={a.city}
                    onClick={() => applyArea(`${a.city}, ${a.region}`)}
                    title={`${a.businesses} businesses · ${a.with_websites} with websites`}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      i < 3
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {i < 3 ? "★ " : ""}{a.city} · {a.businesses}
                  </button>
                ))}
                {areaSuggestions.length > 0 && (
                  <span className="text-xs text-muted-foreground self-center">
                    {areaSuggestions.length >= 3 ? "★ top 3 = best" : ""}
                  </span>
                )}
              </div>
            )}
            {autoBadges && areaSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-muted-foreground">Best areas for this search:</span>
                {areaSuggestions.slice(0, 3).map((a) => (
                  <button
                    key={a.city}
                    onClick={() => applyArea(`${a.city}, ${a.region}`)}
                    className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
                  >
                    {a.city}
                  </button>
                ))}
                <span className="text-muted-foreground">— pick one, or type any city</span>
              </div>
            )}
            {areaError && <p className="text-xs text-destructive">{areaError}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Country</label>
            <Input
              placeholder="e.g. United States, United Kingdom"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Number of leads</label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 leads</SelectItem>
                <SelectItem value="25">25 leads</SelectItem>
                <SelectItem value="50">50 leads</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Assign to campaign</label>
            <Select value={showCampaignInput ? "__new__" : campaignId} onValueChange={(v) => {
              if (v === "__new__") { setShowCampaignInput(true); setCampaignId(""); }
              else { setShowCampaignInput(false); setCampaignId(v); }
            }}>
              <SelectTrigger><SelectValue placeholder="Optional — skip to add as unassigned" /></SelectTrigger>
              <SelectContent className="max-w-[300px]">
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="block truncate">{c.name}</span>
                  </SelectItem>
                ))}
                <SelectItem value="__new__">
                  <span className="flex items-center gap-1.5 text-primary"><Plus className="h-3 w-3" /> Create new campaign</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {showCampaignInput && (
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Campaign name"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button variant="ghost" size="sm" onClick={() => { setShowCampaignInput(false); setNewCampaignName(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={search} disabled={finding || !activeNiche} className="bg-gradient-primary px-6">
            {finding ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</>
            ) : (
              <><Search className="mr-2 h-4 w-4" /> Find Leads</>
            )}
          </Button>
          {finding && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/40 transition-all duration-1000" style={{ width: `${Math.min((elapsed / 45) * 100, 100)}%` }} />
              </div>
              {elapsed}s
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && !finding && (
        <div className="space-y-4">
          {/* Statistics Bar */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{stats.total} total</Badge>
            <Badge variant="secondary"><Mail className="mr-1 h-3 w-3" />{stats.withEmail} with email</Badge>
            {stats.verified > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="mr-1 h-3 w-3" />{stats.verified} verified
              </Badge>
            )}
            {stats.risky > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                <ShieldAlert className="mr-1 h-3 w-3" />{stats.risky} risky
              </Badge>
            )}
            {stats.unknown > 0 && (
              <Badge variant="secondary"><Shield className="mr-1 h-3 w-3" />{stats.unknown} unknown</Badge>
            )}
            {stats.invalid > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">
                <ShieldX className="mr-1 h-3 w-3" />{stats.invalid} invalid
              </Badge>
            )}
            {source && (
              <Badge variant={source === "google-maps" ? "default" : "secondary"} className="ml-auto">
                {source === "google-maps" ? "Google Maps" : "OpenStreetMap"}
              </Badge>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search leads..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 w-48 text-xs"
            />
            {(["verified", "risky", "unknown", "invalid"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? s === "verified" ? "bg-emerald-600 text-white"
                      : s === "risky" ? "bg-amber-600 text-white"
                      : s === "invalid" ? "bg-red-600 text-white"
                      : "bg-muted-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => setHasWebsiteFilter(!hasWebsiteFilter)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                hasWebsiteFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Globe className="mr-1 h-3 w-3 inline" />Has website
            </button>
            <button
              onClick={() => setHasEmailFilter(!hasEmailFilter)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                hasEmailFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Mail className="mr-1 h-3 w-3 inline" />Has email
            </button>
            <button
              onClick={() => setSourceFilter(sourceFilter === "google-maps" ? null : "google-maps")}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                sourceFilter === "google-maps" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Map className="mr-1 h-3 w-3 inline" />Google Maps
            </button>
            {(statusFilter || hasWebsiteFilter || hasEmailFilter || sourceFilter || searchText) && (
              <button
                onClick={() => { setStatusFilter(null); setHasWebsiteFilter(false); setHasEmailFilter(false); setSourceFilter(null); setSearchText(""); }}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                Clear all
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {filtered.length} of {results.length}
            </span>
          </div>

          {/* Results Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== results.length && ` (filtered from ${results.length})`}
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(filtered.map((_, fi) => results.indexOf(filtered[fi]))))}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Deselect all
              </Button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((lead) => {
              const i = results.indexOf(lead);
              const isInvalid = lead.email_status === "invalid";
              const isRisky = lead.email_status === "risky";
              return (
                <div
                  key={i}
                  onClick={() => toggle(i)}
                  className={`relative cursor-pointer rounded-xl border p-4 transition-all ${
                    isInvalid
                      ? selected.has(i)
                        ? "border-red-400 bg-red-50/50 dark:bg-red-950/20 shadow-sm"
                        : "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10"
                      : selected.has(i)
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="absolute right-3 top-3">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      selected.has(i)
                        ? isInvalid ? "border-red-500 bg-red-500 text-white" : "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    }`}>
                      {selected.has(i) && <Check className="h-3 w-3" />}
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeLead(i); }}
                    className="absolute right-3 top-9 text-muted-foreground/40 hover:text-destructive transition-colors"
                    title="Remove lead"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {/* Invalid warning banner */}
                  {isInvalid && (
                    <div className="mb-2 flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Not recommended for sending
                    </div>
                  )}
                  {isRisky && !isInvalid && (
                    <div className="mb-2 flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Use with caution
                    </div>
                  )}

                  {/* Content */}
                  <div className="pr-8">
                    <h3 className="font-semibold text-foreground truncate">{lead.company || lead.name}</h3>
                    {lead.category && (
                      <p className="text-xs text-primary/80 truncate">{lead.category}</p>
                    )}
                    {lead.company && lead.name !== lead.company && (
                      <p className="text-xs text-muted-foreground truncate">{lead.name}</p>
                    )}
                  </div>

                  {/* Details */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                    {lead.email_status && (
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${
                        lead.email_status === "verified"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : lead.email_status === "risky"
                          ? "text-amber-600 dark:text-amber-400"
                          : lead.email_status === "invalid"
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}>
                        {lead.email_status === "verified" ? (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        ) : lead.email_status === "risky" ? (
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                        ) : lead.email_status === "invalid" ? (
                          <ShieldX className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Shield className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {lead.email_status === "verified" && `Verified (${lead.email_confidence}%)`}
                          {lead.email_status === "risky" && `Risky (${lead.email_confidence}%)`}
                          {lead.email_status === "invalid" && `Invalid`}
                          {lead.email_status === "unknown" && "Unknown"}
                        </span>
                      </div>
                    )}
                    {lead.email_source && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="text-[10px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                          {lead.email_source === "website-mailto" ? "mailto" : "website"}
                        </span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.phone}</span>
                      </div>
                    )}
                    {lead.city && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {lead.city}{lead.country ? `, ${lead.country}` : ""}
                        </span>
                      </div>
                    )}
                    {lead.address && !lead.city && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.address}</span>
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer: rating + source */}
                  <div className="mt-2 flex items-center gap-2">
                    {lead.rating && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {lead.rating.toFixed(1)}
                      </div>
                    )}
                    {lead.source && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        lead.source === "google-maps"
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {lead.source === "google-maps" ? "Google Maps" : "OSM"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Bar */}
          {selected.size > 0 && !saved && (
            <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-primary/20 bg-card p-4 shadow-glow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selected.size} lead{selected.size !== 1 ? "s" : ""} selected
                </span>
                {selectedInvalid > 0 && (
                  <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {selectedInvalid} invalid — will be added but not recommended for sending
                  </span>
                )}
              </div>
              <Button onClick={saveSelected} disabled={saving || creatingCampaign} className="bg-gradient-primary">
                {(saving || creatingCampaign) ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {creatingCampaign ? "Creating campaign..." : "Adding..."}</>
                ) : (
                  <><Check className="mr-2 h-4 w-4" /> Add to Campaign</>
                )}
              </Button>
            </div>
          )}

          {/* Confirmation */}
          {saved && confirmCount !== null && (
            <div className="rounded-xl border border-success/20 bg-success/5 p-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-success font-semibold">
                <Check className="h-5 w-5" />
                {confirmCount} lead{confirmCount !== 1 ? "s" : ""} added successfully!
              </div>
              <p className="text-sm text-muted-foreground">
                {campaignId
                  ? `Assigned to campaign. Go to Campaigns to launch when ready.`
                  : `Added as unassigned leads. Assign them to a campaign from the Leads page.`}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setSaved(false); setConfirmCount(null); }}>
                  Search again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/leads" })}>
                  View all leads →
                </Button>
                {campaignId && (
                  <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/campaigns" })}>
                    Go to campaigns →
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warm network matches */}
      {network.length > 0 && !finding && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Warm network matches</h2>
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
            >
              No cold email needed
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Businesses already on OutshipAi matching "{activeNiche}". Their email stays private — request a warm intro and they
            choose to accept (so does the steady drip cadence you know).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {network.map((m) => (
              <div key={m.target_user_id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate">{m.business}</h3>
                  {m.matched.length > 0 && (
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      {m.matched.join(", ")}
                    </span>
                  )}
                </div>
                {m.offer && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.offer}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {m.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.country}</span>}
                  {m.niche && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{m.niche}</span>}
                </div>
                {m.website_url && (
                  <a
                    href={m.website_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" /><span className="truncate">{m.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                  </a>
                )}
                <div className="mt-3">
                  {networkRequested.has(m.target_user_id) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Intro requested — they'll be notified
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full bg-gradient-primary text-primary-foreground hover:bg-gradient-primary/90"
                      disabled={sendingNetwork !== null}
                      onClick={() => requestIntro(m)}
                    >
                      {sendingNetwork === m.target_user_id ? (
                        <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Sending...</>
                      ) : (
                        <>Request warm intro</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!finding && results.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a business type above and click <strong>Find Leads</strong> to discover businesses with public emails.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Powered by Google Maps + email verification · 10,000 free searches/month
          </p>
        </div>
      )}
    </div>
  );
}
