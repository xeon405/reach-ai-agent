SELECT id, lead_id, message_id, intent, confidence, requires_human, suggested_action, created_at
FROM ai_classifications WHERE id IN (28, 30) ORDER BY id;