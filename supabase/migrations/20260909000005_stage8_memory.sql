-- #############################################################################
-- Stage 8: conversation memory + erasure-by-design (INTELLIGENCE-LAYER-DESIGN.md §8)
--
-- Adds:
--   * thread_memory        — facts-only conversation memory (never raw message
--                            text; transcript stays in Gmail).
--   * email_threads.forget_at          — tombstone boundary (timestamp, not
--                                        forever); erases local memory <= boundary,
--                                        strictly-later correspondence resumes fresh.
--   * email_threads.last_summarized_at — per-thread summarization watermark.
--                            NOTE (settled 2026-09-09): watermark lives on
--                            email_threads, not thread_memory — the thread row is
--                            the per-(user,lead) unit; thread_memory rows are per
--                            fact and would duplicate the cursor.
--   * saved_businesses.discovered_by/forgotten_by — contributor attribution so the
--                            inferred-email cell is purgeable on forget/delete.
--   * forget_lead / delete_lead RPCs (SECURITY DEFINER, service_role only,
--                            partial-index-safe, return named row counts as jsonb).
--
-- Enforced here (schema) / by callers (code):
--   * fact-kind whitelist + value <= 200 chars as CHECK constraints.
--   * 64-fact-per-thread cap is CODE-enforced by the memory builder (schema cannot
--     count cheaply at insert time).
--   * Double-layered boundary: (1) RPC deletes local copies <= forget_at;
--     (2) memory builder hard-filters Gmail internalDate > forget_at BEFORE any
--     summarization, unconditionally, even on resume.
--   * campaign_learning: RPC DELETES affected campaign rows so the erased lead's
--     fingerprint can never linger (stale campaign_learning => consumers fall back
--     to deterministic defaults; the fold rebuilds from surviving emails_sent/
--     meetings at next nightly fold). A fully synchronous in-RPC re-fold is
--     deferred to the learning-loop refactor (same fold code, moat-safe).
--
-- Erasure scope per §8.2: saved_businesses (business entity row survives; the
-- email cell is purged via attribution); lead_finder_caches / lead_refresh /
-- refresh_usage are explicitly OUT of scope (TTL cache / throttle / quota only).
--
-- ROLLBACK:
--   run 20260909000005_stage8_memory.rollback.sql
--   (drops the RPCs first, then the columns, then thread_memory).
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 1) thread_memory — facts only (design §8.5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.thread_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  fact_kind text NOT NULL,
  value text NOT NULL,
  source_message_id text,
  source_ts timestamptz,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CONSTRAINT thread_memory_fact_kind_whitelist CHECK (
    fact_kind IN (
      'interest_level', 'objection', 'timing_window', 'availability',
      'decision_criteria', 'contact_role', 'next_action', 'commitment'
    )
  ),
  CONSTRAINT thread_memory_value_len CHECK (char_length(value) <= 200)
);

COMMENT ON TABLE public.thread_memory IS
  'Facts-only conversation memory. Never raw message text (transcript stays in Gmail). fact_kind is whitelist-gated at schema AND prompt level; value <= 200 chars; only source_message_id + source_ts reference the raw exchange; per-thread fact cap (64) enforced by the memory-builder code.';
COMMENT ON COLUMN public.thread_memory.superseded_at IS
  'Set on replace-not-append conflict resolution (same fact_kind supersedes older fact).';

CREATE INDEX IF NOT EXISTS thread_memory_thread_idx ON public.thread_memory(thread_id, source_ts);
CREATE INDEX IF NOT EXISTS thread_memory_lead_idx ON public.thread_memory(lead_id);

ALTER TABLE public.thread_memory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.thread_memory FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_memory TO service_role;

-- ---------------------------------------------------------------------------
-- 2) email_threads — tombstone boundary + summarization watermark
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS forget_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_summarized_at timestamptz;

COMMENT ON COLUMN public.email_threads.forget_at IS
  'Tombstone boundary (settled §8.3): local copies <= forget_at erased; strictly-later correspondence resumes as a fresh exchange. NOT a suppression signal (that is §8.4, independent).';
COMMENT ON COLUMN public.email_threads.last_summarized_at IS
  'Per-thread summarization watermark. Not advanced when the summarizer conserves (mode != ai / ceiling-tripped) so no message is skipped forever; resume re-processes the gap with internalDate > forget_at and > last_summarized_at, capped per scan.';

