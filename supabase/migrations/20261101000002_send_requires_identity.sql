-- ============================================================
-- ANTI-ABUSE MVP — part 2: business identity is required to SEND
--
-- Why a second migration instead of editing part 1: part 1 is already applied
-- to the live database. A migration is a historical record, so the change goes
-- in a new one.
--
-- The onboarding form requires a brand name and business address, but a form is
-- not an enforcement point — the API can be called directly. reserve_send_slot
-- is the one place every send passes through, so the rule lives there. That way
-- the duplicate-business trigger always has something to compare: an account
-- with a blank identity could otherwise never be flagged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_send_slot(p_user uuid, p_cap int)
RETURNS boolean
LANGUAGE plpgsql AS $fn$
DECLARE
  v_lifetime integer;
  v_ok boolean;
BEGIN
  SELECT lifetime_emails INTO v_lifetime
    FROM public.plan_limits
   WHERE plan = public.effective_plan(p_user);

  UPDATE public.profiles SET
    emails_sent_date  = current_date,
    emails_sent_today = CASE
                          WHEN emails_sent_date = current_date
                          THEN coalesce(emails_sent_today, 0) + 1
                          ELSE 1
                        END,
    emails_sent_total = coalesce(emails_sent_total, 0) + 1
  WHERE id = p_user
    -- business identity on file (first send only cares that it is present)
    AND coalesce(btrim(company), '') <> ''
    AND coalesce(btrim(business_address), '') <> ''
    -- daily cap
    AND (CASE WHEN emails_sent_date = current_date
              THEN coalesce(emails_sent_today, 0) ELSE 0 END) < p_cap
    -- lifetime cap
    AND (v_lifetime IS NULL OR coalesce(emails_sent_total, 0) < v_lifetime)
    -- duplicate-business challenge
    AND (NOT domain_required OR domain_verified)
  RETURNING true INTO v_ok;

  RETURN coalesce(v_ok, false);
END $fn$;

CREATE OR REPLACE FUNCTION public.send_block_reason(p_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_lifetime integer;
  v_daily    integer;
  v_used_day integer;
  v_used_all integer;
  v_req      boolean;
  v_ver      boolean;
  v_company  text;
  v_address  text;
BEGIN
  SELECT pl.lifetime_emails, pl.daily_emails,
         COALESCE(p.emails_sent_today, 0), COALESCE(p.emails_sent_total, 0),
         p.domain_required, p.domain_verified,
         p.company, p.business_address
    INTO v_lifetime, v_daily, v_used_day, v_used_all, v_req, v_ver, v_company, v_address
    FROM public.profiles p
    LEFT JOIN public.plan_limits pl ON pl.plan = public.effective_plan(p.id)
   WHERE p.id = p_user;

  IF v_req AND NOT v_ver THEN RETURN 'domain_required'; END IF;
  IF coalesce(btrim(v_company), '') = '' OR coalesce(btrim(v_address), '') = '' THEN
    RETURN 'business_identity_required';
  END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
