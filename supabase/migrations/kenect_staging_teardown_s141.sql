-- ============================================================================
-- Kenect staging TEARDOWN (Session 141)
--
-- RUN THIS NOW — the S141 pull is COMPLETE and verified (3,093 contacts / 3,200
-- conversations / 56,279 messages / 7,756 media files, 0 failed, md5-verified).
-- The anon key is PUBLIC (it ships in js/config.js on a public repo), so while these
-- grants exist ANYONE could insert junk rows into the kenect_* staging tables or
-- upload arbitrary files into the kenect-media bucket. No data can leak (anon never
-- had SELECT), but this is write/storage abuse surface with no remaining purpose.
--
-- 🔁 THE 2026-07-21 DELTA PULL will need the ingest path again: simply re-run
--    kenect_staging_s141.sql + kenect_att_worklist_view_s141.sql +
--    kenect_mark_downloaded_rpc_s141.sql, then run this teardown again afterwards.
--
-- Keeps: the raw staging tables, the media bucket, and all authenticated access —
-- so the Phase 4 transform (which runs authenticated / server-side) is unaffected.
-- ============================================================================

drop policy if exists kenect_ingest_ins_contacts on public.kenect_contacts_raw;
drop policy if exists kenect_ingest_upd_contacts on public.kenect_contacts_raw;
drop policy if exists kenect_ingest_ins_convos   on public.kenect_conversations_raw;
drop policy if exists kenect_ingest_upd_convos   on public.kenect_conversations_raw;
drop policy if exists kenect_ingest_ins_msgs     on public.kenect_messages_raw;
drop policy if exists kenect_ingest_upd_msgs     on public.kenect_messages_raw;
drop policy if exists kenect_ingest_ins_atts     on public.kenect_attachments_raw;
drop policy if exists kenect_ingest_upd_atts     on public.kenect_attachments_raw;

drop policy if exists kenect_media_anon_ins on storage.objects;

drop view if exists public.kenect_att_worklist;

-- Remove the S141 write-path probe rows (contact_id 999999901/999999902/999999903)
delete from public.kenect_contacts_raw where contact_id >= 999999900;

-- NOTE: do NOT `delete from storage.objects` — Supabase blocks it with the
-- storage.protect_delete() trigger ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead."), and because the SQL editor runs the whole
-- script as ONE transaction, that error rolls back the entire teardown.
-- The two 4-byte probe objects (kenect-media/_probe/test.bin, _probe/test2.bin) are
-- harmless and unreferenced by any attachment row. Delete them from the Storage UI
-- (Storage -> kenect-media -> _probe) whenever convenient, or leave them.

revoke insert, update on public.kenect_contacts_raw      from anon;
revoke insert, update on public.kenect_conversations_raw from anon;
revoke insert, update on public.kenect_messages_raw      from anon;
revoke insert, update on public.kenect_attachments_raw   from anon;

-- The mark-downloaded RPC is an anon-callable WRITE path — close it too.
-- (SECURITY DEFINER: it bypasses RLS by design, so it must not outlive the pull.)
revoke execute on function public.kenect_mark_downloaded(jsonb) from anon;

-- Verify: all three must return 0 rows.
-- select * from pg_policies where schemaname='public' and tablename like 'kenect%' and 'anon' = any(roles);
-- select * from pg_policies where schemaname='storage' and tablename='objects' and 'anon' = any(roles) and policyname like 'kenect%';
-- select has_function_privilege('anon','public.kenect_mark_downloaded(jsonb)','execute') as anon_can_still_call;
