-- Autopilot: the cron robot finds leads and sends on the user's behalf

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS autopilot boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS autopilot_country text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS autopilot_niche text;
