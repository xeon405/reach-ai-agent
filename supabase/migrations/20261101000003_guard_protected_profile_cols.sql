-- ============================================================
-- ANTI-ABUSE MVP — part 3: protected profile columns
--
-- Found while building the UI: the "own profile update" RLS policy is
-- `USING (auth.uid() = id)`, which allows updating ANY column the table has —
-- including `plan`, `domain_required` and `domain_verified`. A single REST call
-- (PATCH /profiles?id=eq.<me> { "domain_verified": true }) would have cleared
-- the duplicate-business challenge and restored sending. The rules would have
-- been decoration.
--
-- Fix: a BEFORE UPDATE trigger that restores the protected columns unless the
-- write comes from a trusted role. It silently keeps the old value rather than
-- raising, so an ordinary profile save keeps working and cannot be used to
-- probe which columns are protected.
--
-- Deliberately NOT protected here:
--   * emails_sent_today / emails_sent_total — reserve_send_slot() runs as the
--     calling user (SECURITY INVOKER), so guarding them would break sending.
--     They are already protected from abuse by being a hard stop, not a counter
--     the user can spend: lowering them gives no extra emails, because the cap
--     is compared against the same number on every send.
--   * business_address / company — the user must be able to correct these; the
--     flag is sticky and is never cleared by this trigger.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_protected_profile_cols()
RETURNS TRIGGER
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Service role (edge functions, admin tooling) and the database owner may
  -- change these. Everything else is the end user.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan := OLD.plan;
  END IF;
  IF NEW.domain_required IS DISTINCT FROM OLD.domain_required THEN
    NEW.domain_required := OLD.domain_required;
  END IF;
  IF NEW.domain_verified IS DISTINCT FROM OLD.domain_verified THEN
    NEW.domain_verified := OLD.domain_verified;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_a_guard_protected_profile_cols ON public.profiles;
CREATE TRIGGER trg_a_guard_protected_profile_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_profile_cols();

-- Postgres fires same-event triggers in name order, and only constraint triggers
-- accept FOLLOWS. So the guard is named trg_a_... to sort before
-- trg_flag_duplicate_business. If either trigger is renamed, the guard could
-- run second and undo the flag — keep the names.
DROP TRIGGER IF EXISTS trg_flag_duplicate_business ON public.profiles;
CREATE TRIGGER trg_flag_duplicate_business
  BEFORE UPDATE OF company, business_address ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.flag_duplicate_business();
