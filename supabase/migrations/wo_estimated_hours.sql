-- wo_estimated_hours.sql
-- Session 109 (2026-06-14)
-- Additive: expected labor hours per Service Work Order.
-- Enables actual-vs-estimate labor efficiency in the Weekly P&L and the
-- repurposed Manager Daily Report (see docs/specs/MANAGER_DAILY_REPORT_SPEC.md sec 8).
-- Nullable; no backfill; no behavior change until the WO modal field populates it.

ALTER TABLE service_work_orders
  ADD COLUMN IF NOT EXISTS estimated_hours numeric;

COMMENT ON COLUMN service_work_orders.estimated_hours IS
  'Manager-entered expected labor hours for this WO. Pairs with dollar_value to compute actual-vs-spec labor efficiency (actual hours from time_logs). Added Session 109.';
