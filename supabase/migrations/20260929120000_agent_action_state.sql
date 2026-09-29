-- Assistant action budget: per-message and per-conversation step counters.
--
-- ai-cost_state already caps AI SPEND. It cannot cap STEPS -- a loop of cheap
-- actions never trips a dollar budget. These counters bound the run itself.
--
-- Service role only (the edge functions hold the key). RLS is ON with no
-- client policy at all: a customer must never be able to read or inflate their
-- own budget, and an empty policy set means anon/authenticated get nothing.
create table if not exists public.agent_action_state (
  conversation_id       uuid primary key,
  message_id            text,
  used_in_message       integer not null default 0,
  used_in_conversation  integer not null default 0,
  updated_at            timestamptz not null default now(),
  constraint agent_action_state_used_in_message_nonneg  check (used_in_message >= 0),
  constraint agent_action_state_used_in_conversation_nonneg check (used_in_conversation >= 0)
);

comment on table public.agent_action_state is
  'Per-conversation assistant step counters. Service-role only; enforces the '
  'step caps in supabase/functions/_shared/action-budget.ts.';

create index if not exists agent_action_state_updated_at_idx
  on public.agent_action_state (updated_at);

alter table public.agent_action_state enable row level security;
