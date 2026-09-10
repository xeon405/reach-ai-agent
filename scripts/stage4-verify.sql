-- Stage 4 verification — answers "what Stage-4 state is present right now?".
-- Pre-apply (dry-run): 0 tables / 0 cron (proves rollback left schema untouched).
-- Post-apply:          3 tables / 1 cron.
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('lead_score','campaign_learning','strategy_state')) AS stage4_tables,
  (SELECT count(*) FROM cron.job WHERE jobname = 'learning-hourly') AS learning_cron;