// Shared OpenStreetMap lead-finder (used by find-leads API and autopilot cron)
import { enrichWebsiteEmails } from "./website-email-enrichment.ts";
export type Niche = { tag: string; label: string };
export const COUNTRY_ISO: Record<string, string> = {
  "united states": "US", usa: "US", us: "US", "united kingdom": "GB", uk: "GB",
  england: "GB", canada: "CA", australia: "AU", india: "IN", pakistan: "PK",
  germany: "DE", france: "FR", spain: "ES", italy: "IT", netherlands: "NL",
  portugal: "PT", ireland: "IE", "new zealand": "NZ", singapore: "SG",
  malaysia: "MY", indonesia: "ID", philippines: "PH", brazil: "BR", mexico: "MX",
  "south africa": "ZA", nigeria: "NG", kenya: "KE", uae: "AE",
  "united arab emirates": "AE", "saudi arabia": "SA", poland: "PL", sweden: "SE",
  norway: "NO", denmark: "DK", finland: "FI", austria: "AT", switzerland: "CH",
  belgium: "BE", turkey: "TR", egypt: "EG", bangladesh: "BD", "sri lanka": "LK",
};

// ---- Niche keyword -> OpenStreetMap tag selectors + name regex ----
interface Niche { tags: string[]; regex?: string }
export function nicheFor(jobTitleRaw: string): Niche {
  const t = jobTitleRaw.toLowerCase();
  const has = (...k: string[]) => k.some((x) => t.includes(x));

  if (has("dentist", "dental")) return { tags: ['"amenity"="dentist"', '"healthcare"="dentist"'] };
  if (has("doctor", "clinic", "physician", "medical"))
    return { tags: ['"amenity"="doctors"', '"amenity"="clinic"', '"healthcare"="doctor"', '"healthcare"="clinic"'] };
  if (has("gym", "fitness", "trainer")) return { tags: ['"leisure"="fitness_centre"', '"leisure"="sports_centre"'] };
  if (has("restaurant", "food", "cafe", "coffee")) return { tags: ['"amenity"="restaurant"', '"amenity"="cafe"', '"amenity"="fast_food"'] };
  if (has("hotel", "travel")) return { tags: ['"tourism"="hotel"', '"tourism"="guest_house"'] };
  if (has("salon", "beauty", "barber", "hair")) return { tags: ['"shop"="hairdresser"', '"shop"="beauty"'] };
  if (has("lawyer", "attorney", "legal")) return { tags: ['"office"="lawyer"'], regex: "law|legal|advocate" };
  if (has("real estate", "realtor", "property", "estate agent"))
    return { tags: ['"office"="estate_agent"'], regex: "real ?estate|properties|realty" };
  if (has("insurance")) return { tags: ['"office"="insurance"'], regex: "insurance" };
  if (has("accountant", "tax", "bookkeeping")) return { tags: ['"office"="accountant"', '"office"="tax_advisor"'], regex: "account|tax|audit" };
  if (has("veterinar", "pet", "animal")) return { tags: ['"amenity"="veterinary"'] };
  if (has("school", "tutor", "education", "academy"))
    return { tags: ['"amenity"="school"', '"amenity"="prep_school"', '"office"="educational_institution"'], regex: "academy|tutor|institute|school|learning" };
  if (has("car", "auto", "mechanic", "garage"))
    return { tags: ['"shop"="car_repair"', '"shop"="car"', '"shop"="car_parts"'] };
  if (has("construction", "contractor", "builder", "architect"))
    return { tags: ['"craft"="builder"', '"office"="architect"', '"craft"="carpenter"'], regex: "construct|build|contract|architect" };
  if (has("photograph")) return { tags: ['"shop"="photo"', '"craft"="photographer"'], regex: "photo|studio" };
  if (has("it ", "software", "web ", "tech", "digital agency"))
    return { tags: ['"office"="it"', '"office"="company"'], regex: "softwar|tech|web|digital|it services|solutions" };

  // Fallback: match the keyword against business names
  const word = jobTitleRaw.trim().split(/[\s,]+/)[0] ?? "";
  return { tags: [], regex: word.length >= 3 ? word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "" };
}

