-- ============================================================
-- ROLLBACK for 20261125000001_paypal_payments.sql
--
-- Drops only the provider-neutral columns added for PayPal. The
-- Razorpay columns and indexes are untouched, so rolling this back
-- while PayPal is dormant restores the pre-PayPal schema exactly.
--
-- Destructive once PayPal has taken money: existing PayPal rows lose
-- their processor identifiers. Only run this before go-live, or after
-- exporting `select id, provider_order_id, provider_payment_id from payments`.
-- ============================================================

drop index if exists public.payments_provider_payment_idx;
drop index if exists public.payments_provider_order_idx;

alter table public.payments
  drop column if exists provider_payment_id,
  drop column if exists provider_order_id,
  drop column if exists provider;
