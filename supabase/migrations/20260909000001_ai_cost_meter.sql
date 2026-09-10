-- Stage 7 (diff 1): metered AI spend.
--
-- Contract (INTELLIGENCE-LAYER-DESIGN.md §6.1/§6.3): every LLM call in the system
-- crosses _shared/groq.ts groqChat(), which captures response usage and writes ONE
-- row to ai_spend_ledger per call — fire-and-forget, never blocks the send path, and
-- caller context { fn, kind, user_id, campaign_id, lead_id, decision_id } rides along.
-- est_cost_usd is computed from ENV token rates (AI_COST_PER_1M_IN/OUT, defaults
-- $0.20/$0.80), 6dp. ai_cost_state mirrors sender_health: one row per profile, windowed
-- daily + monthly counters, batch-maintained by a sweep that RE-SUMS the ledger — the
-- LEDGER is authoritative, ai_cost_state is the cache (no read-modify-write races).
--
-- Deliverability of metering: no consumer reads these tables yet. This diff is live
-- but dead until the gate + breaker diff wires them in (getKillSwitch-style picker
-- + agent_config mode writer). RLS/grants identical to sender_health (service_role
-- only); anon/authenticated never touch cost data.
--
-- ROLLBACK:
--   drop table if exists public.ai_cost_state;
--   drop table if exists public.ai_spend_ledger;

create table if not exists public.ai_spend_ledger (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  fn text not null default 'unknown',
  kind text not null default 'generic',
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  est_cost_usd numeric(14,6) not null default 0 check (est_cost_usd >= 0),
  user_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  decision_id text,
  model_version text
);

create index if not exists ai_spend_ledger_user_ts_idx
  on public.ai_spend_ledger (user_id, ts desc);
create index if not exists ai_spend_ledger_campaign_ts_idx
  on public.ai_spend_ledger (campaign_id, ts desc);
create index if not exists ai_spend_ledger_ts_idx
  on public.ai_spend_ledger (ts desc);

alter table public.ai_spend_ledger enable row level security;
revoke all on public.ai_spend_ledger from anon, authenticated;
grant select, insert, update on public.ai_spend_ledger to service_role;

create table if not exists public.ai_cost_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  window_date text not null,
  window_month text not null,
  used_daily_usd numeric(14,6) not null default 0,
  used_monthly_usd numeric(14,6) not null default 0,
  mode text not null default 'ai' check (mode in ('ai','template','hard_stop')),
  trips int not null default 0,
  tripped_at timestamptz,
  tripped_reason text,
  last_reported_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_cost_state enable row level security;
revoke all on public.ai_cost_state from anon, authenticated;
grant select, insert, update on public.ai_cost_state to service_role;