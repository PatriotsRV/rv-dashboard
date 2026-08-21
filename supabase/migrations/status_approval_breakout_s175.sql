-- ============================================================================
-- status_approval_breakout_s175.sql  (Session 175, 2026-08-20)
--
-- RO STATUS BREAKOUT: retire 'Awaiting Approval', add 6 source-specific
-- statuses (Roland directive S175):
--   'Awaiting Insurance' · 'Awaiting Customer' · 'Awaiting Extended Warranty'
--   'Approved Insurance' · 'Approved Customer' · 'Approved Extended Warranty'
--
-- Canonical list goes 12 -> 17 values. Progress weights (client-side
-- STATUS_PROGRESS_MAP): Awaiting X = 20 (inherited), Approved X = 25.
--
-- ORDER MATTERS — v2 (first run FAILED 23514, S175): the OLD constraints
-- must be DROPPED before the remap UPDATEs — writing 'Awaiting Insurance'
-- while the old CHECK is still standing is rejected. Correct order:
-- drop both CHECKs -> remap rows -> add new CHECKs -> validate. All one
-- transaction, so a failure rolls the whole thing back (as the first
-- attempt did — no partial state). Both repair_orders AND the cashiered
-- twin are widened together (Class K).
--
-- Run in the Supabase SQL Editor (MCP is read-only). Idempotent.
-- ============================================================================

BEGIN;

-- ── 0. Drop the OLD constraints first (they don't know the new values) ──────
ALTER TABLE repair_orders
  DROP CONSTRAINT IF EXISTS repair_orders_status_check;

ALTER TABLE cashiered
  DROP CONSTRAINT IF EXISTS cashiered_status_check;

-- ── 1. Remap the 2 live legacy rows (guarded; confirmed by Roland S175) ─────
-- Sean Ziegler, insurance RO -> Awaiting Insurance
UPDATE repair_orders
   SET status = 'Awaiting Insurance', updated_at = now()
 WHERE ro_id = 'PRVS-7744-C353'
   AND status = 'Awaiting Approval';

-- Richard Burch, standard RO -> Awaiting Customer
UPDATE repair_orders
   SET status = 'Awaiting Customer', updated_at = now()
 WHERE ro_id = 'PRVS-RI06-63F7'
   AND status = 'Awaiting Approval';

-- Safety net: any other stragglers (should be 0 rows; cashiered has none)
UPDATE repair_orders
   SET status = 'Awaiting Customer', updated_at = now()
 WHERE status = 'Awaiting Approval';

UPDATE cashiered
   SET status = 'Awaiting Customer'
 WHERE status = 'Awaiting Approval';

-- ── 2. New repair_orders CHECK (17 canonical values, legacy retired) ────────
ALTER TABLE repair_orders
  ADD CONSTRAINT repair_orders_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;

ALTER TABLE repair_orders
  VALIDATE CONSTRAINT repair_orders_status_check;

-- ── 3. New cashiered CHECK (Class K twin — identical list) ──────────────────
ALTER TABLE cashiered
  ADD CONSTRAINT cashiered_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;

ALTER TABLE cashiered
  VALIDATE CONSTRAINT cashiered_status_check;

COMMIT;

-- ── VERIFY (run after COMMIT; expect 0 legacy rows, both constraints valid) ─
-- SELECT status, count(*) FROM repair_orders WHERE status LIKE 'Awaiting%' OR status LIKE 'Approved%' GROUP BY 1;
-- SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('repair_orders_status_check','cashiered_status_check');
