-- Stage 4 rollback: remove the learning-loop cron job first (a still-deployed
-- learning-loop bundle then becomes inert — nothing calls it), then drop the
-- three intelligence tables. Safe on pre-Stage-5 bundles only (no consumers
-- read these tables until Stage 5/6 wiring). Never roll back this migration
-- while Stage-5+ consumer bundles are live without rolling them back too.
SELECT cron.unschedule('learning-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'learning-hourly'
);

-- Remove only the two glob rows this migration seeded (safe even if later
-- stages added user/campaign scoped variants of the same keys).
DELETE FROM public.agent_config
WHERE scope = 'glob' AND key IN ('campaign_learning.enabled', 'lead_score.enabled');

DROP TABLE IF EXISTS public.strategy_state;
DROP TABLE IF EXISTS public.campaign_learning;
DROP TABLE IF EXISTS public.lead_score;