SELECT id, user_id, lead_id, campaign_id, event, created_at,
       payload->>'gmail_message_id' AS gid, payload->>'kind' AS kind
FROM audit_events
WHERE created_at > now() - interval '7 days'
  AND event IN ('ai.reply_sent','ai.reply_generated','email.replied')
ORDER BY created_at DESC LIMIT 20;