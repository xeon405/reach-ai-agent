SELECT id, intent, confidence, requires_human, suggested_action, created_at, message_id
FROM ai_classifications WHERE lead_id = '3b69cda9-76b2-4022-a3ac-398c09a1c436' ORDER BY id DESC LIMIT 3;
SELECT id, ai_turns, last_lead_msg_at, last_ai_msg_at, ai_draft IS NOT NULL AS has_draft
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';