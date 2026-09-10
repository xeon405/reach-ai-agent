SELECT id, campaign_id, sequence, sent_at, replied, autoreplied, ai_turns, ai_paused,
       last_lead_msg_at, last_ai_msg_at, gmail_thread_id, user_id
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';
SELECT campaign_id, version, state, triggered_by, updated_at
FROM campaign_learning WHERE campaign_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28';
SELECT l.id AS lead_id, l.email, l.conv_mode, l.lifecycle, l.status, l.campaign_id
FROM leads l WHERE l.id = (SELECT lead_id FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9');