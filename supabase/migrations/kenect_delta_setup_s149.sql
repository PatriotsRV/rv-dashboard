-- ============================================================================
-- KENECT DELTA PULL SETUP (Session 149, 2026-07-21)
--
-- Re-opens the S141 anon ingest path for the pre-shutdown delta pull
-- (messages/conversations/contacts landed since the 7/15 pull; Kenect access
-- ends 2026-07-24; Textly went live 7/21 so Kenect send/receive is already dead).
--
-- WHY NOT just re-run kenect_staging_s141.sql: its CREATE POLICY statements for
-- the PERMANENT authenticated policies (kenect_auth_all_*, kenect_media_auth_*)
-- are not IF NOT EXISTS — they still exist from S141, so the duplicate error
-- would roll back the whole script (SQL editor = one transaction).
-- This file re-creates ONLY the temporary anon pieces, idempotently.
--
-- Verified pre-state (S149, via read-only MCP):
--   staging tables intact: 3,093 contacts / 3,200 convos / 56,279 msgs /
--   8,396 atts (7,756 downloaded; the 640 remaining are video/vcard/audio —
--   all excluded by the worklist view filter, so nothing old resurfaces).
--   Anon policies: 0 (teardown ran). RPC exists; anon EXECUTE revoked.
--
-- AFTER THE PULL: re-run kenect_staging_teardown_s141.sql (unchanged), then
-- kenect_phase4_transform_s142.sql (idempotent; folds delta into live inbox).
-- ============================================================================

-- 1. Anon ingest policies (INSERT + UPDATE only; NO SELECT — same as S141)
drop policy if exists kenect_ingest_ins_contacts on public.kenect_contacts_raw;
drop policy if exists kenect_ingest_upd_contacts on public.kenect_contacts_raw;
drop policy if exists kenect_ingest_ins_convos   on public.kenect_conversations_raw;
drop policy if exists kenect_ingest_upd_convos   on public.kenect_conversations_raw;
drop policy if exists kenect_ingest_ins_msgs     on public.kenect_messages_raw;
drop policy if exists kenect_ingest_upd_msgs     on public.kenect_messages_raw;
drop policy if exists kenect_ingest_ins_atts     on public.kenect_attachments_raw;
drop policy if exists kenect_ingest_upd_atts     on public.kenect_attachments_raw;

create policy kenect_ingest_ins_contacts on public.kenect_contacts_raw      for insert to anon with check (true);
create policy kenect_ingest_upd_contacts on public.kenect_contacts_raw      for update to anon using (true) with check (true);
create policy kenect_ingest_ins_convos   on public.kenect_conversations_raw for insert to anon with check (true);
create policy kenect_ingest_upd_convos   on public.kenect_conversations_raw for update to anon using (true) with check (true);
create policy kenect_ingest_ins_msgs     on public.kenect_messages_raw      for insert to anon with check (true);
create policy kenect_ingest_upd_msgs     on public.kenect_messages_raw      for update to anon using (true) with check (true);
create policy kenect_ingest_ins_atts     on public.kenect_attachments_raw   for insert to anon with check (true);
create policy kenect_ingest_upd_atts     on public.kenect_attachments_raw   for update to anon using (true) with check (true);

grant insert, update on public.kenect_contacts_raw      to anon;
grant insert, update on public.kenect_conversations_raw to anon;
grant insert, update on public.kenect_messages_raw      to anon;
grant insert, update on public.kenect_attachments_raw   to anon;

-- 2. Anon upload to the media bucket (temporary; dropped at teardown)
drop policy if exists kenect_media_anon_ins on storage.objects;
create policy kenect_media_anon_ins on storage.objects
  for insert to anon with check (bucket_id = 'kenect-media');

-- 3. Work-list view (ids + mime only; image/PDF only — video stays excluded)
create or replace view public.kenect_att_worklist
with (security_invoker = off) as
  select attachment_id, message_id, conversation_id, content_type, size, downloaded
  from public.kenect_attachments_raw
  where downloaded = false
    and (content_type like 'image/%' or content_type = 'application/pdf');

grant select on public.kenect_att_worklist to anon, authenticated;

-- 4. Re-open the mark-downloaded RPC for anon (SECURITY DEFINER; re-revoked at teardown)
grant execute on function public.kenect_mark_downloaded(jsonb) to anon;

-- ── VERIFY (all three should now be non-zero / true) ───────────────────────
-- select count(*) from pg_policies where tablename like 'kenect%' and 'anon' = any(roles);              -- 8
-- select count(*) from pg_policies where schemaname='storage' and policyname='kenect_media_anon_ins';   -- 1
-- select has_function_privilege('anon','public.kenect_mark_downloaded(jsonb)','execute');               -- true
