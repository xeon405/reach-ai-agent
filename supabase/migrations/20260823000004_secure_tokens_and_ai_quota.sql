-- M1: move Gmail OAuth tokens out of profiles into a service-role-only vault
CREATE TABLE IF NOT EXISTS public.gmail_tokens (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_tokens FROM anon, authenticated;

INSERT INTO public.gmail_tokens (profile_id, access_token, refresh_token)
SELECT id, gmail_access_token, gmail_refresh_token
FROM public.profiles
WHERE gmail_refresh_token IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE
  SET access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      updated_at = now();

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS gmail_access_token,
  DROP COLUMN IF EXISTS gmail_refresh_token;

-- M2: per-user daily AI generation quota (atomic consumption via RPC)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_generated_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_generated_date date;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(uid uuid, cap integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.profiles
    SET ai_generated_date = CURRENT_DATE,
        ai_generated_today = CASE
          WHEN ai_generated_date = CURRENT_DATE THEN ai_generated_today + 1
          ELSE 1
        END
    WHERE id = uid
      AND COALESCE(CASE WHEN ai_generated_date = CURRENT_DATE THEN ai_generated_today ELSE 0 END, 0) < cap
    RETURNING true
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;
