-- ============================================================
-- PHASE 1: COMPLETE LONG-TERM FOLLOW-UP ENGINE
-- ============================================================
-- 1. Fix follow_up_sequences timing to match exact spec
-- 2. Add lead-level follow-up tracking columns
-- 3. Add campaign follow-ups toggle
-- 4. Create follow-up lifecycle RPC functions
-- ============================================================

-- ── 1. FIX FOLLOW-UP SEQUENCE TIMING ────────────────────────
-- Current DB: 3,7,12,17,22,30,60,120,150,180,240,300,365 (WRONG)
-- Required:   3,8,18,33,58,88,148,268,418,568,748,1048,1413 (cumulative from initial)
--
-- Each delay is the cumulative number of days from the initial email.
-- Step 2: +3d, Step 3: +8d (3+5), Step 4: +18d (8+10), ...
-- Step 14: +1413d (3+5+10+15+25+30+60+120+150+180+240+300+365)

-- Delete existing sequences and recreate with correct timings
DELETE FROM follow_up_sequences;

-- Insert correct sequences for all active campaigns
INSERT INTO follow_up_sequences (user_id, campaign_id, step_number, delay_days, active)
SELECT
  c.user_id,
  c.id AS campaign_id,
  v.step_number,
  v.delay_days,
  true
FROM campaigns c
CROSS JOIN (VALUES
  (2, 3),
  (3, 8),
  (4, 18),
  (5, 33),
  (6, 58),
  (7, 88),
  (8, 148),
  (9, 268),
  (10, 418),
  (11, 568),
  (12, 748),
  (13, 1048),
  (14, 1413)
) AS v(step_number, delay_days)
WHERE c.status = 'active';

-- ── 2. LEAD-LEVEL FOLLOW-UP TRACKING ────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_step integer DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at timestamp with time zone;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_status text DEFAULT 'none';
-- followup_status: 'none' | 'active' | 'paused' | 'completed' | 'cancelled'

-- Index for efficient worker queries
CREATE INDEX IF NOT EXISTS idx_leads_followup_due
  ON leads (next_followup_at)
  WHERE followup_status = 'active' AND next_followup_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_followup_campaign
  ON leads (campaign_id, followup_status);

-- ── 3. CAMPAIGN FOLLOW-UPS TOGGLE ───────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS followups_enabled boolean DEFAULT true;

-- ── 4. UPDATED DEFAULT FOLLOW-UP CREATION FUNCTION ──────────
-- Drop old trigger first
DROP TRIGGER IF EXISTS on_campaign_created ON campaigns;
DROP FUNCTION IF EXISTS create_default_follow_ups();

CREATE OR REPLACE FUNCTION create_default_follow_ups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.followups_enabled = true OR NEW.followups_enabled IS NULL THEN
    INSERT INTO follow_up_sequences (user_id, campaign_id, step_number, delay_days, active)
    VALUES
      (NEW.user_id, NEW.id, 2, 3, true),    -- +3 days
      (NEW.user_id, NEW.id, 3, 8, true),    -- +8 days (3+5)
      (NEW.user_id, NEW.id, 4, 18, true),   -- +18 days (8+10)
      (NEW.user_id, NEW.id, 5, 33, true),   -- +33 days (18+15)
      (NEW.user_id, NEW.id, 6, 58, true),   -- +58 days (33+25)
      (NEW.user_id, NEW.id, 7, 88, true),   -- +88 days (58+30)
      (NEW.user_id, NEW.id, 8, 148, true),  -- +148 days (88+60)
      (NEW.user_id, NEW.id, 9, 268, true),  -- +268 days (148+120)
      (NEW.user_id, NEW.id, 10, 418, true), -- +418 days (268+150)
      (NEW.user_id, NEW.id, 11, 568, true), -- +568 days (418+150)
      (NEW.user_id, NEW.id, 12, 748, true), -- +748 days (568+180)
      (NEW.user_id, NEW.id, 13, 1048, true),-- +1048 days (748+300)
      (NEW.user_id, NEW.id, 14, 1413, true);-- +1413 days (1048+365)
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_campaign_created
  AFTER INSERT ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION create_default_follow_ups();

