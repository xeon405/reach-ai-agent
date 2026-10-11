-- Google Places search budget: one true daily counter for every live Google
-- Maps search the whole app makes, so the background "leftover quota" workers
-- can spend whatever the day's user traffic did NOT use.
--
-- Why this exists: the nightly warmer (warm-areas) was capped at a tiny fixed
-- 6 refreshes + 8 seeds, and gate-kept by refresh_usage (a 40/day cap that only
-- counts *refreshes*, not first-time live searches). Neither number reflected
-- the real Google quota, so almost all of the daily allowance went unused.
--
-- This table counts actual Google API calls (Text Search + Place Details) for
-- the UTC day. Every live-search path records its calls here; the nightly
-- coordinator reads the remaining allowance and spends it.

CREATE TABLE IF NOT EXISTS public.google_search_usage (
  day        DATE PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal bookkeeping only: service-role access. No client policies.
ALTER TABLE public.google_search_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_search_usage FROM anon, authenticated;

-- Atomic increment-and-read: returns the new total for today. Called after each
-- live search with the number of Google API calls it made.
CREATE OR REPLACE FUNCTION public.bump_google_search_usage(p_cost INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
  v_cost  INTEGER := GREATEST(COALESCE(p_cost, 0), 0);
BEGIN
  INSERT INTO public.google_search_usage (day, count, updated_at)
  VALUES ((now() AT TIME ZONE 'utc')::date, v_cost, now())
  ON CONFLICT (day) DO UPDATE
    SET count = public.google_search_usage.count + EXCLUDED.count,
        updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.bump_google_search_usage(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_google_search_usage(INTEGER) TO service_role;
