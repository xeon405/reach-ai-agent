-- Inbound email captured from the provider's inbound-parse webhook
-- (SendGrid Inbound Parse -> supabase/functions/inbound-email). Replaces the
-- Gmail read path for reply detection. Service-role only: RLS on, no policies.
create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lead_id uuid,
  campaign_id uuid,
  from_email text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  content_hash text unique,
  created_at timestamptz not null default now()
);

create index if not exists inbound_emails_user_idx on public.inbound_emails (user_id, created_at desc);
create index if not exists inbound_emails_lead_idx on public.inbound_emails (lead_id);

alter table public.inbound_emails enable row level security;
