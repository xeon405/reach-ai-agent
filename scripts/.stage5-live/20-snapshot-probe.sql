SELECT id, campaign_id, version, jsonb_pretty(state) AS state, has_winner, updated_at
FROM campaign_learning WHERE campaign_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28';
SELECT id, ai_turns, ai_paused, last_lead_msg_at, last_ai_msg_at, conv_mode, replied, autoreplied
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';