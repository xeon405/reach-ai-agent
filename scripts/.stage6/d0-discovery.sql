-- Stage 6 live-proof discovery (read-only)
select p.id as user_id, p.gmail_email, p.emails_sent_date, p.emails_sent_today, p.gmail_connected
from public.profiles p order by p.created_at asc;

select id, name, status, delivery, user_id, ab_test from public.campaigns where status = 'active';

select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and (is_nullable = 'NO' and (column_default is null or column_default = 'now()'))
order by ordinal_position;

select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'agent_config'
order by ordinal_position;

select count(*) as pending_jobs from public.send_queue where status in ('pending','claimed','processing');