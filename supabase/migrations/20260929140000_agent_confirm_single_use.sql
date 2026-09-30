-- Makes a confirmation single-use.
--
-- Bug found by scripts/.stage8/prove-agent-live.mjs: the write branch returned
-- "pending" BEFORE persisting the user message, so the follow-up "yes" could
-- not find the intent it was meant to confirm. Fixing the ordering alone is
-- not enough -- without a way to mark a confirmation spent, the SAME "yes" can
-- be replayed and a "create campaign" confirmation would create a duplicate
-- campaign every time it was sent.
--
-- executed_at is set on the user message that authorized the write. The confirm
-- lookup only accepts a user message that is still NULL, so one pending intent
-- can be confirmed exactly once.

alter table public.agent_messages
  add column if not exists executed_at timestamptz;

comment on column public.agent_messages.executed_at is
  'Set when this user message has been confirmed and its write executed. NULL = still pending.';
