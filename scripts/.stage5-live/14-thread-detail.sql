SELECT es.id, es.campaign_id, es.sequence, es.sent_at, es.replied, es.autoreplied, es.ai_turns,
       es.ai_paused, es.last_lead_msg_at, es.last_ai_msg_at, es.gmail_thread_id,
       left(es.ai_draft, 60) AS ai_draft_head, l.email AS lead_email, l.conv_mode, l.lifecycle, l.status
FROM emails_sent es JOIN leads l ON l.id = es.lead_id
WHERE es.lead_id IN (SELECT es2.lead_id FROM emails_sent es2 WHERE es2.id = '31135a54-a34e-4242-ba50-434455ed02a4')
ORDER BY es.sent_at;