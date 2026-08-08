-- ============================================================================
-- mauricio_sr_manager_s171.sql — Session 171 (2026-08-08)
-- Mauricio Tellez → Service Manager: full sr_manager grant (Roland directive,
-- decided S170 Arc 3; executed S171).
--
-- 3-table process per S161. Table state verified read-only via MCP this session:
--   staff:        role='manager', service_silo='repair'  → role flips; SILO KEPT
--                 ('repair' stays — Roland call S171: he remains a repair silo
--                 lead for notifications while gaining sr_manager powers)
--   public.users: row EXISTS (id 50153532-… vs auth uid da14d902-… — the S156
--                 id-drift; INERT: all 4 RLS helpers verified to carry the
--                 email fallback). NO CHANGE to this table.
--   user_roles:   has Manager only → ADD 'Sr Manager' (Ryan precedent: keeps
--                 Manager alongside). FK targets public.users.id — resolved by
--                 email subquery below, NOT hardcoded.
--
-- Guarded + idempotent per the S125 rule: safe to run twice; every statement
-- no-ops if the state is already correct. Run in the Supabase SQL editor.
-- ============================================================================

BEGIN;

-- 1. staff: manager → sr_manager (service_silo deliberately untouched)
UPDATE staff
SET role = 'sr_manager'
WHERE email = 'mauricio@patriotsrvservices.com'
  AND role = 'manager';

-- 2. user_roles: add 'Sr Manager' (keep the existing Manager row)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
JOIN roles r ON r.name = 'Sr Manager'
WHERE u.email = 'mauricio@patriotsrvservices.com'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT — expect exactly these results):
--
-- V1: staff row — expect role='sr_manager', service_silo='repair'
--   SELECT name, role, service_silo FROM staff
--   WHERE email='mauricio@patriotsrvservices.com';
--
-- V2: roles — expect TWO rows: 'Manager' and 'Sr Manager'
--   SELECT r.name FROM user_roles ur
--   JOIN public.users u ON u.id = ur.user_id
--   JOIN roles r ON r.id = ur.role_id
--   WHERE u.email='mauricio@patriotsrvservices.com' ORDER BY r.name;
--
-- V3: server-side gate — expect is_sr=true (run as any session; helper is
--     SECURITY DEFINER but keys on the JWT, so the REAL proof is Mauricio's
--     own live retest — see the session TODO)
-- ============================================================================
