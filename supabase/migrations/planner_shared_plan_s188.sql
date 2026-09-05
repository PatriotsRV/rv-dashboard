-- ============================================================================
-- WORK PLANNER — Phase 1: SHARED PLAN + RO CHANNEL + AUDIT (Session 188, 2026-09-05)
-- Spec: docs/specs/WORK_PLANNER_SPEC.md   Feature: js/planner.js (index.html v1.504)
-- Creates: planner_entries, planner_messages, planner_events (+ audit triggers).
-- Requires: planner_views_s188.sql already run (saved report views).
-- Run in the Supabase SQL editor. Idempotent where practical.
--
-- Roland's model (S188):
--   • A plan ENTRY is one silo's intent for one RO (bucket + planned start/end +
--     note). Every manager can SEE every silo's entry on an RO — that is the
--     whole point (cross-silo awareness). Owner / that silo's manager / Sr Mgr /
--     Admin can write it. Admins may add an entry to any silo as an FYI.
--   • The RO CHANNEL (planner_messages) is a Slack-style thread per RO where
--     requests, replies, conflicts and FYIs live. NOT email.
--   • planner_events is the audit trail — written by TRIGGERS so nothing can
--     bypass it (every insert/update/delete on entries + messages).
-- ============================================================================

-- ─── 1. planner_entries — the shared plan ──────────────────────────────────
create table if not exists planner_entries (
  id             uuid primary key default gen_random_uuid(),
  ro_uuid        uuid not null references repair_orders(id) on delete cascade,
  ro_display_id  text,                                   -- cached human RO id (house style)
  service_silo   text not null,                          -- SERVICE_SILOS key (repair/vroom/solar/roof/paint_body/chassis/detailing/truetopper)
  owner_email    text not null,                          -- manager who owns this silo's plan
  bucket         text not null default ''
                 check (bucket in ('', 'today', 'week', 'later', 'hold')),
  planned_start  date,
  planned_end    date,
  note           text,
  sort_order     int,
  source         text not null default 'manual'
                 check (source in ('manual', 'admin_fyi')),
  status         text not null default 'planned'
                 check (status in ('planned', 'active', 'done', 'dropped')),
  created_by     text not null,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (ro_uuid, service_silo)
);
create index if not exists idx_planner_entries_ro     on planner_entries (ro_uuid);
create index if not exists idx_planner_entries_owner  on planner_entries (lower(owner_email));
create index if not exists idx_planner_entries_bucket on planner_entries (bucket) where bucket <> '';

-- ─── 2. planner_messages — the RO channel ──────────────────────────────────
create table if not exists planner_messages (
  id             uuid primary key default gen_random_uuid(),
  ro_uuid        uuid not null references repair_orders(id) on delete cascade,
  ro_display_id  text,
  from_email     text not null,
  from_silo      text,                                   -- silo the author speaks for (null = admin/shop)
  to_silo        text,                                   -- addressed silo (null = whole channel)
  kind           text not null default 'message'
                 check (kind in ('message', 'request', 'reply', 'conflict', 'fyi', 'system')),
  body           text not null,
  proposed_date  date,                                   -- "can we have it on …?" / "not until …"
  parent_id      uuid references planner_messages(id) on delete set null,
  resolved_at    timestamptz,
  resolved_by    text,
  sms_sent_at    timestamptz,                            -- Phase 2: direct SMS via Messages board
  created_at     timestamptz not null default now()
);
create index if not exists idx_planner_messages_ro   on planner_messages (ro_uuid, created_at);
create index if not exists idx_planner_messages_open on planner_messages (to_silo) where resolved_at is null and kind = 'request';

-- ─── 3. planner_events — audit trail (trigger-written) ─────────────────────
create table if not exists planner_events (
  id           bigserial primary key,
  table_name   text not null,
  row_id       uuid,
  ro_uuid      uuid,
  service_silo text,
  action       text not null,                            -- INSERT / UPDATE / DELETE
  actor_email  text not null,
  old_row      jsonb,
  new_row      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_planner_events_ro on planner_events (ro_uuid, created_at desc);

create or replace function public.planner_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb;
begin
  j := to_jsonb(coalesce(new, old));
  insert into planner_events (table_name, row_id, ro_uuid, service_silo, action, actor_email, old_row, new_row)
  values (
    TG_TABLE_NAME,
    (j->>'id')::uuid,
    (j->>'ro_uuid')::uuid,
    coalesce(j->>'service_silo', j->>'from_silo'),
    TG_OP,
    coalesce(auth.jwt()->>'email', 'system'),
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists planner_entries_audit on planner_entries;
create trigger planner_entries_audit
  after insert or update or delete on planner_entries
  for each row execute function public.planner_audit();

drop trigger if exists planner_messages_audit on planner_messages;
create trigger planner_messages_audit
  after insert or update or delete on planner_messages
  for each row execute function public.planner_audit();

-- updated_at maintenance (house trigger fn from auto_set_updated_at.sql, S115)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'drop trigger if exists planner_entries_set_updated_at on planner_entries';
    execute 'create trigger planner_entries_set_updated_at before update on planner_entries for each row execute function set_updated_at()';
  end if;
end $$;

-- ─── 4. RLS ────────────────────────────────────────────────────────────────
-- Entries + messages: every manager-tier user reads everything (cross-silo
-- awareness is the feature). Writes: manager tier; the UI enforces WHO may edit
-- WHICH silo's entry (owner / silo manager / Sr Mgr / Admin) and the audit
-- trigger records every actor regardless.
alter table planner_entries  enable row level security;
alter table planner_messages enable row level security;
alter table planner_events   enable row level security;

drop policy if exists planner_entries_manager_rw on planner_entries;
create policy planner_entries_manager_rw on planner_entries
  for all to authenticated
  using (public.is_manager_or_above()) with check (public.is_manager_or_above());

drop policy if exists planner_messages_manager_rw on planner_messages;
create policy planner_messages_manager_rw on planner_messages
  for all to authenticated
  using (public.is_manager_or_above()) with check (public.is_manager_or_above());

-- Audit: read-only for managers; nobody writes it except the trigger (SECURITY DEFINER).
drop policy if exists planner_events_manager_read on planner_events;
create policy planner_events_manager_read on planner_events
  for select to authenticated using (public.is_manager_or_above());

-- ─── VERIFICATION — run ONE AT A TIME (the editor shows only the last result, S187) ─
-- select tablename, count(*) from pg_policies where tablename like 'planner_%' group by 1 order by 1;  -- entries 1, events 1, messages 1, views 4
-- select tgname, tgrelid::regclass from pg_trigger where tgname like 'planner_%' and not tgisinternal;  -- 3 or 4 rows
-- select proname, prosecdef from pg_proc where proname = 'planner_audit';  -- prosecdef = true
