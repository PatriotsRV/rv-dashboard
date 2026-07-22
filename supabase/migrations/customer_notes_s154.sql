-- customer_notes_s154.sql — Session 154 (2026-07-22)
-- Kenect customer-notes rescue: standalone notes table keyed by phone_key
-- (NOT a conversations column — 27 of the 542 noted Kenect contacts have no
-- conversation yet; a standalone table keeps all 542 and serves future notes).
-- Idempotent: safe to re-run. Read-path: messages board joins on phone_key.
-- RLS mirrors conversations: authenticated read, managers+ write.

-- 1. Table
create table if not exists public.customer_notes (
  phone_key   text primary key,
  note        text not null,
  display_name text,
  source      text not null default 'kenect_import',
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.customer_notes enable row level security;

-- 2. RLS (drop-then-create = idempotent)
drop policy if exists customer_notes_select_authenticated on public.customer_notes;
create policy customer_notes_select_authenticated
  on public.customer_notes for select to authenticated using (true);

drop policy if exists customer_notes_insert_manager on public.customer_notes;
create policy customer_notes_insert_manager
  on public.customer_notes for insert to authenticated
  with check (is_manager_or_above());

drop policy if exists customer_notes_update_manager on public.customer_notes;
create policy customer_notes_update_manager
  on public.customer_notes for update to authenticated
  using (is_manager_or_above()) with check (is_manager_or_above());

grant select, insert, update on public.customer_notes to authenticated;

-- 3. updated_at trigger (reuses the S115 set_updated_at())
drop trigger if exists trg_customer_notes_updated_at on public.customer_notes;
create trigger trg_customer_notes_updated_at
  before update on public.customer_notes
  for each row execute function set_updated_at();

-- 4. Backfill from Kenect staging (542 non-empty notes at S154 count).
--    Dedupe by phone_key: keep the most recently updated Kenect contact.
--    ON CONFLICT DO NOTHING = idempotent + never clobbers a staff-edited note.
insert into public.customer_notes (phone_key, note, display_name, source)
select distinct on (pk)
  pk, note, display_name, 'kenect_import'
from (
  select
    right(regexp_replace(payload->'mainNumber'->>'number', '\D', '', 'g'), 10) as pk,
    trim(payload->>'note') as note,
    payload->>'displayName' as display_name,
    coalesce((payload->>'updatedDate')::bigint, 0) as upd
  from public.kenect_contacts_raw
  where nullif(trim(payload->>'note'),'') is not null
) s
where pk is not null and length(pk) = 10
order by pk, upd desc
on conflict (phone_key) do nothing;

-- 5. Report (run output tells you the landed count)
select count(*) as customer_notes_rows,
       count(*) filter (where source = 'kenect_import') as from_kenect
from public.customer_notes;
