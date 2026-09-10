-- ============================================================
-- STAGE 9 — CRON OUTCOME EVIDENCE RPC
--
-- Upgrade the cron probe from "did pg_cron DISPATCH?" (job_run_details,
-- which records 'succeeded' for net.http_post regardless of whether the edge
-- function body executed — the 09-09 reputation-nightly blind spot) to
-- "did the FUNCTION actually RUN?" (unconditional run-marker audit rows).
--
-- Every cron target writes a run marker: health.run, cost.sweep.run,
-- push.drain.run, inbox.run, send.worker.run, learning.fold,
-- digest.run, warm.run, health.report.run. This RPC returns each job's
-- dispatch ledger AND its last confirmed execution marker; the health-check
-- probe judges freshness on the marker first.
--
-- ROLLBACK: 20260910000002_health_cron_evidence.rollback.sql
-- ============================================================

create or replace function public.health_cron_evidence()
returns table (
  jobname text,
  schedule text,
  last_start timestamptz,
  last_success timestamptz,
  failed_runs bigint,
  last_run_event text,
  last_run_event_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with events(jobname, run_event) as (
    values
      ('cost-sweep', 'cost.sweep.run'),
      ('health-hourly', 'health.run'),
      ('learning-hourly', 'learning.fold'),
      ('outreachai_daily_digest', 'digest.run'),
      ('outreachai_inbox_agent_hourly', 'inbox.run'),
      ('outreachai_push_drainer_minutely', 'push.drain.run'),
      ('outreachai_send_worker_hourly', 'send.worker.run'),
      ('outreachai_warm_areas_daily', 'warm.run'),
      ('reputation-nightly', 'health.report.run')
  ),
  markers as (
    select event, max(created_at) as run_event_at
    from public.audit_events
    where event in (
      'cost.sweep.run', 'health.run', 'learning.fold',
      'digest.run', 'inbox.run', 'push.drain.run',
      'send.worker.run', 'warm.run', 'health.report.run'
    )
    group by event
  )
  select j.jobname,
         j.schedule,
         max(d.start_time) as last_start,
         max(d.end_time) filter (where d.status = 'succeeded') as last_success,
         count(*) filter (where d.status = 'failed') as failed_runs,
         e.run_event,
         m.run_event_at
  from cron.job j
  join events e on e.jobname = j.jobname
  left join markers m on m.event = e.run_event
  left join cron.job_run_details d on d.jobid = j.jobid
  group by j.jobname, j.schedule, e.run_event, m.run_event_at
  order by j.jobname;
$$;

revoke all on function public.health_cron_evidence() from public, anon, authenticated;
grant execute on function public.health_cron_evidence() to service_role;