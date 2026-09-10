SELECT p.id, count(*) AS rows_cnt
FROM emails_sent es JOIN leads l ON l.id = es.lead_id
JOIN profiles p ON p.id = es.user_id
JOIN gmail_tokens gt ON gt.profile_id = p.id
GROUP BY p.id;