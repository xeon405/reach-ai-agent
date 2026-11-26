-- ============================================================
-- PAYPAL PAYMENTS — provider-neutral billing columns.
--
-- The Razorpay flow stays in the repo as a dormant fallback, so its
-- columns and unique indexes are left exactly as they are. PayPal
-- writes the neutral `provider*` columns instead. New rows default
-- to 'razorpay' only to keep historical reads truthful; PayPal
-- always writes provider='paypal' explicitly.
-- ============================================================

alter table public.payments
  add column if not exists provider text not null default 'razorpay',
  add column if not exists provider_order_id text,
  add column if not exists provider_payment_id text;

comment on column public.payments.provider is 'Payment processor: razorpay (dormant) or paypal (active).';
comment on column public.payments.provider_order_id is 'Processor order id — PayPal order id, or Razorpay order id once backfilled.';
comment on column public.payments.provider_payment_id is 'Processor capture/payment id — the idempotency anchor for settlement.';

-- Backfill: every pre-existing row was created by the Razorpay flow, so its
-- order id is the same value under the provider-neutral name.
update public.payments
   set provider = 'razorpay'
 where provider is null;

update public.payments
   set provider_order_id = razorpay_order_id
 where provider_order_id is null
   and razorpay_order_id is not null;

update public.payments
   set provider_payment_id = razorpay_payment_id
 where provider_payment_id is null
   and razorpay_payment_id is not null;

-- One order per processor (a PayPal order id can never collide with a
-- Razorpay one, but scoping by provider keeps the guarantee explicit).
create unique index if not exists payments_provider_order_idx
  on public.payments (provider, provider_order_id)
  where provider_order_id is not null;

-- Idempotency: a webhook redelivery must not re-apply a plan change or
-- double-count revenue.
create unique index if not exists payments_provider_payment_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;
