-- Rollback: remove the outcome-evidence RPC. health_last_cron_runs (dispatch
-- ledger only) remains available for the pre-marker fallback path.
drop function if exists public.health_cron_evidence();