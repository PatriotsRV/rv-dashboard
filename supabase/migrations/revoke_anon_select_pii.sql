-- revoke_anon_select_pii.sql
-- ============================================================================
-- SECURITY: Remove anon-role SELECT access to customer PII + internal tables.
--
-- Root cause: the public anon key ships in index.html (js/config.js) on a public
-- GitHub repo. Ten tables carry `TO anon USING(true)` SELECT policies, so anyone
-- with the anon key can read them directly via the REST API
-- (GET /rest/v1/<table>) without loading a page or logging in.
--
-- Verified exposed to anon (2026-07-05, via anon-key REST probe):
--   repair_orders  94 rows   customer name/phone/email/address/VIN
--   notes          525 rows  free-text RO notes (customer comms, internal)
--   cashiered      140 rows  closed-RO PII (same fields as repair_orders)
--   parts          252 rows
--   users          13 rows   staff names + emails
--   user_roles     n rows    user_id -> role_id (privilege map)
--   time_logs      698 rows
--   audit_log      4149 rows full change history
--   config         2 rows    app config (insurance field defs, etc.)
--   solar_project_store  1 row
--
-- Writes are already denied to anon (INSERT/UPDATE/DELETE return 42501 / 0-row),
-- so this is a read-only exposure. Tables already correctly authenticated-only
-- and NOT touched here: service_work_orders, service_tasks, staff,
-- scheduled_notifications, woosender_leads, enhancement_requests,
-- time_off_requests, cashiered_time_logs.
--
-- Pattern mirrors the existing authenticated-only policies (swo_select /
-- staff_select_authenticated / wttp_select): SELECT TO authenticated USING(true).
--
-- SAFETY: Each block DROPs the named anon policy AND (re)asserts an authenticated
-- SELECT policy, so it is idempotent and cannot lock out the logged-in app even
-- if an authenticated policy already exists. Edge functions use the service role
-- and bypass RLS entirely — unaffected.
--
-- ⚠️ PRODUCTION RLS CHANGE. Runs in a single transaction. Paste into the Supabase
-- SQL editor. See KNOWN BREAKAGE (solar.html) at the bottom.
-- ============================================================================

BEGIN;

-- ── repair_orders ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read repair_orders" ON repair_orders;
DROP POLICY IF EXISTS "ro_select_authenticated" ON repair_orders;
CREATE POLICY "ro_select_authenticated"
  ON repair_orders FOR SELECT TO authenticated USING (true);

-- ── notes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read notes" ON notes;
DROP POLICY IF EXISTS "notes_select_authenticated" ON notes;
CREATE POLICY "notes_select_authenticated"
  ON notes FOR SELECT TO authenticated USING (true);

-- ── cashiered (closed-RO PII) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read cashiered" ON cashiered;
DROP POLICY IF EXISTS "cashiered_select_authenticated" ON cashiered;
CREATE POLICY "cashiered_select_authenticated"
  ON cashiered FOR SELECT TO authenticated USING (true);

-- ── parts ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read parts" ON parts;
DROP POLICY IF EXISTS "parts_select_authenticated" ON parts;
CREATE POLICY "parts_select_authenticated"
  ON parts FOR SELECT TO authenticated USING (true);

-- ── users (staff names + emails) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read users" ON users;
DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated"
  ON users FOR SELECT TO authenticated USING (true);

-- ── user_roles (privilege map) ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read user_roles" ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_authenticated" ON user_roles;
CREATE POLICY "user_roles_select_authenticated"
  ON user_roles FOR SELECT TO authenticated USING (true);

-- ── time_logs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read time_logs" ON time_logs;
DROP POLICY IF EXISTS "time_logs_select_authenticated" ON time_logs;
CREATE POLICY "time_logs_select_authenticated"
  ON time_logs FOR SELECT TO authenticated USING (true);

-- ── audit_log ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read audit_log" ON audit_log;
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON audit_log FOR SELECT TO authenticated USING (true);

-- ── config ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read config" ON config;
DROP POLICY IF EXISTS "config_select_authenticated" ON config;
CREATE POLICY "config_select_authenticated"
  ON config FOR SELECT TO authenticated USING (true);

-- ── solar_project_store ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read solar_project_store" ON solar_project_store;
DROP POLICY IF EXISTS "solar_project_store_select_authenticated" ON solar_project_store;
CREATE POLICY "solar_project_store_select_authenticated"
  ON solar_project_store FOR SELECT TO authenticated USING (true);

COMMIT;

-- ============================================================================
-- POST-CHANGE VERIFICATION — run with the ANON key; each should return */0 (or 401):
--   for t in repair_orders notes cashiered parts users user_roles \
--            time_logs audit_log config solar_project_store; do
--     curl -s -I -H "apikey: <ANON>" -H "Authorization: Bearer <ANON>" \
--       -H "Prefer: count=exact" -H "Range: 0-0" \
--       "https://axfejhudchdejoiwaetq.supabase.co/rest/v1/$t?select=*"; done
--   -> content-range: */0   (anon now sees nothing)
-- Then log into the dashboard (authenticated) and confirm the board still loads.
--
-- KNOWN BREAKAGE — solar.html (accepted 2026-07-05):
--   solar.html has NO login gate (storageKey 'prvs_solar_auth' is never populated)
--   so it runs as anon. Its "Link to existing RO" search (searchROs -> repair_orders
--   SELECT, solar.html:2959) stops returning results after this change. Its createRO
--   INSERT and solar_quote UPDATE are already denied to anon today, so RO-linking is
--   already partially broken. All other pages (index, customer-checkin, checkin,
--   leads, guide, worklist-report, time-off, analytics, closed-ros) read only after
--   an authenticated session — unaffected.
-- ============================================================================
