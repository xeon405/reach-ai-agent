-- ============================================================
-- NOTE: x-cron-secret below is redacted to <CRON_SECRET>; substitute the project's
-- CRON_SECRET (`supabase secrets list`) before applying on a fresh project.
-- STAGE 9 — HOURLY HEALTH-CHECK (infra watchdog)
--
-- Reuse, don't rebuild:
--   * owner_alerts -> trg_alerts_to_push -> push_queue -> push-drainer
--     is the existing alert + Web Push channel (no new channel).
--   * cron.job_run_details (pg_cron's own run ledger) is the single
--     authoritative "did THIS run?" source for every cron, including the
--     health-check itself. No per-function heartbeat instrumentation.
--   * gmail.ts getAccessToken() = real token mint = "can we still call Gmail?".
--   * cost-sweep's re-sum SQL against ai_spend_ledger = drift check.
--
-- NEW state is minimal: health_state (dedup/cooldown state machine) +
-- the health-hourly cron itself. owner_alerts kind +='system'.
--
-- ROLLBACK: see 20260910000001_health_check.rollback.sql
-- ============================================================

-- 1) owner_alerts kind whitelist += 'system'
alter table public.owner_alerts drop constraint if exists owner_alerts_kind_check;
alter table public.owner_alerts add constraint owner_alerts_kind_check
  check (kind = any (array[
    'booking','opt_out','takeover','handoff','bounce','first_reply','review',
    'network_intro','network_intro_accepted','network_intro_rejected','referral_reward','system'
  ]));

-- 2) dedup/cooldown state machine (service_role only)
create table if not exists public.health_state (
  check_key text primary key,
  active_since timestamptz,
  last_alerted_at timestamptz,
  last_seen_at timestamptz,
  resolved_at timestamptz,
  escalated_at timestamptz,
  alert_count integer not null default 0
);
alter table public.health_state enable row level security;
revoke all on public.health_state from anon, authenticated;
grant select, insert, update on public.health_state to service_role;

-- 3) last-run ledger exposed read-only via RPC (cron schema is not reachable
--    through PostgREST). LEFT JOIN from cron.job so an UNSCHEDULED job vanishes
--    from the result entirely -> the check treats "expected but missing" as stale.
create or replace function public.health_last_cron_runs()
returns table (
  jobname text,
  schedule text,
  last_start timestamptz,
  last_success timestamptz,
  failed_runs bigint
)
language sql
security definer
set search_path = public
as $$
  select j.jobname,
         j.schedule,
         max(d.start_time) as last_start,
         max(d.end_time) filter (where d.status = 'succeeded') as last_success,
         count(*) filter (where d.status = 'failed') as failed_runs
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  group by j.jobname, j.schedule
  order by j.jobname;
$$;

revoke all on function public.health_last_cron_runs() from public, anon, authenticated;
grant execute on function public.health_last_cron_runs() to service_role;

-- 4) hourly health-check cron
select cron.unschedule('health-hourly') where exists (select 1 from cron.job where jobname = 'health-hourly');

select cron.schedule(
  'health-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  ) AS request_id;
  $$
);