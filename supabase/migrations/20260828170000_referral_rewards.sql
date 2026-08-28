-- Phase 3: Referral reward — referrer earns 7 free days of starter when a friend joins via their link.
-- Effective plan is resolved at runtime (referral_reward_plan while active, otherwise subscription plan).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_reward_plan text,
  ADD COLUMN IF NOT EXISTS referral_reward_until timestamptz;