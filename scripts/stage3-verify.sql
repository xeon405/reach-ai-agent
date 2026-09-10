select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='audit_events' and column_name in ('decision_id','model_version','strategy_ref')) as attr_cols,
  (select count(*) from pg_indexes
     where schemaname='public' and tablename='audit_events' and indexname like 'audit_events_%idx%') as attr_indexes;