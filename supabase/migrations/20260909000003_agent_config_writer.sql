-- Stage 7 fix: agent_config uses PARTIAL unique indexes (glob_uq on (key) where
-- scope='glob'; scoped_uq on (key,scope,scope_id) where scope in user/campaign),
-- so PostgREST's insert-...-onConflict cannot target them. RPC-based upsert that
-- matches each partial predicate exactly, used by cost-sweep for the dual markers
-- and by any admin/automation writing scoped or global config.
--
-- ROLLBACK:
--   drop function if exists public.set_agent_config(text, text, uuid, jsonb, boolean, text);
--
-- Example (sweep writes the degraded marker):
--   select public.set_agent_config('ai_quality.metering_degraded',
--     'user'::text, p_profile_id, 'true'::jsonb, true, 'cost-sweep');

create or replace function public.set_agent_config(
  p_key text,
  p_scope text,
  p_scope_id uuid,
  p_value jsonb,
  p_enabled boolean,
  p_changed_by text
) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_scope = 'glob' then
    insert into public.agent_config (key, scope, scope_id, value, enabled, changed_by)
    values (p_key, 'glob', null, p_value, coalesce(p_enabled, true), coalesce(p_changed_by, 'system'))
    on conflict (key) where scope = 'glob'
    do update set value = excluded.value, enabled = excluded.enabled,
                  changed_by = excluded.changed_by, updated_at = now();
  else
    insert into public.agent_config (key, scope, scope_id, value, enabled, changed_by)
    values (p_key, coalesce(p_scope, 'user'), p_scope_id, p_value, coalesce(p_enabled, true), coalesce(p_changed_by, 'system'))
    on conflict (key, scope, scope_id) where scope = any (array['user'::text, 'campaign'::text])
    do update set value = excluded.value, enabled = excluded.enabled,
                  changed_by = excluded.changed_by, updated_at = now();
  end if;
end $fn$;

revoke all on function public.set_agent_config(text, text, uuid, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.set_agent_config(text, text, uuid, jsonb, boolean, text) to service_role;