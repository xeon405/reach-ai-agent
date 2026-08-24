-- Conversation Mode: multi-turn AI thread handling
alter table public.emails_sent
  add column if not exists ai_turns int not null default 0,
  add column if not exists last_lead_msg_at timestamptz,
  add column if not exists last_ai_msg_at timestamptz,
  add column if not exists ai_paused boolean not null default false;
