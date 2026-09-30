-- ============================================================================
-- Learned vocabulary: the fast lane.
--
-- The agent already understands meaning on the slow lane (one model call per
-- new phrasing). This table is what makes a REPEAT phrasing free and instant.
--
-- scope is the whole trick:
--   scope = <conversation_id>  provisional - heard once, in one chat
--   scope = '*'                account-wide - proven across two different chats
--
-- A phrase cannot become account-wide by being repeated many times by ONE
-- person in ONE chat; that proves nothing about how a team talks. It has to
-- show up in a second, distinct conversation. That is the promotion rule.
--
-- state = 'retired' means the mapping was wrong and we fell back to meaning.
-- A retired phrase is never served again, but is kept for inspection so the
-- user can see what the agent got wrong.
-- ============================================================================

create table if not exists public.agent_learned_phrases (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  scope           text not null default '*',
  phrase          text not null,
  intent          text not null,
  params          jsonb not null default '{}'::jsonb,
  state           text not null default 'provisional',
  uses            integer not null default 0,
  correct         integer not null default 0,
  last_used_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint agent_learned_state_check
    check (state in ('provisional', 'account', 'retired')),
  constraint agent_learned_uses_nonneg    check (uses >= 0),
  constraint agent_learned_correct_nonneg check (correct >= 0),
  -- The intent is stored as text for forward compatibility, but only real goals
  -- may ever be written here. The executor revalidates anyway; this stops junk
  -- at the door and keeps the table honest when someone reads it directly.
  constraint agent_learned_intent_check
    check (intent in (
      'list_campaigns', 'campaign_stats', 'find_contacts', 'sender_health',
      'compliance_check', 'create_campaign_draft', 'add_contacts_to_campaign',
      'pause_campaign'
    )),
  -- params must be a JSON object, never an array or scalar.
  constraint agent_learned_params_object check (jsonb_typeof(params) = 'object')
);

-- One row per phrase per scope. '*' is account-wide, a uuid is one chat.
create unique index if not exists agent_learned_unique
  on public.agent_learned_phrases (user_id, scope, phrase);

create index if not exists agent_learned_lookup
  on public.agent_learned_phrases (user_id, phrase) where state <> 'retired';

create index if not exists agent_learned_list
  on public.agent_learned_phrases (user_id, state, last_used_at desc);

alter table public.agent_learned_phrases enable row level security;

drop policy if exists "own learned phrases" on public.agent_learned_phrases;
create policy "own learned phrases" on public.agent_learned_phrases
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.agent_learned_phrases.scope is
  '''*'' = account-wide (proven across 2+ conversations); otherwise the conversation id that taught it.';
comment on column public.agent_learned_phrases.state is
  'provisional = one chat only; account = shared; retired = learned wrong, never served again.';

-- Carry over the previous phrase cache so nothing already learned is lost.
--
-- These rows are migrated as 'account' rather than 'provisional' on purpose.
-- agent_intent_cache only ever stored a mapping AFTER the model had resolved
-- that exact phrase successfully, so each one is already evidence the phrasing
-- means that goal - the work the two-conversation rule asks for has been done.
-- The counters carry over too, so the existing live proof of correctness does
-- not start from zero.
insert into public.agent_learned_phrases (user_id, scope, phrase, intent, params, state, uses, correct)
select user_id, '*', phrase, intent, params, 'account', greatest(hits, 0), greatest(hits, 0)
from public.agent_intent_cache
on conflict (user_id, scope, phrase) do nothing;

-- Superseded by agent_learned_phrases, which adds scope, state and counters.
--
-- The old table is dropped so there is exactly one phrase store to reason
-- about. This is why the migration and the new function must ship together:
-- the new code reads agent_learned_phrases and nothing else, and the old code
-- reads agent_intent_cache and nothing else. Roll back with the companion
-- .rollback.sql, which recreates the old table from the learned one.
drop table if exists public.agent_intent_cache;
