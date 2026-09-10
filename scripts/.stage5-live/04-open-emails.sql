SELECT es.id, es.user_id, es.campaign_id, es.sent_at, es.replied, es.last_lead_msg_at,
       l.email, l.name, l.status, l.lifecycle
FROM emails_sent es
JOIN leads l ON l.id = es.lead_id
WHERE es.replied = false
ORDER BY es.sent_at DESC
LIMIT 15;