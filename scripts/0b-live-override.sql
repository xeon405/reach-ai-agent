-- Live proof override for dormant probe user (no mailbox, no data — inert to the
-- deployed function itself; exists to prove config reaches the resolution path).
insert into public.agent_config (key, scope, scope_id, value, version, changed_by) values
  ('turn_budget', 'user', 'b0b0b0b0-0000-4000-8000-00000000000c', '7', 2, '0b-live-proof'),
  ('confidence_floor', 'user', 'b0b0b0b0-0000-4000-8000-00000000000c', '0.40', 2, '0b-live-proof'),
  ('reply_policy', 'user', 'b0b0b0b0-0000-4000-8000-00000000000c', '"concise"', 2, '0b-live-proof');
select 'override inserted' as note;