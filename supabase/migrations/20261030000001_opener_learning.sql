-- Opener learning: record which attention angle produced each email.
--
-- send-worker has always picked one of seven opening angles per lead by hashing
-- name+company+title, so a natural experiment has been running since launch.
-- The chosen angle was computed, pasted into the prompt, and then discarded —
-- the outcome could never be attributed to it.
--
-- One column turns that discarded signal into training data. The nightly
-- learning-loop fold reads it, and a genuinely better-than-average angle is
-- published as `opener_hint` on campaign_learning, which send-worker applies to
-- future first emails in the same campaign.
--
-- Nullable on purpose: template/fallback sends use no angle, and every row
-- written before this migration has no recorded angle. Null means "unknown",
-- never "default".

ALTER TABLE public.emails_sent
  ADD COLUMN IF NOT EXISTS opener_key text;

COMMENT ON COLUMN public.emails_sent.opener_key IS
  'Attention angle the model was instructed to open with (keys live in supabase/functions/_shared/ai-lib.ts ATTENTION_OPENERS). NULL = not recorded (pre-migration row, template send, or no AI used).';

CREATE INDEX IF NOT EXISTS emails_sent_campaign_opener_idx
  ON public.emails_sent (campaign_id, opener_key)
  WHERE opener_key IS NOT NULL;

-- Read-side rollup for the dashboard/analysis. security_invoker keeps the
-- emails_sent RLS policy in force, so a user only ever aggregates their own rows.
CREATE OR REPLACE VIEW public.opener_performance
WITH (security_invoker = true) AS
SELECT
  campaign_id,
  opener_key,
  count(*)                        AS sent,
  count(*) FILTER (WHERE replied) AS replied,
  round(
    (count(*) FILTER (WHERE replied))::numeric / greatest(count(*), 1),
    4
  )                               AS reply_rate
FROM public.emails_sent
WHERE opener_key IS NOT NULL
  AND campaign_id IS NOT NULL
GROUP BY campaign_id, opener_key;

GRANT SELECT ON public.opener_performance TO authenticated;
