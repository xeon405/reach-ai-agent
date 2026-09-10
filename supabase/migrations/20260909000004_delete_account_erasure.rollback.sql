-- Stage 8 hotfix rollback: restore cost-ledger retention (SET NULL) on profile delete.
alter table public.ai_spend_ledger
  drop constraint if exists ai_spend_ledger_user_id_fkey,
  add constraint ai_spend_ledger_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;