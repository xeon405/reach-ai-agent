-- #############################################################################
-- Stage 8 ROLLBACK — run 20260909000005_stage8_memory.sql in reverse.
-- Order matters: drop the RPCs first (their bodies reference the columns/tables),
-- then the columns, then thread_memory. No consumer schema reads these yet beyond
-- the RPCs themselves, so rollback is safe on pre-Stage-8 function bundles ONLY —
-- once the inbox-agent memory builder and saved-businesses attribution code are
-- deployed, rolling back WITHOUT rolling back those bundles silently degrades to
-- today's deterministic behavior (memory never read; attribution never written).
-- #############################################################################

-- 1) RPCs (forget_lead / delete_lead)
DROP FUNCTION IF EXISTS public.delete_lead(uuid, uuid);
DROP FUNCTION IF EXISTS public.forget_lead(uuid, uuid, boolean);

-- 2) saved_businesses contributor attribution
ALTER TABLE public.saved_businesses
  DROP COLUMN IF EXISTS forgotten_by,
  DROP COLUMN IF EXISTS discovered_by;

-- 3) email_threads tombstone + watermark
ALTER TABLE public.email_threads
  DROP COLUMN IF EXISTS last_summarized_at,
  DROP COLUMN IF EXISTS forget_at;

-- 4) thread_memory facts store
DROP TABLE IF EXISTS public.thread_memory;