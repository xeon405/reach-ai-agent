select trigger_name, event_manipulation, action_statement
from information_schema.triggers
where event_object_table in ('gmail_tokens','profiles') and trigger_schema='public';
select event, count(*), min(created_at) as first_seen, max(created_at) as last_seen
from public.audit_events
where event like 'gmail.%' or event like '%disconnect%' or event like '%revoke%'
group by event;