-- Stage: guest AI-cost gate for the public support-chat widget.
--
-- Contract: mirrors 20260909000002_ai_cost_gate.sql exactly, but for the support-
-- chat VISITOR bucket. ai_cost_state.profile_id has an FK to public.profiles(id)
-- (on delete cascade) — anonymous visitors have no profile row, so a synthetic
-- sentinel UUID is impossible and a phantom "guest" profile would leak into app
-- listings/autopilot. Instead a single-row GLOBAL store keeps aggregate visitor
-- spend, guarded by the SAME atomic reservation-debit pattern (row-lock, window-
-- rollover-aware increment, ceiling check, no change on refusal) and settled back
-- to ACTUAL by the meter (ai_cost_guest_settle) after each call. Consumption is
-- enforced by openGuestAiCall in _shared/ai-cost-gate.ts (the per-user contract
-- mirrored). The cost-sweep keeps this bucket's heartbeat fresh so staleness
-- conservation (spent-unknown => conserve) behaves identically to user rows.
--
-- ROLLBACK:
--   drop function if exists public.ai_cost_guest_settle(numeric);
--   drop function if exists public.ai_cost_guest_debit(numeric, numeric, numeric);
--   drop table if exists public.ai_cost_guest_state;

create table if not exists public.ai_cost_guest_state (
  id boolean primary key default true check (id),
  window_date text not null,
  window_month text not null,
  used_daily_usd numeric(14,6) not null default 0,
  used_monthly_usd numeric(14,6) not null default 0,
  last_reported_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_cost_guest_state enable row level security;
revoke all on public.ai_cost_guest_state from anon, authenticated;
grant select, insert, update on public.ai_cost_guest_state to service_role;

create or replace function public.ai_cost_guest_debit(
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
  if p_debit is null or p_debit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'noop');
  end if;
  insert into public.ai_cost_guest_state (id, window_date, window_month, used_daily_usd, used_monthly_usd, updated_at)
  values (true, v_day, v_month, 0, 0, v_now)
  on conflict (id) do nothing;
  select used_daily_usd, used_monthly_usd, window_date, window_month
    into v_used_daily, v_used_monthly, v_cam_daily, v_cam_month
  from public.ai_cost_guest_state where id = true for update;
  v_new_daily := case when v_cam_daily = v_day then v_used_daily + p_debit else p_debit end;
  v_new_monthly := case when v_cam_month = v_month then v_used_monthly + p_debit else p_debit end;
  if v_new_daily > p_pool_daily or v_new_monthly > p_pool_monthly then
    return jsonb_build_object('ok', false, 'reason', 'ceiling',
      'used_daily_usd', v_used_daily, 'used_monthly_usd', v_used_monthly);
  end if;
  update public.ai_cost_guest_state
     set used_daily_usd = v_new_daily, used_monthly_usd = v_new_monthly,
         window_date = v_day, window_month = v_month, updated_at = v_now
   where id = true;
  return jsonb_build_object('ok', true, 'used_daily_usd', v_new_daily, 'used_monthly_usd', v_new_monthly);
end $fn$;

create or replace function public.ai_cost_guest_settle(
  p_delta numeric(14,6)
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_now timestamptz := now();
  v_day text := to_char(now(), 'YYYY-MM-DD');
  v_month text := to_char(now(), 'YYYY-MM');
begin
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', true, 'settled', 0);
  end if;
  insert into public.ai_cost_guest_state (id, window_date, window_month, used_daily_usd, used_monthly_usd, updated_at)
  values (true, v_day, v_month, 0, 0, v_now)
  on conflict (id) do nothing;
  update public.ai_cost_guest_state
     set used_daily_usd = greatest(0, (case when window_date = v_day then used_daily_usd + p_delta else p_delta end)),
         used_monthly_usd = greatest(0, (case when window_month = v_month then used_monthly_usd + p_delta else p_delta end)),
         window_date = v_day, window_month = v_month, updated_at = v_now
   where id = true;
  return jsonb_build_object('ok', true, 'settled', p_delta);
end $fn$;

revoke all on function public.ai_cost_guest_debit(numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ai_cost_guest_settle(numeric) from public, anon, authenticated;
grant execute on function public.ai_cost_guest_debit(numeric, numeric, numeric) to service_role;
grant execute on function public.ai_cost_guest_settle(numeric) to service_role;