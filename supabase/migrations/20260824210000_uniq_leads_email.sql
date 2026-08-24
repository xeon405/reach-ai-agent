-- Server-side duplicate-lead protection (case-insensitive per user)
create unique index if not exists uniq_leads_user_email
  on public.leads (user_id, lower(email));
