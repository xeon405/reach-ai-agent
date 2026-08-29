import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { probeArea, isGoogleMapsAvailable } from "../_shared/google-maps.ts";
import { metrosFor, rankAreas, type AreaRecommendation } from "../_shared/areas.ts";
import { groqChat, extractJson, sanitizeForPrompt, groqKeys } from "../_shared/groq.ts";
import { cacheGet, cacheSet, AREA_TTL_MS } from "../_shared/search-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const body = await req.json().catch(() => ({}));
    await getAuthedUserId(req); // require a valid user session to suggest areas
    const { jobTitle, country = "United States" } = body;
    if (!jobTitle) throw new Error("jobTitle is required");
    if (!isGoogleMapsAvailable()) throw new Error("Google Maps integration is not configured");

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
    const cacheKey = [String(jobTitle), String(country)].map((s) => s.trim().toLowerCase()).join("|");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Serve a fresh cached ranking (24h) — probing 28 metros every "Suggest" click
    // burns Places quota that a cached answer already covers.
    const cached = await cacheGet<{ areas: AreaRecommendation[]; ai_note: string | null }>(supabase, "area", cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify({ ...cached, niche: jobTitle, country, probed: 0, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const metros = metrosFor(country);
    const raw = await pMap(metros, 4, async (metro) => {
      const r = await probeArea(apiKey, String(jobTitle), metro, country);
      return { metro, ...r };
    });
    const quotaHit = raw.some((r) => r.quotaHit);
    if (quotaHit || raw.every((r) => r.businesses === 0)) {
      return new Response(
        JSON.stringify({
          areas: [],
          ai_note: null,
          niche: jobTitle,
          country,
          probed: metros.length,
          cached: false,
          quota_exceeded: quotaHit,
          message: quotaHit
            ? "Google Maps' daily search quota is used up, so fresh area suggestions couldn't be probed. Cached suggestions keep working; this resets with the Places quota."
            : "No area data could be gathered right now — please try again shortly.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ranked = rankAreas(raw).slice(0, 15);
    let areas: AreaRecommendation[] = rankAreas(raw).slice(0, 10);
    let aiNote: string | null = null;

    // AI refinement: let the model re-prioritize using both the measured data and
    // real-world knowledge of the niche, then explain the reasoning.
    if (groqKeys().length > 0 && ranked.length >= 2) {
      try {
        const lines = ranked
          .map((a) => `${a.city}, ${a.region} | businesses ${a.businesses} | sites ${a.with_websites} | activity ${a.activity}`)
          .join("\n");
        const out = await groqChat(
          [
            { role: "system", content: "You rank US/world metros as lead-sourcing priorities for a local-business outreach product. Respond ONLY with valid JSON." },
            {
              role: "user",
              content: `Re-rank these metros for finding "${sanitizeForPrompt(String(jobTitle), 60)}" leads in ${sanitizeForPrompt(country, 40)}. Metrics are measured live from Google (businesses found, fraction with websites, review activity). Weigh real-world demand/seasonality you know: e.g. fitness booms, restaurant density, whatever fits the niche. Keep the full list but prioritize.
METRICS:
${lines}
Respond ONLY valid JSON:
{"ranked": ["City, Region", ... in priority order, include ALL listed], "note": "one short sentence explaining the top pick")}`,
            },
          ],
          { maxTokens: 700, temperature: 0.3 },
        );
        const parsed = extractJson<{ ranked: string[]; note: string }>(out);
        if (parsed && Array.isArray(parsed.ranked) && parsed.ranked.length > 0) {
          const seen = new Set<number>();
          const reordered: AreaRecommendation[] = [];
          for (const label of parsed.ranked) {
            const key = String(label).trim().toLowerCase();
            const idx = areas.findIndex(
              (a) => `${a.city}, ${a.region}`.toLowerCase() === key || a.city.toLowerCase() === key,
            );
            if (idx !== -1 && !seen.has(idx)) {
              seen.add(idx);
              reordered.push(areas[idx]);
            }
          }
          for (let i = 0; i < areas.length; i++) if (!seen.has(i)) reordered.push(areas[i]);
          if (reordered.length > 0) areas = reordered.slice(0, 10);
          aiNote = sanitizeForPrompt(parsed.note, 160) || null;
        }
      } catch (err) {
        console.error("[suggest-areas] AI refinement failed:", err);
      }
    }

    await cacheSet(supabase, "area", cacheKey, { areas, ai_note: aiNote }, AREA_TTL_MS);

    return new Response(
      JSON.stringify({
        areas,
        ai_note: aiNote,
        niche: jobTitle,
        country,
        probed: metros.length,
        cached: false,
        hasLocationInput: !!body.location,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});