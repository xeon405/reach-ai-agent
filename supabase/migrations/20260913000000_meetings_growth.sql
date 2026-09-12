-- ============================================================
-- MEETINGS GROWTH — webhook-confirmed real bookings (Calendly, phase 1)
-- The meetings table was schema-only and never written. This adds the
-- fields needed to store a provider-confirmed booking, plus the
-- idempotency key so webhook retries can't double-insert.
-- ============================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'calendly',
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','cancelled','completed','no_show')),
  ADD COLUMN IF NOT EXISTS invitee_email text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Idempotency: one provider event maps to at most one meetings row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_provider_event
  ON public.meetings (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;