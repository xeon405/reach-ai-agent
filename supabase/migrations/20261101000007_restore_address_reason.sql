-- ============================================================
-- ANTI-ABUSE MVP — part 7: restore the specific address reason
--
-- Part 6 deliberately reported 'business_identity_required' for a bad address
-- because the bundle serving traffic at the time had no copy for the specific
-- string and would have thrown on the dashboard.
--
-- That bundle is now live: send-gate-*.js contains the 'business_address_incomplete'
-- key and its copy, and onboarding/settings call addressProblem before saving.
-- So the UI can be told the truth again: the identity is present, the address is
-- the problem, and a country name is why.
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_block_reason(p_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid      uuid := p_user;
  v_lifetime integer;
  v_daily    integer;
  v_used_day integer;
  v_used_all integer;
  v_req      boolean;
  v_ver      boolean;
  v_company  text;
  v_address  text;
BEGIN
  -- `authenticated` can only read its own row; trusted roles may ask about any.
  IF current_user = 'authenticated' THEN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN RETURN NULL; END IF;
  END IF;

  SELECT pl.lifetime_emails, pl.daily_emails,
         COALESCE(p.emails_sent_today, 0), COALESCE(p.emails_sent_total, 0),
         p.domain_required, p.domain_verified,
         p.company, p.business_address
    INTO v_lifetime, v_daily, v_used_day, v_used_all, v_req, v_ver, v_company, v_address
    FROM public.profiles p
    LEFT JOIN public.plan_limits pl ON pl.plan = public.effective_plan(p.id)
   WHERE p.id = v_uid;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_req AND NOT v_ver THEN RETURN 'domain_required'; END IF;
  IF coalesce(btrim(v_company), '') = '' THEN RETURN 'business_identity_required'; END IF;
  -- Identity is present; the address is what is missing or not a street address.
  IF NOT public.is_plausible_business_address(v_address) THEN
    RETURN 'business_address_incomplete';
  END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
