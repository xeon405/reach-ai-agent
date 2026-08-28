-- Phase 3: Per-campaign delivery preference.
-- 'smart' (default) = send only during each lead's local business morning (8-11am);
-- 'instant' = bypass the morning gate and send as soon as the campaign is launched.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT 'smart';