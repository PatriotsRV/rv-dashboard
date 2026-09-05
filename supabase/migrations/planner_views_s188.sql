-- ============================================================================
-- WORK PLANNER — saved / shared planner views (Session 188, 2026-09-05)
-- Feature: js/planner.js (index.html v1.504) — manager-facing dynamic RO
--          report + daily/weekly work-list builder.
-- Creates: planner_views (+ indexes, RLS, updated_at trigger).
-- Run in the Supabase SQL editor. Idempotent where practical.
--
-- Shape:
--   config jsonb = { filters:{...}, sort:{key,dir}, columns:[...] }
--   rows   jsonb = { "<repair_orders.id uuid>": { order:int|null, bucket:''|today|week|later|hold, note:text } }
-- RO membership is NOT a FK on purpose: a view may reference ROs that later
-- close/archive; the client simply ignores keys it cannot find in currentData.
--
-- Access model (Roland S188 draft):
--   • read  : owner, OR any Manager/Sr Manager/Admin when shared = true
--   • write : owner (insert/update/delete); Admin may update/delete any
--   Owner match uses the JWT email (auth.jwt()->>'email') — same load-bearing
--   fallback the S156 role helpers use (public.users.id ≠ auth.uid for 5 users).
-- ============================================================================

create table if not exists planner_views (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_email  text not null,
  shared       boolean not null default false,
  config       jsonb not null default '{}'::jsonb,
  rows         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_planner_views_owner  on planner_views (lower(owner_email));
create index if not exists idx_planner_views_shared on planner_views (shared) where shared;

-- updated_at maintenance — reuse the house trigger fn if present (auto_set_updated_at.sql, S115)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'drop trigger if exists planner_views_set_updated_at on planner_views';
    execute 'create trigger planner_views_set_updated_at before update on planner_views for each row execute function set_updated_at()';
  end if;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table planner_views enable row level security;

drop policy if exists planner_views_select on planner_views;
create policy planner_views_select on planner_views
  for select to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt()->>'email',''))
    or (shared and public.is_manager_or_above())
  );

drop policy if exists planner_views_insert on planner_views;
create policy planner_views_insert on planner_views
  for insert to authenticated
  with check (
    public.is_manager_or_above()
    and lower(owner_email) = lower(coalesce(auth.jwt()->>'email',''))
  );

drop policy if exists planner_views_update on planner_views;
create policy planner_views_update on planner_views
  for update to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt()->>'email',''))
    or public.has_role('Admin')
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt()->>'email',''))
    or public.has_role('Admin')
  );

drop policy if exists planner_views_delete on planner_views;
create policy planner_views_delete on planner_views
  for delete to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt()->>'email',''))
    or public.has_role('Admin')
  );

-- ─── VERIFICATION (S187 rule: the SQL editor shows ONLY the last statement's
--     result — run these ONE AT A TIME, or read them as separate queries) ───
-- select count(*) as policies from pg_policies where tablename = 'planner_views';   -- expect 4
-- select column_name, data_type from information_schema.columns where table_name = 'planner_views' order by ordinal_position;  -- expect 8 cols
-- select tgname from pg_trigger where tgrelid = 'planner_views'::regclass and not tgisinternal;  -- expect planner_views_set_updated_at (if set_updated_at() exists)
