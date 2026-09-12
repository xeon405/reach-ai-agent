-- ============================================================
-- Default follow-up sequence: 4 touches over 3 weeks (day 3,7,14,21)
-- ============================================================
-- Replaces the 13-step / ~4-year default (cumulative 3,8,18,33,...1413d)
-- with a realistic 4-touch sequence. delay_days stays CUMULATIVE from the
-- initial email (same semantics as followup_engine.sql).
--
-- Scope DECISION (stated, not accidental): this applies to BOTH new and
-- existing campaigns, and re-schedules active leads currently mid-sequence
-- onto the new timeline:
--   * every enabled campaign is rewritten to the 4-step default (one source
--     of truth; no old-13-step campaigns lingering next to new ones),
--   * NEW campaigns inherit it via create_default_follow_ups(),
--   * active leads get next_followup_at = initial_sent + new delay(step+1);
--     any active lead whose next step exceeds the 5-step limit is completed.
-- (At application time: 3 active leads existed, all step 3, and are recomputed.)

-- ── 1. NEW default for campaigns created from now on ────────
CREATE OR REPLACE FUNCTION create_default_follow_ups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.followups_enabled = true OR NEW.followups_enabled IS NULL THEN
    INSERT INTO follow_up_sequences (user_id, campaign_id, step_number, delay_days, active)
    VALUES
      (NEW.user_id, NEW.id, 2, 3, true),   -- +3 days
      (NEW.user_id, NEW.id, 3, 7, true),   -- +7 days (3+4)
      (NEW.user_id, NEW.id, 4, 14, true),  -- +14 days (7+7)
      (NEW.user_id, NEW.id, 5, 21, true);  -- +21 days (14+7)
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Rewrite EXISTING enabled campaigns to the same default ──
DELETE FROM follow_up_sequences;

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
  (3, 7),
  (4, 14),
  (5, 21)
) AS v(step_number, delay_days)
WHERE c.followups_enabled != false;

-- ── 3. Re-schedule active leads mid-sequence onto the new timeline ──
WITH new_sched AS (
  SELECT l.id,
         l.followup_step + 1 AS next_step,
         COALESCE(
           (SELECT e.sent_at FROM emails_sent e
             WHERE e.lead_id = l.id AND e.campaign_id = l.campaign_id AND e.sequence = 1
             LIMIT 1),
           now()
         ) AS initial_sent
  FROM leads l
  WHERE l.followup_status = 'active'
)
UPDATE leads le
SET
  followup_status = CASE WHEN d.next_step > 5 THEN 'completed' ELSE 'active' END,
  next_followup_at = CASE
    WHEN d.next_step <= 5 THEN
      d.initial_sent + (
        SELECT s.delay_days || ' days'::text
        FROM follow_up_sequences s
        WHERE s.campaign_id = le.campaign_id AND s.step_number = d.next_step AND s.active
        LIMIT 1
      )::interval
    ELSE NULL
  END
FROM new_sched d
WHERE le.id = d.id;