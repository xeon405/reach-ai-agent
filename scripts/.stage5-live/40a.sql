SELECT id, intent, confidence, suggested_action, created_at, message_id
FROM ai_classifications WHERE lead_id = '3b69cda9-76b2-4022-a3ac-398c09a1c436' ORDER BY id DESC LIMIT 3;