-- Parts "Requested -> Ordered" state machine — PHASE 2 (Session 100, 2026-06-10)
-- Spec: docs/specs/PARTS_REQUESTED_ORDERED_SPEC.md
-- Phase 1 (Session 93) widened repair_orders_parts_status_check to the union
--   requested|sourcing|ordered|outstanding|received|estimate  (expand-contract)
-- so prod v1.445 (still writing 'outstanding') was never broken.
-- Phase 2 (this file, run AFTER v1.446 soaked in prod 2026-06-06 -> 2026-06-10):
--   1. Backfill the legacy value:  outstanding -> ordered  (2 rows at run time)
--   2. Tighten the constraint to drop 'outstanding' from the allowed set.
-- NOTE: cashiered has NO parts_status column (verified via pg_constraint +
-- information_schema at run time), so no companion constraint exists there.
-- Run by Roland in Supabase SQL Editor 2026-06-10. Verified:
--   estimate 7 | ordered 2 | received 19 | NULL 93 | outstanding 0

BEGIN;

UPDATE repair_orders
SET parts_status = 'ordered'
WHERE parts_status = 'outstanding';

ALTER TABLE repair_orders
DROP CONSTRAINT repair_orders_parts_status_check;

ALTER TABLE repair_orders
ADD CONSTRAINT repair_orders_parts_status_check
CHECK (parts_status IS NULL OR parts_status = ANY (ARRAY['requested'::text, 'sourcing'::text, 'ordered'::text, 'received'::text, 'estimate'::text]));

COMMIT;
