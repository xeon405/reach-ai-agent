SELECT 'hint' AS k, COALESCE(state->>'reply_style_hint','(none)') AS v
FROM campaign_learning WHERE campaign_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28'
UNION ALL
SELECT 'last_lead_msg_at', COALESCE(last_lead_msg_at::text,'(null)')
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';