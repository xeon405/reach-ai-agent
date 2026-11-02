-- ============================================================
-- ANTI-ABUSE MVP — part 6: keep the reason string compatible
--
-- The database change in part 5 shipped before the frontend did (Vercel deploys
-- on its own schedule). The bundle that is live right now has no copy for
-- 'business_address_incomplete', so it would render `undefined.title` and throw
-- on the dashboard for any account with a company but a bad address. Two real
-- accounts are in exactly that state.
--
-- So for now the address problem reports 'business_identity_required', which
-- every deployed bundle understands and which is still true: the identity is
-- not complete. The enforcement itself is unchanged — reserve_send_slot still
-- refuses, and is_plausible_business_address still decides.
--
-- Restore the specific message with 20261101000007 once the new bundle is
-- confirmed live; it makes the banner say "a country or city on its own is not
-- an address" instead of "add your business name and address".
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
  IF coalesce(btrim(v_company), '') = ''
     OR NOT public.is_plausible_business_address(v_address) THEN
    RETURN 'business_identity_required';
  END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
