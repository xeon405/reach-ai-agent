-- ============================================================
-- ROLLBACK — Stage 9 health-check
-- ============================================================

select cron.unschedule('health-hourly') where exists (select 1 from cron.job where jobname = 'health-hourly');

drop function if exists public.health_last_cron_runs();

drop table if exists public.health_state;

alter table public.owner_alerts drop constraint if exists owner_alerts_kind_check;
alter table public.owner_alerts add constraint owner_alerts_kind_check
  check (kind = any (array[
    'booking','opt_out','takeover','handoff','bounce','first_reply','review',
    'network_intro','network_intro_accepted','network_intro_rejected','referral_reward'
  ]));