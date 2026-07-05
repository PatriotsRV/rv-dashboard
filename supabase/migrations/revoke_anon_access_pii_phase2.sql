-- revoke_anon_access_pii_phase2.sql
-- ============================================================================
-- SECURITY phase 2 — follow-on to revoke_anon_select_pii.sql.
--
-- A pg_policies scan after phase 1 surfaced four more tables with anon grants
-- that the original finding never named:
--   insurance_scans  27 rows  anon SELECT  — insurance-document PII (HIGH)
--   roles            8 rows   anon SELECT  — role definitions (low)
--   solar_project_store 1 row anon ALL     — read+write, solar.html persistence
--   solar_settings   2 rows   anon ALL     — read+write, solar.html persistence
--
-- Decisions (2026-07-05, Roland):
--   insurance_scans + roles -> lock to authenticated (zero logged-in impact).
--   solar_project_store + solar_settings -> lock to authenticated; solar.html
--     has NO login gate, so its save/load breaks until it gets one (accepted).
--
-- Left in place intentionally (safe by design, NOT anon-exploitable):
--   scheduled_notifications: anon INSERT constrained to source='auto_dropoff_reminder'
--   service_work_orders / service_tasks: TO public writes, but every policy is
--     gated by is_sr_manager_or_admin()/is_silo_manager(), false for anon.
--
-- ⚠️ PRODUCTION RLS CHANGE. Paste into the Supabase SQL editor.
-- ============================================================================

BEGIN;

-- insurance_scans: drop anon SELECT (authenticated_full_access already covers logged-in)
DROP POLICY IF EXISTS "Anon can read insurance_scans" ON insurance_scans;

-- roles: drop anon SELECT (authenticated_read already covers logged-in)
DROP POLICY IF EXISTS "Anon can read roles" ON roles;

-- solar_project_store: replace anon+authenticated ALL with authenticated-only ALL
DROP POLICY IF EXISTS "Allow all access to solar_project_store" ON solar_project_store;
DROP POLICY IF EXISTS "solar_project_store_select_authenticated" ON solar_project_store;
DROP POLICY IF EXISTS "solar_project_store_authenticated_all" ON solar_project_store;
CREATE POLICY "solar_project_store_authenticated_all"
  ON solar_project_store FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- solar_settings: replace anon+authenticated ALL with authenticated-only ALL
DROP POLICY IF EXISTS "Allow all access to solar_settings" ON solar_settings;
DROP POLICY IF EXISTS "solar_settings_authenticated_all" ON solar_settings;
CREATE POLICY "solar_settings_authenticated_all"
  ON solar_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- POST-CHANGE (anon key): insurance_scans, roles, solar_project_store, solar_settings
-- should all return content-range */0.
