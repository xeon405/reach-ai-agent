delete from public.agent_config
where changed_by = '0b-live-proof';
select 'override reverted' as note;