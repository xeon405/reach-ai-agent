SELECT jobid, jobname, schedule, active, command
FROM cron.job WHERE jobname LIKE '%inbox_agent%' OR jobname LIKE '%send_worker%';