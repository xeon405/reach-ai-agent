-- AI upgrade #5: persistent, account-aware support chat.
-- Threads persist server-side so conversations survive across devices and the
-- assistant can answer with the user's REAL account numbers (plan, usage, Gmail state).

CREATE TABLE IF NOT EXISTS public.support_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'auto',   -- 'auto' = AI replies | 'human' = handed off
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_chat_threads_user_idx
  ON public.support_chat_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.support_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_chat_messages_thread_idx
  ON public.support_chat_messages (thread_id, created_at);

ALTER TABLE public.support_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_threads_own ON public.support_chat_threads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY support_threads_own_insert ON public.support_chat_threads
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY support_messages_own ON public.support_chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_chat_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY support_messages_own_insert ON public.support_chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.support_chat_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );