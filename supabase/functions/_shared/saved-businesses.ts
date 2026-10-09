// "Our own map": a permanent, ever-growing ledger of every business the lead
// finder has legitimately found (Google, OpenStreetMap, website enrichment).
// Searches check this table FIRST — zero external cost, never runs out.
// Access via the service-role client (bypasses RLS).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Refresh policy: an area we already covered gets ONE new live search every
// REFRESH_INTERVAL, so businesses that open later still get discovered.
export const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// Safety: never spend more than this many live refreshes per day.
export const DAILY_REFRESH_CAP = 40;

export interface SavedLead {
  name: string;
  email: string;
  company: string;
  job_title: string;
  country: string;
  city: string;
  website: string;
  phone: string;
  address: string;
  rating: number | null;
  source: string;
  category: string;
  place_id: string;
  email_source?: string;
  email_source_url?: string;
  email_status?: string;
  email_confidence?: number;
  email_is_role?: boolean;
  email_is_disposable?: boolean;
  email_verification_reason?: string;
}

function domainOf(website?: string): string {
  if (!website) return "";
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Stable unique key per business: google/OSM place id, else website host,
// else the email's domain.
export function placeKey(lead: { place_id?: string; email?: string; website?: string }): string {
  if (lead.place_id) return String(lead.place_id);
  const d = domainOf(lead.website);
  if (d) return `mem-${d}`;
  if (lead.email) return `mem-${String(lead.email).split("@")[1] || String(lead.email)}`;
  return "";
}

export async function findSavedLeads(
  supabase: SupabaseClient,
  q: { niche: string; country: string; location?: string; limit: number },
): Promise<SavedLead[]> {
  let query = supabase
    .from("saved_businesses")
    .select("*")
    .eq("niche", q.niche)
    .eq("country", q.country)
    .order("last_seen", { ascending: false })
    .limit(Math.max(1, Math.min(q.limit, 100)));
  const locCity = (q.location ?? "").split(",")[0].trim().toLowerCase();
  if (locCity) {
    const safeLoc = locCity.replace(/[%_]/g, "\\$&");
    query = query.or(`city.ilike.%${safeLoc}%,address.ilike.%${safeLoc}%`);
  }
  const { data, error } = await query;
  if (error) {
    console.error("findSavedLeads:", error.message);
    return [];
  }
  const leads: SavedLead[] = (data ?? []).map((r) => ({
    name: String(r.name ?? r.company ?? r.email.split("@")[0] ?? ""),
    email: String(r.email ?? ""),
    company: String(r.company ?? ""),
    job_title: String(r.job_title ?? "Owner"),
    country: String(r.country ?? ""),
    city: String(r.city ?? ""),
    website: String(r.website ?? ""),
    phone: String(r.phone ?? ""),
    address: String(r.address ?? ""),
    rating: typeof r.rating === "number" ? r.rating : null,
    source: String(r.source ?? "database"),
    category: String(r.category ?? ""),
    place_id: String(r.place_id ?? ""),
    email_source: r.email_source ? String(r.email_source) : undefined,
    email_source_url: r.email_source_url ? String(r.email_source_url) : undefined,
    email_status: r.email_status ? String(r.email_status) : undefined,
    email_confidence: typeof r.email_confidence === "number" ? r.email_confidence : undefined,
    email_is_role: typeof r.email_is_role === "boolean" ? r.email_is_role : undefined,
    email_is_disposable: typeof r.email_is_disposable === "boolean" ? r.email_is_disposable : undefined,
    email_verification_reason: r.email_verification_reason ? String(r.email_verification_reason) : undefined,
  }));

  // Light per-business dedupe (same website host or same email domain + city).
  const seen = new Set<string>();
  const out: SavedLead[] = [];
  for (const l of leads) {
    const d = domainOf(l.website) || (l.email.split("@")[1] ?? "");
    const key = d ? `${d}|${String(l.city).toLowerCase()}` : l.email;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export async function saveBusinesses(
  supabase: SupabaseClient,
  leads: Array<Record<string, any>>,
  niche: string,
  country: string,
): Promise<number> {
  // A business is worth remembering even before we know its email: Google
  // returns the business, not the inbox, and most rows have no email. Keeping
  // only email-bearing rows is why this "our own map" stayed at ~100 entries
  // and never got big enough to answer a repeat search for free. So we now save
  // BOTH: with-email rows into one upsert, no-email rows into another that
  // deliberately omits the email columns, so a later email-less sighting of a
  // business we already have an email for can never blank that email out.
  const withEmail: Array<Record<string, unknown>> = [];
  const noEmail: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const email = String(l.email ?? "").trim().toLowerCase();
    const hasEmail = email.includes("@");
    const key = placeKey(l as { place_id?: string; email?: string; website?: string });
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const identity: Record<string, unknown> = {
      place_id: key,
      website: String(l.website ?? ""),
      domain: domainOf(String(l.website ?? "")),
      name: String(l.name ?? ""),
      company: String(l.company ?? l.name ?? ""),
      job_title: String(l.job_title ?? "Owner"),
      niche: String(niche ?? "").trim().toLowerCase(),
      country: String(country ?? "").trim(),
      city: String(l.city ?? ""),
      source: String(l.source ?? ""),
      category: String(l.category ?? ""),
      phone: String(l.phone ?? ""),
      address: String(l.address ?? ""),
      rating: typeof l.rating === "number" ? l.rating : null,
      last_seen: new Date().toISOString(),
    };
    if (hasEmail) {
      withEmail.push({
        ...identity,
        email,
        email_source: l.email_source ? String(l.email_source) : null,
        email_source_url: l.email_source_url ? String(l.email_source_url) : null,
        email_status: l.email_status ? String(l.email_status) : null,
        email_confidence: typeof l.email_confidence === "number" ? l.email_confidence : null,
        email_is_role: typeof l.email_is_role === "boolean" ? l.email_is_role : null,
        email_is_disposable: typeof l.email_is_disposable === "boolean" ? l.email_is_disposable : null,
      });
    } else {
      noEmail.push(identity);
    }
  }
  let saved = 0;
  if (withEmail.length > 0) {
    const { error } = await supabase.from("saved_businesses").upsert(withEmail, { onConflict: "place_id" });
    if (error) console.error("saveBusinesses(email):", error.message);
    else saved += withEmail.length;
  }
  if (noEmail.length > 0) {
    const { error } = await supabase.from("saved_businesses").upsert(noEmail, { onConflict: "place_id" });
    if (error) console.error("saveBusinesses(no email):", error.message);
    else saved += noEmail.length;
  }
  return saved;
}

// ---- Refresh rotation: keep covered areas fresh without wasting quota ----

export async function coverageStale(
  supabase: SupabaseClient,
  niche: string,
  country: string,
  city: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lead_refresh")
    .select("last_live_search_at")
    .eq("niche", niche)
    .eq("country", country)
    .eq("city", city)
    .maybeSingle();
  if (!data || !data.last_live_search_at) return true;
  return Date.now() - new Date(data.last_live_search_at).getTime() > REFRESH_INTERVAL_MS;
}

export async function markCoverageRefreshed(
  supabase: SupabaseClient,
  niche: string,
  country: string,
  city: string,
  query?: string,
): Promise<void> {
  const prev = await supabase
    .from("lead_refresh")
    .select("refreshes")
    .eq("niche", niche)
    .eq("country", country)
    .eq("city", city)
    .maybeSingle();
  const refreshes = Number(prev.data?.refreshes ?? 0) + 1;
  const { error } = await supabase
    .from("lead_refresh")
    .upsert(
      { niche, country, city, last_live_search_at: new Date().toISOString(), refreshes, query: query ?? null },
      { onConflict: "niche,country,city" },
    );
  if (error) console.error("markCoverageRefreshed:", error.message);
}

// Grants one refresh slot for today (subject to the daily cap). Returns false
// when the cap is spent — callers then serve memory instead of re-searching.
export async function grantRefresh(supabase: SupabaseClient): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("refresh_usage")
    .select("count")
    .eq("day", today)
    .maybeSingle();
  const used = Number(data?.count ?? 0);
  if (used >= DAILY_REFRESH_CAP) return false;
  const { error } = await supabase
    .from("refresh_usage")
    .upsert({ day: today, count: used + 1 }, { onConflict: "day" });
  if (error) console.error("grantRefresh:", error.message);
  return !error;
}