-- Phase 3: Add missing lead detail columns
-- city, phone, address, website, rating — returned by find-leads but not persisted

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1);

CREATE INDEX IF NOT EXISTS idx_leads_city ON leads (city);
CREATE INDEX IF NOT EXISTS idx_leads_website ON leads (website);
