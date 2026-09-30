-- Verifies agent_learned_phrases is correct and safe AFTER 20260929150000
-- has been applied for real. Every check must return zero rows.

-- 1. New table exists, old one is gone.
select 'missing agent_learned_phrases' as problem
where not exists (select 1 from pg_tables where schemaname='public' and tablename='agent_learned_phrases')
union all
select 'agent_intent_cache still exists' as problem
where exists (select 1 from pg_tables where schemaname='public' and tablename='agent_intent_cache');

-- 2. RLS is on.
select 'RLS disabled on agent_learned_phrases' as problem
where exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='agent_learned_phrases' and not c.relrowsecurity
);

-- 3. The per-user policy exists (no policy = readable by any authed client).
select 'agent_learned_phrases has no own-rows policy' as problem
where not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='agent_learned_phrases'
    and qual like '%auth.uid()%user_id%'
);

-- 4. No SECURITY DEFINER object can read across users.
select 'security definer object references learned phrases' as problem
where exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and pg_get_functiondef(p.oid) like '%agent_learned_phrases%'
);

-- 5. Every stored intent is a real goal (the CHECK should make this impossible).
select 'row with unknown intent: '||intent as problem
from public.agent_learned_phrases
where intent not in (
  'list_campaigns','campaign_stats','find_contacts','sender_health',
  'compliance_check','create_campaign_draft','add_contacts_to_campaign','pause_campaign'
);

-- 6. params is always a JSON object.
select 'row with non-object params' as problem
from public.agent_learned_phrases
where jsonb_typeof(params) <> 'object';

-- 7. No negative counters.
select 'negative counter' as problem
from public.agent_learned_phrases
where uses < 0 or correct < 0;

-- 8. state is legal.
select 'illegal state: '||state as problem
from public.agent_learned_phrases
where state not in ('provisional','account','retired');

-- 9. scope is a real conversation uuid or the '*' account marker.
select 'scope is neither a uuid nor ''*'': '||scope as problem
from public.agent_learned_phrases
where scope <> '*' and scope !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 10. Uniqueness guarantee that makes promotion idempotent.
select 'duplicate (user, scope, phrase)' as problem
from public.agent_learned_phrases
group by user_id, scope, phrase having count(*) > 1;

-- 11. No orphaned user_id.
select 'orphan user_id' as problem
from public.agent_learned_phrases l
where not exists (select 1 from auth.users u where u.id = l.user_id);
