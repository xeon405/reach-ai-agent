-- ROLLBACK for migration 20260929140000_agent_confirm_single_use.sql
--
-- Deployed-code note: agent v2 reads agent_messages.executed_at. Rolling this
-- back while v2 is live would break the confirm path, so revert the code
-- (deploy v1) BEFORE or together with this rollback. The column is only a
-- guard against duplicate confirmed writes, so a brief window where a
-- replayed "yes" could double-apply is the worst case, not data loss.
--
-- Safe to re-run: re-adding the column re-arms the guard, but every existing
-- row comes back NULL, i.e. every already-executed write looks unconfirmed.
-- Set executed_at on historical rows before relying on it again.
--
-- DESTRUCTIVE: none. Dropping this column discards no user data - only the
-- spent/unspent marker for pending confirmations.

alter table public.agent_messages
  drop column if exists executed_at;
