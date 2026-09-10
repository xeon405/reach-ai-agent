INSERT INTO public.agent_config (key, scope, scope_id, value, version, enabled, changed_by)
VALUES ('campaign_learning.enabled', 'campaign', 'c3772e1f-c028-48e4-8f8c-abcf73240f28', 'false'::jsonb, 1, true, 'stage5-live-probe');
UPDATE emails_sent SET ai_paused = false WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';
UPDATE leads SET conv_mode = 'AI_AUTOPILOT', lifecycle = 'INTERESTED' WHERE id = '3b69cda9-76b2-4022-a3ac-398c09a1c436';
DELETE FROM ai_classifications WHERE id = 37 AND message_id = '1a047343d0ab9c1f';
UPDATE emails_sent SET last_lead_msg_at = '2026-08-28 07:00:00+00' WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';