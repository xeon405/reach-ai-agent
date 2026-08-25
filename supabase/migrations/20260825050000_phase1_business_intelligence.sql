-- Phase 1: Onboarding / Business Intelligence
-- Adds structured business config columns to profiles.
-- Existing offer, website_url, booking_link, signature are kept as-is.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS problem_solved text,
  ADD COLUMN IF NOT EXISTS target_customer text,
  ADD COLUMN IF NOT EXISTS cities text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS communication_style text,
  ADD COLUMN IF NOT EXISTS dont_claim text,
  ADD COLUMN IF NOT EXISTS has_product_image boolean DEFAULT false;
