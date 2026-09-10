-- Repair: restore the probe mailbox's token row (was deleted mid-cycle by an
-- unknown actor; audit trail shows no disconnect/revoke event).
insert into public.gmail_tokens (profile_id, refresh_token, connected_at)
values ('a3f0c001-0000-4000-8000-000000000001', 'brake-probe-token', now() - interval '40 days');
select 'token restored' as note;