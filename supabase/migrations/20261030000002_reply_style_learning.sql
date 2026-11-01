-- Reply-style learning: the same record -> measure -> act loop as openers.
--
-- The reply prompt used to be one fixed instruction string, so no outcome could
-- be attributed to a "shape". inbox-agent now picks one of three shapes per lead
-- (see _shared/reply-styles.ts) and records it here. The nightly fold then
-- compares meeting rate per shape against the campaign's own average.
--
-- Nullable: rows written before this migration, and conversations handled by a
-- human, have no shape. Null means "not recorded", never "default shape".

ALTER TABLE public.emails_sent
  ADD COLUMN IF NOT EXISTS reply_style text;

COMMENT ON COLUMN public.emails_sent.reply_style IS
  'Reply shape used for this conversation (keys in supabase/functions/_shared/reply-styles.ts). NULL = no AI reply sent yet or pre-migration row.';

CREATE INDEX IF NOT EXISTS emails_sent_campaign_reply_style_idx
  ON public.emails_sent (campaign_id, reply_style)
  WHERE reply_style IS NOT NULL;

-- Read-side rollup. Reply-style winners are judged on MEETINGS BOOKED, not on
-- reply sentiment: "they answered warmly" is not the business outcome, and
-- optimising for it would reward politeness over progress.
CREATE OR REPLACE VIEW public.reply_style_performance
WITH (security_invoker = true) AS
SELECT
  e.campaign_id,
  e.reply_style,
  count(DISTINCT e.lead_id) AS conversations,
  count(DISTINCT m.lead_id)  AS meetings
FROM public.emails_sent e
LEFT JOIN public.meetings m
  ON m.lead_id = e.lead_id
 AND m.campaign_id = e.campaign_id
WHERE e.reply_style IS NOT NULL
  AND e.campaign_id IS NOT NULL
GROUP BY e.campaign_id, e.reply_style;

GRANT SELECT ON public.reply_style_performance TO authenticated;
