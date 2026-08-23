-- Viral growth: referral tracking + public aggregate stats

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by text;

-- Backfill short codes from existing ids
UPDATE public.profiles
SET referral_code = lower(substring(id::text, 1, 8))
WHERE referral_code IS NULL;

-- Public aggregate counters (no PII) for the landing page
CREATE OR REPLACE FUNCTION public.public_stats()
RETURNS TABLE (emails_sent bigint, agents bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.emails_sent),
    (SELECT count(*) FROM public.profiles);
$$;

REVOKE ALL ON FUNCTION public.public_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.public_stats() TO anon, authenticated;

-- How many signups each user's referral link brought
CREATE OR REPLACE FUNCTION public.referral_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.profiles p
  WHERE p.referred_by = (
    SELECT referral_code FROM public.profiles WHERE id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.referral_count() FROM public;
GRANT EXECUTE ON FUNCTION public.referral_count() TO authenticated;
