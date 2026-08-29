-- Push notifications: device subscriptions + a drain queue filled by a
-- trigger on owner_alerts (high/medium only). The push-drainer edge function
-- (scheduled via pg_cron) sends every queued alert to the user's devices.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create table if not exists public.push_queue (
  id bigserial primary key,
  user_id uuid not null,
  title text not null,
  body text,
  kind text,
  lead_id uuid,
  priority text,
  created_at timestamptz not null default now(),
  unique (user_id, title, body)
);

alter table public.push_queue enable row level security;

-- The trigger runs as the writing role (service role) which bypasses RLS,
-- so no public policies are needed here.

create or replace function public.enqueue_push_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.priority in ('high', 'medium') and NEW.user_id is not null then
    insert into public.push_queue (user_id, title, body, kind, lead_id, priority)
    values (NEW.user_id, NEW.title, NEW.body, NEW.kind, NEW.lead_id, NEW.priority)
    on conflict (user_id, title, body) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_alerts_to_push on public.owner_alerts;
create trigger trg_alerts_to_push
  after insert on public.owner_alerts
  for each row execute function public.enqueue_push_alert();

-- Let the browser notification bell react live to new alerts.
alter publication supabase_realtime add table public.owner_alerts;
alter table public.owner_alerts replica identity full;