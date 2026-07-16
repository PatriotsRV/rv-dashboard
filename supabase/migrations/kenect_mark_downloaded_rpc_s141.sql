-- ============================================================================
-- Kenect Phase 3 — mark-downloaded RPC + reconcile (Session 141)
--
-- BUG THIS FIXES: the extractor's PATCH .../kenect_attachments_raw?attachment_id=eq.N
-- returned HTTP 204 but affected ZERO rows (verified: Content-Range "*/0").
-- PostgreSQL requires SELECT to LOCATE rows for `UPDATE ... WHERE`, so the SELECT
-- policies apply — and anon intentionally has NO SELECT here (staging holds message
-- bodies + phone numbers). Result: uploads succeeded, but nothing was ever marked
-- downloaded => the worklist never drains and every file re-downloads forever.
-- (Same root cause as PostgREST upsert failing: anything that must READ first is a
-- no-op or an error for anon. 204 does NOT mean "rows changed".)
--
-- FIX: a narrow SECURITY DEFINER RPC that runs as owner (bypassing base-table RLS)
-- and can ONLY set downloaded/storage_path. No SELECT is granted to anon anywhere.
-- ============================================================================

create or replace function public.kenect_mark_downloaded(items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- items: [{"attachment_id":123,"storage_path":"52765630/379000675-44263837.pdf"}, ...]
  with payload as (
    select (e->>'attachment_id')::bigint as aid,
           (e->>'storage_path')::text   as spath
    from jsonb_array_elements(items) e
  ), upd as (
    update public.kenect_attachments_raw a
    set downloaded = true,
        storage_path = p.spath
    from payload p
    where a.attachment_id = p.aid
    returning 1
  )
  select count(*) into n from upd;
  return n;
end;
$$;

revoke all on function public.kenect_mark_downloaded(jsonb) from public;
grant execute on function public.kenect_mark_downloaded(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RECONCILE: ~1,486 files were already uploaded to Storage before this bug was
-- caught, but never marked. Match them by storage object name so they are NOT
-- re-downloaded from Kenect (saves ~2+ GB of redundant transfer against a
-- 2026-07-24 deadline). Path shape: {conversation_id}/{message_id}-{attachment_id}.{ext}
-- ---------------------------------------------------------------------------
update public.kenect_attachments_raw a
set downloaded = true,
    storage_path = o.name
from storage.objects o
where o.bucket_id = 'kenect-media'
  and o.name ~ '^[0-9]+/[0-9]+-[0-9]+\.'
  and a.attachment_id = (regexp_match(o.name, '^[0-9]+/[0-9]+-([0-9]+)\.'))[1]::bigint
  and a.downloaded = false;

-- Clear the diagnostic marker written during debugging (it never applied, but be safe)
update public.kenect_attachments_raw
set storage_path = null
where storage_path = 'DIAGNOSTIC';
