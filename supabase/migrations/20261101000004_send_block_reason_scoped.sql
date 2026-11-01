-- ============================================================
-- ANTI-ABUSE MVP — part 4: send_block_reason keeps to the caller's own account
--
-- The function takes a user id so the server (send-worker, service role) can ask
-- about any account. Exposed to `authenticated`, that would also let a signed-in
-- user pass someone else's id and read their cap and challenge state. Small leak,
-- free to close: when the caller is an end user, only their own row is readable.
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
  IF coalesce(btrim(v_company), '') = '' OR coalesce(btrim(v_address), '') = '' THEN
    RETURN 'business_identity_required';
  END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
