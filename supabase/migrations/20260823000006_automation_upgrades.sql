-- Automation upgrades: booking links, reply sentiment, daily digest

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS booking_link text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_digest_date date;
ALTER TABLE public.emails_sent ADD COLUMN IF NOT EXISTS reply_sentiment text;
