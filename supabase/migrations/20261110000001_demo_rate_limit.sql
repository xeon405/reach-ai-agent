-- Public demo rate limiting.
-- One row per demo request. Service-role only: RLS is on and no policy is
-- created, so no client can read or write it.
CREATE TABLE IF NOT EXISTS public.demo_rate_limit (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_demo_rate_limit_ip_time
  ON public.demo_rate_limit (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_rate_limit_created
  ON public.demo_rate_limit (created_at);
