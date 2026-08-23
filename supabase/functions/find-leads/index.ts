import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
}

// ---- Country name -> ISO-3166-1 alpha-2 (Overpass area lookup key) ----
const COUNTRY_ISO: Record<string, string> = {
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
function nicheFor(jobTitleRaw: string): Niche {
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

function buildQuery(niche: Niche, iso: string, limit: number): string {
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

async function searchDirectory(niche: Niche, iso: string, limit: number) {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(buildQuery(niche, iso, limit)),
  });
  if (!res.ok) throw new Error("Directory search unavailable, try again shortly");
  const data = (await res.json()) as { elements?: OsmEl[] };

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = await getAuthedUserId(req);
    const { campaignId, jobTitle, country, limit = 25 } = await req.json();
    if (!jobTitle) throw new Error("jobTitle is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("user_id", userId)
        .single();
      if (!campaign) throw new Error("Campaign not found");
    }

    const iso =
      COUNTRY_ISO[String(country ?? "").toLowerCase().trim()] ??
      (String(country ?? "").length === 2 ? String(country).toUpperCase() : null);
    if (!iso) throw new Error(`Unsupported country "${country}". Try e.g. United States, United Kingdom, India…`);

    const cappedLimit = Math.max(1, Math.min(Number(limit) || 25, 50));
    const niche = nicheFor(String(jobTitle));
    const leads = await searchDirectory(niche, iso, cappedLimit);

    if (leads.length > 0) {
      const rows = leads.map((l) => ({
        user_id: userId,
        campaign_id: campaignId ?? null,
        ...l,
        status: "new",
      }));
      await supabase.from("leads").insert(rows);
    }

    return json({
      found: leads.length,
      source: "open-business-directory",
      message:
        leads.length === 0
          ? `No public emails listed for "${jobTitle}" in ${country}. Try another niche (dentist, gym, restaurant, salon, lawyer…) or import a CSV.`
          : `Found ${leads.length} businesses with public emails and saved them to your leads.`,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
