select
  (select count(*) from public.gmail_tokens) as gmail_tokens,
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from public.profiles where gmail_connected = true) as profiles_gmail_connected,
  (select count(*) from public.emails_sent where sent_at > now() - interval '7 days') as sends_7d,
  (select count(*) from public.audit_events where created_at > now() - interval '7 days') as audit_events_7d;