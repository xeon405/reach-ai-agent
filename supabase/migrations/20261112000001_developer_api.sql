-- ============================================================
-- DEVELOPER SURFACE (tasks 13-16)
--
-- 13. API keys + webhook endpoints + a durable delivery outbox.
-- 15. The audit trail already records why each email was written,
--     held or blocked; webhooks reuse it instead of a second log.
-- 16. Per-account rules: never-email list, custom daily cap,
--     quiet hours with a timezone, and a tone per campaign.
-- ============================================================

-- ---------- API KEYS ----------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_keys_user on public.api_keys(user_id);

alter table public.api_keys enable row level security;
drop policy if exists "own api keys" on public.api_keys;
create policy "own api keys" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-key request limit, one row per minute per key. Service-role only.
create table if not exists public.api_rate_limit (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key_id, window_start)
);
alter table public.api_rate_limit enable row level security;

create or replace function public.bump_api_rate(p_key uuid, p_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := date_trunc('minute', now());
  c integer;
begin
  insert into public.api_rate_limit(key_id, window_start, count)
  values (p_key, w, 1)
  on conflict (key_id, window_start)
  do update set count = public.api_rate_limit.count + 1
  returning count into c;

  delete from public.api_rate_limit where window_start < now() - interval '2 hours';
  return c <= p_limit;
end $$;

-- ---------- WEBHOOKS ----------
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null,
  events text[] not null default array[
    'email.sent', 'email.replied', 'email.bounced',
    'email.unsubscribed', 'email.held_for_review',
    'email.failed', 'booking.confirmed'
  ],
  active boolean not null default true,
  last_status integer,
  last_attempt_at timestamptz,
  failure_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_endpoints_user on public.webhook_endpoints(user_id);

alter table public.webhook_endpoints enable row level security;
drop policy if exists "own webhook endpoints" on public.webhook_endpoints;
create policy "own webhook endpoints" on public.webhook_endpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.webhook_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_webhook_outbox_due
  on public.webhook_outbox(next_attempt_at) where status = 'pending';
alter table public.webhook_outbox enable row level security;

-- Fan out audit events to subscribed endpoints. A trigger means every writer
-- (worker, replies, billing) gets webhooks without touching each function.
create or replace function public.fanout_webhooks()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.webhook_outbox (user_id, endpoint_id, event, payload)
  select e.user_id, e.id, new.event,
    jsonb_build_object(
      'id', new.id,
      'event', new.event,
      'created_at', new.created_at,
      'user_id', new.user_id,
      'lead_id', new.lead_id,
      'campaign_id', new.campaign_id,
      'data', coalesce(new.payload, '{}'::jsonb)
    )
  from public.webhook_endpoints e
  where e.user_id = new.user_id
    and e.active
    and new.event = any(e.events);
  return new;
end $$;

drop trigger if exists audit_webhook_fanout on public.audit_events;
create trigger audit_webhook_fanout
  after insert on public.audit_events
  for each row execute function public.fanout_webhooks();

-- Claim deliveries atomically; another drainer must not double-send.
create or replace function public.claim_webhook_deliveries(p_limit int default 20)
returns setof public.webhook_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimable as (
    select id from public.webhook_outbox
    where status = 'pending' and next_attempt_at <= now()
    order by id
    for update skip locked
    limit p_limit
  )
  update public.webhook_outbox o
  set attempts = o.attempts + 1,
      next_attempt_at = now() + interval '3 minutes'
  from claimable c
  where o.id = c.id
  returning o.*;
end $$;

-- ---------- USER RULES ----------
create table if not exists public.user_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_cap integer check (daily_cap is null or daily_cap between 1 and 500),
  quiet_start time,
  quiet_end time,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  never_emails text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_rules enable row level security;
drop policy if exists "own rules" on public.user_rules;
create policy "own rules" on public.user_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tone per campaign, used by the writer prompt. Null keeps today's default.
alter table public.campaigns add column if not exists tone text;

grant select, insert, update, delete on public.api_keys to authenticated;
grant select, insert, update, delete on public.webhook_endpoints to authenticated;
grant select, insert, update, delete on public.user_rules to authenticated;
grant select on public.api_keys to service_role;
grant all on public.api_keys, public.api_rate_limit, public.webhook_endpoints,
  public.webhook_outbox, public.user_rules to service_role;
grant usage, select on all sequences in schema public to service_role;