export function buildQuery(niche: Niche, iso: string, limit: number): string {
  const head =
    `[out:json][timeout:25];\narea["ISO3166-1"="${iso}"][admin_level=2]->.a;\n(\n`;
  const tagLines = niche.tags
    .map((tg) => `  nwr[${tg}]["email"](area.a);\n  nwr[${tg}]["contact:email"](area.a);\n`)
    .join("");
  const regexLine = niche.regex
    ? `  nwr["email"]["name"~"${niche.regex}",i](area.a);\n  nwr["contact:email"]["name"~"${niche.regex}",i](area.a);\n`
    : "";
  const tail = `);\nout center ${limit * 3};`;
  return head + tagLines + regexLine + tail;
}

interface OsmEl {
  type: string;
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

export async function searchDirectory(niche: Niche, iso: string, limit: number) {
  const body = "data=" + encodeURIComponent(buildQuery(niche, iso, limit));
  const PER_MIRROR_MS = 35_000;
  let lastErr: unknown = new Error("no endpoint attempted");
  for (const endpoint of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_MIRROR_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "OutshipAi-LeadFinder/1.0 (https://outreach-ochre-sigma.vercel.app)",
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = new Error("Directory search unavailable, try again shortly");
        continue;
      }
      const { withEmail, withWebsite } = parseOverpass(await res.json(), iso);

      // Enrich website-hailing leads that have no email from OSM tags (max 3 concurrent)
      const toEnrich = withWebsite.filter((l) => !l.email && l.website);
      const enrichedResults: typeof withWebsite = [];
      for (let i = 0; i < toEnrich.length; i += 3) {
        const batch = toEnrich.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(async (lead) => {
            const result = await enrichWebsiteEmails(lead.website);
            if (result.emails.length > 0) {
              const best = result.emails[0];
              return {
                ...lead,
                email: best.email,
                email_source: best.source_type === "mailto" ? "website-mailto" : "website-text",
                email_source_url: best.source_url,
              };
            }
            return lead;
          }),
        );
        enrichedResults.push(...batchResults);
      }
      const enriched = [...withEmail.map((l) => l), ...enrichedResults];

      // Merge: leads with OSM email first, then enriched leads, deduplicated
      const seenEmails = new Set(withEmail.map((l) => l.email));
      const merged = [...withEmail];
      for (const lead of enriched) {
        if (lead.email && !seenEmails.has(lead.email)) {
          seenEmails.add(lead.email);
          merged.push(lead);
        }
        if (merged.length >= limit) break;
      }
      return merged.slice(0, limit);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  // All mirrors failed or timed out — return empty instead of crashing the caller
  return [];
}

function parseOverpass(data: { elements?: OsmEl[] }, iso: string) {

  const seen = new Set<string>();
  const withEmail: Array<{
    name: string; email: string; company: string;
    job_title: string; country: string; city: string;
    website: string; phone: string; address: string;
    rating: null; source: string; category: string; place_id: string;
    email_source?: string; email_source_url?: string;
  }> = [];
  const withWebsite: Array<{
    name: string; email: string; company: string;
    job_title: string; country: string; city: string;
    website: string; phone: string; address: string;
    rating: null; source: string; category: string; place_id: string;
    email_source?: string; email_source_url?: string;
  }> = [];

  for (const el of data.elements ?? []) {
    const tg = el.tags ?? {};
    const email = (tg["contact:email"] || tg.email || "").trim().toLowerCase();
    const company = tg.name ?? "";
    const phone = (tg["contact:phone"] || tg.phone || "").trim();
    const website = (tg.website || tg["contact:website"] || "").trim();
    const street = (tg["addr:street"] || "").trim();
    const housenumber = (tg["addr:housenumber"] || "").trim();
    const cityTag = (tg["addr:city"] || "").trim();
    const address = [housenumber && street ? `${housenumber} ${street}` : street, cityTag].filter(Boolean).join(", ");

    // Category from OSM tags
    const tagKeys = ["amenity", "shop", "office", "craft", "leisure", "tourism", "healthcare"];
    let category = "";
    for (const k of tagKeys) {
      if (tg[k]) { category = tg[k].replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()); break; }
    }

    const leadBase = {
      name: company || email.split("@")[0],
      company,
      job_title: "Owner",
      country: iso,
      city: cityTag,
      website,
      phone,
      address,
      rating: null as null,
      source: "openstreetmap",
      category,
      place_id: `osm-${el.type}-${el.id}`,
    };

    if (email && email.includes("@") && !seen.has(email)) {
      seen.add(email);
      withEmail.push({ ...leadBase, name: company || email.split("@")[0], email });
    } else if (website && !seen.has(`website:${website}`)) {
      seen.add(`website:${website}`);
      withWebsite.push({ ...leadBase, name: company || "", email: "" });
    }
  }
  return { withEmail, withWebsite };
}

