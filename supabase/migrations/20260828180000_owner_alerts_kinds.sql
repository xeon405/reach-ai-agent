-- Phase 3: extend owner_alerts kind whitelist for new features added in 2026-08-28:
-- network intros (network_intro / accepted / rejected) + referral rewards.

ALTER TABLE public.owner_alerts DROP CONSTRAINT IF EXISTS owner_alerts_kind_check;
ALTER TABLE public.owner_alerts ADD CONSTRAINT owner_alerts_kind_check
  CHECK (kind = ANY (ARRAY[
    'booking','opt_out','takeover','handoff','bounce','first_reply','review',
    'network_intro','network_intro_accepted','network_intro_rejected','referral_reward'
  ]));