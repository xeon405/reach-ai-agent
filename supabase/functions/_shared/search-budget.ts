// Google Maps search budget — the single daily allowance every live Google
// Places search draws from, and the meter the background "leftover quota"
// workers read to know how much of the day's allowance is still unspent.
//
// The number is a SAFETY CEILING, not a target: user searches spend first, and
// warm-areas / website-crawl only get what is left. Default 120/day is well
// inside Google's 10,000 free Text Search calls per month (~333/day), leaving
// headroom for user traffic. Override with GOOGLE_SEARCH_DAILY_BUDGET.
//
// Counting is best-effort but honest: callers pass the number of Google API
// calls they actually made (Text Search pages + Place Details), and we add it
// atomically. The hard stop is still Google's own 429 (quotaHit) handling.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function googleSearchBudget(): number {
  const n = Number(Deno.env.get("GOOGLE_SEARCH_DAILY_BUDGET") ?? "120");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 120;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function googleSearchesUsedToday(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("google_search_usage")
    .select("count")
    .eq("day", utcDay())
    .maybeSingle();
  if (error) {
    console.error("googleSearchesUsedToday:", error.message);
    return 0;
  }
  return Number(data?.count ?? 0) || 0;
}

// How many Google searches the day still allows. 0 means live search should
// fall back to memory/cache until the UTC day rolls over.
export async function googleSearchesRemaining(supabase: SupabaseClient): Promise<number> {
  return Math.max(0, googleSearchBudget() - (await googleSearchesUsedToday(supabase)));
}

// Record the Google API calls a live search made. Fire-and-forget: a metering
// failure must never fail the search that already happened.
export async function recordGoogleSearches(supabase: SupabaseClient, cost: number): Promise<void> {
  const c = Math.floor(Number(cost) || 0);
  if (c <= 0) return;
  const { error } = await supabase.rpc("bump_google_search_usage", { p_cost: c });
  if (error) console.error("recordGoogleSearches:", error.message);
}
