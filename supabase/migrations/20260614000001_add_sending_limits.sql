-- Add Gmail token columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_email TEXT;

-- Add emails_sent_today counter
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS emails_sent_today INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS emails_sent_date DATE;

-- Add follow_up tracking to emails_sent
ALTER TABLE public.emails_sent
ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

-- Add sequence number to emails (1=first, 2=follow-up)
ALTER TABLE public.emails_sent
ADD COLUMN IF NOT EXISTS sequence INT NOT NULL DEFAULT 1;