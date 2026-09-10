-- Stage 7 (diff 1) rollback: metered AI spend.
drop table if exists public.ai_cost_state;
drop table if exists public.ai_spend_ledger;