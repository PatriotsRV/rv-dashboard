-- ============================================================
-- Add 'Off Lot - Returning' to status CHECK constraints — Session 172 (2026-08-10)
-- ============================================================
-- BUG (Jason Rubin, 2026-08-10): changing an RO status to
-- "Off Lot - Returning" fails with 23514 check_violation.
--
-- ROOT CAUSE: v1.460 (S120, ER dac9fdda) added the status to the UI
-- in all 7 hardcoded places but NEVER widened the DB CHECK constraint
-- from S72 (status_casing_check_constraint.sql). Zero rows have ever
-- held this status — it has never worked since shipping 2026-06-21.
--
-- FIX: recreate BOTH constraints (repair_orders + cashiered twin,
-- per the Class K twin rule) with the value added. No code change —
-- the client already sends the exact canonical string.
--
-- Canonical set after this migration (S72 set + 1):
--   'Not On Lot' · 'On Lot' · 'Scheduled' · 'Awaiting Approval'
--   'Awaiting parts' · 'Ready to Work' · 'In progress'
--   'Repairs Completed' · 'Waiting for QA/QC' · 'Ready for pickup'
--   'Off Lot - Returning'  ← NEW
--   'Delivered/Cashed Out'
-- ============================================================

BEGIN;

-- ── repair_orders ────────────────────────────────────────────
ALTER TABLE repair_orders
  DROP CONSTRAINT IF EXISTS repair_orders_status_check;

ALTER TABLE repair_orders
  ADD CONSTRAINT repair_orders_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Off Lot - Returning',
    'Delivered/Cashed Out'
  ))
  NOT VALID;   -- existing rows validated below

ALTER TABLE repair_orders
  VALIDATE CONSTRAINT repair_orders_status_check;

-- ── cashiered (Class K twin) ─────────────────────────────────
ALTER TABLE cashiered
  DROP CONSTRAINT IF EXISTS cashiered_status_check;

ALTER TABLE cashiered
  ADD CONSTRAINT cashiered_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Off Lot - Returning',
    'Delivered/Cashed Out'
  ))
  NOT VALID;

ALTER TABLE cashiered
  VALIDATE CONSTRAINT cashiered_status_check;

COMMIT;

-- ── Verification ─────────────────────────────────────────────
-- Both rows must show 'Off Lot - Returning' in the definition
-- and is_validated = true.
SELECT conname,
       conrelid::regclass AS table_name,
       pg_get_constraintdef(oid) AS definition,
       convalidated AS is_validated
  FROM pg_constraint
 WHERE conname IN ('repair_orders_status_check', 'cashiered_status_check');

-- ── OPTIONAL: prove the fix (leaves no trace) ────────────────
-- BEGIN;
-- UPDATE repair_orders SET status = 'Off Lot - Returning'
--  WHERE status = 'In progress' AND ro_id IS NOT NULL
--  AND ctid = (SELECT ctid FROM repair_orders WHERE status = 'In progress' LIMIT 1);
-- ROLLBACK;

-- ============================================================
-- ROLLBACK (restores the S72 constraint set without the new value)
-- ============================================================
-- BEGIN;
-- ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
-- ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_status_check
--   CHECK (status IN ('Not On Lot','On Lot','Scheduled','Awaiting Approval',
--     'Awaiting parts','Ready to Work','In progress','Repairs Completed',
--     'Waiting for QA/QC','Ready for pickup','Delivered/Cashed Out')) NOT VALID;
-- ALTER TABLE repair_orders VALIDATE CONSTRAINT repair_orders_status_check;
-- ALTER TABLE cashiered DROP CONSTRAINT IF EXISTS cashiered_status_check;
-- ALTER TABLE cashiered ADD CONSTRAINT cashiered_status_check
--   CHECK (status IN ('Not On Lot','On Lot','Scheduled','Awaiting Approval',
--     'Awaiting parts','Ready to Work','In progress','Repairs Completed',
--     'Waiting for QA/QC','Ready for pickup','Delivered/Cashed Out')) NOT VALID;
-- ALTER TABLE cashiered VALIDATE CONSTRAINT cashiered_status_check;
-- COMMIT;
-- ============================================================
