-- consume_ai_quota is an internal function used by edge functions with the
-- service role key. It must never be callable by anon/authenticated/PUBLIC,
-- otherwise anyone can burn another user's AI quota by uid.
REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) TO service_role;

-- Same hardening for referral_count (internal aggregation)
REVOKE ALL ON FUNCTION public.referral_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.referral_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.referral_count() TO authenticated, service_role;
