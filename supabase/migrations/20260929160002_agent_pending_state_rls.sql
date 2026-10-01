-- Fix: the pending-state table was created with FORCE ROW LEVEL SECURITY.
--
-- FORCE applies RLS to the table owner too, which silently blocked the edge
-- function's service-role writes. Every clarifying question was asked and then
-- forgotten: savePendingState failed on a policy violation that nothing was
-- checking. The live probe caught it - the reply was correct and the row
-- simply did not exist.
--
-- PostgreSQL has no "NO FORCE" syntax, and re-issuing ENABLE does not clear
-- relforcerowsecurity once set. The only ways out are a catalog update or a
-- rebuild. This table is a short-lived cache (clarifications expire after 15
-- minutes), so a rebuild costs nothing in practice and avoids editing
-- pg_class by hand.
--
-- Plain ENABLE is the correct shape, matching agent_learned_phrases and
-- agent_action_state: RLS is on, there are zero client policies (so anon and
-- authenticated can do nothing), and the service role can still write.

drop table if exists public.agent_pending_state;

create table public.agent_pending_state (
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid not null,
  intent           text not null,
  params           jsonb not null default '{}'::jsonb,
  asked_at         timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

comment on table public.agent_pending_state is
  'Carries pending clarification (intent + partial params) across turns so '
  'answers like "Q3 push" complete the previous request instead of starting a '
  'new one. RLS enabled WITHOUT force so the service role can write; there '
  'are deliberately no client policies.';

create index agent_pending_state_asked_idx on public.agent_pending_state (asked_at);

alter table public.agent_pending_state enable row level security;