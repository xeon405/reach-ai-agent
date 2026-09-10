SELECT 'killrow' AS k, count(*)::text AS v FROM agent_config
WHERE key = 'campaign_learning.enabled' AND scope = 'campaign' AND scope_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28' AND value = 'false'::jsonb
UNION ALL
SELECT 'ai_paused', ai_paused::text FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9'
UNION ALL
SELECT 'lead_mode', conv_mode || '/' || lifecycle FROM leads WHERE id = '3b69cda9-76b2-4022-a3ac-398c09a1c436'
UNION ALL
SELECT 'old_cls37', (SELECT count(*) FROM ai_classifications WHERE id = 37)::text
UNION ALL
SELECT 'last_lead', last_lead_msg_at::text FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';