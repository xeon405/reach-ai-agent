-- ROLLBACK for migration 20260929150000_agent_learned_phrases.sql
--
-- Deployed-code note: agent v7+ reads agent_learned_phrases for its fast lane.
-- Rolling this back drops the table that lookup uses, so the agent loses
-- instant repeat answers and falls back to a model call for every message. It
-- stays CORRECT, just slower and more expensive. The slow (meaning) lane is
-- untouched, so no functionality disappears.
--
-- Order matters: recreate the old table, copy the account-wide rows back, then
-- drop the new one. Copying only scope='*' is right - the old table had no
-- concept of a per-conversation scope, so provisional rows have nowhere to go
-- and are simply lost.
--
-- DESTRUCTIVE: provisional (single-chat) phrases are lost, since the old schema
-- cannot represent them. Account-wide phrases are preserved by the copy.

create table if not exists public.agent_intent_cache (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  phrase      text not null,
  intent      text not null,
  params      jsonb not null default '{}'::jsonb,
  hits        int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, phrase)
);

insert into public.agent_intent_cache (user_id, phrase, intent, params, hits)
select user_id, phrase, intent, params, uses
from public.agent_learned_phrases
where scope = '*'
on conflict (user_id, phrase) do nothing;

drop table if exists public.agent_learned_phrases;

-- RLS is not optional here. agent_intent_cache reads user vocabulary, so a
-- table left without a policy would be readable by any authenticated client
-- through PostgREST - cross-account phrase leakage. The original table had this
-- from day one; recreating the table must not quietly undo it.
alter table public.agent_intent_cache enable row level security;

drop policy if exists "own intent cache" on public.agent_intent_cache;
create policy "own intent cache" on public.agent_intent_cache
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.agent_intent_cache is
  'Legacy per-user phrase cache. Superseded by agent_learned_phrases; recreated by the 20260929150000 rollback.';
