// Google Maps Places API (New) lead finder — finds businesses + enriches their websites for emails
// Uses Places API (New) Text Search Essentials — 10,000 free searches/month
// https://developers.google.com/maps/documentation/places/web-service/text-search

import { enrichWebsiteEmails } from "./website-email-enrichment.ts";
import { sampleMetros, type Metro } from "./areas.ts";

async function pMap<T, R>(items: T[], width: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface GoogleMapsLead {
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
}

// Places API (New) response types
interface NewTextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string; languageCode: string };
    websiteUri?: string;
    internationalPhoneNumber?: string;
    formattedAddress?: string;
    countryCode?: string;
    rating?: number;
    userRatingCount?: number;
    types?: string[];
    primaryType?: string;
  }>;
  nextPageToken?: string;
}

interface NewPlaceDetailsResponse {
  id: string;
  displayName?: { text: string; languageCode: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  formattedAddress?: string;
  countryCode?: string;
  rating?: number;
  types?: string[];
  primaryType?: string;
}

// Map country name to Google Maps region bias
const COUNTRY_REGIONS: Record<string, string> = {
  "united states": "us", usa: "us", us: "us", america: "us",
  "united kingdom": "gb", uk: "gb", england: "gb", scotland: "gb",
  canada: "ca", australia: "au", india: "in", germany: "de",
  france: "fr", spain: "es", italy: "it", netherlands: "nl",
  brazil: "br", mexico: "mx", "south africa": "za", nigeria: "ng",
  uae: "ae", emirates: "ae", "united arab emirates": "ae", dubai: "ae",
  "saudi arabia": "sa", ksa: "sa", singapore: "sg",
  malaysia: "my", philippines: "ph", pakistan: "pk", egypt: "eg",
  turkey: "tr", poland: "pl", sweden: "se", norway: "no", denmark: "dk",
  japan: "jp", "south korea": "kr", china: "cn", thailand: "th",
  indonesia: "id", vietnam: "vn", colombia: "co", argentina: "ar",
  chile: "cl", peru: "pe", portugal: "pt", ireland: "ie", belgium: "be",
  austria: "at", switzerland: "ch", finland: "fi", "new zealand": "nz",
  israel: "il", qatar: "qa", kuwait: "kw", bahrain: "bh", oman: "om",
  morocco: "ma", tunisia: "tn", jordan: "jo", lebanon: "lb", "hong kong": "hk",
};

// Pretty-print a Google Maps place type: "dentist" -> "Dentist", "health_care" -> "Health Care"
function formatCategory(types: string[] | undefined, primaryType?: string): string {
  const raw = primaryType ?? types?.[0] ?? "";
  if (!raw) return "";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Parse city and country from Google's formattedAddress
// Example: "25 E Washington St Ste 1921, Chicago, IL 60602, USA" -> city="Chicago", country="USA"
function parseCityCountry(formattedAddress: string | undefined, fallbackCountry: string): { city: string; country: string } {
  if (!formattedAddress) return { city: "", country: fallbackCountry };
  const parts = formattedAddress.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    const city = parts[parts.length - 3] ?? "";
    const country = parts[parts.length - 1] ?? fallbackCountry;
    return { city, country };
  }
  return { city: parts.length >= 2 ? parts[parts.length - 2] : "", country: fallbackCountry };
}

export function isGoogleMapsAvailable(): boolean {
  return !!Deno.env.get("GOOGLE_MAPS_API_KEY");
}

export interface SearchRegionSpec {
  query: string;
  cap: number;
}

export interface SearchResult {
  leads: GoogleMapsLead[];
  quotaHit: boolean;
}

export async function searchGoogleMaps(
  jobTitle: string,
  country: string,
  limit: number,
  location?: string,
  extraPhrases?: string[],
  extraAreas?: SearchRegionSpec[],
  enrichmentBudget?: number,
): Promise<SearchResult> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return { leads: [], quotaHit: false };

  const region = COUNTRY_REGIONS[String(country ?? "").toLowerCase().trim()];
  const phrases = [jobTitle, ...(extraPhrases ?? []).filter((p) => String(p).trim().toLowerCase() !== jobTitle.toLowerCase())]
    .slice(0, 3);
  const budget = enrichmentBudget ?? Math.max(limit, 25) * 2;

