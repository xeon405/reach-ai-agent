-- Review-each-email mode.
-- A new account drafts its first 20 first-touch emails, holds them, and shows
-- them before anything leaves the mailbox. review_mode:
--   'first_20' (default) | 'always' | 'off'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'first_20';

ALTER TABLE public.send_queue
  ADD COLUMN IF NOT EXISTS review_state TEXT,     -- NULL | 'awaiting' | 'approved' | 'skipped'
  ADD COLUMN IF NOT EXISTS draft_subject TEXT,
  ADD COLUMN IF NOT EXISTS draft_body TEXT,
  ADD COLUMN IF NOT EXISTS draft_meta JSONB;

-- A held draft is a live job: relaunching the campaign must not queue a second
-- draft for the same lead while the owner is still deciding.
DROP INDEX IF EXISTS public.uniq_queue_job;
CREATE UNIQUE INDEX uniq_queue_job
  ON public.send_queue (campaign_id, lead_id)
  WHERE status IN ('pending', 'claimed', 'processing', 'awaiting_review');

CREATE INDEX IF NOT EXISTS idx_send_queue_awaiting_review
  ON public.send_queue (user_id, created_at DESC)
  WHERE status = 'awaiting_review';
