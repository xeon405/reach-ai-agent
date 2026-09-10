-- Stage 8 hotfix (standalone, ships ahead of the Stage 8 memory work):
-- close the delete-account erasure gaps found in the erasure-surface audit.
--
-- 1. ai_spend_ledger.user_id was ON DELETE SET NULL on profile deletion, so an
--    account deletion left an anonymous cost-history orphan behind. Make profile
--    deletion CASCADE the ledger: on account erasure every cost row must go with
--    it (they are the user's own spend rows and cost-sweep already reconciles the
--    live state; nothing downstream needs the orphaned history).
--
-- 2. agent_config user-scoped rows (scope='user', scope_id=userId) have no FK
--    (scope_id is polymorphic users|campaigns) and are erased by
--    delete-account/index.ts explicitly (scope+scope_id). No constraint change
--    here — a shared FK is impossible for a polymorphic scope_id.
--
-- 3. push_queue rows have no FK on user_id. Erased explicitly in
--    delete-account/index.ts by user_id. Not converting to an FK: pre-existing
--    rows may not reference a live auth user (queue is drained by push-drainer),
--    so adding a constraint would reject the migration at apply time.
alter table public.ai_spend_ledger
  drop constraint if exists ai_spend_ledger_user_id_fkey,
  add constraint ai_spend_ledger_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;