  // Prefer explicit areas (AI-suggested), then the typed location, then sampled
  // metros so country-wide searches vary between requests.
  const regions: SearchRegionSpec[] = extraAreas && extraAreas.length > 0
    ? extraAreas
    : location
    ? [{ query: String(location), cap: limit }]
    : sampleMetros(country, 4).map((m) => ({ query: m.query, cap: Math.max(5, Math.ceil(limit / 4)) }));

  const seenEmails = new Set<string>();
  const seenPlaceIds = new Set<string>();
  const shared = { set: seenEmails, seenPlaceIds, enrichmentsUsed: 0, quotaHit: false };
  const leads: GoogleMapsLead[] = [];

  for (const r of regions) {
    if (leads.length >= limit || shared.enrichmentsUsed >= budget || shared.quotaHit) break;
    const subLeads = await searchRegion(
      apiKey, phrases, region, limit - leads.length, r.cap, shared, () => shared.enrichmentsUsed++, budget, r.query, 8_000,
    );
    leads.push(...subLeads);
  }

  return { leads, quotaHit: shared.quotaHit };
}

async function searchRegion(
  apiKey: string,
  phrases: string[],
  region: string | undefined,
  limit: number,
  perRegionCap: number,
  shared: { set: Set<string>; seenPlaceIds: Set<string>; enrichmentsUsed: number; quotaHit: boolean },
  bumpEnrich: () => void,
  budget: number,
  where: string,
  pageDelayMs: number,
): Promise<GoogleMapsLead[]> {
  const leads: GoogleMapsLead[] = [];

  // Step 1: Text Search via Places API (New)
  // Note: places.countryCode is NOT supported by Text Search and causes HTTP 400 INVALID_ARGUMENT.
  const fieldMask = "places.id,places.displayName,places.websiteUri,places.internationalPhoneNumber,places.formattedAddress,places.rating,places.types,places.primaryType,nextPageToken";

  for (const phrase of phrases) {
    if (leads.length >= limit || leads.length >= perRegionCap || shared.enrichmentsUsed >= budget || shared.quotaHit) break;
    const query = `${phrase} in ${where}`;
    let pageToken: string | undefined;
    let pagesFetched = 0;
    const MAX_PAGES = 2;

    while (leads.length < limit && leads.length < perRegionCap && shared.enrichmentsUsed < budget && !shared.quotaHit && pagesFetched < MAX_PAGES) {
      const body: Record<string, unknown> = {
        textQuery: query,
        maxResultCount: 20,
      };
      if (region) body.regionCode = region;
      if (pageToken) body.pageToken = pageToken;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);

      let data: NewTextSearchResponse;
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.status === 429) {
          shared.quotaHit = true;
          break;
        }
        if (res.status >= 400) {
          console.error("Places searchText HTTP", res.status, query);
          break;
        }
        data = await res.json();
      } catch {
        break;
      } finally {
        clearTimeout(timer);
      }

      const places = data.places ?? [];
      if (places.length === 0) break;

      // Each candidate consumes enrichment budget; the cheapest useful pass for
      // a candidate is a single enrichment. Dedupe place ids across phrases.
      const room = Math.min(budget - shared.enrichmentsUsed, limit - leads.length, perRegionCap - leads.length);
      if (room <= 0) break;
      type Candidate = {
        place: NewTextSearchResponse["places"] extends Array<infer P> ? P : never;
        website: string;
        phone: string;
        address: string;
        rating: number | null;
      };
      const resolved = await pMap(places, 6, async (place): Promise<Candidate | null> => {
        if (shared.seenPlaceIds.has(place.id)) return null;
        shared.seenPlaceIds.add(place.id);
        let website = place.websiteUri ?? "";
        let phone = place.internationalPhoneNumber ?? "";
        let address = place.formattedAddress ?? "";
        let rating = place.rating ?? null;
        if (!website) {
          const details = await getPlaceDetailsNew(place.id, apiKey);
          if (details) {
            website = details.websiteUri ?? "";
            phone = details.internationalPhoneNumber ?? phone;
            address = details.formattedAddress ?? address;
            rating = details.rating ?? rating;
          }
        }
        if (!website) return null;
        return { place, website, phone, address, rating };
      });
      const withWebsite = resolved.filter((c): c is NonNullable<typeof c> => c !== null);
      if (withWebsite.length === 0) break;

      for (const c of withWebsite) {
        if (leads.length >= limit || leads.length >= perRegionCap || shared.enrichmentsUsed >= budget || shared.quotaHit) break;
        const { city, country: parsedCountry } = parseCityCountry(c.address, "");
        const countryName = String(parsedCountry ?? "").toLowerCase();
        const category = formatCategory(c.place.types, c.place.primaryType);

        // Step 3: Enrich website for publicly displayed emails — pick the single
        // best email so one business never floods the list with duplicates.
        bumpEnrich();
        const enrichment = await enrichWebsiteEmails(c.website);
        const best = enrichment.emails
          .filter((e) => !shared.set.has(e.email))
          .sort((a, b) => (b.source_type === "mailto" ? 2 : b.source_type === "text" ? 1 : 0) -
            (a.source_type === "mailto" ? 2 : a.source_type === "text" ? 1 : 0))[0];

        const base = {
          name: c.place.displayName?.text || best?.email.split("@")[0] || "",
          company: c.place.displayName?.text || "",
          job_title: phrases[0],
          country: countryName,
          city,
          website: c.website,
          phone: c.phone,
          address: c.address,
          rating: c.rating,
          source: "google-maps",
          category,
          place_id: c.place.id,
        };

        if (best) {
          shared.set.add(best.email);
          leads.push({
            ...base,
            email: best.email,
            email_source: best.source_type === "mailto" ? "website-mailto" : "website-text",
            email_source_url: best.source_url,
          });
        } else {
          leads.push({ ...base, email: "" });
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
      await new Promise((r) => setTimeout(r, pageDelayMs));
      pagesFetched++;
    }
  }

  return leads;
}

