SELECT e.id AS emails_sent_id, l.email, a.event, a.created_at, a.payload->>'kind' AS kind,
       (a.payload->>'turn') AS turn
FROM audit_events a
JOIN emails_sent e ON e.lead_id = a.lead_id
JOIN leads l ON l.id = a.lead_id
WHERE a.lead_id IN (
  SELECT lead_id FROM emails_sent WHERE id IN ('31135a54-a34e-4242-ba50-434455ed02a4','98b8ff86-471c-4195-9eaf-6559b36cddf9')
)
ORDER BY a.created_at;