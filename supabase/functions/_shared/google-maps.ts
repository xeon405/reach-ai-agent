// Google Maps Places API lead finder — finds businesses + scrapes their websites for emails
// Uses Places API (New) Text Search Essentials — 10,000 free searches/month

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "10minutemail.com", "trashmail.com", "sharklasers.com",
  "guerrillamailblock.com", "grr.la", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "tempail.com", "tempr.email", "temp-mail.org",
]);
const IGNORE_PATTERNS = /\.(png|jpg|jpeg|gif|svg|webp|pdf|doc|xls|zip|mp[34]|css|js)$/i;

export interface GoogleMapsLead {
  name: string;
  email: string;
  company: string;
  job_title: string;
  country: string;
  website: string;
  phone: string;
  address: string;
  rating: number | null;
  source: string;
}

interface PlaceResult {
  place_id: string;
  name?: string;
  website?: string;
  formatted_phone_number?: string;
  formatted_address?: string;
  rating?: number;
  types?: string[];
}

interface TextSearchResponse {
  results: PlaceResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

interface PlaceDetailsResponse {
  result: PlaceResult;
  status: string;
}

// Map country name to Google Maps region bias
const COUNTRY_REGIONS: Record<string, string> = {
  "united states": "us", "united kingdom": "gb", canada: "ca", australia: "au",
  india: "in", germany: "de", france: "fr", spain: "es", italy: "it",
  netherlands: "nl", brazil: "br", mexico: "mx", "south africa": "za",
  nigeria: "ng", uae: "ae", "saudi arabia": "sa", singapore: "sg",
  malaysia: "my", philippines: "ph", pakistan: "pk", egypt: "eg",
  turkey: "tr", poland: "pl", sweden: "se", norway: "no", denmark: "dk",
  japan: "jp", "south korea": "kr", china: "cn", thailand: "th",
  indonesia: "id", vietnam: "vn", colombia: "co", argentina: "ar",
  chile: "cl", peru: "pe", "new zealand": "nz", ireland: "ie",
  portugal: "pt", austria: "at", switzerland: "ch", belgium: "be",
};

export function isGoogleMapsAvailable(): boolean {
  return !!Deno.env.get("GOOGLE_MAPS_API_KEY");
}

export async function searchGoogleMaps(
  jobTitle: string,
  country: string,
  limit: number,
): Promise<GoogleMapsLead[]> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return [];

  const region = COUNTRY_REGIONS[country.toLowerCase().trim()] ?? "";
  const query = `${jobTitle} in ${country}`;
  const leads: GoogleMapsLead[] = [];
  const seenPlaceIds = new Set<string>();
  const seenEmails = new Set<string>();

  // Step 1: Text Search to find businesses
  const batchSize = Math.min(limit, 20); // Google returns max 20 per page
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "establishment");
  url.searchParams.set("key", apiKey);
  if (region) url.searchParams.set("region", region);

  let nextPageToken: string | undefined;
  let pagesFetched = 0;
  const MAX_PAGES = 3; // Max 60 results (20 per page × 3 pages)

  while (leads.length < limit && pagesFetched < MAX_PAGES) {
    const fetchUrl = nextPageToken
      ? `${url.href}&pagetoken=${nextPageToken}`
      : url.href;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let data: TextSearchResponse;
    try {
      const res = await fetch(fetchUrl, { signal: controller.signal });
      data = await res.json();
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      // API error — stop but don't crash
      break;
    }

    for (const place of data.results ?? []) {
      if (seenPlaceIds.has(place.place_id)) continue;
      seenPlaceIds.add(place.place_id);

      // Step 2: Get place details (website URL)
      const details = await getPlaceDetails(place.place_id, apiKey);
      const website = details?.website ?? place.website ?? "";
      if (!website) continue;

      // Step 3: Scrape website for emails
      const emails = await scrapeWebsiteForEmails(website);
      for (const email of emails) {
        if (seenEmails.has(email)) continue;
        seenEmails.add(email);

        leads.push({
          name: place.name || email.split("@")[0],
          email,
          company: place.name || "",
          job_title: jobTitle,
          country,
          website,
          phone: details?.formatted_phone_number ?? "",
          address: details?.formatted_address ?? place.formatted_address ?? "",
          rating: details?.rating ?? place.rating ?? null,
          source: "google-maps",
        });

        if (leads.length >= limit) break;
      }
      if (leads.length >= limit) break;
    }

    nextPageToken = data.next_page_token;
    if (!nextPageToken) break;

    // Google requires a short delay before using next_page_token
    await new Promise((r) => setTimeout(r, 2000));
    pagesFetched++;
  }

  return leads;
}

async function getPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,formatted_phone_number,formatted_address,rating");
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.href, { signal: controller.signal });
    const data: PlaceDetailsResponse = await res.json();
    if (data.status === "OK") return data.result;
  } catch {
    // Timeout or network error — skip this place
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function scrapeWebsiteForEmails(websiteUrl: string): Promise<string[]> {
  // Normalize URL
  let url = websiteUrl;
  if (!url.startsWith("http")) url = "https://" + url;

  // Try common contact pages first
  const pagesToTry = [
    url,
    url.replace(/\/$/, "") + "/contact",
    url.replace(/\/$/, "") + "/contact-us",
    url.replace(/\/$/, "") + "/about",
    url.replace(/\/$/, "") + "/about-us",
  ];

  const allEmails = new Set<string>();

  for (const pageUrl of pagesToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    try {
      const res = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "OutreachAI-LeadFinder/2.0 (https://outreach-ochre-sigma.vercel.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) continue;

      const html = await res.text();
      const emails = extractEmails(html);

      for (const email of emails) {
        allEmails.add(email);
      }

      // If we found emails on the main page, no need to check subpages
      if (allEmails.size > 0) break;
    } catch {
      // Timeout or error — try next page
    } finally {
      clearTimeout(timer);
    }
  }

  return [...allEmails];
}

function extractEmails(html: string): string[] {
  const raw = html.match(EMAIL_REGEX) ?? [];
  const valid = new Set<string>();

  for (const email of raw) {
    const lower = email.toLowerCase();
    const domain = lower.split("@")[1];

    // Skip invalid domains
    if (!domain || domain.length < 4) continue;
    if (DISPOSABLE_DOMAINS.has(domain)) continue;
    if (IGNORE_PATTERNS.test(lower)) continue;

    // Skip image/file attachments that look like emails
    if (lower.includes("png") || lower.includes("jpg") || lower.includes("gif")) continue;

    valid.add(lower);
  }

  return [...valid];
}
