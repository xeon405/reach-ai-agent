-- Teardown: remove the brake-probe mailbox entirely (cleanup after the cycle).
delete from public.emails_sent where user_id = 'a3f0c001-0000-4000-8000-000000000001';
delete from public.audit_events where user_id = 'a3f0c001-0000-4000-8000-000000000001';
delete from public.sender_health where profile_id = 'a3f0c001-0000-4000-8000-000000000001';
delete from public.gmail_tokens where profile_id = 'a3f0c001-0000-4000-8000-000000000001';
delete from public.profiles where id = 'a3f0c001-0000-4000-8000-000000000001';