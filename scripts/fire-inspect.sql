select
  (select count(*) from public.gmail_tokens) as tokens,
  (select count(*) from public.gmail_tokens where profile_id='a3f0c001-0000-4000-8000-000000000001') as probe_token,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users where id='a3f0c001-0000-4000-8000-000000000001') as probe_user,
  (select count(*) from public.sender_health where profile_id='a3f0c001-0000-4000-8000-000000000001') as probe_health;