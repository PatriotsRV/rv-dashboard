-- ============================================================================
-- will_read_admin_s187.sql — Session 187 (2026-09-03)
-- Will Read (Roland's assistant) — Sr Manager → ADMIN. Roland directive S187:
-- "add Will to the Admin permissions role so he can see everything in the RO DB
-- and the other various pages."
--
-- Supersedes the role half of will_read_sr_manager_s174.sql (S174). His staff
-- row, phone, and silo from that migration are UNCHANGED and still correct.
--
-- ── LIVE STATE VERIFIED READ-ONLY VIA MCP THIS SESSION ─────────────────────
--   staff:      Will Read · will@patriotsrvservices.com · role='sr_manager'
--               · service_silo=NULL · active=true          (id 77b53cf7…)
--   users:      e18ac442-406b-4919-9f97-eee704c72727       (seeded S174 from
--               his real auth.uid — NOT in the S156 id-drift backlog)
--   user_roles: 'Sr Manager' (assigned 2026-08-18 00:48 UTC)
--
-- ── THE TARGET SHAPE — copied from the two EXISTING Admins, not invented ───
-- Roland and Lynn are the only Admins today. BOTH are:
--       user_roles = 'Admin'  (that row ALONE — no 'Sr Manager' row)
--       staff.role = 'sr_manager'
-- So this migration makes Will byte-identical to them: SWAP the user_roles row,
-- leave staff alone.
--
-- 🔴 THERE IS NO 'admin' VALUE IN staff.role — DO NOT ADD ONE (S154 gotcha,
--    re-verified S187 against pg_constraint per the S185 rule):
--      staff_role_check CHECK (role = ANY (ARRAY['tech','manager',
--                                                'sr_manager','parts_manager']))
--    `staff` is display/routing only and grants NO app permission. Permission
--    lives ENTIRELY in user_roles. Writing 'admin' there throws 23514.
--
-- ── WHY DELETING THE 'Sr Manager' ROW LOSES HIM NOTHING ────────────────────
-- Two independent proofs, both checked live this session:
--   1. DB layer — the RLS helpers accept Admin directly:
--        is_manager_or_above()   → r.name IN ('Manager','Sr Manager','Admin')
--        is_sr_manager_or_admin()→ r.name IN ('Sr Manager','Admin')
--      Admin satisfies both on its own.
--   2. Client layer — loadUserRoles() (js/auth.js) merges TWO sources, and the
--      staff-table merge runs UNCONDITIONALLY (the v1.416 Lynn-fix hardening):
--        staffRoleMap['sr_manager'] = 'Sr Manager'  → pushed into userRoles
--      So at runtime Will lands on window.userRoles = ['Admin','Sr Manager'] —
--      the SAME array Roland and Lynn get. Every gate in the app is written
--      `isAdmin() || hasRole(...)`, so Admin short-circuits regardless.
--   Belt and braces: even if the user_roles read failed entirely, the staff
--   merge alone still returns 'Sr Manager' — he cannot end up locked out.
--
-- INSERT runs BEFORE DELETE inside one transaction, so there is no instant at
-- which Will holds no role.
--
-- ── CHECKED AND UNAFFECTED ────────────────────────────────────────────────
--   * worklist-report.html "filter out pure Admins" (line ~2365) reads the
--     STAFF table, not user_roles — Will keeps his staff row, so he keeps
--     appearing as an operational Sr Manager on the report. No change.
--   * isInsuranceWoWriterOnly() — N/A, he holds no 'Insurance WO Writer' role.
--   * tasks.html ASSIGN_ROLES includes 'Admin' — he keeps task-assign rights.
--
-- ── SCOPE — READ THIS BEFORE RUNNING ──────────────────────────────────────
-- user_roles is ACCOUNT-WIDE, not per-page (open TODO since S161). 'Admin'
-- grants Will the top tier SIMULTANEOUSLY on index.html, messages.html,
-- closed-ros.html, worklist-report.html, checkin.html, customer-checkin.html,
-- tasks.html, analytics.html and guide.html. That includes everything above
-- the Sr Manager tier: RO delete, cash-out, the Admin-only panels, all manager
-- work lists, full P&L / analytics, and every customer conversation. This is
-- what Roland asked for; it is recorded here so the blast radius is explicit
-- and not a surprise later.
--
-- NO CODE CHANGE. NO RELEASE. index.html stays v1.502.
-- Guarded + idempotent per the S125 rule — safe to run twice.
-- Run in the Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- STEP 1 — grant 'Admin' (no-ops if he already has it) ---------------------
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
CROSS JOIN public.roles r
WHERE lower(u.email) = 'will@patriotsrvservices.com'
  AND r.name = 'Admin'
  AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

-- STEP 2 — drop the now-redundant 'Sr Manager' row -------------------------
-- Guarded on the Admin row EXISTING first, so a failed STEP 1 can never leave
-- him with no user_roles row at all.
DELETE FROM public.user_roles ur
USING public.users u, public.roles r
WHERE ur.user_id = u.id
  AND ur.role_id = r.id
  AND lower(u.email) = 'will@patriotsrvservices.com'
  AND r.name = 'Sr Manager'
  AND EXISTS (
      SELECT 1
      FROM public.user_roles ur2
      JOIN public.roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = u.id AND r2.name = 'Admin'
  );

COMMIT;

-- ── VERIFY (expect exactly ONE row) ───────────────────────────────────────
--   staff_role      = 'sr_manager'   ← unchanged, correct, do not "fix"
--   service_silo    = NULL
--   active          = true
--   app_roles       = 'Admin'        ← the whole point of this migration
--   id_matches_auth = true
SELECT s.name,
       s.email,
       s.role         AS staff_role,
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
         WHERE lower(u.email) = lower(s.email)) AS app_roles
FROM public.staff s
WHERE lower(s.email) = 'will@patriotsrvservices.com';

-- ── VERIFY THE SHAPE MATCHES THE OTHER ADMINS ─────────────────────────────
-- Expect THREE rows — lynn@, roland@, will@ — all reading app_roles='Admin'
-- and staff_role='sr_manager'. If Will's line differs from the other two,
-- something above did not take.
SELECT u.email,
       string_agg(r.name, ', ' ORDER BY r.name) AS app_roles,
       s.role AS staff_role,
       s.active
FROM public.users u
JOIN public.user_roles ur ON ur.user_id = u.id
JOIN public.roles r       ON r.id = ur.role_id
LEFT JOIN public.staff s  ON lower(s.email) = lower(u.email)
GROUP BY u.email, s.role, s.active
HAVING string_agg(r.name, ', ' ORDER BY r.name) LIKE '%Admin%'
ORDER BY u.email;

-- ============================================================================
-- AFTER RUNNING: Will must SIGN OUT AND BACK IN.
-- loadUserRoles() runs once at page load and caches into window.userRoles —
-- a live tab will keep showing Sr Manager until it re-authenticates. A hard
-- refresh is NOT enough if the session is still warm; sign out, sign in,
-- then confirm the boot console prints:  ✅ User roles: ['Admin','Sr Manager']
-- ============================================================================
