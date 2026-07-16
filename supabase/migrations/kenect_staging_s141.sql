-- ============================================================================
-- Kenect extraction staging (Session 141, 2026-07-15)
-- TEMPORARY infrastructure for the Kenect -> Supabase data rescue (deadline 2026-07-24).
-- The browser extractor runs in app.kenect.com and writes DIRECTLY to Supabase with
-- the public anon key, so raw pull data + media (2-7 GB) never route through Claude.
-- Anon gets INSERT/UPDATE on the staging tables + INSERT to the kenect-media bucket ONLY.
-- NO anon SELECT on any staging table. All anon-ingest grants are dropped at teardown
-- (see kenect_staging_teardown_s141.sql) after the Phase 4 transform is verified.
-- ============================================================================

-- 1. Raw staging tables ------------------------------------------------------
create table if not exists public.kenect_contacts_raw (
  contact_id  bigint primary key,
  payload     jsonb not null,
  pulled_at   timestamptz not null default now()
);

create table if not exists public.kenect_conversations_raw (
  conversation_id bigint primary key,
  archived        boolean,
  payload         jsonb not null,
  pulled_at       timestamptz not null default now()
);

create table if not exists public.kenect_messages_raw (
  message_id      bigint primary key,
  conversation_id bigint,
  payload         jsonb not null,
  pulled_at       timestamptz not null default now()
);

create table if not exists public.kenect_attachments_raw (
  attachment_id   bigint primary key,
  message_id      bigint,
  conversation_id bigint,
  name            text,
  content_type    text,
  size            bigint,
  storage_path    text,             -- kenect-media/<conversationId>/<messageId>-<attachmentId>-<name>
  downloaded      boolean not null default false,
  payload         jsonb,
  pulled_at       timestamptz not null default now()
);

create index if not exists kenect_messages_raw_convo_idx on public.kenect_messages_raw (conversation_id);
create index if not exists kenect_attachments_raw_todo_idx on public.kenect_attachments_raw (downloaded) where downloaded = false;

alter table public.kenect_contacts_raw       enable row level security;
alter table public.kenect_conversations_raw  enable row level security;
alter table public.kenect_messages_raw       enable row level security;
alter table public.kenect_attachments_raw    enable row level security;

-- 2. TEMPORARY anon ingest policies (INSERT + UPDATE only; NO SELECT) --------
create policy kenect_ingest_ins_contacts on public.kenect_contacts_raw      for insert to anon with check (true);
create policy kenect_ingest_upd_contacts on public.kenect_contacts_raw      for update to anon using (true) with check (true);
create policy kenect_ingest_ins_convos   on public.kenect_conversations_raw for insert to anon with check (true);
create policy kenect_ingest_upd_convos   on public.kenect_conversations_raw for update to anon using (true) with check (true);
create policy kenect_ingest_ins_msgs     on public.kenect_messages_raw      for insert to anon with check (true);
create policy kenect_ingest_upd_msgs     on public.kenect_messages_raw      for update to anon using (true) with check (true);
create policy kenect_ingest_ins_atts     on public.kenect_attachments_raw   for insert to anon with check (true);
create policy kenect_ingest_upd_atts     on public.kenect_attachments_raw   for update to anon using (true) with check (true);

-- 3. Authenticated full access (permanent — the dashboard/transform reads these)
create policy kenect_auth_all_contacts on public.kenect_contacts_raw      for all to authenticated using (true) with check (true);
create policy kenect_auth_all_convos   on public.kenect_conversations_raw for all to authenticated using (true) with check (true);
create policy kenect_auth_all_msgs     on public.kenect_messages_raw      for all to authenticated using (true) with check (true);
create policy kenect_auth_all_atts     on public.kenect_attachments_raw   for all to authenticated using (true) with check (true);

grant insert, update on public.kenect_contacts_raw      to anon;
grant insert, update on public.kenect_conversations_raw to anon;
grant insert, update on public.kenect_messages_raw      to anon;
grant insert, update on public.kenect_attachments_raw   to anon;
grant all    on public.kenect_contacts_raw      to authenticated;
grant all    on public.kenect_conversations_raw to authenticated;
grant all    on public.kenect_messages_raw      to authenticated;
grant all    on public.kenect_attachments_raw   to authenticated;

-- 4. Media bucket (private) + policies --------------------------------------
insert into storage.buckets (id, name, public)
values ('kenect-media', 'kenect-media', false)
on conflict (id) do nothing;

-- TEMPORARY: anon upload during the pull (dropped at teardown)
create policy kenect_media_anon_ins on storage.objects
  for insert to anon with check (bucket_id = 'kenect-media');
-- PERMANENT: authenticated read (dashboard displays the media) + manage
create policy kenect_media_auth_read on storage.objects
  for select to authenticated using (bucket_id = 'kenect-media');
create policy kenect_media_auth_ins on storage.objects
  for insert to authenticated with check (bucket_id = 'kenect-media');
create policy kenect_media_auth_del on storage.objects
  for delete to authenticated using (bucket_id = 'kenect-media');
