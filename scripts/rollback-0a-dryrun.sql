-- Dry-run of 20260908000001_sender_health.rollback.sql against live schema.
-- Wrapped in BEGIN/ROLLBACK so no effect persists. Verifies: cron job resolves,
-- sender_health drops cleanly, connected_at drops cleanly, ordering is correct.
begin;
select cron.unschedule('reputation-nightly')
  where exists (select 1 from cron.job where jobname = 'reputation-nightly');
drop table if exists public.sender_health;
alter table public.gmail_tokens drop column if exists connected_at;
rollback;