SELECT id, decision_id, model_version, strategy_ref, payload
FROM audit_events
WHERE lead_id = '3b69cda9-76b2-4022-a3ac-398c09a1c436'
  AND event = 'ai.reply_sent'
  AND created_at > now() - interval '15 minutes'
ORDER BY created_at DESC;