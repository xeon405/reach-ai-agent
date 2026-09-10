SELECT c.id, c.lead_id, l.email, c.intent, c.confidence, c.interested, c.booking_intent, c.sentiment,
       c.requires_human, c.suggested_action, c.created_at, c.raw->>'subject' AS subj
FROM ai_classifications c JOIN leads l ON l.id = c.lead_id
WHERE c.lead_id IN (
  SELECT lead_id FROM emails_sent WHERE id IN ('31135a54-a34e-4242-ba50-434455ed02a4','98b8ff86-471c-4195-9eaf-6559b36cddf9')
)
ORDER BY c.created_at DESC;