SELECT 'pending_jobs' AS k, count(*)::text AS v FROM send_queue WHERE status = 'pending'
UNION ALL SELECT 'due_followups', count(*)::text FROM leads
  WHERE followup_status = 'active' AND next_followup_at IS NOT NULL AND next_followup_at <= now()
UNION ALL SELECT 'sending_followups', count(*)::text FROM leads WHERE followup_status = 'sending'
UNION ALL SELECT 'queued_leased', count(*)::text FROM send_queue WHERE lease_until > now() AND status = 'pending';