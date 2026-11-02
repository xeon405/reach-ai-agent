-- ============================================================
-- ANTI-ABUSE MVP — part 5: the address must actually be an address
--
-- "India", "United States" and "London" were accepted, because the only rule was
-- "not blank". That is two problems in one:
--   * the sender identity on outbound mail was meaningless;
--   * the duplicate check compares name + address, so typing a country made every
--     signup look unique and skipped the domain challenge entirely.
--
-- The rule below has no country list to maintain. A country name fails naturally,
-- because it contains neither a digit nor a street word. A real address nearly
-- always has one of the two, in any language we support:
--     "12 Market Street, Leeds"      -> digit
--     "The Old Mill, Mill Lane, Bath"-> "lane"
--     "Nagar, Chennai"               -> "nagar"
--     "Hauptstrasse 5, Berlin"       -> digit
-- Word boundaries matter: without them "Norway" would match "way".
--
-- Enforced in reserve_send_slot, not only in the form, for the same reason as
-- part 2: a form is not an enforcement point.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_plausible_business_address(p_address text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_address IS NULL THEN false
    -- too short to hold a street and a city
    WHEN length(btrim(p_address)) < 12 THEN false
    -- digits only, no words
    WHEN btrim(p_address) !~ '[[:alpha:]]' THEN false
    -- a building number is the strongest signal
    WHEN btrim(p_address) ~ '[0-9]' THEN true
    -- otherwise require a street-type word, in English and the other
    -- languages the product supports
    WHEN lower(btrim(p_address)) ~ '\m(street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|close|court|ct|place|pl|terrace|square|sq|highway|hwy|parkway|pkwy|route|rte|unit|suite|floor|building|bldg|block|sector|industrial|estate|park|plaza|centre|center|nagar|colony|marg|chowk|bazaar|via|calle|rue|strasse|straße|weg|platz|gasse|ring|allee|ulica|callejón|bulevar)\M'
      THEN true
    ELSE false
  END
$fn$;

COMMENT ON FUNCTION public.is_plausible_business_address(text) IS
  'True when the value looks like a street-level business address rather than a bare country or city. Used by reserve_send_slot and mirrored in src/lib/address.ts.';

-- ---- the enforcer ------------------------------------------
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
    -- business identity on file, and the address is a real one
    AND coalesce(btrim(company), '') <> ''
    AND public.is_plausible_business_address(business_address)
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

-- ---- say which of the two identity problems it is ----------
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
  -- Separate reason so the app can say "a country isn't enough" instead of
  -- showing a generic "missing details" message the user cannot act on.
  IF NOT public.is_plausible_business_address(v_address) THEN
    RETURN 'business_address_incomplete';
  END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_plausible_business_address(text) TO authenticated, service_role;

-- ---- compare addresses with whitespace ignored --------------
-- "1 Main Street, Leeds" and "1 Main  Street, Leeds" are the same address. Not
-- fuzzy matching — nothing is stemmed or reordered, and two genuinely different
-- businesses can never collide by accident. It only stops a double space from
-- looking like a new business.
CREATE OR REPLACE FUNCTION public.normalize_business_text(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'))
$fn$;

CREATE OR REPLACE FUNCTION public.flag_duplicate_business()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_dup uuid;
BEGIN
  IF coalesce(btrim(NEW.company), '') = '' OR coalesce(btrim(NEW.business_address), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.company IS NOT DISTINCT FROM OLD.company
     AND NEW.business_address IS NOT DISTINCT FROM OLD.business_address THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_dup
    FROM public.profiles
   WHERE id <> NEW.id
     AND public.normalize_business_text(company) = public.normalize_business_text(NEW.company)
     AND public.normalize_business_text(business_address) = public.normalize_business_text(NEW.business_address)
     AND created_at <= NEW.created_at
   LIMIT 1;

  -- Never clear an existing flag here: once challenged, only a verified domain
  -- (or an admin) removes it, otherwise editing a typo would launder the flag.
  IF v_dup IS NOT NULL THEN
    NEW.domain_required := true;
  END IF;

  RETURN NEW;
END $fn$;

DROP INDEX IF EXISTS public.profiles_business_identity_idx;
CREATE INDEX IF NOT EXISTS profiles_business_identity_idx
  ON public.profiles (
    public.normalize_business_text(company),
    public.normalize_business_text(business_address)
  )
  WHERE business_address IS NOT NULL;
