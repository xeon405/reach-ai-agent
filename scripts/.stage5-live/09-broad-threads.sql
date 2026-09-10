SELECT es.id, es.user_id, es.campaign_id, es.sent_at, es.replied, es.ai_turns, es.ai_paused,
       es.last_lead_msg_at, es.last_ai_msg_at, es.gmail_thread_id,
       l.email, l.name, l.lifecycle, l.conv_mode, l.status
FROM emails_sent es JOIN leads l ON l.id = es.lead_id
WHERE es.last_lead_msg_at IS NOT NULL
  AND es.last_lead_msg_at > now() - interval '14 days'
ORDER BY es.last_lead_msg_at DESC
LIMIT 25;