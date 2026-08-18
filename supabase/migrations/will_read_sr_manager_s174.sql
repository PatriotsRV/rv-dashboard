-- ============================================================================
-- will_read_sr_manager_s174.sql — Session 174 (2026-08-17)
-- Will Read (Roland's new assistant) → Sr Manager: full provision across the
-- 3 tables per the S161 process. Roland directive S174.
--
-- Table state verified read-only via MCP this session — Will exists in NONE of
-- the three tables, so all three inserts are fresh (unlike S171/Mauricio, which
-- was a role FLIP on an existing staffer).
--
-- ROLAND'S DECISIONS (S174):
--   * user_roles     = 'Sr Manager' ONLY (Sofia's shape, NOT Ryan/Mauricio's
--                      'Manager' + 'Sr Manager' pair). 'Sr Manager' alone
--                      already satisfies is_manager_or_above() — verified this
--                      session against the live function def — so it carries
--                      every Manager power PLUS the Sr Manager powers. Adding a
--                      redundant 'Manager' row would only matter if
--                      service_silo were set (js/auth.js silo-scoped checks),
--                      and it is NULL here.
--   * staff.role     = 'sr_manager'
--   * service_silo   = NULL (cross-silo — matches Sofia, Lynn, Ryan, Kevin).
--                      He is deliberately NOT a silo notification lead.
--   * active         = true
--   * phone_number   → STEP 4 at the bottom (supplied separately)
--
-- WHY THREE TABLES (carried forward from add_john_nepomuceno_s161.sql):
--   staff       = display name, technician/assignment dropdowns, broadcast
--                 recipient lists, silo routing. Grants NO app permission.
--                 Values are lowercase snake_case (S154 gotcha — there is no
--                 'Admin' staff.role).
--   users       = the join target for user_roles. Safe to insert BEFORE Will
--                 has ever signed in: has_role() / is_manager_or_above() /
--                 is_sr_manager_or_admin() all match on
--                 (u.id = auth.uid() OR lower(u.email) = jwt email) since the
--                 S156 email-match fix, so users.id never has to equal
--                 auth.uid(). (This is the same benign id-drift noted in S156 /
--                 S171 — inert, all helpers carry the email fallback.)
--   user_roles  = the actual permission. FK targets public.users.id — resolved
--                 by email subquery below, NEVER hardcoded.
--
-- 🔴 SIGN-IN GATE — DO THIS OR HE CANNOT LOG IN (S161 Known Issue):
--   The new-user allowlist is NOT in the code. It is
--   Supabase → Authentication → Sign In / Providers → User Signups →
--   "Allow new users to sign up". It is normally OFF. Will has no auth.users
--   row, so signInWithIdToken must CREATE one and will be REFUSED with
--   "Signups not allowed for this instance".
--   Procedure — keep the window to MINUTES, with Will standing by:
--     1. Toggle ON → CLICK SAVE CHANGES (the toggle alone does nothing)
--     2. Will signs in with Google immediately
--     3. Toggle back OFF → SAVE CHANGES
--     4. Security-check the window (query at the very bottom of this file)
--
-- SCOPE NOTE: user_roles is ACCOUNT-WIDE, not per-page. 'Sr Manager' grants
--   him Sr Manager powers on index.html, messages.html, closed-ros.html,
--   worklist-report.html, checkin.html, customer-checkin.html, analytics.html
--   and guide.html simultaneously. There is no per-page role today (open TODO).
--
-- NO CODE CHANGE REQUIRED. The hardcoded ADMIN_EMAILS / MANAGER_EMAILS /
--   SR_MANAGER_EMAILS arrays were removed in Session 2; every page now reads
--   userRoles[] + _allStaff. index.html stays v1.494.
--
-- Guarded + idempotent per the S125 rule: safe to run twice; every statement
-- no-ops if the state is already correct. Run in the Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- STEP 1 — staff row -------------------------------------------------------
INSERT INTO public.staff (name, email, role, service_silo, active)
SELECT 'Will Read', 'will@patriotsrvservices.com', 'sr_manager', NULL, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.staff
    WHERE lower(email) = 'will@patriotsrvservices.com'
);

