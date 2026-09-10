-- #############################################################################
-- NOTE: x-cron-secret below is redacted to <CRON_SECRET>; substitute the project's
-- CRON_SECRET (`supabase secrets list`) before applying on a fresh project.
-- Stage 4: intelligence-layer state (lead_score / campaign_learning /
-- strategy_state) + hourly learning-loop cron (the single writer).
--
-- Design doc: INTELLIGENCE-LAYER-DESIGN.md §2.2, §2.3, §2.4, §3.
-- Contract invariants enforced HERE (schema) and in learning-loop (code):
--   * Staleness = "no opinion": lead_score carries computed_at/expires_at so
--     consumers enforce the 24h freshness bound; campaign_learning carries
--     updated_at for the 36h bound; strategy_state is batch-only and never
--     consulted at request time.
--   * Advisory, never controller: consumers fall back to today's deterministic
--     behavior when rows are missing/stale; a score can only raise priority
--     within existing caps and can never bypass sender_health.
--   * Privacy moat: strategy_state holds anonymized aggregates keyed by coarse
--     feature_bucket + model_version. Rolling window per the 7-day default.
--     EU/UK outcome exclusion (GDPR_COUNTRY_ISOS) is enforced by learning-loop
--     at write time; null/unknown country is excluded conservatively.
--   * Minimum-sample gate: learning-loop will not declare any A/B variant a
--     winner before every variant has >= MIN_SAMPLE sent outcomes and the
--     reply-rate lead is >= MIN_DELTA ahead (constants live in learning-loop).
--
-- ROLLBACK NOTE (Stage 4):
--   Rollback = run 20260908000004_intelligence_tables.rollback.sql. It removes
--   the learning-hourly cron job first, so a still-deployed learning-loop bundle
--   becomes inert (nothing calls it; manual calls just short-circuit). Drops the
--   three tables. No consumer schema depends on these tables until Stage 5/6
--   wiring lands, so schema rollback alone is safe on pre-5 bundles ONLY. Once
--   Stage 5 deploys consumer reads, rolling back this migration WITHOUT rolling
--   back the consumer bundles will silently return defaults — never raise.
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 1) lead_score — "how valuable is this lead right now" (design §2.2).
--    features jsonb carries feature VALUES only (opaque, no raw content/PII).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_score (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 1),
  tier text NOT NULL DEFAULT 'D' CHECK (tier IN ('A', 'B', 'C', 'D')),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_version int NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
COMMENT ON TABLE public.lead_score IS
  'Intelligence-layer lead value. Consumers may read only if computed_at > now()-24h; stale/missing => default behavior. A score can raise priority only within existing caps and never bypass sender_health.';
COMMENT ON COLUMN public.lead_score.features IS
  'Opaque feature values only (replies_received, ai_turns, opens, days_since_last_activity, intent, bounced). No raw content, no PII.';
CREATE INDEX IF NOT EXISTS lead_score_expires_at_idx ON public.lead_score(expires_at);
CREATE INDEX IF NOT EXISTS lead_score_computed_at_idx ON public.lead_score(computed_at);

ALTER TABLE public.lead_score ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_score FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_score TO service_role;

-- ---------------------------------------------------------------------------
-- 2) campaign_learning — per-campaign state that gets smarter from that
--    campaign's OWN outcomes (design §2.3). Writers: learning-loop ONLY.
--    send-worker / inbox-agent are read-only consumers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_learning (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text NOT NULL DEFAULT 'learning-loop'
);
COMMENT ON TABLE public.campaign_learning IS
  'Per-campaign learned state (variant deltas declared only past the min-sample gate). Consumers may use behavioral advice only if updated_at > now()-36h; stale/missing => current defaults. Single writer: learning-loop.';
COMMENT ON COLUMN public.campaign_learning.state IS
  'Documented shape: { variants: { <key>: {sent, replied, opened, meets, bounces, reply_rate, open_rate} }, winner_variant: {...}|null, min_sample: {required, note}, last_folded_at } plus reserved next_sequence_hint / reply_style_hint keys (populated at Stage 5).';
CREATE INDEX IF NOT EXISTS campaign_learning_updated_at_idx ON public.campaign_learning(updated_at);

ALTER TABLE public.campaign_learning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_learning FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_learning TO service_role;

-- ---------------------------------------------------------------------------
-- 3) strategy_state — anonymized global cross-customer aggregates (design
--    §2.4). No lead id, no campaign id, no email content, no PII.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategy_state (
  feature_bucket text NOT NULL,
  model_version text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent int NOT NULL DEFAULT 0,
  replied int NOT NULL DEFAULT 0,
  meets int NOT NULL DEFAULT 0,
  excluded_gdpr int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_bucket, model_version, window_start)
);
COMMENT ON TABLE public.strategy_state IS
  'Anonymized aggregate outcomes per coarse feature_bucket + model_version (batch-only, never read at request time). No PII. EU/UK outcomes excluded at write time by learning-loop; null-country excluded conservatively. Buckets with sent < floor are not written (statistical-noise + de-identification floor).';

ALTER TABLE public.strategy_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strategy_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.strategy_state TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Hourly learning-loop cron (single writer; mirrors reputation-nightly).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('learning-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'learning-hourly'
);

SELECT cron.schedule(
  'learning-hourly',
  '0 * * * *',  -- every hour on the hour; campaign/strategy folds gate at 02:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/learning-loop',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  ) AS request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- 5) Stage-5 kill-switch defaults (design §2.5): one glob row per intelligence
--    toggle, enabled = today's behavior. Consumers wire these in Stage 5/6;
--    seeding now is additive and harmless — the current inbox-agent resolver
--    reads only AGENT_CONFIG_KEYS, so these rows stay untouched until the
--    wiring stage. Disabled row => consumers fall back to deterministic
--    defaults; the kill-switch is always a config row, never a code path.
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_config (key, scope, value, version, enabled, changed_by)
VALUES
  ('campaign_learning.enabled', 'glob', 'true', 1, true, 'system'),
  ('lead_score.enabled',       'glob', 'true', 1, true, 'system')
ON CONFLICT (key) WHERE scope = 'glob' DO NOTHING;