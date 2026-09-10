-- ROLLBACK for migration 20260908000001_sender_health.sql
-- Stage 1 (0a): sender_health ledger + connected_at + reputation-nightly cron
--
-- Order matters. Run all three statements together.
--
-- 1) Unschedules the nightly reputation job (pg_cron). Safe if already gone.
-- 2) Drops sender_health. DESTRUCTIVE: current cap/phase/clean_days state is lost
--    (acceptable for rollback). Re-running the forward migration rebuilds it.
-- 3) Drops gmail_tokens.connected_at. Re-add with the backfill from the forward
--    migration if you ever re-apply.
--
-- Deployed-code note: send-worker (v41) + reputation-report (v3) fail SAFE if
-- sender_health is absent (resolveDailyCap falls back to the warm-up ramp, i.e.
-- exactly pre-0a behavior). No urgent redeploy required; for a byte-exact
-- pre-0a stack, redeploy send-worker v40 / the pre-connected_at gmail-oauth.
select cron.unschedule('reputation-nightly')
  where exists (select 1 from cron.job where jobname = 'reputation-nightly');

drop table if exists public.sender_health;

alter table public.gmail_tokens drop column if exists connected_at;