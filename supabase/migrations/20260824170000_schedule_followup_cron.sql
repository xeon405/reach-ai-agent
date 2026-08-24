-- Schedule the follow-up agent (reply detection, follow-ups, autopilot, digests)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any stale job with the same name, then schedule fresh
SELECT cron.unschedule('follow-up-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'follow-up-hourly'
);

SELECT cron.schedule(
  'follow-up-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/follow-up',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REDACTED_CRON_SECRET'
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  ) AS request_id;
  $$
);
