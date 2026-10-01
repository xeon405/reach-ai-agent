-- Pending slot state: remember what we were trying to do when we asked.
--
-- When the agent asks "Which campaign should I add them to?", it must carry
-- the partial params (e.g. city/company/query) and the intent into the next
-- user message. Without that, follow-ups ("Q3 push") orphan the earlier
-- request and the agent restarts from scratch - which makes it feel dumb.
--
-- This is a small, tenant-scoped cache keyed by conversation. It expires
-- after a few minutes so an abandoned question does not linger. RLS is ON
-- with NO customer policies: only service role can touch it.

create table if not exists public.agent_pending_state (
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid not null,
  intent           text not null,
  params           jsonb not null default '{}'::jsonb,
  asked_at         timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

comment on table public.agent_pending_state is
  'Carries pending clarification (intent + partial params) across turns so '
  'answers like "Q3 push" complete the previous request instead of starting a new one.';

create index if not exists agent_pending_state_user_idx on public.agent_pending_state (user_id);
create index if not exists agent_pending_state_asked_idx on public.agent_pending_state (asked_at);

alter table public.agent_pending_state enable row level security;

-- Deliberately NOT "force row level security". FORCE also applies RLS to the
-- table owner, and that silently blocked the edge function's service-role
-- writes too - every clarification was lost with no error surfaced. The other
-- agent tables (agent_learned_phrases, agent_action_state) use plain ENABLE
-- plus zero client policies, which is the correct shape here: anon and
-- authenticated get nothing, service role still writes.
