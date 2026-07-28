-- ============================================================================
-- add_john_nepomuceno_s161.sql
-- Session 161 (2026-07-28) — provision John Nepomuceno for the Messages board.
--
-- Roland's decisions (S161):
--   * Needs to REPLY, not just read  -> user_roles 'Manager'
--   * Add to staff, active            -> name display, assignment dropdown, broadcast
--   * staff.role = 'manager', service_silo = NULL (cross-silo)
--   * phone_number  -> supplied separately, see STEP 4 at the bottom
--
-- WHY THREE TABLES:
--   staff       = display name, assignment dropdown, broadcast recipient lists.
--                 Does NOT grant any app permission. Values are lowercase
--                 snake_case (S154 gotcha — there is no 'Admin' staff.role).
--   users       = the join target for user_roles. Safe to insert BEFORE John has
--                 ever signed in: has_role()/is_manager_or_above() match on
--                 (u.id = auth.uid() OR lower(u.email) = jwt email) since the
--                 S156 email-match fix, so the id never has to equal auth.uid().
--   user_roles  = the actual permission. 'Manager' satisfies is_manager_or_above(),
--                 which is what gates every write on messages.html (reply, assign,
--                 notes, review request, broadcast) via RLS on conversations /
--                 conversation_events.
--
-- SCOPE WARNING (told to Roland S161): user_roles is ACCOUNT-WIDE, not per-page.
--   'Manager' also grants manager powers on index.html. There is no
--   Messages-only role today; building one is its own TODO.
--
-- Idempotent — safe to re-run.
-- ============================================================================

begin;

-- STEP 1 — staff row -----------------------------------------------------
insert into public.staff (name, email, role, service_silo, active)
select 'John Nepomuceno', 'john@patriotsrvservices.com', 'manager', null, true
where not exists (
    select 1 from public.staff
    where lower(email) = 'john@patriotsrvservices.com'
);

-- STEP 2 — public.users row (join target for user_roles) ------------------
insert into public.users (email, name)
select 'john@patriotsrvservices.com', 'John Nepomuceno'
where not exists (
    select 1 from public.users
    where lower(email) = 'john@patriotsrvservices.com'
);

-- STEP 3 — Manager role ---------------------------------------------------
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u
cross join public.roles r
where lower(u.email) = 'john@patriotsrvservices.com'
  and r.name = 'Manager'
  and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = u.id and ur.role_id = r.id
  );

commit;

-- ── VERIFY (should return exactly one row, app_roles = 'Manager') ─────────
select s.name,
       s.email,
       s.role          as staff_role,
       s.service_silo,
       s.active,
       s.phone_number,
       (select string_agg(r.name, ', ' order by r.name)
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          join public.users u on u.id = ur.user_id
         where lower(u.email) = lower(s.email)) as app_roles,
       exists (select 1 from auth.users a
                where lower(a.email) = lower(s.email)) as has_signed_in_yet
from public.staff s
where lower(s.email) = 'john@patriotsrvservices.com';

-- ============================================================================
-- STEP 4 — PHONE  (Roland supplied 2026-07-28: 214-494-0794 -> +12144940794)
-- E.164 to match every other staff row. sms_opt_in_at stamped the same way
-- Lynn + Sofia were added in S138. Until this runs he shows DISABLED in the
-- Broadcast recipient list.
-- Safe to run in the same paste as STEPS 1-3, or separately.
-- ============================================================================

update public.staff
   set phone_number  = '+12144940794',
       sms_opt_in_at = coalesce(sms_opt_in_at, now())
 where lower(email) = 'john@patriotsrvservices.com';

-- ── VERIFY PHONE ─────────────────────────────────────────────────────────
select name, email, phone_number, sms_opt_in_at
  from public.staff
 where lower(email) = 'john@patriotsrvservices.com';
