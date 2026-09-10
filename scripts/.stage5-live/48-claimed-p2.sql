SELECT id, event, created_at, payload->>'job_id' AS job_id, payload->>'lead_score' AS lead_score,
       payload->>'lead_tier' AS lead_tier, payload->>'lead_score_version' AS lead_score_version,
       payload->>'lead_score_at' AS lead_score_at
FROM audit_events
WHERE event = 'email.claimed' AND payload->>'job_id' = '30efe256-2180-4f8f-a360-0cb584fe2a84'
ORDER BY created_at DESC LIMIT 2;