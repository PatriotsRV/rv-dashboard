-- ============================================================================
-- Kenect Phase 3 media work list (Session 141)
-- The browser extractor needs to know WHICH attachments still need downloading,
-- but anon has no SELECT on kenect_attachments_raw (it holds file names alongside
-- message/contact linkage). This view exposes ONLY non-sensitive routing columns:
-- ids + mime type + downloaded flag. No file names, no message bodies, no phones.
--
-- Scope (Roland, S141): PDFs + images only — video is excluded at the view level,
-- so the extractor physically cannot pull the ~78 video files (~50 GB).
-- TEMPORARY: dropped in kenect_staging_teardown_s141.sql.
-- ============================================================================

create or replace view public.kenect_att_worklist
with (security_invoker = off) as
  select attachment_id, message_id, conversation_id, content_type, size, downloaded
  from public.kenect_attachments_raw
  where downloaded = false
    and (content_type like 'image/%' or content_type = 'application/pdf');

grant select on public.kenect_att_worklist to anon, authenticated;
