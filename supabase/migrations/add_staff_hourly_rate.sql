-- ============================================================
-- GH#31 (Session 52) — Staff hourly rate for labor-cost rollup
-- ============================================================
-- Adds hourly_rate NUMERIC(6,2) to staff table.
-- Used by worklist-report.html v1.3 to compute per-RO / per-silo /
-- per-manager / grand-total labor cost = hours × rate summed over
-- all time_logs for ROs on active Manager Work Lists.
--
-- Rates provided by Roland 2026-04-19 (Session 52).
-- Roland Shepard, Kevin McHenry, and Ryan's testing accounts are
-- seeded at 0.00 so their hours don't pollute labor totals.
-- Lynn is intentionally NOT in staff table (admin-only, doesn't clock).
--
-- Safe to re-run: guarded by IF NOT EXISTS / ON CONFLICT idempotency.
-- ============================================================

-- 1. Add hourly_rate column (NUMERIC(6,2) → supports up to $9999.99, 2 decimals)
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(6,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN staff.hourly_rate IS
  'Hourly labor rate in USD. Used by worklist-report.html for labor-cost rollup. 0.00 = excluded from labor cost (tester/admin).';

-- 2. Seed rates per staffer. Excluded testers (Roland, Kevin) stay at 0.
UPDATE staff SET hourly_rate = 40.00 WHERE lower(email) = 'ryan@patriotsrvservices.com';      -- Ryan Dillon — Sr Manager
UPDATE staff SET hourly_rate =  0.00 WHERE lower(email) = 'kevin@patriotsrvservices.com';     -- Kevin McHenry — tester
UPDATE staff SET hourly_rate =  0.00 WHERE lower(email) = 'roland@patriotsrvservices.com';    -- Roland Shepard — tester/owner

UPDATE staff SET hourly_rate = 24.00 WHERE lower(email) = 'mauricio@patriotsrvservices.com';  -- Mauricio Tellez — Manager (Repair)
UPDATE staff SET hourly_rate = 30.00 WHERE lower(email) = 'jason@patriotsrvservices.com';     -- Jason Rubin — Manager (Repair)
UPDATE staff SET hourly_rate = 27.00 WHERE lower(email) = 'andrew@patriotsrvservices.com';    -- Andrew Page — Manager (Vroom)
UPDATE staff SET hourly_rate = 27.00 WHERE lower(email) = 'solar@patriotsrvservices.com';     -- Riley Scott — Manager (Solar)

UPDATE staff SET hourly_rate = 33.00 WHERE lower(email) = 'bobby@patriotsrvservices.com';     -- Bobby Thatcher — Parts Manager
UPDATE staff SET hourly_rate = 17.00 WHERE lower(email) = 'brandon@patriotsrvservices.com';   -- Brandon Dillon — Parts Manager

UPDATE staff SET hourly_rate = 25.00 WHERE lower(email) = 'nik@patriotsrvservices.com';       -- Nik Polizzo — Tech
UPDATE staff SET hourly_rate = 33.00 WHERE lower(email) = 'ignacio@patriotsrvservices.com';   -- Ignacio Ochoa — Tech
UPDATE staff SET hourly_rate = 17.00 WHERE lower(email) = 'tipton@patriotsrvservices.com';    -- Tipton Scott — Tech
UPDATE staff SET hourly_rate = 25.00 WHERE lower(email) = 'rod@patriotsrvservices.com';       -- Rod Wimbles — Tech
UPDATE staff SET hourly_rate = 25.00 WHERE lower(email) = 'zak@patriotsrvservices.com';       -- Zak Wimbles — Tech
UPDATE staff SET hourly_rate = 15.00 WHERE lower(email) = 'travis@patriotsrvservices.com';    -- Travis Wimbles — Tech
UPDATE staff SET hourly_rate = 17.00 WHERE lower(email) = 'cooper@patriotsrvservices.com';    -- Cooper Cihak — Tech
UPDATE staff SET hourly_rate = 27.00 WHERE lower(email) = 'rudy@patriotsrvservices.com';      -- Rudy Juarez — Tech
UPDATE staff SET hourly_rate = 25.00 WHERE lower(email) = 'tommy@patriotsrvservices.com';     -- Tommy Belew — Tech

-- 3. Verify — paste result into chat after running
SELECT email, name, role, service_silo, hourly_rate
FROM staff
ORDER BY
  CASE role
    WHEN 'sr_manager' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'parts_manager' THEN 3
    WHEN 'tech' THEN 4
    ELSE 5
  END,
  name;
