import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sparkles, Loader2, Check, MapPin, Phone, Star, Globe, Mail, Search, Shield, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
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
  email_status?: string; email_confidence?: number;
  email_is_role?: boolean; email_is_disposable?: boolean;
  email_verification_reason?: string;
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
  const [customNiche, setCustomNiche] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("");
  const [finding, setFinding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<FoundLead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").then(({ data }) => setCampaigns((data as Campaign[]) ?? []));
  }, []);

  const activeNiche = customNiche.trim() || selectedNiche;

  async function search() {
    if (!activeNiche) { toast.error("Select or type a business type"); return; }
    setFinding(true);
    setElapsed(0);
    setResults([]);
    setSelected(new Set());
    setSaved(false);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const { data, error } = await supabase.functions.invoke("find-leads", {
        body: {
          campaignId: campaignId || null,
          jobTitle: activeNiche,
          country: country || "United States",
          limit: parseInt(limit),
        },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);

      const leads: FoundLead[] = data.leads ?? [];
      setSource(data.source ?? "");
      if (leads.length === 0) {
        toast.info(data.message ?? "No leads found. Try a different niche or country.");
      } else {
        setResults(leads);
        setSelected(new Set(leads.map((_, i) => i)));
        toast.success(`Found ${leads.length} leads`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Search failed");
    } finally {
      clearInterval(timer);
      setFinding(false);
    }
  }

  async function saveSelected() {
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const rows = [...selected].map((i) => ({
        user_id: u.user.id,
        name: results[i].name || null,
        email: results[i].email,
        company: results[i].company || null,
        job_title: results[i].job_title || null,
        country: results[i].country || null,
        campaign_id: campaignId || null,
        status: "new" as const,
        category: results[i].category || null,
        place_id: results[i].place_id || null,
        lead_source: results[i].source || null,
        email_status: results[i].email_status || null,
        email_confidence: results[i].email_confidence ?? null,
        email_is_role: results[i].email_is_role ?? null,
        email_is_disposable: results[i].email_is_disposable ?? null,
        email_verification_reason: results[i].email_verification_reason || null,
      }));
      let savedCount = 0;
      for (const row of rows) {
        const { error } = await supabase.from("leads").insert(row);
        if (!error) savedCount++;
      }
      toast.success(`Added ${savedCount} lead${savedCount !== 1 ? "s" : ""}!`);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
            Discover real businesses with public email addresses from Google Maps
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Business Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Business Type *</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. dentist, gym, restaurant"
                value={customNiche}
                onChange={(e) => { setCustomNiche(e.target.value); setSelectedNiche(""); }}
                className="flex-1"
              />
            </div>
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

          {/* Country */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Country</label>
            <Input
              placeholder="e.g. United States, United Kingdom"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>

          {/* Number of leads */}
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

          {/* Campaign */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Assign to campaign</label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Optional — skip to add as unassigned" /></SelectTrigger>
              <SelectContent className="max-w-[300px]">
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="block truncate">{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search Button */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={search}
            disabled={finding || !activeNiche}
            className="bg-gradient-primary px-6"
          >
            {finding ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</>
            ) : (
              <><Search className="mr-2 h-4 w-4" /> Find Leads</>
            )}
          </Button>
          {finding && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/40 transition-all duration-1000"
                  style={{ width: `${Math.min((elapsed / 45) * 100, 100)}%` }}
                />
              </div>
              {elapsed}s
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && !finding && (
        <div className="space-y-4">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{results.length} leads found</h2>
              {source && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  source === "google-maps"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {source === "google-maps" ? "Google Maps" : "OpenStreetMap"}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(results.map((_, i) => i)))}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Deselect all
              </Button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((lead, i) => (
              <div
                key={i}
                onClick={() => toggle(i)}
                className={`relative cursor-pointer rounded-xl border p-4 transition-all ${
                  selected.has(i)
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                {/* Checkbox */}
                <div className="absolute right-3 top-3">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    selected.has(i)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input"
                  }`}>
                    {selected.has(i) && <Check className="h-3 w-3" />}
                  </div>
                </div>

                {/* Content */}
                <div className="pr-7">
                  <h3 className="font-semibold text-foreground truncate">{lead.company || lead.name}</h3>
                  {lead.category && (
                    <p className="text-xs text-primary/80 truncate">{lead.category}</p>
                  )}
                  {lead.company && lead.name !== lead.company && (
                    <p className="text-xs text-muted-foreground truncate">{lead.name}</p>
                  )}
                </div>

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
                        {lead.email_status === "invalid" && `Invalid — ${lead.email_verification_reason}`}
                        {lead.email_status === "unknown" && "Unknown"}
                      </span>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.phone}</span>
                    </div>
                  )}
                  {lead.address && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.address}</span>
                    </div>
                  )}
                  {lead.website && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                    </div>
                  )}
                </div>

                {lead.rating && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {lead.rating.toFixed(1)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save Bar */}
          {selected.size > 0 && !saved && (
            <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-primary/20 bg-card p-4 shadow-glow">
              <span className="text-sm font-medium">
                {selected.size} lead{selected.size !== 1 ? "s" : ""} selected
              </span>
              <Button onClick={saveSelected} disabled={saving} className="bg-gradient-primary">
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                ) : (
                  <><Check className="mr-2 h-4 w-4" /> Add to Leads</>
                )}
              </Button>
            </div>
          )}

          {saved && (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-center">
              <p className="text-sm font-medium text-success">Leads added successfully!</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate({ to: "/leads" })}>
                View all leads →
              </Button>
            </div>
          )}
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
            Powered by Google Maps · 10,000 free searches/month
          </p>
        </div>
      )}
    </div>
  );
}
