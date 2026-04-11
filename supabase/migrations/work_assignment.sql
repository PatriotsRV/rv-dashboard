-- ============================================================
-- GH#5 Work Assignment System — DB Migration
-- Run in Supabase SQL Editor AFTER staff_table.sql
-- Created: 2026-03-30
-- ============================================================
-- TABLES:
--   service_work_orders  — one row per silo per RO
--   service_tasks        — one row per task within a work order
--
-- ACCESS MODEL (enforced in app layer; RLS provides baseline):
--   Admin / Sr. Manager  → read + write any silo
--   Manager              → read all silos, write own silo only
--   Parts Manager        → read only (not involved in WOs)
--   Tech                 → read all, update status on own assigned tasks
-- ============================================================


-- ============================================================
-- 1. Helper function — checks if current user can manage a silo
--    Used in RLS policies below.
--    Returns TRUE for: Admin role, sr_manager staff role,
--    or manager whose service_silo matches the given silo.
-- ============================================================
CREATE OR REPLACE FUNCTION is_silo_manager(silo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role('Admin')
    OR EXISTS (
      SELECT 1 FROM staff
      WHERE email = (auth.jwt() ->> 'email')
        AND active = true
        AND (
          role = 'sr_manager'
          OR (role = 'manager' AND service_silo = silo)
        )
    );
$$;


-- ============================================================
-- 2. service_work_orders
--    One row per service silo per RO.
--    Multiple silos can be active on the same RO simultaneously.
-- ============================================================
CREATE TABLE IF NOT EXISTS service_work_orders (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  ro_id           UUID          NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  service_silo    TEXT          NOT NULL
                  CHECK (service_silo IN ('repair', 'vroom', 'solar', 'roof', 'paint_body')),
  status          TEXT          NOT NULL DEFAULT 'not_started'
                  CHECK (status IN (
                    'not_started',
                    'in_progress',
                    'awaiting_customer_approval',
                    'customer_approved',
                    'completed'
                  )),
  dollar_value    DECIMAL(10,2) DEFAULT 0,
  notes           TEXT,
  created_by      TEXT          NOT NULL,   -- email of manager who created this WO
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW(),

  -- One work order per silo per RO — prevent duplicates
  UNIQUE (ro_id, service_silo)
);


-- ============================================================
-- 3. service_tasks
--    Multiple tasks per work order, ordered by sort_order.
--    Tech updates status; manager creates / edits / reorders.
-- ============================================================
CREATE TABLE IF NOT EXISTS service_tasks (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id       UUID        NOT NULL REFERENCES service_work_orders(id) ON DELETE CASCADE,
  ro_id               UUID        NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  task_title          TEXT        NOT NULL,
  description         TEXT,
  assigned_tech_email TEXT,                 -- soft ref to staff.email (allows unassigned)
  status              TEXT        NOT NULL DEFAULT 'not_started'
                      CHECK (status IN (
                        'not_started',
                        'in_progress',
                        'awaiting_approval',
                        'awaiting_parts',
                        'completed'
                      )),
  sort_order          INT         DEFAULT 0,
  depends_on          UUID        REFERENCES service_tasks(id) ON DELETE SET NULL,
                                            -- V1.5: task dependency (e.g. Solar before Roof)
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 4. RLS — service_work_orders
-- ============================================================
ALTER TABLE service_work_orders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all work orders (cross-silo visibility)
CREATE POLICY "swo_select"
  ON service_work_orders FOR SELECT
  TO authenticated
  USING (true);

-- Only silo managers / sr_managers / admins can insert new work orders
CREATE POLICY "swo_insert"
  ON service_work_orders FOR INSERT
  TO authenticated
  WITH CHECK (is_silo_manager(service_silo));

-- Same for update and delete
CREATE POLICY "swo_update"
  ON service_work_orders FOR UPDATE
  TO authenticated
  USING (is_silo_manager(service_silo))
  WITH CHECK (is_silo_manager(service_silo));

CREATE POLICY "swo_delete"
  ON service_work_orders FOR DELETE
  TO authenticated
  USING (is_silo_manager(service_silo));


-- ============================================================
-- 5. RLS — service_tasks
-- ============================================================
ALTER TABLE service_tasks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all tasks
CREATE POLICY "st_select"
  ON service_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Managers / sr_managers / admins can insert tasks
CREATE POLICY "st_insert"
  ON service_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    is_silo_manager(
      (SELECT service_silo FROM service_work_orders WHERE id = work_order_id)
    )
  );

-- Managers can fully edit; techs can update status on their own assigned tasks
CREATE POLICY "st_update"
  ON service_tasks FOR UPDATE
  TO authenticated
  USING (
    -- Manager of this silo, sr_manager, or admin can update anything
    is_silo_manager(
      (SELECT service_silo FROM service_work_orders WHERE id = work_order_id)
    )
    -- Techs can update status only on tasks assigned to them
    OR assigned_tech_email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    is_silo_manager(
      (SELECT service_silo FROM service_work_orders WHERE id = work_order_id)
    )
    OR assigned_tech_email = (auth.jwt() ->> 'email')
  );

-- Only managers / sr_managers / admins can delete tasks
CREATE POLICY "st_delete"
  ON service_tasks FOR DELETE
  TO authenticated
  USING (
    is_silo_manager(
      (SELECT service_silo FROM service_work_orders WHERE id = work_order_id)
    )
  );


-- ============================================================
-- 6. Update repair_orders table
--    Add dollar_value column if it doesn't already exist.
--    The app will write the rolled-up sum of all silo
--    dollar_values here whenever a work order is saved.
-- ============================================================
ALTER TABLE repair_orders
  ADD COLUMN IF NOT EXISTS dollar_value DECIMAL(10,2) DEFAULT 0;


-- ============================================================
-- DONE. Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('service_work_orders', 'service_tasks', 'staff');
-- ============================================================
