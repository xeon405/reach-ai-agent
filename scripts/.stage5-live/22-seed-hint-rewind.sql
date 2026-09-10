UPDATE campaign_learning
SET state = jsonb_set(state, '{reply_style_hint}',
  '"Mirror the lead''s tone and keep sentences short; open by answering their question directly; avoid jargon; end with a single clear question. Warm and concise."'),
    version = version
WHERE campaign_id = 'c3772e1f-c028-48e4-8f8c-abcf73240f28';

UPDATE emails_sent
SET last_lead_msg_at = '2026-08-28 07:05:00+00'
WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';