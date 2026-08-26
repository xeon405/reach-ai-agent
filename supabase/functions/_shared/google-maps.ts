// Google Maps Places API (New) lead finder — finds businesses + scrapes their websites for emails
// Uses Places API (New) Text Search Essentials — 10,000 free searches/month
// https://developers.google.com/maps/documentation/places/web-service/text-search

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
  city: string;
  website: string;
  phone: string;
  address: string;
  rating: number | null;
  source: string;
  category: string;
  place_id: string;
}

// Places API (New) response types
interface NewTextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string; languageCode: string };
    websiteUri?: string;
    internationalPhoneNumber?: string;
    formattedAddress?: string;
    rating?: number;
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
  rating?: number;
  types?: string[];
  primaryType?: string;
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

export async function searchGoogleMaps(
  jobTitle: string,
  country: string,
  limit: number,
): Promise<GoogleMapsLead[]> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return [];

  const query = `${jobTitle} in ${country}`;
  const leads: GoogleMapsLead[] = [];
  const seenPlaceIds = new Set<string>();
  const seenEmails = new Set<string>();

  // Step 1: Text Search via Places API (New)
  const fieldMask = "places.id,places.displayName,places.websiteUri,places.internationalPhoneNumber,places.formattedAddress,places.rating,places.types,places.primaryType,nextPageToken";
  let pageToken: string | undefined;
  let pagesFetched = 0;
  const MAX_PAGES = 3;

  while (leads.length < limit && pagesFetched < MAX_PAGES) {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: 20,
    };
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
      data = await res.json();
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }

    const places = data.places ?? [];
    if (places.length === 0) break;

    for (const place of places) {
      if (seenPlaceIds.has(place.id)) continue;
      seenPlaceIds.add(place.id);

      // Step 2: Get place details (website URL) if not in search result
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
      if (!website) continue;

      const { city, country: parsedCountry } = parseCityCountry(address, country);
      const category = formatCategory(place.types, place.primaryType);

      // Step 3: Scrape website for emails
      const emails = await scrapeWebsiteForEmails(website);
      for (const email of emails) {
        if (seenEmails.has(email)) continue;
        seenEmails.add(email);

        leads.push({
          name: place.displayName?.text || email.split("@")[0],
          email,
          company: place.displayName?.text || "",
          job_title: jobTitle,
          country: parsedCountry,
          city,
          website,
          phone,
          address,
          rating,
          source: "google-maps",
          category,
          place_id: place.id,
        });

        if (leads.length >= limit) break;
      }
      if (leads.length >= limit) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;

    // Google requires a short delay before using next page token
    await new Promise((r) => setTimeout(r, 2000));
    pagesFetched++;
  }

  return leads;
}

async function getPlaceDetailsNew(
  placeId: string,
  apiKey: string,
): Promise<NewPlaceDetailsResponse | null> {
  const fieldMask = "websiteUri,internationalPhoneNumber,formattedAddress,rating";

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

async function scrapeWebsiteForEmails(websiteUrl: string): Promise<string[]> {
  let url = websiteUrl;
  if (!url.startsWith("http")) url = "https://" + url;

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

    if (!domain || domain.length < 4) continue;
    if (DISPOSABLE_DOMAINS.has(domain)) continue;
    if (IGNORE_PATTERNS.test(lower)) continue;
    if (lower.includes("png") || lower.includes("jpg") || lower.includes("gif")) continue;

    valid.add(lower);
  }

  return [...valid];
}
