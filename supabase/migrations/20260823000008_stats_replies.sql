DROP FUNCTION IF EXISTS public.public_stats();

CREATE FUNCTION public.public_stats()
RETURNS TABLE (emails_sent bigint, agents bigint, replies_detected bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.emails_sent),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.emails_sent WHERE replied = true);
$$;

REVOKE ALL ON FUNCTION public.public_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.public_stats() TO anon, authenticated;