-- ---------------------------------------------------------------------------
-- 3) saved_businesses — contributor attribution (shared discovery map)
-- ---------------------------------------------------------------------------
ALTER TABLE public.saved_businesses
  ADD COLUMN IF NOT EXISTS discovered_by uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forgotten_by uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.saved_businesses.discovered_by IS
  'Auth users who discovered/paid for this business row (set at write time by authenticated callers; null for cron). Used to decide when the inferred-email cell is safe to purge.';
COMMENT ON COLUMN public.saved_businesses.forgotten_by IS
  'Users who have forgotten the lead tied to this business. findSavedLeads excludes rows where requesting user = any(forgotten_by).';

-- ---------------------------------------------------------------------------
-- 4) forget_lead — data-subject memory erasure (data stays, memory goes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.forget_lead(
  p_user_id uuid,
  p_lead_id uuid,
  p_suppress boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_place_id text;
  v_email text;
  v_thread_memory bigint := 0;
  v_ai_class bigint := 0;
  v_alerts bigint := 0;
  v_emails bigint := 0;
  v_meetings bigint := 0;
  v_tracking bigint := 0;
  v_audit bigint := 0;
  v_ledger bigint := 0;
  v_score bigint := 0;
  v_queue_cancel bigint := 0;
  v_threads bigint := 0;
  v_business bigint := 0;
  v_campaign_ids uuid[] := '{}'; BEGIN
  -- Ownership gate: the lead must exist AND belong to the caller.
  SELECT l.place_id, l.email INTO v_place_id, v_email
  FROM public.leads l
  WHERE l.id = p_lead_id AND l.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAD_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  -- 0. Capture the affected campaigns BEFORE erasing emails_sent (the deleted
  --    rows carry the campaign linkage) so no stale per-campaign fingerprint
  --    can outlive the erasure.
  SELECT coalesce(array_agg(DISTINCT e.campaign_id), '{}')
  INTO v_campaign_ids
  FROM public.emails_sent e WHERE e.lead_id = p_lead_id;

  -- 1. Cancel in-flight work BEFORE erasing history (no stranded lease/retry).
  UPDATE public.send_queue
  SET status = 'cancelled', updated_at = now()
  WHERE lead_id = p_lead_id AND status IN ('pending','claimed','processing','failed');
  GET DIAGNOSTICS v_queue_cancel = ROW_COUNT;

  -- 2. Erase every fact from every thread tied to the lead (all threads).
  DELETE FROM public.thread_memory WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_thread_memory = ROW_COUNT;

  -- 3. Explicit erasure of the no-FK content stores (never assumed by cascade).
  DELETE FROM public.ai_classifications WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_ai_class = ROW_COUNT;
  DELETE FROM public.owner_alerts WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_alerts = ROW_COUNT;
  DELETE FROM public.tracking_events WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_tracking = ROW_COUNT;
  DELETE FROM public.emails_sent WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_emails = ROW_COUNT;
  DELETE FROM public.meetings WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_meetings = ROW_COUNT;
  DELETE FROM public.audit_events WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  DELETE FROM public.ai_spend_ledger WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_ledger = ROW_COUNT;
  DELETE FROM public.lead_score WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_score = ROW_COUNT;

  -- 4. Tombstone: set forget_at on EVERY email_threads row for the lead (all
  --    gmail threads across campaigns/re-engagements), reset counters built from
  --    the erased exchange. The row survives as the anchor for "> forget_at".
  UPDATE public.email_threads
  SET forget_at = now(), turn_count = 0, high_priority = false, updated_at = now()
  WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_threads = ROW_COUNT;

  -- 5. Purge the saved_businesses email attribution (shared map; business entity
  --    row stays, inferred-email cell is purgeable via the attribution columns).
  UPDATE public.saved_businesses s
  SET discovered_by = array_remove(coalesce(s.discovered_by, '{}'), p_user_id),
      forgotten_by = (
        SELECT array_agg(DISTINCT x ORDER BY x)
        FROM unnest(coalesce(s.forgotten_by, '{}') || ARRAY[p_user_id]) AS t(x)
      )
  WHERE (v_place_id IS NOT NULL AND s.place_id = v_place_id)
     OR (v_place_id IS NULL AND v_email IS NOT NULL AND lower(s.email) = lower(v_email));
  GET DIAGNOSTICS v_business = ROW_COUNT;

  -- 5b. Null the inferred personal-data cell once no contributor remains.
  UPDATE public.saved_businesses s
  SET email = NULL, email_source = NULL, email_source_url = NULL,
      email_status = NULL, email_confidence = NULL, email_is_role = NULL,
      email_is_disposable = NULL, email_verification_reason = NULL
  WHERE (v_place_id IS NOT NULL AND s.place_id = v_place_id)
     OR (v_place_id IS NULL AND v_email IS NOT NULL AND lower(s.email) = lower(v_email))
  AND coalesce(array_length(coalesce(s.discovered_by, '{}'), 1), 0) = 0;

  -- 6. Independence of signals (§8.4): suppression is NEVER derived from erasure.
  --    Only an explicit p_suppress writes it. Erasure (Art.17) and consent (PECR)
  --    keep separate bases.
  IF p_suppress AND v_email IS NOT NULL THEN
    INSERT INTO public.suppressions (user_id, lead_id, email, reason, source)
    VALUES (p_user_id, p_lead_id, v_email, 'manual', 'forget_lead')
    ON CONFLICT (user_id, email) DO NOTHING;
    UPDATE public.leads SET unsubscribed = true, status = 'suppressed'
    WHERE id = p_lead_id;
  END IF;

  -- 7. No stale per-campaign fingerprint may outlive the erasure: drop the
  --    affected campaigns' learning rows (fold rebuilds next nightly from the
  --    surviving emails_sent/meetings; while absent, consumers run defaults).
  DELETE FROM public.campaign_learning WHERE campaign_id = ANY(v_campaign_ids);

  -- 8. Identity-light audit record: lead_id is dropped, payload carries counts.
  INSERT INTO public.audit_events (user_id, lead_id, event, payload)
  VALUES (p_user_id, NULL, 'lead.forgot', jsonb_build_object(
    'suppressed', coalesce(p_suppress, false),
    'row_counts', jsonb_build_object(
      'thread_memory', v_thread_memory, 'ai_classifications', v_ai_class,
      'owner_alerts', v_alerts, 'emails_sent', v_emails, 'meetings', v_meetings,
      'tracking_events', v_tracking, 'audit_events', v_audit, 'ai_spend_ledger', v_ledger,
      'lead_score', v_score, 'send_queue_cancelled', v_queue_cancel,
      'email_threads_tombstoned', v_threads, 'saved_businesses_purged', v_business
    )
  ));

  RETURN jsonb_build_object(
    'forgot', true,
    'suppressed', coalesce(p_suppress, false),
    'row_counts', jsonb_build_object(
      'thread_memory', v_thread_memory, 'ai_classifications', v_ai_class,
      'owner_alerts', v_alerts, 'emails_sent', v_emails, 'meetings', v_meetings,
      'tracking_events', v_tracking, 'audit_events', v_audit, 'ai_spend_ledger', v_ledger,
      'lead_score', v_score, 'send_queue_cancelled', v_queue_cancel,
      'email_threads_tombstoned', v_threads, 'saved_businesses_purged', v_business
    )
  );
END $fn$;

REVOKE ALL ON FUNCTION public.forget_lead(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forget_lead(uuid, uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) delete_lead — controller-side full removal (cascade parent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_lead(
  p_user_id uuid,
  p_lead_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_place_id text;
  v_email text;
  v_thread_memory bigint := 0;
  v_ai_class bigint := 0;
  v_alerts bigint := 0;
  v_emails bigint := 0;
  v_meetings bigint := 0;
  v_tracking bigint := 0;
  v_audit bigint := 0;
  v_ledger bigint := 0;
  v_queue bigint := 0;
  v_business bigint := 0;
  v_campaigns bigint := 0;
  v_campaign_ids uuid[] := '{}';
  v_lead_deleted boolean := false; BEGIN
  SELECT l.place_id, l.email INTO v_place_id, v_email
  FROM public.leads l
  WHERE l.id = p_lead_id AND l.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAD_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  -- 0. Capture affected campaigns BEFORE erasing emails_sent (they carry the
  --    campaign linkage that the fold needs to exclude this lead).
  SELECT coalesce(array_agg(DISTINCT e.campaign_id), '{}')
  INTO v_campaign_ids
  FROM public.emails_sent e WHERE e.lead_id = p_lead_id;

  -- 1. Cancel AND remove queue rows BEFORE the parent delete (no stranded lease).
  UPDATE public.send_queue
  SET status = 'cancelled', updated_at = now()
  WHERE lead_id = p_lead_id AND status IN ('pending','claimed','processing','failed');
  GET DIAGNOSTICS v_queue = ROW_COUNT;

  -- 2. Erase child/no-FK stores explicitly (never assume the cascade covers them).
  DELETE FROM public.thread_memory WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_thread_memory = ROW_COUNT;
  DELETE FROM public.ai_classifications WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_ai_class = ROW_COUNT;
  DELETE FROM public.owner_alerts WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_alerts = ROW_COUNT;
  DELETE FROM public.tracking_events WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_tracking = ROW_COUNT;
  DELETE FROM public.emails_sent WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_emails = ROW_COUNT;
  DELETE FROM public.meetings WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_meetings = ROW_COUNT;
  DELETE FROM public.audit_events WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  DELETE FROM public.ai_spend_ledger WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_ledger = ROW_COUNT;

  -- 3. Drop learning fingerprint rows for the erased lead's campaigns.
  DELETE FROM public.campaign_learning WHERE campaign_id = ANY(v_campaign_ids);
  GET DIAGNOSTICS v_campaigns = ROW_COUNT;

  -- 4. Purge the saved_businesses inferred-email attribution (identical to
  --    forget_lead §5) BEFORE the lead row disappears (place_id/email needed).
  UPDATE public.saved_businesses s
  SET discovered_by = array_remove(coalesce(s.discovered_by, '{}'), p_user_id),
      forgotten_by = (
        SELECT array_agg(DISTINCT x ORDER BY x)
        FROM unnest(coalesce(s.forgotten_by, '{}') || ARRAY[p_user_id]) AS t(x)
      )
  WHERE (v_place_id IS NOT NULL AND s.place_id = v_place_id)
     OR (v_place_id IS NULL AND v_email IS NOT NULL AND lower(s.email) = lower(v_email));
  GET DIAGNOSTICS v_business = ROW_COUNT;

  UPDATE public.saved_businesses s
  SET email = NULL, email_source = NULL, email_source_url = NULL,
      email_status = NULL, email_confidence = NULL, email_is_role = NULL,
      email_is_disposable = NULL, email_verification_reason = NULL
  WHERE (v_place_id IS NOT NULL AND s.place_id = v_place_id)
     OR (v_place_id IS NULL AND v_email IS NOT NULL AND lower(s.email) = lower(v_email))
  AND coalesce(array_length(coalesce(s.discovered_by, '{}'), 1), 0) = 0;

  -- 5. Delete the parent row (cascades lead_score, suppressions, email_threads —
  --    which carry the tombstone — send_queue, meetings, emails_sent, + FK
  --    set-null on ai_spend_ledger, all now already handled explicitly above).
  DELETE FROM public.leads WHERE id = p_lead_id AND user_id = p_user_id;
  v_lead_deleted := (FOUND);

  -- 6. Identity-light audit record (no lead id, counts only).
  INSERT INTO public.audit_events (user_id, lead_id, event, payload)
  VALUES (p_user_id, NULL, 'lead.deleted', jsonb_build_object(
    'lead_deleted', v_lead_deleted,
    'row_counts', jsonb_build_object(
      'thread_memory', v_thread_memory, 'ai_classifications', v_ai_class,
      'owner_alerts', v_alerts, 'emails_sent', v_emails, 'meetings', v_meetings,
      'tracking_events', v_tracking, 'audit_events', v_audit, 'ai_spend_ledger', v_ledger,
      'send_queue', v_queue, 'campaign_learning', v_campaigns,
      'saved_businesses_purged', v_business
    )
  ));

  RETURN jsonb_build_object(
    'deleted', v_lead_deleted,
    'row_counts', jsonb_build_object(
      'thread_memory', v_thread_memory, 'ai_classifications', v_ai_class,
      'owner_alerts', v_alerts, 'emails_sent', v_emails, 'meetings', v_meetings,
      'tracking_events', v_tracking, 'audit_events', v_audit, 'ai_spend_ledger', v_ledger,
      'send_queue', v_queue, 'campaign_learning', v_campaigns,
      'saved_businesses_purged', v_business
    )
  );
END $fn$;

REVOKE ALL ON FUNCTION public.delete_lead(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_lead(uuid, uuid) TO service_role;