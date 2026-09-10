SELECT es.id, es.user_id, es.campaign_id, es.sent_at, es.replied, es.ai_turns, es.ai_paused,
       es.last_lead_msg_at, es.last_ai_msg_at, es.gmail_thread_id, es.autoreplied,
       l.email, l.name, l.lifecycle, l.conv_mode, l.status
FROM emails_sent es JOIN leads l ON l.id = es.lead_id
WHERE es.replied = true
ORDER BY es.last_lead_msg_at DESC NULLS LAST
LIMIT 20;