-- Key Dates Phase 1 (Session 117, 2026-06-18) — ER d2561e11 (Brandon)
-- Additive, nullable. Records when the unit is ready / actually picked up
-- (when it left the lot). Joins planned_dropoff_date + promised_date as the
-- third "key date". No backfill; existing rows stay NULL.
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS pickup_date date;
