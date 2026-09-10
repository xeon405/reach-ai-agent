SELECT id, user_id, campaign_id, subject, sent_at, replied, autoreplied, ai_turns, ai_paused,
       last_lead_msg_at, last_ai_msg_at, reply_sentiment, gmail_thread_id,
       ai_draft, sequence, variant
FROM emails_sent WHERE id = '98b8ff86-471c-4195-9eaf-6559b36cddf9';