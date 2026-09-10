SELECT 'cls' AS k, string_agg(id::text || '|' || message_id, ',') AS v
FROM ai_classifications WHERE lead_id = '3b69cda9-76b2-4022-a3ac-398c09a1c436'
UNION ALL
SELECT 'lead', conv_mode || '|' || lifecycle FROM leads WHERE id = '3b69cda9-76b2-4022-a3ac-398c09a1c436'
UNION ALL
SELECT 'row', ai_turns::text || '|' || ai_paused::text || '|' || last_lead_msg_at::text || '|' || last_ai_msg_at::text
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';