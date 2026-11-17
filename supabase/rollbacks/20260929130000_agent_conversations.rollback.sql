-- ROLLBACK for migration 20260929130000_agent_conversations.sql
-- Agent chat: conversation history + the intent cache.
--
-- Run all four statements together.
--
-- Deployed-code note: the agent function (v1) fails SAFE if these tables are
-- absent — it catches persistence errors and still answers from live queries.
-- So this rollback does not require an immediate redeploy. If you want the
-- agent fully disabled afterwards, delete supabase/functions/agent/ instead.
--
-- 1) Indexes first: dropping the table cascades them anyway, but being explicit
--    keeps this safe to run twice.
-- 2) Tables, children first. All three CASCADE to auth.users, so deleting a
--    user already removes their agent history.
--
-- DESTRUCTIVE: every agent conversation, message, and cached intent mapping is
-- lost. Acceptable for a rollback; users lose their chat history and the
-- unknown-phrase cache is cold again.

drop index if exists public.idx_agent_cache_user;
drop index if exists public.idx_agent_msg_user;
drop index if exists public.idx_agent_msg_conv;
drop index if exists public.idx_agent_conv_user;

drop table if exists public.agent_intent_cache;
drop table if exists public.agent_messages;
drop table if exists public.agent_conversations;
