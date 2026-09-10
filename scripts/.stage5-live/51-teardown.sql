DELETE FROM agent_config
WHERE key = 'campaign_learning.enabled' AND scope = 'campaign'
  AND scope_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28' AND changed_by = 'stage5-live-probe';

UPDATE campaign_learning
SET state = jsonb_set(state, '{reply_style_hint}', 'null'::jsonb)
WHERE campaign_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28';

UPDATE emails_sent
SET ai_turns = 1, ai_paused = false,
    last_lead_msg_at = '2026-08-28 07:09:23+00',
    last_ai_msg_at = '2026-08-28 07:10:05.834+00',
    ai_draft = $ai$You’re welcome! Is there anything specific you’d like to know about how OutreachAI can find leads, personalize cold emails from your Gmail, or handle follow‑ups for you? Feel free to check the details on our site if you’d like: https://outreach-ochre-sigma.vercel.app.

Best regards$ai$
WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';

UPDATE leads SET conv_mode = 'AI_AUTOPILOT', lifecycle = 'INTERESTED'
WHERE id = '3b69cda9-76b2-4022-a3ac-398c09a1c436';

DELETE FROM ai_classifications WHERE id IN (37, 38);

INSERT INTO ai_classifications (id, user_id, lead_id, message_id, intent, confidence, interested,
  booking_intent, unsubscribe, sentiment, requires_human, suggested_action, raw, created_at) VALUES
 (28, '39b65a0f-2c1d-48e2-9ee7-a358ba8d0570', '3b69cda9-76b2-4022-a3ac-398c09a1c436', '1a04732881e993b1',
  'question', 0.96, true, false, false, 'INTERESTED', false, 'auto_reply',
  jsonb_build_object('subject', 'Re: Automate Your Cold Email Outreach in Gmail'), '2026-08-28 07:09:02.946118+00'),
 (30, '39b65a0f-2c1d-48e2-9ee7-a358ba8d0570', '3b69cda9-76b2-4022-a3ac-398c09a1c436', '1a047343d0ab9c1f',
  'unclear', 0.92, false, false, false, 'INTERESTED', false, 'do_nothing',
  jsonb_build_object('subject', 'Re: Automate Your Cold Email Outreach in Gmail'), '2026-08-28 07:10:03.4228+00');

UPDATE lead_score SET computed_at = now(), expires_at = now() + interval '24 hours'
WHERE lead_id = '396a562c-e8a8-4f2a-a94a-d47531e4fd64';

DELETE FROM send_queue WHERE id IN ('2e0a955b-166c-421a-9a79-89ad7b99dffd', '30efe256-2180-4f8f-a360-0cb584fe2a84');