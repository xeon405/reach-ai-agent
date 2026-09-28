-- ============================================================
-- RAZORPAY PAYMENTS — order + payment ledger for the checkout flow.
-- LemonSqueezy only wrote profiles.plan and kept no transaction
-- record, so there was no way to show an invoice or reconcile a
-- failed renewal. Razorpay needs a durable row per attempt: the
-- order is created server-side (so the amount is never client
-- controlled) and the webhook settles it.
-- ============================================================

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  -- Razorpay identifiers (all nullable until the row settles).
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  plan              text not null,
  amount_cents      bigint not null,
  currency          text not null default 'USD',
  -- created | paid | failed | refunded
  status            text not null default 'created'
                      check (status in ('created','paid','failed','refunded')),
  -- 'checkout' today. Kept so a later subscription table can attach
  -- without rewriting the payment rows.
  source            text not null default 'checkout',
  method            text,
  failure_reason    text,
  -- Client-supplied dedupe token for order creation, so a double
  -- click cannot mint two live Razorpay orders (and two charges).
  idempotency_key   text,
  notes             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status) where status = 'created';

-- One live order per (user, idempotency key) so a retried create is a
-- no-op rather than a second chargeable order.
create unique index if not exists payments_idempotency_idx
  on public.payments (user_id, idempotency_key)
  where idempotency_key is not null and status = 'created';

-- Idempotency: a webhook redelivery must not re-apply a plan change
-- or double-count revenue. Razorpay retries until it gets a 2xx.
create unique index if not exists payments_razorpay_payment_idx
  on public.payments (razorpay_payment_id)
  where razorpay_payment_id is not null;

-- Billing audit: mirror of the plan changes the webhook applies.
create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade,
  payment_id    uuid references public.payments(id) on delete set null,
  event         text not null,
  plan          text,
  amount_cents  bigint,
  currency      text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists billing_events_user_idx on public.billing_events (user_id, created_at desc);

-- updated_at maintenance
create or replace function public.touch_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_payments_updated_at();

-- RLS: a customer reads only their own payments; writes are service
-- role only (the edge functions hold the service key).
alter table public.payments enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select using (auth.uid() = user_id);

drop policy if exists billing_events_select_own on public.billing_events;
create policy billing_events_select_own on public.billing_events
  for select using (auth.uid() = user_id);
