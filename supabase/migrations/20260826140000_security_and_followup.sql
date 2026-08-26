-- ============================================================
-- SECURITY + FOLLOW-UP HARDENING
-- ============================================================

-- 1. RLS on gmail_tokens (OAuth refresh tokens — CRITICAL)
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gmail tokens" ON public.gmail_tokens
  FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

-- 2. RLS on tools_rate_limit (IP-based, no user_id — allow service-role only via default deny)
ALTER TABLE public.tools_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.tools_rate_limit
  FOR ALL USING (false);

-- 3. Follow-up sequence table — configurable per-campaign intervals
CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  delay_days int NOT NULL,
  template text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_number)
);
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own follow-up sequences" ON public.follow_up_sequences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Default follow-up intervals (inserted for each new campaign via function)
-- The send-worker reads these instead of hardcoded values.
CREATE OR REPLACE FUNCTION public.create_default_follow_ups(p_user_id uuid, p_campaign_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.follow_up_sequences (user_id, campaign_id, step_number, delay_days)
  VALUES
    (p_user_id, p_campaign_id, 2, 3),
    (p_user_id, p_campaign_id, 3, 7),
    (p_user_id, p_campaign_id, 4, 12),
    (p_user_id, p_campaign_id, 5, 17),
    (p_user_id, p_campaign_id, 6, 22),
    (p_user_id, p_campaign_id, 7, 30),
    (p_user_id, p_campaign_id, 8, 60),
    (p_user_id, p_campaign_id, 9, 120),
    (p_user_id, p_campaign_id, 10, 150),
    (p_user_id, p_campaign_id, 11, 180),
    (p_user_id, p_campaign_id, 12, 240),
    (p_user_id, p_campaign_id, 13, 300),
    (p_user_id, p_campaign_id, 14, 365)
  ON CONFLICT (campaign_id, step_number) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create default follow-ups for existing active campaigns
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id, user_id FROM public.campaigns WHERE status = 'active' LOOP
    PERFORM public.create_default_follow_ups(c.user_id, c.id);
  END LOOP;
END $$;

-- Auto-create follow-up sequences when a new campaign is created
CREATE OR REPLACE FUNCTION public trg_create_follow_ups_on_campaign()
RETURNS trigger AS $trigger$
BEGIN
  PERFORM public.create_default_follow_ups(NEW.user_id, NEW.id);
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_campaign_created ON public.campaigns;
CREATE TRIGGER on_campaign_created
  AFTER INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_create_follow_ups_on_campaign();
