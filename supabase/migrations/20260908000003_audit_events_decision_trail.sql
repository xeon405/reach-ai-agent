-- ============================================================
-- audit_events decision attribution (Workstream 1 / design 2.1)
-- Adds the attribution prerequisite for the learning loop.
-- Nullable + additive: no existing writer or reader changes.
-- Backfill: no-op (null) — this is a forward-only attribution trail.
-- ============================================================
alter table public.audit_events
  add column if not exists decision_id uuid,
  add column if not exists model_version text,
  add column if not exists strategy_ref text;

-- Trails: lookup by decision, by config/prompt version, by strategy row.
create index if not exists audit_events_decision_id_idx on public.audit_events(decision_id);
create index if not exists audit_events_model_version_idx on public.audit_events(model_version);
create index if not exists audit_events_strategy_ref_idx on public.audit_events(strategy_ref);
-- Decision outcome trail (model output -> where it landed) is the hot path.
create index if not exists audit_events_decision_trail_idx on public.audit_events(decision_id, created_at desc);