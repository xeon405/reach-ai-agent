SELECT id, event, created_at, payload->>'kind' AS kind,
       payload->>'style_hint' AS style_hint,
       payload->>'turn' AS turn,
       payload->>'gmail_message_id' AS gmail_message_id
FROM audit_events
WHERE lead_id = '3b69cda9-76b2-4022-a3ac-398c09a1c436'
  AND created_at > now() - interval '30 minutes'
ORDER BY created_at;