-- Phase 2: Email verification columns on leads table
-- Adds verification state so it persists after discovery

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email_status TEXT,
  ADD COLUMN IF NOT EXISTS email_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS email_is_role BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_is_disposable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_reason TEXT;

-- Index for filtering by verification status
CREATE INDEX IF NOT EXISTS idx_leads_email_status ON leads (email_status);
