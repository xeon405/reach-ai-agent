-- Website email enrichment provenance columns
-- Tracks where a lead's email was discovered from

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS email_source_url TEXT;

COMMENT ON COLUMN public.leads.email_source IS 'Email discovery source: website-mailto, website-text, website-metadata, google-maps, openstreetmap, csv, manual';
COMMENT ON COLUMN public.leads.email_source_url IS 'Specific page URL where the email was found during website enrichment';

CREATE INDEX IF NOT EXISTS idx_leads_email_source ON public.leads (email_source) WHERE email_source IS NOT NULL;
