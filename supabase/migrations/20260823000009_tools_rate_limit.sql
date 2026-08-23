create table if not exists public.tools_rate_limit (
  id bigint generated always as identity primary key,
  ip text not null,
  action text not null default 'any',
  created_at timestamptz not null default now()
);

alter table public.tools_rate_limit enable row level security;

-- No policies: denied for everyone except service_role (used by the tools function)
create index if not exists idx_tools_rate_limit_ip_time on public.tools_rate_limit (ip, created_at desc);
create index if not exists idx_tools_rate_limit_cleanup on public.tools_rate_limit (created_at);
