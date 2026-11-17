-- ROLLBACK for migration 20260908000003_audit_events_decision_trail.sql
-- Stage 3: attribution columns + 4 indexes on audit_events.
--
-- Order: drop indexes first, then the columns. All statements idempotent.
-- Re-running the forward migration restores everything.
--
-- Data note: dropping the columns also discards any decision_id/model_version/
-- strategy_ref values written while the forward migration was live. If you need
-- to keep attribution while rolling back the schema, copy
--   (id, decision_id, model_version, strategy_ref) to a scratch table first.
--
-- Deployed-code note: shared `_shared/audit.ts` passes these as nullable inputs;
-- a function built against the new audit.ts is safe with the columns dropped
-- (insert with explicit nulls for non-existent columns FAILS, and insertAudit
-- swallows errors — so a deployed new insertAudit without the columns loses
-- audit rows SILENTLY). Roll back the schema only together with redeploying the
-- pre-Stage-3 function bundles, or apply the migration again immediately.
drop index if exists audit_events_decision_trail_idx;
drop index if exists audit_events_decision_id_idx;
drop index if exists audit_events_model_version_idx;
drop index if exists audit_events_strategy_ref_idx;

alter table public.audit_events
  drop column if exists decision_id,
  drop column if exists model_version,
  drop column if exists strategy_ref;