-- STEP 2 — public.users row (join target for user_roles) -------------------
-- Will signed in BEFORE this migration ran (auth.users row created
-- 2026-08-18 00:46 UTC during the S174 signup window), so we can seed
-- public.users.id with his REAL auth.uid() instead of letting the
-- uuid_generate_v4() default mint a fresh one. That deliberately keeps him OUT
-- of the S156 id-drift backlog (6 users whose public.users.id ≠ auth.uid) —
-- the drift is inert because all four RLS helpers carry the email fallback,
-- but there is no reason to create a 7th.
--
-- The subselect is the guard: if for any reason there is no auth.users row,
-- the INSERT selects nothing and no row is created — better a visible no-op
-- than a silently drifted id. (If that happens, sign Will in first, then
-- re-run — this file is idempotent.)
INSERT INTO public.users (id, email, name)
SELECT a.id, 'will@patriotsrvservices.com', 'Will Read'
FROM auth.users a
WHERE lower(a.email) = 'will@patriotsrvservices.com'
  AND NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE lower(email) = 'will@patriotsrvservices.com'
  );

-- STEP 3 — 'Sr Manager' role ----------------------------------------------
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
CROSS JOIN public.roles r
WHERE lower(u.email) = 'will@patriotsrvservices.com'
  AND r.name = 'Sr Manager'
  AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

COMMIT;

-- ── VERIFY (expect exactly ONE row) ───────────────────────────────────────
--   staff_role        = 'sr_manager'
--   service_silo      = NULL
--   active            = true
--   app_roles         = 'Sr Manager'
--   has_signed_in_yet = true   (he signed in during the S174 window)
--   id_matches_auth   = true   (STEP 2 seeded the real auth.uid — no drift)
SELECT s.name,
       s.email,
       s.role          AS staff_role,
       s.service_silo,
       s.active,
       s.phone_number,
       (SELECT u.id = a.id
          FROM public.users u, auth.users a
         WHERE lower(u.email) = lower(s.email)
           AND lower(a.email) = lower(s.email)) AS id_matches_auth,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          JOIN public.users u ON u.id = ur.user_id
         WHERE lower(u.email) = lower(s.email)) AS app_roles,
       EXISTS (SELECT 1 FROM auth.users a
                WHERE lower(a.email) = lower(s.email)) AS has_signed_in_yet
FROM public.staff s
WHERE lower(s.email) = 'will@patriotsrvservices.com';

-- ============================================================================
-- STEP 4 — PHONE  (Roland supplied 2026-08-17: 214-676-1985 → +12146761985)
-- E.164 to match every other staff row. sms_opt_in_at stamped the same way
-- Lynn + Sofia were added in S138 and John in S161. Until this runs he shows
-- DISABLED in the Broadcast recipient list and receives no assigned-owner
-- notify SMS. Safe to run in the same paste as STEPS 1-3, or separately.
-- ============================================================================

UPDATE public.staff
   SET phone_number  = '+12146761985',
       sms_opt_in_at = coalesce(sms_opt_in_at, now())
 WHERE lower(email) = 'will@patriotsrvservices.com';

-- ── VERIFY PHONE ─────────────────────────────────────────────────────────
SELECT name, email, phone_number, sms_opt_in_at
  FROM public.staff
 WHERE lower(email) = 'will@patriotsrvservices.com';

-- ============================================================================
-- POST-SIGN-IN SECURITY CHECK (run right after toggling signups back OFF).
-- While the window is open there is genuinely NO allowlist and reads on
-- conversations/messages are USING (true) — any Google account reaching the
-- page could self-create and read every customer conversation. S161's window
-- was clean (John only). Verify EVERY time.
-- Expect: will@patriotsrvservices.com and nothing else.
-- ============================================================================

-- SELECT email, created_at
--   FROM auth.users
--  WHERE created_at > now() - interval '12 hours'
--  ORDER BY created_at DESC;
