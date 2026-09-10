// warm-areas — nightly "leftover quota" worker.
// 1) Refreshes covered-but-stale areas (so newly-opened businesses get found),
// 2) seeds brand-new (niche x metro) combos we haven't covered yet,
// saving everything into our own saved-businesses ledger ("our own map").
// Invoked by pg_cron with the x-cron-secret header; stops instantly on quota.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { isGoogleMapsAvailable, searchGoogleMaps } from "../_shared/google-maps.ts";
import { metrosFor } from "../_shared/areas.ts";
import { saveBusinesses, markCoverageRefreshed, grantRefresh } from "../_shared/saved-businesses.ts";

const STALE_REFRESH_MAX = 6;
const NEW_COMBO_MAX = 8;
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SEED_NICHES = [
  "dentist", "gym", "restaurant", "salon", "lawyer", "real estate",
  "auto repair", "veterinary", "photographer", "accountant", "bakery",
  "physiotherapist", "coffee shop", "daycare",
];
const SEED_COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India",
  "Germany", "France", "United Arab Emirates",
];

function titleCase(s: string): string {
  return String(s).split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

interface Combo { niche: string; country: string; city: string; query: string }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const health = new URL(req.url).searchParams.get("health") === "1";
  if (health) return new Response("warm-areas ok", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  // Run-marker: unconditional proof this invocation EXECUTED (health-check's
  // cron probe judges freshness on this, never on dispatch 'succeeded' alone).
  // Emitted before the no-key skip so "ran but skipped" is still observable.
  try {
    await insertAudit(supabase as any, {
      user_id: null,
      event: "warm.run",
      payload: { at: new Date().toISOString() },
    });
  } catch { /* marker is best-effort; the run is authoritative */ }

  if (!isGoogleMapsAvailable()) {
    return new Response(JSON.stringify({ status: "skipped: no google key" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
  const out = { refreshed: 0, seeded: 0, savedTotal: 0, searches: 0, quotaHit: false };

  async function probe(combo: Combo): Promise<"ok" | "quota" | "capped"> {
    if (!(await grantRefresh(supabase))) return "capped";
    const gres = await searchGoogleMaps(combo.niche, combo.country, 25, combo.query, [], undefined);
    out.searches++;
    if (gres.quotaHit) { out.quotaHit = true; return "quota"; }
    const saved = await saveBusinesses(supabase, gres.leads, combo.niche.trim().toLowerCase(), combo.country.trim());
    await markCoverageRefreshed(supabase, combo.niche.trim().toLowerCase(), combo.country.trim(), combo.city, combo.query);
    out.savedTotal += saved;
    return "ok";
  }

  // 1) Covered but stale areas — "new businesses we don't have yet".
  const staleRes = await supabase
    .from("lead_refresh")
    .select("niche, country, city, query")
    .lt("last_live_search_at", new Date(Date.now() - REFRESH_AFTER_MS).toISOString())
    .order("last_live_search_at", { ascending: true })
    .limit(STALE_REFRESH_MAX) as { data?: Array<{ niche: string; country: string; city: string; query: string | null }> };
  for (const row of staleRes.data ?? []) {
    if (out.quotaHit || out.refreshed >= STALE_REFRESH_MAX) break;
    const res = await probe({ niche: row.niche, country: row.country, city: row.city, query: row.query || `${titleCase(row.city)}, ${row.country}` });
    if (res === "quota") break;
    if (res === "ok") out.refreshed++;
  }

  // 2) Seed combos we've never covered — user demand first, then a static list.
  if (!out.quotaHit) {
    const combos = new Map<string, Combo>();
    const addCombo = (niche: string, country: string, metro: { city: string; query: string }) => {
      const city = String(metro.query).split(",")[0].trim().toLowerCase();
      const key = `${niche.trim().toLowerCase()}|${country.trim()}|${city}`;
      if (!combos.has(key)) combos.set(key, { niche: niche.trim(), country: country.trim(), city, query: metro.query });
    };
    const { data: demand } = await supabase
      .from("audit_events")
      .select("payload")
      .eq("event", "lead.searched")
      .order("created_at", { ascending: false })
      .limit(200) as { data?: Array<{ payload?: Record<string, unknown> } | null> };
    const counts = new Map<string, { niche: string; country: string; n: number }>();
    for (const e of demand ?? []) {
      const p = e?.payload ?? {};
      const n = String(p.jobTitle ?? "").trim();
      const c = String(p.country ?? "").trim();
      if (!n) continue;
      const k = `${n}|${c}`;
      const cur = counts.get(k) ?? { niche: n, country: c, n: 0 };
      cur.n += 1;
      counts.set(k, cur);
    }
    for (const v of [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6)) {
      for (const metro of metrosFor(v.country).slice(0, 3)) addCombo(v.niche, v.country, metro);
    }
    for (const country of SEED_COUNTRIES) {
      for (const niche of SEED_NICHES) {
        for (const metro of metrosFor(country).slice(0, 3)) addCombo(niche, country, metro);
      }
    }
    for (const combo of combos.values()) {
      if (out.quotaHit || out.seeded >= NEW_COMBO_MAX) break;
      const existing = await supabase
        .from("lead_refresh")
        .select("niche")
        .eq("niche", combo.niche.toLowerCase())
        .eq("country", combo.country)
        .eq("city", combo.city)
        .maybeSingle() as { data?: { niche: string } | null };
      if (existing.data) continue; // already covered
      const res = await probe(combo);
      if (res === "quota") break;
      if (res === "ok") out.seeded++;
    }
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
});