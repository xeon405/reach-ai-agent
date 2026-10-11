// warm-areas — background "leftover quota" coordinator.
//
// Google Maps gives us a daily search allowance (GOOGLE_SEARCH_DAILY_BUDGET,
// see _shared/search-budget.ts). Live user searches spend from it first; this
// worker spends whatever is LEFT to grow our own map while it's free:
//   1) Refreshes covered-but-stale areas (older than 7 days) so businesses that
//      opened since then still get discovered.
//   2) Seeds brand-new (niche x metro) combos, real user demand first, then a
//      fixed list — so popular niches are warm before anyone asks.
// It never overspends: it reads the remaining allowance, caps each run, stops
// the moment Google returns 429, and records exactly what it spent.
// Invoked by pg_cron with the x-cron-secret header.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { isGoogleMapsAvailable, searchGoogleMaps } from "../_shared/google-maps.ts";
import { metrosFor } from "../_shared/areas.ts";
import { saveBusinesses, markCoverageRefreshed } from "../_shared/saved-businesses.ts";
import { googleSearchBudget, googleSearchesRemaining, recordGoogleSearches } from "../_shared/search-budget.ts";

// Never spend more than this many Google calls in a single invocation, even if
// the day's allowance is untouched — keeps one run from burning the whole lot.
const PER_RUN_MAX = 15;
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_SCAN = 40;
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  try {
    await insertAudit(supabase as any, {
      user_id: null,
      event: "warm.run",
      payload: { at: new Date().toISOString() },
    });
  } catch { /* marker is best-effort; the run is authoritative */ }

  if (!isGoogleMapsAvailable()) {
    return json({ status: "skipped: no google key" });
  }

  // Spend only what today's user searches did not.
  const budget = googleSearchBudget();
  const remaining = await googleSearchesRemaining(supabase);
  const runCap = Math.min(PER_RUN_MAX, remaining);
  const out = { budget, remaining, runCap, refreshed: 0, seeded: 0, savedTotal: 0, searches: 0, apiCalls: 0, quotaHit: false };

  if (runCap <= 0) {
    return json({ ...out, note: "daily search budget spent; nothing to do" });
  }

  async function probe(combo: Combo): Promise<"ok" | "quota" | "capped"> {
    if (out.apiCalls >= runCap) return "capped";
    const gres = await searchGoogleMaps(combo.niche, combo.country, 25, combo.query, [], undefined, undefined, false);
    out.searches++;
    out.apiCalls += gres.apiCalls;
    await recordGoogleSearches(supabase, gres.apiCalls);
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
    .limit(STALE_SCAN) as { data?: Array<{ niche: string; country: string; city: string; query: string | null }> };
  for (const row of staleRes.data ?? []) {
    if (out.quotaHit || out.apiCalls >= runCap) break;
    const res = await probe({ niche: row.niche, country: row.country, city: row.city, query: row.query || `${titleCase(row.city)}, ${row.country}` });
    if (res === "quota") break;
    if (res === "ok") out.refreshed++;
  }

  // 2) Seed combos we've never covered — user demand first, then a static list.
  if (!out.quotaHit && out.apiCalls < runCap) {
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
      if (out.quotaHit || out.apiCalls >= runCap) break;
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

  return json(out);
});
