-- ============================================================================
-- rls_role_helpers_email_match_s156.sql
-- Session 156 (2026-07-23)
--
-- ROOT CAUSE: 5 auth users (andrew, mauricio, ryan, solar, tipton) have a
-- public.users.id that does NOT match their auth.users id, so every RLS
-- helper keyed on users.id = auth.uid() silently returns FALSE for them.
-- Symptom (Mauricio, messages.html): conversations UPDATE no-ops silently
-- (USING false -> 0 rows, no error) and the conversation_events INSERT
-- throws "new row violates row-level security policy".
-- Blocked for those 5: assign/unassign, close/reopen, edit customer name,
-- Add Notes, review requests, and (Ryan/solar) all is_sr_manager_or_admin
-- gated WO writes.
--
-- FIX: match users by id OR by the verified JWT email (belt and braces).
-- Precedent: is_silo_manager() already matches staff by auth.jwt()->>'email'.
-- All statements are CREATE OR REPLACE — idempotent, no data touched,
-- no policies dropped. Role-name lists preserved exactly.
--
-- FUTURE CLEANUP (separate TODO): reconcile public.users.id to auth.uid
-- for the 5 users (FK ripple: user_roles.user_id, audit_log.user_id).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r       ON r.id = ur.role_id
    WHERE (u.id = auth.uid()
           OR lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    AND r.name IN ('Manager', 'Sr Manager', 'Admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_sr_manager_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r       ON r.id = ur.role_id
    WHERE (u.id = auth.uid()
           OR lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    AND r.name IN ('Sr Manager', 'Admin')
  );
$function$;

-- has_role previously joined user_roles directly on auth.uid();
-- now routes through users so the email fallback applies.
CREATE OR REPLACE FUNCTION public.has_role(role_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r       ON r.id = ur.role_id
    WHERE (u.id = auth.uid()
           OR lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      AND r.name = role_name
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_insurance_wo_writer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE (u.id = auth.uid()
           OR lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    AND r.name = 'Insurance WO Writer'
  );
$function$;

COMMIT;

-- ============================================================================
-- VERIFICATION (run after COMMIT):
-- 1. The 5 mismatched users still show ids_match=false (data untouched):
--    SELECT au.email, (au.id = pu.id) AS ids_match
--    FROM auth.users au JOIN public.users pu
--      ON lower(pu.email) = lower(au.email)
--    ORDER BY au.email;
-- 2. Definitive test: Mauricio hard-refreshes messages.html and reopens the
--    conversation — expect the "Conversation reopened." toast, a
--    conversation_events row (event='reopened'), and conversations.status
--    actually flipping to 'open'.
-- ============================================================================
