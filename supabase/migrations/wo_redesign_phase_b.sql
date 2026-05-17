-- ============================================================
-- WO REDESIGN — PHASE B — Additive Schema Migration
-- ============================================================
-- Created: Session 64 (2026-05-03)
-- Spec: docs/specs/WO_REDESIGN_SPEC.md sections 6 + 6.7
-- Branch: wo-redesign
--
-- All changes are ADDITIVE.
--   - No column drops
--   - No column renames
--   - No CHECK constraints made stricter
--   - One CHECK constraint RELAXED (silo enum 5 → 8)
--   - Existing rows untouched
--   - Existing code continues to work unchanged
--
-- Run in Supabase SQL Editor as a single block.
-- Re-running is safe (all CREATE/ALTER use IF NOT EXISTS).
-- ============================================================


-- ============================================================
-- 1. Relax service_work_orders.service_silo CHECK to all 8 silos
-- ------------------------------------------------------------
-- Existing constraint allows: repair, vroom, solar, roof, paint_body
-- SERVICE_SILOS in index.html defines 8: those + chassis, detailing,
-- truetopper. Any manager attempting to build a WO for the latter 3
-- currently fails the CHECK silently. This relaxes the constraint
-- without dropping any existing data.
-- ============================================================
ALTER TABLE service_work_orders
  DROP CONSTRAINT IF EXISTS service_work_orders_service_silo_check;

ALTER TABLE service_work_orders
  ADD CONSTRAINT service_work_orders_service_silo_check
  CHECK (service_silo IN (
    'repair',
    'vroom',
    'solar',
    'roof',
    'paint_body',
    'chassis',
    'detailing',
    'truetopper'
  ));


-- ============================================================
-- 2. service_tasks — line-item columns
-- ------------------------------------------------------------
-- parent_task_id      — nullable self-FK for sub-item support (Phase G).
--                       Most tasks remain top-level; sub-items reference
--                       their parent. ON DELETE CASCADE so deleting a
--                       parent cleanly removes its sub-items.
-- actual_hours        — cached SUM of time_logs.duration_seconds for
--                       all time_logs WHERE service_task_id = task.id.
--                       Default 0 so existing render code stays correct.
--                       Updated by app code in Phase F (live check-in)
--                       and Phase J (end-of-day backfill).
-- billed_hours        — nullable; manager-set; what gets sent to
--                       Lightspeed at cash-out. Falls back to est_hours
--                       in display when null. (Phase E)
-- completed_at        — nullable timestamp set when manager checks
--                       off the task. Pairs with completed_by_email
--                       for audit. (Phase C)
-- completed_by_email  — nullable; email of manager who clicked the
--                       check-off box. (Phase C)
-- ============================================================
ALTER TABLE service_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id      UUID REFERENCES service_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS actual_hours        NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billed_hours        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_email  TEXT;

CREATE INDEX IF NOT EXISTS idx_service_tasks_parent
  ON service_tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_tasks_completed
  ON service_tasks(completed_at) WHERE completed_at IS NOT NULL;


-- ============================================================
-- 3. parts — link to specific WO line item + lifecycle
-- ------------------------------------------------------------
-- service_task_id     — nullable FK so existing RO-level parts
--                       continue to work unchanged. New parts can
--                       link to a specific task. ON DELETE SET NULL
--                       so deleting a task does NOT delete the part —
--                       it reverts to RO-level.
-- lifecycle_status    — simplified lifecycle: ordered → received →
--                       installed. This is what the new line-item
--                       UI displays. The richer parts.status column
--                       (Sourcing/Outstanding/Backordered/Received/
--                       Installed/Returned) continues to drive the
--                       existing parts modal unchanged.
-- date_installed      — nullable; set when manager marks part installed.
-- installed_by_email  — nullable; who installed it.
-- ============================================================
ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS service_task_id    UUID REFERENCES service_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status   TEXT
    CHECK (lifecycle_status IS NULL OR lifecycle_status IN ('ordered', 'received', 'installed')),
  ADD COLUMN IF NOT EXISTS date_installed     DATE,
  ADD COLUMN IF NOT EXISTS installed_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_parts_service_task
  ON parts(service_task_id) WHERE service_task_id IS NOT NULL;


-- ============================================================
-- 4. time_logs — link to specific WO line item
-- ------------------------------------------------------------
-- service_task_id — nullable FK so existing time_logs continue to
--                   attribute hours to the RO only. Phase F's
--                   checkin.html update will let techs select a
--                   specific task at clock-in time. ON DELETE SET
--                   NULL so deleting a task does NOT delete time
--                   logs — they revert to RO-level attribution.
-- ============================================================
ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS service_task_id UUID REFERENCES service_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_logs_service_task
  ON time_logs(service_task_id) WHERE service_task_id IS NOT NULL;


-- ============================================================
-- 5. New table — wo_template_task_parts
-- ------------------------------------------------------------
-- Holds typical parts associated with a template task — name,
-- supplier, qty, prices, install hours. Used by Phase H to make
-- "Load Template" pre-populate parts alongside steps.
-- ============================================================
CREATE TABLE IF NOT EXISTS wo_template_task_parts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id        UUID NOT NULL REFERENCES wo_template_tasks(id) ON DELETE CASCADE,
  part_name               TEXT NOT NULL,
  part_number             TEXT,
  supplier                TEXT,
  qty                     INT  DEFAULT 1,
  wholesale_price         NUMERIC(10,2),
  retail_price            NUMERIC(10,2),
  install_hours           NUMERIC(5,2),
  notes                   TEXT,
  sort_order              INT DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_template_task_parts_template_task
  ON wo_template_task_parts(template_task_id);

