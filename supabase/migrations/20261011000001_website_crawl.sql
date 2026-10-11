-- Website email backfill for the shared map.
--
-- saved_businesses is our permanent, shared "our own map". Rows that a search
-- found with a website but no email are never enriched after the fact, so the
-- map keeps roughly the same ~20 email-less rows forever.
--
-- This adds a crawl watermark so the background website-crawl job can:
--   * pick rows with a website but no email,
--   * crawl the site for a published email and write it back (shared: every
--     future search by every user then gets it from memory),
--   * never re-crawl the same site for a month,
--   * count today's crawls for a daily budget.

ALTER TABLE public.saved_businesses
  ADD COLUMN IF NOT EXISTS email_crawl_at timestamptz;

COMMENT ON COLUMN public.saved_businesses.email_crawl_at IS
  'Last time the background website-crawl job tried to find an email for this business. Stamped even when nothing was found; used to skip re-crawling for ~30 days and to count today''s crawl budget.';

CREATE INDEX IF NOT EXISTS saved_businesses_crawl_candidates
  ON public.saved_businesses (email_crawl_at, last_seen DESC)
  WHERE email IS NULL AND website IS NOT NULL AND website <> '';