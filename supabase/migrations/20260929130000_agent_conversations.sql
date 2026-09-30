-- ============================================================================
-- Agent chat: conversation history + the intent cache.
--
-- The cache is the reason a repeated request costs nothing. The first time the
-- user phrases something we do not recognise, the AI maps it to an intent once;
-- that mapping is stored against the user's own phrase, and every identical
-- phrase afterwards is served by string match with no model call at all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New chat',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text NOT NULL,
  intent          text,
  params          jsonb,
  -- True when the AI was consulted. Lets us prove the cache is working.
  used_ai         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_intent_cache (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase      text NOT NULL,
  intent      text NOT NULL,
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  hits        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phrase)
);

CREATE INDEX IF NOT EXISTS idx_agent_conv_user   ON public.agent_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_msg_conv    ON public.agent_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_msg_user    ON public.agent_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_cache_user  ON public.agent_intent_cache (user_id, hits DESC);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_intent_cache  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own agent conversations" ON public.agent_conversations;
CREATE POLICY "own agent conversations" ON public.agent_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own agent messages" ON public.agent_messages;
CREATE POLICY "own agent messages" ON public.agent_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own agent intent cache" ON public.agent_intent_cache;
CREATE POLICY "own agent intent cache" ON public.agent_intent_cache
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
