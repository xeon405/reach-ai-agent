-- Stage 6: advisory queue priority — ORDER-axis only.
--
-- Contract (INTELLIGENCE-LAYER-DESIGN.md §2.2/§3): a fresh lead_score may move a
-- job EARLIER within the claimable band; stale/missing => priority 0.5
-- (deterministic default => order is byte-identical to today). The claim LIMIT
-- and the daily send volume stay owned by sender_health / reserve_send_slot —
-- priority can never bypass them (it reorders within [0, band], never raises
-- volume).
--
-- STARVATION BOUND (added after review): pure `priority desc, created_at` lets a
-- continuous stream of hot newcomers starve a normal-priority job indefinitely.
-- Aging offsets that: once a job is older than PRIORITY_AGING_WINDOW it enters
-- the 1.0 band (earliest first). Worst-case wait for ANY job is therefore
-- AGING_WINDOW + one claim pass — bounded, never infinite. With scores off
-- (all 0.5) this is equivalent to FIFO, truncated at the window like today.
--
-- ROLLBACK:
--   alter table public.send_queue drop column priority;
--   drop index if exists idx_queue_status_priority_created;

alter table public.send_queue
  add column if not exists priority numeric not null default 0.5
  check (priority >= 0 and priority <= 1);

create index if not exists idx_queue_status_priority_created
  on public.send_queue (status, priority desc, created_at);

-- Claim order: priority first, FIFO within a band; aged jobs vault to the 1.0
-- band so no lead can be starved indefinitely (identical body to the pre-Stage-6
-- function otherwise — retry/lease semantics unchanged).
create or replace function public.claim_queue_jobs_v2(p_limit int default 10, p_lease_minutes int default 10)
returns setof public.send_queue language plpgsql as $fn$
begin
  return query
  with claimable as (
    select id from public.send_queue
    where (status = 'pending' and (next_retry_at is null or next_retry_at <= now()))
       or (status in ('claimed','processing') and coalesce(lease_until, now() - interval '1 hour') < now())
       or (status = 'failed' and next_retry_at is not null and next_retry_at <= now())
    order by (case when created_at < now() - interval '2 days' then 1.0 else priority end) desc, created_at
    for update skip locked
    limit p_limit
  )
  update public.send_queue q
  set status = 'claimed',
      attempts = q.attempts + 1,
      lease_until = now() + (p_lease_minutes || ' minutes')::interval,
      updated_at = now()
  from claimable c
  where q.id = c.id
  returning q.*;
end $fn$;