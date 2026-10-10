-- Plan limits: one source of truth for what each plan allows, plus
-- server-side enforcement so no client or agent can exceed it.
--
--   daily_emails : emails a user may send per day (enforced in send-worker via
--                  reserve_send_slot; recorded here so it lives in one place).
--   leads        : total leads a user may hold (NULL = unlimited).
--   campaigns    : active campaigns a user may run at once (NULL = unlimited).
--
-- Lead caps were already enforced by 20260824200000_lead_cap_trigger.sql with
-- hardcoded numbers; this migration points that trigger at this table and makes
-- it referral-reward aware. Campaign caps are new (booked here for the first
-- time) -- only the frontend/agent created campaigns without any server check.

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan         TEXT PRIMARY KEY,
  daily_emails INTEGER NOT NULL,
  leads        INTEGER,
  campaigns    INTEGER
);

INSERT INTO public.plan_limits (plan, daily_emails, leads, campaigns) VALUES
  ('free',    10,  25,   1),
  ('starter', 50,  250,  1),
  ('growth',  200, 1000, 5),
  ('agency',  500, 5000, NULL)
ON CONFLICT (plan) DO UPDATE
  SET daily_emails = EXCLUDED.daily_emails,
      leads        = EXCLUDED.leads,
      campaigns    = EXCLUDED.campaigns;

-- Reference data: readable by any signed-in user, writable only by service role.
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan limits readable" ON public.plan_limits;
CREATE POLICY "plan limits readable" ON public.plan_limits
  FOR SELECT TO authenticated USING (true);

-- Effective plan for a user: the subscription plan, upgraded to a still-active
-- referral reward plan when that reward ranks higher. Mirrors
-- supabase/functions/_shared/effective-plan.ts.
CREATE OR REPLACE FUNCTION public.effective_plan(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan  TEXT;
  v_rp    TEXT;
  v_until TIMESTAMPTZ;
  v_order TEXT[] := ARRAY['free', 'starter', 'growth', 'agency'];
BEGIN
  SELECT plan, referral_reward_plan, referral_reward_until
    INTO v_plan, v_rp, v_until
    FROM public.profiles WHERE id = p_user;

  IF v_plan IS NULL OR NOT (v_plan = ANY (v_order)) THEN
    v_plan := 'free';
  END IF;

  IF v_rp IS NOT NULL AND (v_rp = ANY (v_order))
     AND v_until IS NOT NULL AND v_until > now()
     AND array_position(v_order, v_rp) > array_position(v_order, v_plan) THEN
    RETURN v_rp;
  END IF;

  RETURN v_plan;
END; $$;

-- Active-campaign cap. Enforced for every writer (app + edge functions), since
-- creating or starting a campaign is always a deliberate, user-facing action.
CREATE OR REPLACE FUNCTION public.enforce_campaign_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap  INTEGER;
  v_used INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  -- Only when this row is newly becoming active.
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT campaigns INTO v_cap
    FROM public.plan_limits
   WHERE plan = public.effective_plan(NEW.user_id);

  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_used
    FROM public.campaigns
   WHERE user_id = NEW.user_id AND status = 'active';

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'Campaign limit reached for your plan (%). Pause one or upgrade.', v_cap
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_campaign_limit ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_limit
  BEFORE INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_limit();

-- Point the pre-existing lead-cap trigger at the single source of truth and
-- make it referral-reward aware. Same errcode/behaviour as before.
CREATE OR REPLACE FUNCTION public.enforce_lead_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap INTEGER;
BEGIN
  SELECT leads INTO cap
    FROM public.plan_limits
   WHERE plan = public.effective_plan(NEW.user_id);

  IF cap IS NULL THEN
    RETURN NEW;
  END IF;

  IF (SELECT count(*) FROM public.leads WHERE user_id = NEW.user_id) >= cap THEN
    RAISE EXCEPTION 'Lead limit reached for your plan (%). Delete some leads or upgrade.', cap
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

-- Cleanup: an earlier revision of this migration added a duplicate lead trigger.
DROP TRIGGER IF EXISTS trg_enforce_lead_limit ON public.leads;
DROP FUNCTION IF EXISTS public.enforce_lead_limit();
