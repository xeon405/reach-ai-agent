-- Add 'review' to owner_alerts CHECK constraint.
-- Code uses kind='review' for autoresponder detection and reply-loop guard.
-- Previously blocked by the constraint — these alerts were silently lost.
ALTER TABLE public.owner_alerts DROP CONSTRAINT owner_alerts_kind_check;
ALTER TABLE public.owner_alerts ADD CONSTRAINT owner_alerts_kind_check
  CHECK (kind = ANY (ARRAY['booking','opt_out','takeover','handoff','bounce','first_reply','review']));
