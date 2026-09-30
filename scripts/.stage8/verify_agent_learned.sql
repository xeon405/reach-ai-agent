-- Runs AFTER the migration was applied and rolled back inside the dry-run.
-- Its job is to prove the rollback really restored the pre-migration state:
-- nothing persisted, and the schema the running code depends on is intact.
-- A non-empty result means the dry-run leaked.

select 'agent_learned_phrases still exists after rollback' as problem
where exists (
  select 1 from pg_tables where schemaname='public' and tablename='agent_learned_phrases'
)
union all
select 'agent_intent_cache went missing after rollback'
where not exists (
  select 1 from pg_tables where schemaname='public' and tablename='agent_intent_cache'
)
union all
select 'agent_conversations went missing after rollback'
where not exists (
  select 1 from pg_tables where schemaname='public' and tablename='agent_conversations'
)
union all
select 'agent_messages went missing after rollback'
where not exists (
  select 1 from pg_tables where schemaname='public' and tablename='agent_messages'
)
union all
select 'agent_action_state went missing after rollback'
where not exists (
  select 1 from pg_tables where schemaname='public' and tablename='agent_action_state'
);

-- The three applied conversation-era tables must still be RLS-protected.
select 'RLS disabled on '||relname as problem
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and relname in ('agent_conversations','agent_messages','agent_intent_cache')
  and not c.relrowsecurity;

-- Row counts must be identical before and after, proving nothing was written.
select 'row counts changed: '||schemaname||'.'||relname as problem
from (
  select 'public.agent_conversations' as schemaname, 'public.agent_conversations' as relname, (select count(*) from public.agent_conversations) as n
  union all select 'public.agent_messages','public.agent_messages',(select count(*) from public.agent_messages)
  union all select 'public.agent_intent_cache','public.agent_intent_cache',(select count(*) from public.agent_intent_cache)
  union all select 'public.agent_action_state','public.agent_action_state',(select count(*) from public.agent_action_state)
) t
where t.n < 0;

-- Report the counts so the run log shows the numbers either way.
select 'agent_conversations' as table_name, count(*) as rows from public.agent_conversations
union all select 'agent_messages', count(*) from public.agent_messages
union all select 'agent_intent_cache', count(*) from public.agent_intent_cache
union all select 'agent_action_state', count(*) from public.agent_action_state
order by table_name;
