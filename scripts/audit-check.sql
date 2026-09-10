-- Verify the learning.fold audit row from the most recent force-run.
SELECT id, event, user_id, campaign_id, lead_id, payload, created_at
FROM public.audit_events
WHERE event = 'learning.fold'
ORDER BY created_at DESC
LIMIT 1;