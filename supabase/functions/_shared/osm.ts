// Shared OpenStreetMap lead-finder (used by find-leads API and autopilot cron)
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
    `[out:json][timeout:60];\narea["ISO3166-1"="${iso}"][admin_level=2]->.a;\n(\n`;
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
  // Primary instance is slow under load (40s+ country scans) — try mirrors in order
  let lastErr: unknown = new Error("no endpoint attempted");
  for (const endpoint of [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ]) {
    const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 80_000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "OutreachAI-LeadFinder/1.0 (https://outreach-ochre-sigma.vercel.app)",
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = new Error("Directory search unavailable, try again shortly");
        continue;
      }
      return parseOverpass(await res.json(), limit, iso);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function parseOverpass(data: { elements?: OsmEl[] }, limit: number, iso: string) {

  const seen = new Set<string>();
  const leads: Array<{
    name: string; email: string; company: string;
    job_title: string; country: string; website: string;
  }> = [];

  for (const el of data.elements ?? []) {
    const tg = el.tags ?? {};
    const email = (tg["contact:email"] || tg.email || "").trim().toLowerCase();
    const company = tg.name ?? "";
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    leads.push({
      name: company || email.split("@")[0],
      email,
      company,
      job_title: "Owner",
      country: iso,
      website: tg.website || tg["contact:website"] || "",
    });
    if (leads.length >= limit) break;
  }
  return leads;
}

