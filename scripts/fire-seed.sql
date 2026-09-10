insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  'a3f0c001-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'brake-probe@example.com', '', now(), now(), now()
);
insert into public.profiles (id, email, name, plan, gmail_connected, gmail_account_type, gmail_email, created_at)
values (
  'a3f0c001-0000-4000-8000-000000000001',
  'brake-probe@example.com', 'Brake Probe', 'growth', true, 'consumer', 'brake-probe@example.com',
  now() - interval '220 days'
)
on conflict (id) do update set
  plan = 'growth', gmail_connected = true, gmail_account_type = 'consumer',
  gmail_email = 'brake-probe@example.com', email = 'brake-probe@example.com';
insert into public.gmail_tokens (profile_id, refresh_token, connected_at)
values ('a3f0c001-0000-4000-8000-000000000001', 'brake-probe-token', now() - interval '40 days');