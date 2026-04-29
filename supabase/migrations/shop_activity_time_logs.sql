-- GH#24 Phase 3 (Session 61, 2026-04-29)
-- Adds shop_activity column to time_logs for Shop RO time tracking.
-- Stores the selected shop work item when a tech clocks into a Shop RO
-- via checkin.html. NULL for all non-shop ROs.

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS shop_activity TEXT
  CHECK (
    shop_activity IS NULL OR shop_activity IN (
      'Shop Cleanup', 'Moving RVs', 'Work Break', 'Running Errands', 'Part Pickup'
    )
  );

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'time_logs'
  AND column_name = 'shop_activity';
