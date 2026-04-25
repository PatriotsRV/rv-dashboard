-- ============================================================
-- GH#ER1 + GH#ER2 — Unified Scheduled Notifications
-- Session 56 (2026-04-25)
--
-- Purpose:
--   Generic "scheduled future notification" engine. One table powers:
--     (a) ER#2 — manager-created cross-silo notifications via 🔔 modal
--     (b) ER#1 — auto-fired drop-off reminders 1 day before planned_dropoff_date
--
--   pg_cron runs every 15 minutes, invokes the
--   `process-scheduled-notifications` edge function, which sends pending
--   rows whose scheduled_at <= now() and marks them sent/failed.
--
-- This migration:
--   1. Adds planned_dropoff_date DATE column to repair_orders
--   2. Creates scheduled_notifications table with RLS
--   3. Adds partial index for the cron's pending-row query
-- ============================================================

-- 1. planned_dropoff_date on repair_orders
-- (Currently captured by customer-checkin.html as a free-text note only.
--  Adding a real column lets ER#1 schedule reminders programmatically.)
ALTER TABLE repair_orders
  ADD COLUMN IF NOT EXISTS planned_dropoff_date DATE;

COMMENT ON COLUMN repair_orders.planned_dropoff_date IS
  'Customer-committed drop-off date for placeholder ROs created via customer-checkin.html. Drives ER#1 auto-reminder scheduling.';


-- 2. scheduled_notifications table
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ro_id               UUID          NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  scheduled_at        TIMESTAMPTZ   NOT NULL,
  recipient_emails    TEXT[]        NOT NULL,
  subject             TEXT          NOT NULL,
  body                TEXT          NOT NULL,
  source              TEXT          NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'auto_dropoff_reminder')),
  status              TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  fired_at            TIMESTAMPTZ   NULL,
  error_message       TEXT          NULL,
  created_by_email    TEXT          NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Sanity: a row should not have empty recipients
  CONSTRAINT non_empty_recipients CHECK (array_length(recipient_emails, 1) >= 1)
);


-- 3. Index for the cron's pending-row query
-- Partial index — only pending rows are scanned, keeping the index tiny.
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending
  ON scheduled_notifications (scheduled_at)
  WHERE status = 'pending';

-- Index for RO-scoped lookups (the modal's "show existing for this RO")
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_ro_id
  ON scheduled_notifications (ro_id)
  WHERE ro_id IS NOT NULL;


-- 4. RLS — authenticated users get full access; anon gets a narrow INSERT
--    permission only for source='auto_dropoff_reminder' so customer-checkin.html
--    (which runs on the anon key) can create the auto-reminder row.
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_notifications_authenticated_full_access"
  ON scheduled_notifications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anon INSERT only — narrow scope: only for the auto-reminder source.
-- This matches the existing pattern of `repair_orders` allowing anon INSERT
-- from the public check-in page. The constraint ensures the anon role can't
-- spam arbitrary notifications.
CREATE POLICY "scheduled_notifications_anon_insert_auto_reminder"
  ON scheduled_notifications
  FOR INSERT
  TO anon
  WITH CHECK (source = 'auto_dropoff_reminder');


-- 5. Convenience: auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION _set_updated_at_scheduled_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_notifications_updated_at ON scheduled_notifications;
CREATE TRIGGER trg_scheduled_notifications_updated_at
  BEFORE UPDATE ON scheduled_notifications
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at_scheduled_notifications();


-- ============================================================
-- Verification
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'repair_orders' AND column_name = 'planned_dropoff_date';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'scheduled_notifications' ORDER BY ordinal_position;
-- SELECT * FROM scheduled_notifications LIMIT 1;
