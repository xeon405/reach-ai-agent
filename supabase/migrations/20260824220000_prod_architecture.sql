-- ============================================================
-- PRODUCTION ARCHITECTURE HARDENING
-- Multi-tenant-safe, concurrency-safe, auditable, policy-enforced
-- ============================================================

-- ---------- 1. LEAD NORMALIZATION (DB-level dup protection) ----------
alter table public.leads add column if not exists normalized_email text;
update public.leads set normalized_email = lower(btrim(email)) where normalized_email is null;
create unique index if not exists uniq_leads_user_normalized
  on public.leads (user_id, coalesce(normalized_email, lower(btrim(email))));
drop index if exists uniq_leads_user_email;

-- ---------- 2. CONVERSATION STATE MACHINE ----------
-- Lifecycle: NEW -> CONTACTED -> REPLIED -> INTERESTED -> BOOKING -> CUSTOMER
-- Terminal/control: UNSUBSCRIBED / BOUNCED / SUPPRESSED / LOST / HUMAN_TAKEOVER
alter table public.leads add column if not exists lifecycle text not null default 'NEW';
alter table public.leads add column if not exists conv_mode text not null default 'AI_AUTOPILOT';
-- conv_mode ∈ AI_AUTOPILOT | AI_ASSISTED | HUMAN | PAUSED

-- ---------- 3. SUPPRESSIONS (DB-level opt-out enforcement) ----------
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribed','bounced','manual','complaint')),
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppressions_user on public.suppressions(user_id);
create unique index if not exists uniq_suppressions_user_email on public.suppressions(user_id, lower(email));
alter table public.suppressions enable row level security;
create policy "own suppressions" on public.suppressions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Hard gate: no worker (or bug) can ever queue or record a send to a suppressed lead
create or replace function public.assert_not_suppressed() returns trigger as $fn$
declare bad boolean := false;
begin
  if new.lead_id is not null then
    select exists (
      select 1 from public.leads l
      where l.id = new.lead_id and l.user_id = new.user_id
        and (
          l.unsubscribed = true
          or l.status in ('unsubscribed','bounced','suppressed')
          or exists (select 1 from public.suppressions s where s.user_id = new.user_id and lower(s.email) = lower(l.email))
        )
    ) into bad;
  end if;
  if bad then
    raise exception 'SUPPRESSED_LEAD: lead is permanently suppressed';
  end if;
  return new;
end $fn$ language plpgsql;

drop trigger if exists trg_queue_no_suppressed on public.send_queue;
create trigger trg_queue_no_suppressed before insert on public.send_queue
  for each row execute function public.assert_not_suppressed();

drop trigger if exists trg_sent_no_suppressed on public.emails_sent;
create trigger trg_sent_no_suppressed before insert on public.emails_sent
  for each row execute function public.assert_not_suppressed();

-- ---------- 4. SEND QUEUE HARDENING ----------
alter table public.send_queue add column if not exists attempts int not null default 0;
alter table public.send_queue add column if not exists last_error text;
alter table public.send_queue add column if not exists next_retry_at timestamptz;
alter table public.send_queue add column if not exists lease_until timestamptz;
alter table public.send_queue add column if not exists status_new text;
-- statuses: pending | claimed | processing | sent | failed | dead | cancelled
-- Idempotency: one live job per (campaign, lead, step)
create unique index if not exists uniq_queue_job
  on public.send_queue (campaign_id, lead_id)
  where status in ('pending','claimed','processing');

-- Re-claimable atomic claim WITH lease (concurrent-safe, retry-aware)
create or replace function public.claim_queue_jobs_v2(p_limit int, p_lease_minutes int default 10)
returns setof public.send_queue as $$
begin
  return query
  with claimable as (
    select id from public.send_queue
    where (status = 'pending')
       or (status in ('claimed','processing') and coalesce(lease_until, now() - interval '1 hour') < now())
       or (status = 'failed' and next_retry_at is not null and next_retry_at <= now())
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.send_queue q
  set status = 'claimed',
      attempts = q.attempts + 1,
      lease_until = now() + (p_lease_minutes || ' minutes')::interval,
      updated_at = now()
  from claimable c
  where q.id = c.id
  returning q.*;
end $$ language plpgsql;

-- ---------- 5. EMAILS_SENT ENRICHMENT ----------
alter table public.emails_sent add column if not exists gmail_message_id text;
alter table public.emails_sent add column if not exists gmail_thread_id text;
alter table public.emails_sent add column if not exists opened_at timestamptz;

-- ---------- 6. TRACKING EVENTS ----------
create table if not exists public.tracking_events (
  id bigint generated always as identity primary key,
  email_id uuid references public.emails_sent(id) on delete cascade,
  user_id uuid not null,
  lead_id uuid,
  campaign_id uuid,
  event text not null check (event in ('open','click')),
  occurred_at timestamptz not null default now()
);
create index if not exists idx_tracking_email on public.tracking_events(email_id);
alter table public.tracking_events enable row level security;
create policy "own tracking" on public.tracking_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 7. AI CLASSIFICATIONS (structured, never executed directly) ----------
create table if not exists public.ai_classifications (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  lead_id uuid,
  message_id text,
  intent text,
  confidence numeric,
  interested boolean,
  booking_intent boolean,
  unsubscribe boolean,
  sentiment text,
  requires_human boolean,
  suggested_action text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_aiclass_lead on public.ai_classifications(lead_id, created_at desc);
alter table public.ai_classifications enable row level security;
create policy "own classifications" on public.ai_classifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 8. OWNER ALERTS ----------
create table if not exists public.owner_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  lead_id uuid,
  kind text not null check (kind in ('booking','opt_out','takeover','handoff','bounce','first_reply')),
  title text not null,
  body text,
  priority text not null default 'normal' check (priority in ('normal','high')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_alerts_user on public.owner_alerts(user_id, created_at desc);
alter table public.owner_alerts enable row level security;
create policy "own alerts" on public.owner_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 9. EMAIL THREADS ----------
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lead_id uuid references public.leads(id) on delete cascade,
  gmail_thread_id text,
  last_message_id text,
  turn_count int not null default 0,
  high_priority boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, lead_id)
);
alter table public.email_threads enable row level security;
create policy "own threads" on public.email_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 10. AUDIT EVENTS ----------
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  lead_id uuid,
  campaign_id uuid,
  event text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user_time on public.audit_events(user_id, created_at desc);
create index if not exists idx_audit_event on public.audit_events(event);
alter table public.audit_events enable row level security;
create policy "own audit" on public.audit_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 11. USAGE LIMITS (per-tenant counters) ----------
create table if not exists public.usage_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  emails_sent_today int not null default 0,
  limit_date date not null default current_date,
  ai_calls_today int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.usage_limits enable row level security;
create policy "own usage" on public.usage_limits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.usage_limits (user_id, emails_sent_today, limit_date)
select p.id, coalesce(p.emails_sent_today,0), coalesce(p.emails_sent_date, current_date)
from public.profiles p
on conflict (user_id) do nothing;
