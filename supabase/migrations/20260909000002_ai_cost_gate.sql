-- Stage 7 (diff 2): the durable AI-cost gate.
-- NOTE: x-cron-secret below is redacted to <CRON_SECRET>; substitute the project's
-- CRON_SECRET (`supabase secrets list`) before applying on a fresh project.
--
-- Contract (INTELLIGENCE-LAYER-DESIGN.md §6.3/§6.6): the HARD ceiling runs on an
-- atomic reservation-debit, not on ledger SUM. Every gated LLM call debits
-- ai_cost_state BEFORE the call (single plpgsql transaction: row-lock, window-
-- rollover-aware increment, ceiling check, no change on refusal) and the meter
-- SETTLES the actual cost right after (actual − reserved, floored at 0). Only
-- these two paths ever write the counters — the sweep audits drift instead of
-- rewriting them (a sweep-set would race in-flight debits).
--
-- Abandoned reservations (LLM failed after a debit) are NOT refunded: they decay
-- by window rollover and only bias toward earlier degrade — safe direction.
-- RLS/grants identical to the meter migration: service_role only, and the RPCs
-- are SECURITY DEFINER (owner postgres) so client-side sessions can never read
-- or write cost state directly.
--
-- ROLLBACK:
--   select cron.unschedule('cost-sweep') where exists (select 1 from cron.job where jobname='cost-sweep');
--   drop function if exists public.ai_cost_settle(uuid, numeric);
--   drop function if exists public.ai_cost_debit(uuid, numeric, numeric, numeric);

create or replace function public.ai_cost_debit(
  p_profile_id uuid,
  p_debit numeric(14,6),
  p_pool_daily numeric(14,6),
  p_pool_monthly numeric(14,6)
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_now timestamptz := now();
  v_day text := to_char(now(), 'YYYY-MM-DD');
  v_month text := to_char(now(), 'YYYY-MM');
  v_cam_daily text; v_cam_month text;
  v_used_daily numeric := 0; v_used_monthly numeric := 0;
  v_new_daily numeric; v_new_monthly numeric;
begin
  if p_profile_id is null or p_debit is null or p_debit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'noop');
  end if;
  insert into public.ai_cost_state (profile_id, window_date, window_month, used_daily_usd, used_monthly_usd, updated_at)
  values (p_profile_id, v_day, v_month, 0, 0, v_now)
  on conflict (profile_id) do nothing;
  select used_daily_usd, used_monthly_usd, window_date, window_month
    into v_used_daily, v_used_monthly, v_cam_daily, v_cam_month
  from public.ai_cost_state where profile_id = p_profile_id for update;
  v_new_daily := case when v_cam_daily = v_day then v_used_daily + p_debit else p_debit end;
  v_new_monthly := case when v_cam_month = v_month then v_used_monthly + p_debit else p_debit end;
  if v_new_daily > p_pool_daily or v_new_monthly > p_pool_monthly then
    return jsonb_build_object('ok', false, 'reason', 'ceiling', 'used_daily_usd', v_used_daily, 'used_monthly_usd', v_used_monthly);
  end if;
  update public.ai_cost_state
     set used_daily_usd = v_new_daily, used_monthly_usd = v_new_monthly,
         window_date = v_day, window_month = v_month, updated_at = v_now
   where profile_id = p_profile_id;
  return jsonb_build_object('ok', true, 'used_daily_usd', v_new_daily, 'used_monthly_usd', v_new_monthly);
end $fn$;

create or replace function public.ai_cost_settle(
  p_profile_id uuid,
  p_delta numeric(14,6)
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_now timestamptz := now();
  v_day text := to_char(now(), 'YYYY-MM-DD');
  v_month text := to_char(now(), 'YYYY-MM');
begin
  if p_profile_id is null or p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', true, 'settled', 0);
  end if;
  insert into public.ai_cost_state (profile_id, window_date, window_month, used_daily_usd, used_monthly_usd, updated_at)
  values (p_profile_id, v_day, v_month, 0, 0, v_now)
  on conflict (profile_id) do nothing;
  update public.ai_cost_state
     set used_daily_usd = greatest(0, (case when window_date = v_day then used_daily_usd + p_delta else p_delta end)),
         used_monthly_usd = greatest(0, (case when window_month = v_month then used_monthly_usd + p_delta else p_delta end)),
         window_date = v_day, window_month = v_month, updated_at = v_now
   where profile_id = p_profile_id;
  return jsonb_build_object('ok', true, 'settled', p_delta);
end $fn$;

revoke all on function public.ai_cost_debit(uuid, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ai_cost_settle(uuid, numeric) from public, anon, authenticated;
grant execute on function public.ai_cost_debit(uuid, numeric, numeric, numeric) to service_role;
grant execute on function public.ai_cost_settle(uuid, numeric) to service_role;

-- Cost-sweep: every 5 minutes. Reconciles drift (counter vs ledger), writes the
-- dual markers into agent_config, refreshes last_reported_at, and audits the
-- sends-vs-ledger gap. See supabase/functions/cost-sweep/index.ts.
select cron.unschedule('cost-sweep') where exists (
  select 1 from cron.job where jobname = 'cost-sweep'
);

select cron.schedule(
  'cost-sweep',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/cost-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  ) AS request_id;
  $$
);