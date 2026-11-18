-- =============================================================================
-- Bring-your-own-AI engine (MCP) + OAuth 2.1 authorization server tables
-- =============================================================================

-- Which engine generated a course.
alter table public.courses
  add column generation_engine text not null default 'server'
  check (generation_engine in ('server', 'assistant'));

-- New job type, driven by the user's own assistant through the MCP server.
alter table public.course_generation_jobs drop constraint course_generation_jobs_job_type_check;
alter table public.course_generation_jobs add constraint course_generation_jobs_job_type_check
  check (job_type in ('generate_course', 'assistant_generate', 'regenerate_lesson', 'regenerate_illustrations'));

-- The background runner must never lease assistant-driven jobs.
create or replace function public.claim_job(p_job_id uuid, p_lease_seconds integer)
returns setof public.course_generation_jobs
language sql security definer set search_path = public as $$
  update public.course_generation_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         status = case when status in ('queued', 'waiting') then 'running' else status end,
         started_at = coalesce(started_at, now()),
         slices = slices + 1
   where id = p_job_id
     and job_type <> 'assistant_generate'
     and status in ('queued', 'running', 'waiting')
     and next_run_at <= now()
     and (locked_until is null or locked_until < now())
  returning *;
$$;
revoke all on function public.claim_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_job(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- OAuth 2.1 (used by Claude / ChatGPT custom connectors to reach /api/mcp).
-- Only the server (service role) touches these tables. Secrets, codes and
-- tokens are stored as SHA-256 hashes, never in plaintext.
-- -----------------------------------------------------------------------------
create table public.oauth_clients (
  client_id text primary key,
  client_secret_hash text,                     -- null for public (PKCE-only) clients
  client_name text not null default 'MCP client',
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'none'
    check (token_endpoint_auth_method in ('none', 'client_secret_post', 'client_secret_basic')),
  client_uri text,
  created_at timestamptz not null default now()
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_codes_expiry_idx on public.oauth_authorization_codes (expires_at);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('access', 'refresh')),
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null,
  resource text,
  code_hash text,                               -- lets a replayed code revoke what it issued
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_tokens_user_idx on public.oauth_tokens (user_id, client_id);
create index oauth_tokens_code_idx on public.oauth_tokens (code_hash) where code_hash is not null;

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;
revoke all on public.oauth_clients, public.oauth_authorization_codes, public.oauth_tokens from anon, authenticated;
