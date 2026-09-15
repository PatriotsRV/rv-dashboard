-- ============================================================================
-- MESSAGES BOARD — canned responses ("quick replies") with customer tokens
-- Session 189, 2026-09-15 — ER 776384e7 (Andrew Page) + Roland's token spec.
-- Feature: messages.html v1.29 (Quick replies picker + editor).
-- Creates: message_snippets (+ index, RLS, updated_at trigger, explicit grants).
-- Run in the Supabase SQL editor. Idempotent where practical.
--
-- Access model (Roland S189):
--   * read   : every signed-in staff member (anyone who can text can use them)
--   * write  : Manager / Sr Manager / Admin (create, edit, delete)
--   Shop-wide list -- no per-user private snippets in v1.
--
-- Tokens live in `body` as literal angle-bracket placeholders and are expanded
-- CLIENT-SIDE at insert time from the open conversation, e.g.
--   <first name> <last name> <name> <phone> <rv> <ro number> <service>
--   <my name> <my first name> <shop phone>
-- ============================================================================

create table if not exists message_snippets (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category     text,
  sort_order   integer not null default 100,
  active       boolean not null default true,
  created_by   text,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_message_snippets_active_order
  on message_snippets (active, sort_order, lower(title));

-- updated_at maintenance -- reuse the house trigger fn if present (auto_set_updated_at.sql, S115)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'drop trigger if exists message_snippets_set_updated_at on message_snippets';
    execute 'create trigger message_snippets_set_updated_at before update on message_snippets for each row execute function set_updated_at()';
  end if;
end $$;

-- Explicit grants (Supabase is removing default public-schema Data API grants
-- after 2026-10-30 -- new tables need them spelled out).
grant select on message_snippets to authenticated;
grant insert, update, delete on message_snippets to authenticated;

-- --- RLS -------------------------------------------------------------------
alter table message_snippets enable row level security;

drop policy if exists message_snippets_select on message_snippets;
create policy message_snippets_select on message_snippets
  for select to authenticated
  using (true);

drop policy if exists message_snippets_insert on message_snippets;
create policy message_snippets_insert on message_snippets
  for insert to authenticated
  with check (public.is_manager_or_above());

drop policy if exists message_snippets_update on message_snippets;
create policy message_snippets_update on message_snippets
  for update to authenticated
  using (public.is_manager_or_above())
  with check (public.is_manager_or_above());

drop policy if exists message_snippets_delete on message_snippets;
create policy message_snippets_delete on message_snippets
  for delete to authenticated
  using (public.is_manager_or_above());

-- --- Seed: Andrew's first one, written as a token example (edit freely) -----
insert into message_snippets (title, body, category, sort_order, created_by)
select 'Vroom parts deposit',
       'Hi <first name>, this is <my first name> at Patriots RV. Parts for your <rv> are ready to order. We need the parts deposit to get them moving -- you can reply here with any questions or call us at <shop phone>. Thank you!',
       'Vroom', 10, 'seed-s189'
where not exists (select 1 from message_snippets where lower(title) = 'vroom parts deposit');

-- --- VERIFICATION (S187 rule: the SQL editor shows ONLY the last statement's
--     result -- run these ONE AT A TIME) ---
-- select count(*) as policies from pg_policies where tablename = 'message_snippets';   -- expect 4
-- select column_name from information_schema.columns where table_name = 'message_snippets' order by ordinal_position;  -- expect 10 cols
-- select title, left(body, 60) from message_snippets;  -- expect the Vroom seed row
