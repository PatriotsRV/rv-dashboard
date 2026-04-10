-- ============================================================
-- PRVS Staff Table Migration
-- Run in Supabase SQL Editor
-- Created: 2026-03-30
-- ============================================================
-- PURPOSE: Single source of truth for all PRVS personnel.
-- Replaces hardcoded TECH_EMAILS / MANAGER_EMAILS arrays in index.html.
-- Used by: RO "Technician Assigned" field, Work Order task assignment (GH#5).
--
-- ROLES:
--   tech            — field technicians; see only their assigned tasks
--   manager         — Service Silo or dept manager (silo set per person)
--   sr_manager      — cross-silo access; can build/edit any silo's WO
--   parts_manager   — Parts & Insurance dept; not assigned to service WOs
--   (Admin role in user_roles table auto-grants sr_manager access in the app)
--
-- SERVICE SILOS (service work orders):
--   repair | vroom | solar | roof | paint_body
--
-- DEPT SILOS (non-service staff — appear in staff table but not WO dropdowns):
--   parts_insurance
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS staff (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  role          TEXT        NOT NULL
                CHECK (role IN ('tech', 'manager', 'sr_manager', 'parts_manager')),
  service_silo  TEXT
                CHECK (service_silo IN (
                  'repair', 'vroom', 'solar', 'roof', 'paint_body',
                  'parts_insurance'
                )),
  active        BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- All authenticated users can read the staff list (needed for dropdowns)
CREATE POLICY "staff_select_authenticated"
  ON staff FOR SELECT
  TO authenticated
  USING (true);

-- Only Admins can insert / update / delete staff records
CREATE POLICY "staff_write_admin"
  ON staff FOR ALL
  TO authenticated
  USING (has_role('Admin'))
  WITH CHECK (has_role('Admin'));

-- ============================================================
-- 4. Seed data
-- ============================================================
INSERT INTO staff (name, email, role, service_silo) VALUES

  -- Sr. Manager — cross-silo (covers all 5 service silos including Roof + Paint & Body)
  -- Ryan is the acting manager for Roof and Paint & Body until dedicated managers are hired
  ('Ryan Dillon',     'ryan@patriotsrvservices.com',     'sr_manager',     NULL),
  ('Sofia Pedroza',   'sofia@patriotsrvservices.com',    'sr_manager',     NULL),

  -- Repair Managers
  ('Mauricio Tellez', 'mauricio@patriotsrvservices.com', 'manager',        'repair'),
  ('Jason Rubin',     'jason@patriotsrvservices.com',    'manager',        'repair'),

  -- Vroom Manager
  ('Andrew Page',     'andrew@patriotsrvservices.com',   'manager',        'vroom'),

  -- Solar Manager
  ('Riley Scott',     'riley@patriotsrvservices.com',    'manager',        'solar'),

  -- Parts & Insurance Managers (office staff — not assigned to service WOs)
  ('Bobby Thatcher',  'bobby@patriotsrvservices.com',    'parts_manager',  'parts_insurance'),
  ('Brandon Dillon',  'brandon@patriotsrvservices.com',  'parts_manager',  'parts_insurance'),

  -- Technicians (silo = NULL; can be assigned to any service task)
  ('Nik Polizzo',     'nik@patriotsrvservices.com',      'tech',           NULL),
  ('Ignacio Ochoa',   'ignacio@patriotsrvservices.com',  'tech',           NULL),
  ('Tipton Scott',    'tipton@patriotsrvservices.com',   'tech',           NULL),
  ('Rod Wimbles',     'rod@patriotsrvservices.com',      'tech',           NULL),
  ('Zak Wimbles',     'zak@patriotsrvservices.com',      'tech',           NULL),
  ('Travis Wimbles',  'travis@patriotsrvservices.com',   'tech',           NULL),
  ('Cooper Cihak',    'cooper@patriotsrvservices.com',   'tech',           NULL),
  ('Rudy Juarez',     'rudy@patriotsrvservices.com',     'tech',           NULL),
  ('Tommy Belew',     'tommy@patriotsrvservices.com',    'tech',           NULL)

ON CONFLICT (email) DO UPDATE SET
  name         = EXCLUDED.name,
  role         = EXCLUDED.role,
  service_silo = EXCLUDED.service_silo,
  active       = EXCLUDED.active;

-- ============================================================
-- 5. NOTES ON user_roles
-- These staff will need user_roles rows so they can log into the dashboard.
-- Easiest path: have each person sign in once via Google SSO,
-- then use Admin → Manage Users to assign their role.
-- Roles to assign in user_roles:
--   Ryan Dillon       → Sr Manager (or Admin if needed)
--   Mauricio, Jason   → Manager
--   Andrew Page       → Manager
--   Riley Scott       → Manager
--   Bobby Thatcher    → Manager  (for Parts/Insurance access)
--   Brandon Dillon    → Manager  (for Parts/Insurance access)
--   All Techs         → Tech
-- ============================================================
