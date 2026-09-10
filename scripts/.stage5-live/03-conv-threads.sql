SELECT es.id, es.user_id, es.campaign_id, es.sent_at, es.ai_turns, es.ai_paused,
       es.last_lead_msg_at, es.last_ai_msg_at, es.gmail_thread_id,
       l.email, l.name, l.lifecycle, l.conv_mode, l.status
FROM emails_sent es
JOIN leads l ON l.id = es.lead_id
WHERE es.ai_paused = false
  AND es.replied = true
  AND es.gmail_thread_id IS NOT NULL
  AND es.last_lead_msg_at > COALESCE(es.last_ai_msg_at, es.sent_at)
ORDER BY es.last_lead_msg_at DESC
LIMIT 15;