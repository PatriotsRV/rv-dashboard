-- ============================================================================
-- add_cooper_public_users_s163.sql
-- Session 163 (2026-07-29) — give Cooper Cihak his missing public.users row.
--
-- WHY THIS EXISTS
--   Cooper reported a "logged in, v1.484, 0 ROs" dashboard. That symptom was a
--   STALE SESSION wedge (S146 class) and is fixed in code this session — it is
--   NOT caused by anything in this file. But the investigation turned up a
--   separate, quieter gap: Cooper has a `staff` row and an `auth.users` row,
--   and NO `public.users` row at all.
--
--   Consequence (the S161 three-tables gotcha): reads are unaffected, but any
--   role-gated WRITE resolves through helpers that join public.users, so it
--   returns 0 rows and reports SUCCESS (the S141 "204 does not mean rows
--   changed" trap). Nothing errors. Nothing saves.
--
-- WHY upsertUser() DID NOT ALREADY DO THIS
--   js/auth.js upsertUser() upserts into public.users after sign-in and
--   swallows failures in a bare `catch { console.warn }`. Cooper has signed in
--   many times (auth.users created 2026-03-19), so that call has been failing
--   silently for months — almost certainly an RLS INSERT block. CONFIRM the
--   public.users INSERT policy before assuming this migration is the whole fix;
--   otherwise the row is restored here and drifts away again for the next hire.
--   Tracked as a TODO in CLAUDE_CONTEXT.md.
--
-- SCOPE — DELIBERATELY NARROW
--   * public.users row ONLY. No user_roles grant.
--   * Cooper stays a TECH. `staff.role` is already 'tech' and grants nothing;
--     adding no user_roles row means no Manager/Admin powers anywhere. This is
--     the S161 warning honored in advance: user_roles is ACCOUNT-WIDE, so a
--     grant here would hand him manager powers on every page, not just the one
--     he needs. Do not "helpfully" add one.
--
-- THE ID IS PINNED ON PURPOSE
--   We insert his REAL auth uid (16f713b8-f487-4bd0-ad34-2fde5b4ced2d, verified
--   read-only against auth.users this session) rather than letting the default
--   generate one. Six users already have a public.users.id that does not match
--   their auth.uid() — the drift the S156 email-match fix works AROUND but did
--   not repair (see the reconcile TODO). Letting this row generate a fresh uuid
--   would make Cooper the seventh. He has already signed in, so his uid is
--   known; there is no reason to add new drift.
--
-- Idempotent — safe to re-run. Matches on email OR id so it cannot double-insert
-- if a row was added by hand in between.
-- ============================================================================

begin;

insert into public.users (id, email, name)
select '16f713b8-f487-4bd0-ad34-2fde5b4ced2d'::uuid,
       'cooper@patriotsrvservices.com',
       'Cooper Cihak'
where not exists (
    select 1 from public.users
    where lower(email) = 'cooper@patriotsrvservices.com'
       or id = '16f713b8-f487-4bd0-ad34-2fde5b4ced2d'::uuid
);

commit;

-- ── VERIFY 1 — the row, and that the id matches auth.uid() (no new drift) ──
-- Expect: one row, id_matches_auth_uid = true, app_roles = NULL (tech, by design).
select u.id::text                                as public_users_id,
       a.id::text                                as auth_uid,
       (u.id = a.id)                             as id_matches_auth_uid,
       u.email,
       u.name,
       s.role                                    as staff_role,
       s.active                                  as staff_active,
       (select string_agg(r.name, ', ' order by r.name)
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
         where ur.user_id = u.id)                as app_roles
  from public.users u
  left join auth.users a  on lower(a.email) = lower(u.email)
  left join public.staff s on lower(s.email) = lower(u.email)
 where lower(u.email) = 'cooper@patriotsrvservices.com';

-- ── VERIFY 2 — who ELSE is missing a public.users row? ────────────────────
-- Cooper was found by accident, which means nobody has ever checked the set.
-- Run this and paste the result: every active staff member with an auth.users
-- login but no public.users row is silently in the same state Cooper was.
-- Expect ZERO rows after this migration IF Cooper was the only one.
select s.name,
       s.email,
       s.role as staff_role,
       (select max(a.last_sign_in_at) from auth.users a
         where lower(a.email) = lower(s.email)) as last_sign_in_at
  from public.staff s
 where s.active
   and exists (select 1 from auth.users a  where lower(a.email) = lower(s.email))
   and not exists (select 1 from public.users u where lower(u.email) = lower(s.email))
 order by s.name;

-- ── VERIFY 3 — is the public.users INSERT policy the real root cause? ─────
-- If this returns no INSERT policy granting `authenticated`, then upsertUser()
-- cannot ever succeed from the browser and EVERY future hire needs a manual
-- migration like this one. That is the thing to fix properly.
select policyname, cmd, roles::text, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'users'
 order by cmd, policyname;
