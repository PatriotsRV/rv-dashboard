-- ============================================================================
-- GH#30: Admin Delete RO — soft-delete with 1-week auto-scrub
-- ============================================================================
-- Adds soft-delete columns to repair_orders. A row with deleted_at IS NOT NULL
-- is hidden from the dashboard (filtered at load time) and purged by the
-- scrub_soft_deleted_ros() function after 7 days.
--
-- Paired migration: cron_scrub_deleted_ros.sql (pg_cron job + purge function).
--
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE repair_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

-- Partial index — only indexes soft-deleted rows, which are the minority
-- and the only ones the scrub job and Recently Deleted view query.
CREATE INDEX IF NOT EXISTS idx_repair_orders_deleted_at
    ON repair_orders (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN repair_orders.deleted_at IS
    'GH#30 soft-delete timestamp. NULL = active. Set to NOW() by admin Delete RO action. Auto-purged by scrub_soft_deleted_ros() 7 days after being set.';
COMMENT ON COLUMN repair_orders.deleted_by IS
    'GH#30 email of admin who soft-deleted this RO.';
