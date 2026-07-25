-- ============================================================
-- staff_groups_s158.sql (Teams/Groups broadcast, S151 TODO, Session 158)
-- ============================================================
-- Custom saved staff groups for the Messages-board broadcast composer
-- (messages.html v1.13). Silo teams are DERIVED live from
-- staff.service_silo — this table only stores the CUSTOM groups.
-- RLS: managers+ only (broadcast itself is a managers+ feature).
-- S124 note: explicit grants included (Supabase is dropping default
-- public-schema Data API grants for new tables after 2026-10-30).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists staff_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  member_emails text[] not null default '{}',
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint staff_groups_name_unique unique (name),
  constraint staff_groups_name_nonempty check (length(trim(name)) > 0)
);

-- updated_at trigger (S115 pattern — set_updated_at() already exists).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_staff_groups_updated_at' and tgrelid = 'staff_groups'::regclass
  ) then
    create trigger trg_staff_groups_updated_at
      before update on staff_groups
      for each row execute function set_updated_at();
  end if;
end $$;

-- RLS: managers+ full access; nobody else sees the table.
alter table staff_groups enable row level security;

drop policy if exists staff_groups_manager_select on staff_groups;
create policy staff_groups_manager_select on staff_groups
  for select to authenticated using (is_manager_or_above());

drop policy if exists staff_groups_manager_insert on staff_groups;
create policy staff_groups_manager_insert on staff_groups
  for insert to authenticated with check (is_manager_or_above());

drop policy if exists staff_groups_manager_update on staff_groups;
create policy staff_groups_manager_update on staff_groups
  for update to authenticated using (is_manager_or_above()) with check (is_manager_or_above());

drop policy if exists staff_groups_manager_delete on staff_groups;
create policy staff_groups_manager_delete on staff_groups
  for delete to authenticated using (is_manager_or_above());

-- Explicit grants (S124 future-proofing; RLS still gates row access).
grant select, insert, update, delete on staff_groups to authenticated;
grant select on staff_groups to service_role;

-- ── Report ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where tablename = 'staff_groups') as policies,
  (select count(*) from pg_trigger
    where tgrelid = 'staff_groups'::regclass and not tgisinternal) as triggers;