// Quick pre-search used by the "best areas" suggester: how many businesses (and
// how many with websites) does Google surface for this niche in one metro, plus
// a review-activity signal so ranking differentiates metros that all saturate
// the 20-result cap.
export async function probeArea(
  apiKey: string,
  jobTitle: string,
  metro: Metro,
  country: string,
): Promise<{ businesses: number; with_websites: number; ratingSum: number; saturated: boolean; quotaHit: boolean }> {
  const region = COUNTRY_REGIONS[String(country ?? "").toLowerCase().trim()];
  const fieldMask = "places.id,places.displayName,places.websiteUri,places.rating,places.userRatingCount,nextPageToken";
  const body: Record<string, unknown> = { textQuery: `${jobTitle} in ${metro.query}`, maxResultCount: 20 };
  if (region) body.regionCode = region;
  let quotaHitFlag = false;

  async function searchOnce(withPage2: boolean): Promise<{ data: NewTextSearchResponse; status: number }> {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 429) {
      quotaHitFlag = true;
      return { data: {}, status: res.status };
    }
    if (res.status >= 400) return { data: {}, status: res.status };
    const data1: NewTextSearchResponse = await res.json();
    if (!withPage2 || !data1.nextPageToken) return { data: data1, status: res.status };
    await new Promise((r) => setTimeout(r, 1200));
    const res2 = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify({ ...body, pageToken: data1.nextPageToken }),
      signal: controller.signal,
    });
    if (res2.status === 429) {
      quotaHitFlag = true;
      return { data: data1, status: 200 };
    }
    if (res2.status >= 400) return { data: data1, status: 200 };
    const data2: NewTextSearchResponse = await res2.json();
    return {
      data: { ...data1, places: [...(data1.places ?? []), ...(data2.places ?? [])], nextPageToken: data2.nextPageToken },
      status: 200,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    let data: NewTextSearchResponse = {};
    let status = 0;
    // Retry once on transient 429/5xx (burst probes trip rate buckets).
    const first = await searchOnce(true);
    if (first.status === 429 || first.status >= 500) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
      const retry = await searchOnce(true);
      status = retry.status;
      data = retry.data;
    } else {
      status = first.status;
      data = first.data;
    }
    if (status >= 400 || data.places === undefined) {
      return { businesses: 0, with_websites: 0, ratingSum: 0, saturated: false, quotaHit: quotaHitFlag };
    }
    const places = data.places ?? [];
    return {
      businesses: places.length,
      with_websites: places.filter((p) => !!p.websiteUri).length,
      ratingSum: places.reduce((s, p) => s + (p.userRatingCount ?? 0), 0),
      saturated: !!data.nextPageToken,
      quotaHit: quotaHitFlag,
    };
  } catch {
    return { businesses: 0, with_websites: 0, ratingSum: 0, saturated: false, quotaHit: quotaHitFlag };
  } finally {
    clearTimeout(timer);
  }
}

async function getPlaceDetailsNew(
  placeId: string,
  apiKey: string,
): Promise<NewPlaceDetailsResponse | null> {
  const fieldMask = "websiteUri,internationalPhoneNumber,formattedAddress,countryCode,rating";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
