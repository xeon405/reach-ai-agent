-- Rollback for 20261011000001_website_crawl.sql
DROP INDEX IF EXISTS public.saved_businesses_crawl_candidates;
ALTER TABLE public.saved_businesses
  DROP COLUMN IF EXISTS email_crawl_at;