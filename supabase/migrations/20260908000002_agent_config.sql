-- ============================================================
-- agent_config (Workstream 0b / design doc 2.5)
-- Generic key/value config store for inbox-agent judgment knobs.
-- Scope resolution: glob -> user -> campaign (most specific wins).
-- `value` is jsonb; known keys (0b):
--   confidence_floor            number  (default 0.55)
--   turn_budget                 integer (default 3)
--   reply_policy                string  (default "balanced")
--   max_ai_replies_per_lead_24h integer (default 5)
-- Future keys (Stage 5+): campaign_learning.enabled, lead_score.enabled.
-- Judgment knobs exist ONLY as config rows — code never invents them.
-- ============================================================
create table public.agent_config (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  scope      text not null check (scope in ('glob','user','campaign')),
  scope_id   uuid,
  value      jsonb not null,
  version    integer not null default 1,
  enabled    boolean not null default true,
  changed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- glob is singleton per key (scope_id is null there).
-- user/campaign rows are unique per (key, scope, scope_id).
create unique index agent_config_glob_uq on public.agent_config(key) where scope = 'glob';
create unique index agent_config_scoped_uq on public.agent_config(key, scope, scope_id)
  where scope in ('user','campaign');

-- Service-role only. Client roles are explicitly denied.
alter table public.agent_config enable row level security;
create policy "agent_config_service_role_all" on public.agent_config
  for all to service_role using (true) with check (true);
revoke all on public.agent_config from anon, authenticated;

-- Seed: one glob row per known key, matching today's hardcoded constants.
-- This makes the defaults visible/tunable in the DB, not scattered in code.
insert into public.agent_config (key, scope, value, version) values
  ('confidence_floor', 'glob', '0.55', 1),
  ('turn_budget', 'glob', '3', 1),
  ('reply_policy', 'glob', '"balanced"', 1),
  ('max_ai_replies_per_lead_24h', 'glob', '5', 1);