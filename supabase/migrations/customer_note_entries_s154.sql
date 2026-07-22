-- customer_note_entries_s154.sql — Session 154b (2026-07-22, Roland UX directive)
-- Customer notes become an APPEND-ONLY per-entry history — every note keeps
-- its author + date, like the RO updates timeline — replacing the S154
-- single-text customer_notes table. Idempotent: safe to re-run.
--
-- Run AFTER customer_notes_s154.sql (it migrates that table's rows, then
-- retires it).

-- 1. Entries table
create table if not exists public.customer_note_entries (
  id         uuid primary key default gen_random_uuid(),
  phone_key  text not null,
  note       text not null,
  created_by text,                            -- staff email; null on imports
  source     text not null default 'staff',   -- 'staff' | 'kenect_import'
  created_at timestamptz not null default now()
);
create index if not exists idx_note_entries_phone_key
  on public.customer_note_entries (phone_key, created_at desc);

-- 2. RLS — authenticated read, managers+ add. APPEND-ONLY by design:
--    no UPDATE/DELETE policies, so note history can't be silently
--    rewritten (same reasoning as the audit log).
alter table public.customer_note_entries enable row level security;
drop policy if exists note_entries_select_authenticated on public.customer_note_entries;
create policy note_entries_select_authenticated
  on public.customer_note_entries for select to authenticated using (true);
drop policy if exists note_entries_insert_manager on public.customer_note_entries;
create policy note_entries_insert_manager
  on public.customer_note_entries for insert to authenticated
  with check (is_manager_or_above());
grant select, insert on public.customer_note_entries to authenticated;

-- 3. Carry over everything from the S154 customer_notes table (the 542
--    Kenect imports + any staff edit made in the brief single-note window),
--    then retire it. Guarded so a re-run after the drop is a clean no-op.
do $$
begin
  if to_regclass('public.customer_notes') is not null then
    insert into public.customer_note_entries
      (phone_key, note, created_by, source, created_at)
    select n.phone_key, n.note,
           case when n.source = 'staff' then n.updated_by end,
           n.source,
           coalesce(n.updated_at, n.created_at, now())
    from public.customer_notes n
    where nullif(trim(n.note), '') is not null
      and not exists (select 1 from public.customer_note_entries e
                      where e.phone_key = n.phone_key and e.source = n.source);
    drop table public.customer_notes;
  end if;
end $$;

-- 4. Report
select count(*) as note_entries,
       count(*) filter (where source = 'kenect_import') as from_kenect,
       count(*) filter (where source = 'staff') as staff_entries
from public.customer_note_entries;
