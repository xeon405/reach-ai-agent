SELECT l.id, l.email, l.conv_mode, l.lifecycle, l.status,
       (SELECT ai_turns FROM emails_sent WHERE lead_id = l.id ORDER BY sent_at DESC LIMIT 1) AS ai_turns,
       (SELECT ai_paused FROM emails_sent WHERE lead_id = l.id ORDER BY sent_at DESC LIMIT 1) AS ai_paused
FROM leads l
WHERE l.conv_mode IN ('HUMAN','PAUSED','AI_OVERRIDDEN')
   OR l.lifecycle = 'HUMAN_TAKEOVER'
ORDER BY l.created_at;