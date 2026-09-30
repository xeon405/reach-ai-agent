-- ROLLBACK for migration 20260929120000_agent_action_state.sql
--
-- Deployed-code note: this table is the step budget. If it is ABSENT,
-- requestAction() in supabase/functions/_shared/action-budget.ts fails CLOSED
-- and denies every chargeable action -- observed live as writes being refused
-- with "I've done N actions for this request". So removing it does not make
-- the assistant spend more; it makes the assistant unable to write at all.
--
-- Rolling this back while the agent is deployed therefore breaks writes in a
-- loud, safe direction. To truly disable the step budget you must also change
-- the agent to stop calling requestAction.
--
-- DESTRUCTIVE: step counters are lost, so every conversation regains its full
-- allowance once. Nothing user-visible (conversations, messages, campaigns) is
-- affected.

drop table if exists public.agent_action_state;
