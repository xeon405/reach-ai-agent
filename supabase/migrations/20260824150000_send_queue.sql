-- Send queue: decouples Launch click from actual sending.
CREATE TABLE IF NOT EXISTS public.send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  variant text,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own queue rows" ON public.send_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- One active job per lead; finished jobs don't block requeueing later.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_queue_active_lead
  ON public.send_queue (lead_id) WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_queue_status_created ON public.send_queue (status, created_at);

-- Atomic batch claim safe under concurrent workers (SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.claim_queue_jobs(p_limit integer DEFAULT 3)
RETURNS SETOF public.send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.send_queue
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.send_queue q
  SET status = 'processing', updated_at = now()
  FROM claimed c
  WHERE q.id = c.id
  RETURNING q.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_queue_jobs(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_queue_jobs(integer) TO service_role;
