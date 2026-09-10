SELECT id, event, created_at, payload->>'job_id' AS job_id, payload->>'lead_score' AS lead_score,
       payload->>'lead_tier' AS lead_tier, payload->>'lead_score_version' AS lead_score_version,
       payload->>'lead_score_at' AS lead_score_at
FROM audit_events
WHERE event = 'email.claimed' AND payload->>'job_id' = '2e0a955b-166c-421a-9a79-89ad7b99dffd'
ORDER BY created_at DESC LIMIT 2;