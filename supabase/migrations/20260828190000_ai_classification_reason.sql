-- AI upgrade #2: classifier evidence. Every ai_classifications row should
-- carry a one-line human-readable reason showing WHY the AI labeled it that way.

ALTER TABLE public.ai_classifications ADD COLUMN IF NOT EXISTS reason TEXT;