-- ── 5. LEAD FOLLOW-UP LIFECYCLE RPC ─────────────────────────

-- Initialize follow-up tracking when initial email is sent
CREATE OR REPLACE FUNCTION init_lead_followup(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_initial_send_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step2_delay integer;
  v_next_at timestamp with time zone;
BEGIN
  -- Look up step 2 delay (first follow-up after initial)
  SELECT delay_days INTO v_step2_delay
  FROM follow_up_sequences
  WHERE campaign_id = p_campaign_id AND step_number = 2 AND active = true
  LIMIT 1;

  IF v_step2_delay IS NULL THEN
    v_step2_delay := 3; -- default fallback
  END IF;

  v_next_at := p_initial_send_at + (v_step2_delay || ' days')::interval;

  UPDATE leads SET
    followup_step = 1,
    followup_status = 'active',
    next_followup_at = v_next_at
  WHERE id = p_lead_id;
END;
$$;

-- Advance follow-up to next step after a follow-up is sent
CREATE OR REPLACE FUNCTION advance_lead_followup(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_current_step integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_step integer;
  v_next_delay integer;
  v_next_at timestamp with time zone;
BEGIN
  v_next_step := p_current_step + 1;

  -- Check if next step exists
  SELECT delay_days INTO v_next_delay
  FROM follow_up_sequences
  WHERE campaign_id = p_campaign_id AND step_number = v_next_step AND active = true
  LIMIT 1;

  IF v_next_delay IS NULL THEN
    -- No more steps — sequence complete
    UPDATE leads SET
      followup_step = p_current_step,
      followup_status = 'completed',
      next_followup_at = NULL
    WHERE id = p_lead_id;
  ELSE
    -- Schedule the next step (delay is cumulative from initial email, not from now)
    -- We need the initial send time to calculate correctly
    -- The initial send time = now - (total days for current step)
    -- Actually, we store cumulative delays, so next_followup_at = initial_send + next_delay
    -- We can derive initial_send from the current step's emails_sent.sent_at
    -- For simplicity, calculate: next_followup_at = now + (v_next_delay - current cumulative delay)
    -- But we don't have the current cumulative delay here.
    -- Better: look up the step 1 sent_at from emails_sent and add v_next_delay
    DECLARE
      v_initial_sent_at timestamp with time zone;
    BEGIN
      SELECT sent_at INTO v_initial_sent_at
      FROM emails_sent
      WHERE lead_id = p_lead_id AND campaign_id = p_campaign_id AND sequence = 1
      LIMIT 1;

      IF v_initial_sent_at IS NOT NULL THEN
        v_next_at := v_initial_sent_at + (v_next_delay || ' days')::interval;
      ELSE
        -- Fallback: use now + step 2 delay as if starting fresh
        v_next_at := now() + (v_next_delay || ' days')::interval;
      END IF;
    END;

    UPDATE leads SET
      followup_step = p_current_step,
      followup_status = 'active',
      next_followup_at = v_next_at
    WHERE id = p_lead_id;
  END IF;
END;
$$;

-- Cancel all follow-ups for a lead (reply detected, suppressed, etc.)
CREATE OR REPLACE FUNCTION cancel_lead_followup(
  p_lead_id uuid,
  p_reason text DEFAULT 'cancelled'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads SET
    followup_status = p_reason,
    next_followup_at = NULL
  WHERE id = p_lead_id;
END;
$$;

-- ── 6. AUTO-CANCEL ON REPLY ─────────────────────────────────
-- When a lead replies, automatically cancel follow-ups
CREATE OR REPLACE FUNCTION on_lead_reply_cancel_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.replied = true AND (OLD.replied = false OR OLD.replied IS NULL) THEN
    UPDATE leads SET
      followup_status = 'cancelled',
      next_followup_at = NULL
    WHERE id = NEW.lead_id AND followup_status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_reply ON emails_sent;
CREATE TRIGGER on_email_reply
  AFTER UPDATE OF replied ON emails_sent
  FOR EACH ROW
  WHEN (NEW.replied = true AND (OLD.replied = false OR OLD.replied IS NULL))
  EXECUTE FUNCTION on_lead_reply_cancel_followup();
