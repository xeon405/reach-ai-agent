-- 0a: mailbox connection anchor + deterministic sender-health reputation feedback.
-- NOTE: x-cron-secret below is redacted to <CRON_SECRET>; substitute the project's
-- CRON_SECRET (`supabase secrets list`) before applying on a fresh project.
-- The intelligence layer stays advisory: every consumer falls back to today's
-- ramp formula when this ledger has no (or stale) row.

-- 1) Warm-up anchor: gmail_tokens gains connected_at. Set on first connect and
--    preserved on refresh/reconnect (see gmail-oauth). Backfill the best known
--    answer for existing mailboxes (token row update time) so the warm-up bug
--    does not leave old accounts permanently turbo-warmed.
ALTER TABLE public.gmail_tokens ADD COLUMN IF NOT EXISTS connected_at timestamptz;
UPDATE public.gmail_tokens SET connected_at = updated_at WHERE connected_at IS NULL;

-- 2) sender_health: written nightly by reputation-report, read only by
--    send-worker / reserve_send_slot callers.
CREATE TABLE IF NOT EXISTS public.sender_health (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  gmail_email text,
  phase text NOT NULL DEFAULT 'ramp' CHECK (phase IN ('ramp','steady','recovery')),
  current_cap int NOT NULL DEFAULT 5,
  warm_cap int NOT NULL DEFAULT 5,
  sends_7d int NOT NULL DEFAULT 0,
  bounces_7d int NOT NULL DEFAULT 0,
  replies_7d int NOT NULL DEFAULT 0,
  unsubs_7d int NOT NULL DEFAULT 0,
  bounce_rate_7d numeric NOT NULL DEFAULT 0,
  complaint_rate_7d numeric NOT NULL DEFAULT 0,
  reply_rate_7d numeric NOT NULL DEFAULT 0,
  clean_days int NOT NULL DEFAULT 0,
  last_measured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sender_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sender_health FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sender_health TO service_role;

-- 3) Nightly reputation report. Mirrors the follow-up cron pattern so the
--    deterministic brakes run without any user interaction.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('reputation-nightly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reputation-nightly'
);

SELECT cron.schedule(
  'reputation-nightly',
  '15 1 * * *',  -- 01:15 UTC every night
  $$
  SELECT net.http_post(
    url := 'https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/reputation-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  ) AS request_id;
  $$
);