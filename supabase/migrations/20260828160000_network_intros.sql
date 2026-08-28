-- Phase 3: Warm B2B network.
-- profile.network_mode: opt-in "discoverable by other businesses".
-- intro_requests: double opt-in intros between platform users (no contact exposure pre-accept).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS network_mode boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.intro_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.intro_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS intro_requests_target_idx ON public.intro_requests (target_user_id, status);
CREATE INDEX IF NOT EXISTS intro_requests_requester_idx ON public.intro_requests (requester_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS intro_requests_active_uniq ON public.intro_requests (requester_user_id, target_user_id) WHERE status = 'pending';