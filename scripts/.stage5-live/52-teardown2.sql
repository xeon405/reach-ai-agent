INSERT INTO ai_classifications (id, user_id, lead_id, message_id, intent, confidence, interested,
  booking_intent, unsubscribe, sentiment, requires_human, suggested_action, raw, created_at) VALUES
 (28, '39b65a0f-2c1d-48e2-9ee7-a358ba8d0570', '3b69cda9-76b2-4022-a3ac-398c09a1c436', '1a04732881e993b1',
  'question', 0.96, true, false, false, 'INTERESTED', false, 'auto_reply',
  jsonb_build_object('subject', 'Re: Automate Your Cold Email Outreach in Gmail'), '2026-08-28 07:09:02.946118+00'),
 (30, '39b65a0f-2c1d-48e2-9ee7-a358ba8d0570', '3b69cda9-76b2-4022-a3ac-398c09a1c436', '1a047343d0ab9c1f',
  'unclear', 0.92, false, false, false, 'INTERESTED', false, 'do_nothing',
  jsonb_build_object('subject', 'Re: Automate Your Cold Email Outreach in Gmail'), '2026-08-28 07:10:03.4228+00')
OVERRIDING SYSTEM VALUE;

UPDATE lead_score SET computed_at = now(), expires_at = now() + interval '24 hours'
WHERE lead_id = '396a562c-e8a8-4f2a-a94a-d47531e4fd64';

DELETE FROM send_queue WHERE id IN ('2e0a955b-166c-421a-9a79-89ad7b99dffd', '30efe256-2180-4f8f-a360-0cb584fe2a84');