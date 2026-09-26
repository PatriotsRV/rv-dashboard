-- ============================================================================
-- assistant_log_s191.sql  (Session 191)
-- Creates: assistant_log - one row per PRVS Assistant (home.html) request.
-- Written ONLY by the assistant-router edge function (service role).
-- Read: each user sees THEIR OWN rows (the "Your recent requests" list on
-- home.html); Admins see everything. Used for the per-user rate limit and as
-- the backlog of "things people asked for that no destination/filter can
-- express yet" (unmapped).
-- Safe to re-run.
-- ============================================================================
create table if not exists public.assistant_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_email    text not null,
  prompt        text not null,
  via           text not null default 'text',
  result        jsonb,
  destination   text,
  understood    boolean,
  unmapped      jsonb not null default '[]'::jsonb,
  error         text,
  model         text,
  ms            integer,
  input_tokens  integer,
  output_tokens integer
);
create index if not exists idx_assistant_log_user_time on public.assistant_log (lower(user_email), created_at desc);

alter table public.assistant_log enable row level security;

-- Read: own rows, or Admin. No insert/update/delete policy = only the service role writes.
drop policy if exists assistant_log_own_or_admin_read on public.assistant_log;
create policy assistant_log_own_or_admin_read on public.assistant_log
  for select to authenticated
  using (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.has_role('Admin'));

-- Explicit grants (Supabase no longer grants public-schema tables by default).
revoke all on public.assistant_log from anon;
grant select on public.assistant_log to authenticated;
revoke insert, update, delete on public.assistant_log from authenticated;
grant all on public.assistant_log to service_role;

-- Verify
select 'assistant_log' as tbl, count(*) as rows from public.assistant_log;
select polname, polcmd from pg_policy where polrelid = 'public.assistant_log'::regclass;
