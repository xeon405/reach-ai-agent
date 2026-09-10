WITH tko AS (
  SELECT a.id, a.user_id, a.lead_id, a.created_at,
         (SELECT created_at FROM audit_events a2
           WHERE a2.lead_id = a.lead_id AND a2.event = 'ai.reply_sent'
             AND a2.created_at < a.created_at
           ORDER BY a2.created_at DESC LIMIT 1) AS prior_ai_send,
         (SELECT created_at FROM audit_events a3
           WHERE a3.lead_id = a.lead_id AND a3.event = 'human.takeover'
             AND a3.payload->>'trigger' = 'manual_reply_send'
             AND a3.created_at < a.created_at
           ORDER BY a3.created_at DESC LIMIT 1) AS prior_manual_send
  FROM audit_events a
  WHERE a.event = 'human.takeover' AND a.payload->>'trigger' = 'owner_replied_manually'
)
SELECT tko.id, tko.lead_id, tko.created_at, tko.prior_ai_send,
       tko.prior_ai_send IS NOT NULL
         AND (tko.prior_manual_send IS NULL OR tko.prior_ai_send > tko.prior_manual_send)
         AND extract(epoch FROM (tko.created_at - tko.prior_ai_send)) < 3600 AS likely_self_trigger,
       extract(epoch FROM (tko.created_at - tko.prior_ai_send)) AS sec_since_ai_send
FROM tko ORDER BY tko.created_at;