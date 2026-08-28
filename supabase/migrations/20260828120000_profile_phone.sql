-- Phase 3: Add owner phone number shown to clients when the AI hands off
-- (escalation replies offer a direct call to the owner).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;