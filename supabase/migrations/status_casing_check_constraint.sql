-- ============================================================
-- Status Casing CHECK Constraint — Session 72 (2026-05-23)
-- ============================================================
-- Enforces the canonical status set at the database layer so any
-- application-level bug writing wrong casing fails loudly with a
-- Postgres 23514 check_violation rather than silently corrupting data.
--
-- Closes the "once and for all" loop on the GH#29c casing bug class:
--   Layer 1 (application):  Constants + scan-confirmed clean code paths
--                           (checkin.html v1.33, closed-ros.html v1.1)
--   Layer 2 (database):     THIS MIGRATION
--   Layer 3 (CI, future):   Grep-fail rule in deploy pipeline
--
-- Canonical set (matches index.html ALL_STATUSES + 'Scheduled'):
--   'Not On Lot'
--   'On Lot'
--   'Scheduled'
--   'Awaiting Approval'
--   'Awaiting parts'           (lowercase 'p' — historical)
--   'Ready to Work'
--   'In progress'              (lowercase 'p' — canonical)
--   'Repairs Completed'
--   'Waiting for QA/QC'
--   'Ready for pickup'         (lowercase 'p' — historical)
--   'Delivered/Cashed Out'
--
-- Applied to BOTH `repair_orders` AND `cashiered`.
--
-- PREREQUISITES (already done by Roland in Session 72):
--   ✅ Pre-flight scan run, all DELETE-flagged rows removed
--   ✅ Cleanup UPDATEs run (capital_p_remaining=0 in both tables)
--   ✅ closed-ros.html v1.1 deployed (no more capital-P writes)
-- ============================================================


-- ── Step 1: Final pre-flight (should return 0 rows) ──────────
-- If this returns anything, STOP — don't apply the constraint
-- until the bad rows are normalized.
SELECT 'repair_orders' AS tbl, status, COUNT(*) AS bad_rows
  FROM repair_orders
 WHERE status IS NOT NULL
   AND status NOT IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
   )
 GROUP BY status
 UNION ALL
SELECT 'cashiered' AS tbl, status, COUNT(*) AS bad_rows
  FROM cashiered
 WHERE status IS NOT NULL
   AND status NOT IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
   )
 GROUP BY status;


-- ── Step 2: Apply constraint to repair_orders ────────────────
ALTER TABLE repair_orders
  ADD CONSTRAINT repair_orders_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;   -- skip checking existing rows; validate below

ALTER TABLE repair_orders
  VALIDATE CONSTRAINT repair_orders_status_check;


-- ── Step 3: Apply constraint to cashiered ────────────────────
ALTER TABLE cashiered
  ADD CONSTRAINT cashiered_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;

ALTER TABLE cashiered
  VALIDATE CONSTRAINT cashiered_status_check;


-- ── Step 4: Set column default on repair_orders.status ───────
-- Closes L-2 from the Session 72 scan: solar.html `createRO` INSERTs
-- that omit `status` now default to canonical 'Not On Lot' instead
-- of getting NULL.
ALTER TABLE repair_orders
  ALTER COLUMN status SET DEFAULT 'Not On Lot';


-- ── Step 5: Verification ─────────────────────────────────────
-- Confirms both constraints are in place AND validated.
SELECT conname,
       conrelid::regclass AS table_name,
       pg_get_constraintdef(oid) AS definition,
       convalidated AS is_validated
  FROM pg_constraint
 WHERE conname IN ('repair_orders_status_check', 'cashiered_status_check');

-- Confirm zero bad rows remain (defensive — Step 1 already did this).
SELECT 'repair_orders' AS tbl, COUNT(*) AS capital_p_remaining
  FROM repair_orders WHERE status = 'In Progress'
 UNION ALL
SELECT 'cashiered' AS tbl, COUNT(*) AS capital_p_remaining
  FROM cashiered WHERE status = 'In Progress';


-- ── Step 6 (OPTIONAL): Deliberate bad-insert test ────────────
-- Uncomment to confirm the constraint rejects capital-P.
-- Should fail with: ERROR: 23514 new row for relation "repair_orders"
--                   violates check constraint "repair_orders_status_check"
-- Wrapped in BEGIN/ROLLBACK so it leaves no trace.
--
-- BEGIN;
-- INSERT INTO repair_orders (ro_id, customer_name, status)
--   VALUES ('PRVS-TEST-CHECK', 'CHECK CONSTRAINT TEST', 'In Progress');
-- ROLLBACK;


-- ============================================================
-- ROLLBACK (paste if you ever need to remove the constraint)
-- ============================================================
-- ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
-- ALTER TABLE cashiered     DROP CONSTRAINT IF EXISTS cashiered_status_check;
-- ALTER TABLE repair_orders ALTER COLUMN status DROP DEFAULT;
-- ============================================================
