select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='sender_health') as sender_health_cols,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='gmail_tokens' and column_name='connected_at') as connected_at,
  (select count(*) from cron.job where jobname='reputation-nightly') as cron_job;