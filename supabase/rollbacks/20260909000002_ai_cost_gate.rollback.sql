-- Stage 7 (diff 2) rollback: durable AI-cost gate.
select cron.unschedule('cost-sweep') where exists (
  select 1 from cron.job where jobname = 'cost-sweep'
);
drop function if exists public.ai_cost_settle(uuid, numeric);
drop function if exists public.ai_cost_debit(uuid, numeric, numeric, numeric);