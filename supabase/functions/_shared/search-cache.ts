// Shared DB-backed cache for the lead finder so Google Places quota is spent on
// NEW chemistry only, never on repeat searches. TTLs: areas 7 days, lead results
// 12h. All access via the service-role client (bypasses RLS).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const AREA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LEADS_TTL_MS = 12 * 60 * 60 * 1000;

export async function cacheGet<T>(
  supabase: SupabaseClient,
  kind: "area" | "leads",
  key: string,
): Promise<T | null> {
  const { data } = await supabase
    .from("lead_finder_caches")
    .select("payload")
    .eq("kind", kind)
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return (data.payload as T) ?? null;
}

export async function cacheSet<T>(
  supabase: SupabaseClient,
  kind: "area" | "leads",
  key: string,
  payload: T,
  ttlMs: number,
): Promise<void> {
  await supabase
    .from("lead_finder_caches")
    .upsert(
      {
        kind,
        cache_key: key,
        payload,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      },
      { onConflict: "kind,cache_key" },
    );
}