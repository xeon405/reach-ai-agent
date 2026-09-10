select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='agent_config') as cols,
  (select count(*) from public.agent_config where scope='glob') as glob_rows,
  (select count(*) from pg_policies where tablename='agent_config') as policies,
  (select count(*) from public.agent_config
     where (key, scope) in (('confidence_floor','glob'),('turn_budget','glob'),('reply_policy','glob'),('max_ai_replies_per_lead_24h','glob'))) as seeded_glob;