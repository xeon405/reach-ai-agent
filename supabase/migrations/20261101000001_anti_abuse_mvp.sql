-- ============================================================
-- ANTI-ABUSE MVP
--   1. Free tier becomes a LIFETIME cap (50 emails ever, 10/day) so farming
--      accounts stops paying: N accounts buys N x 50 emails ONCE, not 10/day
--      forever.
--   2. Business identity (brand name + address) is required to send, and a
--      second account claiming the same brand+address must prove domain
--      ownership. The FIRST account with that pair is never challenged, so a
--      real business without a website is never blocked.
--   3. Signup device/IP is recorded for investigation, never used to block.
--
-- Why the cap sits in reserve_send_slot: that function is already the single
-- atomic choke point every send passes through (send-worker, follow-ups,
-- replays). Putting the limit anywhere else creates a second source of truth
-- that will drift — the failure mode that makes anti-abuse systems leak.
-- ============================================================

-- ---- 1. lifetime cap ---------------------------------------
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS lifetime_emails integer;

COMMENT ON COLUMN public.plan_limits.lifetime_emails IS
  'Total emails a plan may ever send. NULL = unlimited (paid plans). Enforced atomically in reserve_send_slot.';

UPDATE public.plan_limits SET lifetime_emails = 50 WHERE plan = 'free';
UPDATE public.plan_limits SET lifetime_emails = NULL WHERE plan <> 'free';

-- Running total. Distinct from emails_sent_today, which resets daily.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emails_sent_total integer NOT NULL DEFAULT 0;

-- Seed the lifetime counter from what has actually been sent, so existing
-- accounts are not handed a fresh 50 on migration day.
UPDATE public.profiles p
   SET emails_sent_total = COALESCE(s.n, 0)
  FROM (
    SELECT user_id, count(*) AS n FROM public.emails_sent GROUP BY user_id
  ) s
 WHERE s.user_id = p.id
   AND p.emails_sent_total = 0;

-- ---- 2. business identity + duplicate challenge ------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_address text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS domain_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS domain_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.business_address IS
  'Street address of the business, required before the first send. Used only for the one-trial-per-business check and for the sender identity shown in emails — never published.';
COMMENT ON COLUMN public.profiles.domain_required IS
  'Set when a LATER account claims the same brand name + business address as an earlier one. Until a domain is verified, sending and new campaigns are blocked.';

-- Exact-match lookup for the duplicate check. Deliberately NOT fuzzy: "St" and
-- "Street" must stay distinct, because fuzzy matching would block real
-- neighbours and freelancers who share an office building.
CREATE INDEX IF NOT EXISTS profiles_business_identity_idx
  ON public.profiles (lower(btrim(company)), lower(btrim(business_address)))
  WHERE business_address IS NOT NULL;

-- First-come wins. Only an account created AFTER an identical pair is flagged,
-- and only when the identity fields actually change (so ordinary profile edits
-- don't re-run the lookup).
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
     AND lower(btrim(company)) = lower(btrim(NEW.company))
     AND lower(btrim(business_address)) = lower(btrim(NEW.business_address))
     AND created_at <= NEW.created_at
   LIMIT 1;

  -- Never clear an existing flag here: once challenged, only a verified domain
  -- (or an admin) removes it, otherwise editing a typo would launder the flag.
  IF v_dup IS NOT NULL THEN
    NEW.domain_required := true;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_flag_duplicate_business ON public.profiles;
CREATE TRIGGER trg_flag_duplicate_business
  BEFORE UPDATE OF company, business_address ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.flag_duplicate_business();

-- ---- 3. domains (1-to-many, verified by DNS TXT) ----------
CREATE TABLE IF NOT EXISTS public.domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain             text NOT NULL,
  verification_token text NOT NULL,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- A user may hold several domains (schema stays 1-to-many even though the MVP
-- UI asks for one), but one domain can only ever be VERIFIED to one account.
CREATE UNIQUE INDEX IF NOT EXISTS domains_user_domain_uniq
  ON public.domains (user_id, lower(domain));

CREATE UNIQUE INDEX IF NOT EXISTS domains_verified_domain_uniq
  ON public.domains (lower(domain))
  WHERE verified_at IS NOT NULL;

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domains read own" ON public.domains;
CREATE POLICY "domains read own" ON public.domains
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;

-- ---- 4. signup signals (observe, never block) -------------
CREATE TABLE IF NOT EXISTS public.signup_signals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id  text,
  ip_hash    text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_signals_device_idx
  ON public.signup_signals (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_signals_ip_idx
  ON public.signup_signals (ip_hash) WHERE ip_hash IS NOT NULL;

ALTER TABLE public.signup_signals ENABLE ROW LEVEL SECURITY;
-- No client access at all: this exists for the operator, not the user.
REVOKE ALL ON public.signup_signals FROM anon, authenticated;
GRANT ALL ON public.signup_signals TO service_role;

-- ---- 5. the enforcer --------------------------------------
-- Both caps and the domain challenge, in ONE atomic UPDATE. A rejected send
-- never increments a counter, so a blocked account cannot burn its quota.
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
    -- daily cap (unchanged)
    AND (CASE WHEN emails_sent_date = current_date
              THEN coalesce(emails_sent_today, 0) ELSE 0 END) < p_cap
    -- lifetime cap (new)
    AND (v_lifetime IS NULL OR coalesce(emails_sent_total, 0) < v_lifetime)
    -- duplicate-business challenge (new): nothing goes out until proven
    AND (NOT domain_required OR domain_verified)
  RETURNING true INTO v_ok;

  RETURN coalesce(v_ok, false);
END $fn$;

-- Why a send was refused — so the app can say the real reason instead of
-- showing a generic failure. Read-only, cheap, one row.
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
BEGIN
  SELECT pl.lifetime_emails, pl.daily_emails,
         COALESCE(p.emails_sent_today, 0), COALESCE(p.emails_sent_total, 0),
         p.domain_required, p.domain_verified
    INTO v_lifetime, v_daily, v_used_day, v_used_all, v_req, v_ver
    FROM public.profiles p
    LEFT JOIN public.plan_limits pl ON pl.plan = public.effective_plan(p.id)
   WHERE p.id = p_user;

  IF v_req AND NOT v_ver THEN RETURN 'domain_required'; END IF;
  IF v_lifetime IS NOT NULL AND v_used_all >= v_lifetime THEN RETURN 'lifetime_limit'; END IF;
  IF v_daily IS NOT NULL AND v_used_day >= v_daily THEN RETURN 'daily_limit'; END IF;
  RETURN NULL;
END $fn$;

GRANT EXECUTE ON FUNCTION public.send_block_reason(uuid) TO authenticated, service_role;