ALTER TABLE wo_template_task_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wttp_select" ON wo_template_task_parts;
CREATE POLICY "wttp_select"
  ON wo_template_task_parts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "wttp_modify" ON wo_template_task_parts;
CREATE POLICY "wttp_modify"
  ON wo_template_task_parts FOR ALL
  TO authenticated
  USING (is_sr_manager_or_admin())
  WITH CHECK (is_sr_manager_or_admin());


-- ============================================================
-- 6. New table — cashiered_work_orders
-- ------------------------------------------------------------
-- When an RO is archived to `cashiered`, the existing ON DELETE
-- CASCADE from repair_orders wipes the entire WO tree (work orders +
-- tasks + parts + linked time_logs become RO-orphaned). This is
-- silent data loss every Saturday at 5 PM CDT.
--
-- This table snapshots the WO data at archive time so per-line-item
-- labor / parts intelligence survives. Phase E amends the
-- archive_cashiered_ros() cron function to populate this table
-- before the cascade fires.
--
-- archived_tasks_json is a JSONB blob containing the full denormalized
-- task tree (tasks + their sub-items + their linked parts + their
-- actual/billed hours) at archive time. Format documented in Phase E
-- spec when authored.
-- ============================================================
CREATE TABLE IF NOT EXISTS cashiered_work_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id        UUID NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  original_ro_id      UUID NOT NULL,            -- the repair_orders.id that was cashiered
  service_silo        TEXT NOT NULL,
  status              TEXT,
  dollar_value        NUMERIC(10,2),
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ,              -- original WO creation time, not archive time
  archived_tasks_json JSONB,                    -- denormalized snapshot of WO tasks + parts
  archived_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashiered_wo_cashiered
  ON cashiered_work_orders(cashiered_id);

CREATE INDEX IF NOT EXISTS idx_cashiered_wo_original_ro
  ON cashiered_work_orders(original_ro_id);

ALTER TABLE cashiered_work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cwo_select" ON cashiered_work_orders;
CREATE POLICY "cwo_select"
  ON cashiered_work_orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cwo_insert" ON cashiered_work_orders;
CREATE POLICY "cwo_insert"
  ON cashiered_work_orders FOR INSERT
  TO authenticated
  WITH CHECK (is_sr_manager_or_admin());


-- ============================================================
-- 7. VERIFICATION — run these after the migration to confirm
-- ============================================================
-- Confirm all 5 new columns on service_tasks
-- Expected: 5 rows
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'service_tasks'
   AND column_name IN ('parent_task_id', 'actual_hours', 'billed_hours',
                       'completed_at', 'completed_by_email');

-- Confirm all 4 new columns on parts
-- Expected: 4 rows
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parts'
   AND column_name IN ('service_task_id', 'lifecycle_status',
                       'date_installed', 'installed_by_email');

-- Confirm new column on time_logs
-- Expected: 1 row
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'time_logs' AND column_name = 'service_task_id';

-- Confirm CHECK constraint relaxed to all 8 silos
-- Expected: definition contains all 8 silo strings
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'service_work_orders_service_silo_check';

-- Confirm both new tables exist
-- Expected: 2 rows
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('wo_template_task_parts', 'cashiered_work_orders');

-- Confirm indexes exist
-- Expected: 5 rows
SELECT indexname FROM pg_indexes
 WHERE tablename IN ('service_tasks', 'parts', 'time_logs',
                     'wo_template_task_parts', 'cashiered_work_orders')
   AND indexname IN (
     'idx_service_tasks_parent',
     'idx_service_tasks_completed',
     'idx_parts_service_task',
     'idx_time_logs_service_task',
     'idx_wo_template_task_parts_template_task'
   );

-- Confirm RLS policies exist on the new tables
-- Expected: 4 rows (2 per table)
SELECT tablename, policyname FROM pg_policies
 WHERE tablename IN ('wo_template_task_parts', 'cashiered_work_orders');


-- ============================================================
-- ROLLBACK (if needed) — additive nature of this migration
-- means rollback is safe and non-destructive to original data.
-- ============================================================
-- DROP TABLE IF EXISTS cashiered_work_orders;
-- DROP TABLE IF EXISTS wo_template_task_parts;
--
-- ALTER TABLE time_logs DROP COLUMN IF EXISTS service_task_id;
--
-- ALTER TABLE parts
--   DROP COLUMN IF EXISTS service_task_id,
--   DROP COLUMN IF EXISTS lifecycle_status,
--   DROP COLUMN IF EXISTS date_installed,
--   DROP COLUMN IF EXISTS installed_by_email;
--
-- ALTER TABLE service_tasks
--   DROP COLUMN IF EXISTS parent_task_id,
--   DROP COLUMN IF EXISTS actual_hours,
--   DROP COLUMN IF EXISTS billed_hours,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS completed_by_email;
--
-- (silo CHECK relaxation does NOT need rollback — it only adds
-- valid values; pre-existing rows still pass the original 5-silo
-- subset.)

-- ============================================================
-- DONE. Phase B unblocks Phases C–L.
-- See docs/specs/WO_REDESIGN_SPEC.md for the full plan.
-- ============================================================
