-- Phase 1: Lead Discovery Engine — add category, place_id, source columns
-- These fields store the business metadata from Google Maps / OSM discovery.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT;

COMMENT ON COLUMN public.leads.category IS 'Business category/type from discovery source (e.g. Dentist, Restaurant)';
COMMENT ON COLUMN public.leads.place_id IS 'External place identifier (Google Maps place ID or osm-{type}-{id})';
COMMENT ON COLUMN public.leads.lead_source IS 'Discovery source: google-maps, openstreetmap, csv, manual';
