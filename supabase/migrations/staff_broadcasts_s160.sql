-- ============================================================
-- staff_broadcasts_s160.sql (Broadcasts on the Messages board, Session 160)
-- ============================================================
-- One row PER BROADCAST (not per recipient) so messages.html v1.15 can show
-- broadcast history per group in the 📢 Broadcasts filter. The per-recipient
-- sends remain in `messages` (context 'staff_broadcast', textly-send v1.2);
-- this table adds what those rows lack: the GROUP identity + recipient roster.
-- Written client-side by sendBroadcast() after the send loop.
-- RLS: managers+ only (broadcast itself is a managers+ feature — matches
-- staff_groups_s158.sql).
-- S124 note: explicit grants included (Supabase drops default public-schema
-- Data API grants for new tables after 2026-10-30).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists staff_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  group_name      text not null,            -- 'All staff' / custom group name
  sender_email    text not null,
  body            text not null,            -- raw text (without the 📢 prefix)
  recipients      jsonb not null default '[]'::jsonb,  -- [{email,name,phone,ok}]
  recipient_count int  not null default 0,
  sent_count      int  not null default 0,
  failed_count    int  not null default 0,
  created_at      timestamptz not null default now(),
  constraint staff_broadcasts_body_nonempty check (length(trim(body)) > 0)
);

create index if not exists idx_staff_broadcasts_created
  on staff_broadcasts (created_at desc);

-- RLS: managers+ full read/insert; nobody else sees the table.
alter table staff_broadcasts enable row level security;

drop policy if exists staff_broadcasts_manager_select on staff_broadcasts;
create policy staff_broadcasts_manager_select on staff_broadcasts
  for select to authenticated using (is_manager_or_above());

drop policy if exists staff_broadcasts_manager_insert on staff_broadcasts;
create policy staff_broadcasts_manager_insert on staff_broadcasts
  for insert to authenticated with check (is_manager_or_above());

-- Explicit grants (S124 gotcha).
grant select, insert on staff_broadcasts to authenticated;
