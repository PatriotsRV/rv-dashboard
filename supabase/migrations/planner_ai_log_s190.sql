-- ============================================================================
-- planner_ai_log_s190.sql  (Session 190)
-- Creates: planner_ai_log - one row per Work Planner AI request.
-- Written ONLY by the planner-ai edge function (service role). Used for the
-- per-user rate limit and as the backlog of "things managers asked for that
-- no filter can express yet" (unmapped).
-- Safe to re-run.
-- ============================================================================
create table if not exists public.planner_ai_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_email    text not null,
  prompt        text not null,
  via           text not null default 'text',
  result        jsonb,
  understood    boolean,
  unmapped      jsonb not null default '[]'::jsonb,
  error         text,
  model         text,
  ms            integer,
  input_tokens  integer,
  output_tokens integer
);
create index if not exists idx_planner_ai_log_user_time on public.planner_ai_log (lower(user_email), created_at desc);

alter table public.planner_ai_log enable row level security;

-- Read: Admin only. No insert/update/delete policy = only the service role writes.
drop policy if exists planner_ai_log_admin_read on public.planner_ai_log;
create policy planner_ai_log_admin_read on public.planner_ai_log
  for select to authenticated using (public.has_role('Admin'));

-- Explicit grants (Supabase no longer grants public-schema tables by default).
revoke all on public.planner_ai_log from anon;
grant select on public.planner_ai_log to authenticated;
grant all on public.planner_ai_log to service_role;

-- Verify
select 'planner_ai_log' as tbl, count(*) as rows from public.planner_ai_log;
select polname, polcmd from pg_policy where polrelid = 'public.planner_ai_log'::regclass;
