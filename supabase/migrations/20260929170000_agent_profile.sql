-- Persistent business context the agent acquires by listening.
--
-- The agent could hold a pending clarification for 15 minutes, but it forgot
-- everything else. Someone would describe their business in real detail, get
-- asked "what would you like to name the new campaign?", and lose the whole
-- thing. Conversation history kept the words, but nothing reusable was ever
-- extracted, so the next turn started from zero again.
--
-- One row per user, written only by the edge functions holding the service
-- role. RLS is enabled with no client policy, so the browser can never read or
-- write this directly - it is only ever reached through the agent.

create table public.agent_profile (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  website       text,
  product       text,
  audience      text,
  goals         text,
  notes         text,
  updated_at    timestamptz not null default now()
);

comment on table public.agent_profile is
  'What the agent has learned about this user''s business. Filled in from '
  'conversation, used to ground advice and targeting. Service-role only.';

comment on column public.agent_profile.audience is
  'Who they sell to, in their own words (the ICP).';
comment on column public.agent_profile.goals is
  'What they are trying to achieve with cold email.';
comment on column public.agent_profile.notes is
  'Anything else worth keeping that has no column of its own.';

create index agent_profile_updated_idx on public.agent_profile (updated_at);

alter table public.agent_profile enable row level security;

-- Deliberately not "force": the edge functions write this as service_role,
-- which has bypassrls, and anon/authenticated get nothing because there are no
-- policies. See agent_pending_state for why forcing it is the wrong default.