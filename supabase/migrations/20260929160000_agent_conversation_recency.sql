-- Conversation titles + updated_at so the UI can show a real chat list
-- ordered by recency of the LAST message, not the date the chat was opened.
--
-- Why updated_at and not created_at: a chat started last month and used
-- yesterday is the most recent chat. Ordering by created_at would bury it.

alter table public.agent_conversations
  add column if not exists updated_at timestamptz not null default now();

create index if not exists agent_conversations_recent
  on public.agent_conversations (user_id, updated_at desc);

comment on column public.agent_conversations.updated_at is
  'Last activity. Bumped on every message so the chat list can sort by recency.';

-- Bump the conversation whenever a message lands in it. Doing it in the
-- database means every write path benefits, including ones added later.
create or replace function public.touch_agent_conversation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  touched timestamptz := now();
begin
  update public.agent_conversations
     set updated_at = touched
   where id = new.conversation_id;
  return new;
end;
$fn$;

drop trigger if exists agent_messages_touch_conversation on public.agent_messages;
create trigger agent_messages_touch_conversation
  after insert on public.agent_messages
  for each row execute function public.touch_agent_conversation();

-- Backfill so existing chats are not all stamped with the migration time.
update public.agent_conversations c
   set updated_at = coalesce(
     (select max(m.created_at) from public.agent_messages m
       where m.conversation_id = c.id),
     c.created_at);
