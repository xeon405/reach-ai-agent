-- UNIQUE CONSTRAINT for first-touch emails: prevents duplicate sends in lease-expiry race.
-- The existing uniq_emails_step only covers sequence >= 2 (follow-ups).
-- This closes the gap where two workers could both pass the idempotency check
-- and send the same first-touch email.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_emails_first
  ON public.emails_sent (campaign_id, lead_id)
  WHERE sequence = 1;
