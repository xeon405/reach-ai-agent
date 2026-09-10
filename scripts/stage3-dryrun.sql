begin;
alter table public.audit_events
  add column if not exists decision_id uuid,
  add column if not exists model_version text,
  add column if not exists strategy_ref text;
create index if not exists audit_events_decision_id_idx on public.audit_events(decision_id);
create index if not exists audit_events_model_version_idx on public.audit_events(model_version);
create index if not exists audit_events_strategy_ref_idx on public.audit_events(strategy_ref);
create index if not exists audit_events_decision_trail_idx on public.audit_events(decision_id, created_at desc);
rollback;