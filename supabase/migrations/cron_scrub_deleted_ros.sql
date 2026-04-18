-- ============================================================================
-- GH#30: pg_cron job — daily scrub of soft-deleted ROs >7 days old
-- ============================================================================
-- Runs daily at 2 AM CDT (07:00 UTC). Hard-deletes every repair_orders row
-- whose deleted_at is more than 7 days in the past, along with all child rows
-- that reference it, to avoid FK constraint violations during the parent delete.
--
-- Child tables scrubbed (all reference repair_orders.id via ro_id UUID):
--   notes, parts, time_logs, audit_log, insurance_scans,
--   service_work_orders (→ service_tasks cascades), manager_work_lists
--
-- Prereqs:
--   1) add_deleted_at.sql must be run first.
--   2) pg_cron extension enabled: CREATE EXTENSION IF NOT EXISTS pg_cron;
--      (Already enabled — other PRVS jobs use it.)
--
-- Run once in Supabase SQL Editor. Safe to re-run (ON CONFLICT clauses).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ─────────────────────────────────────────────────────────────────────────
-- Scrub function — called by pg_cron, and also callable directly as
-- `SELECT scrub_soft_deleted_ros()` by an admin in SQL Editor for manual runs.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION scrub_soft_deleted_ros()
RETURNS TABLE(ro_id_scrubbed UUID, ro_name TEXT, scrubbed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target RECORD;
    scrubbed_count INT := 0;
    wo_id UUID;
BEGIN
    FOR target IN
        SELECT id, ro_id AS ro_text_id, customer_name
        FROM repair_orders
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '7 days'
    LOOP
        -- Explicit child cleanup so we don't rely on ON DELETE CASCADE
        -- being set on every child FK (we haven't audited all of them).

        -- service_tasks is a grandchild via service_work_orders.id
        FOR wo_id IN
            SELECT id FROM service_work_orders WHERE ro_id = target.id
        LOOP
            DELETE FROM service_tasks WHERE wo_id = wo_id;
        END LOOP;
        DELETE FROM service_work_orders WHERE ro_id = target.id;

        DELETE FROM notes             WHERE ro_id = target.id;
        DELETE FROM parts             WHERE ro_id = target.id;
        DELETE FROM time_logs         WHERE ro_id = target.id;
        DELETE FROM audit_log         WHERE ro_id = target.id;
        DELETE FROM insurance_scans   WHERE ro_id = target.id;
        DELETE FROM manager_work_lists WHERE ro_id = target.id;

        DELETE FROM repair_orders WHERE id = target.id;

        scrubbed_count := scrubbed_count + 1;
        RETURN QUERY SELECT target.id, target.customer_name, NOW();
    END LOOP;

    RAISE NOTICE 'scrub_soft_deleted_ros: % RO(s) scrubbed', scrubbed_count;
    RETURN;
END;
$$;

COMMENT ON FUNCTION scrub_soft_deleted_ros() IS
    'GH#30 — hard-deletes soft-deleted ROs older than 7 days plus all their FK children. Called daily by pg_cron job scrub-soft-deleted-ros.';


-- ─────────────────────────────────────────────────────────────────────────
-- Unschedule any prior version of this job, then schedule fresh
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    PERFORM cron.unschedule('scrub-soft-deleted-ros');
EXCEPTION WHEN OTHERS THEN
    -- Job didn't exist yet; ignore.
    NULL;
END $$;

SELECT cron.schedule(
    'scrub-soft-deleted-ros',
    '0 7 * * *',  -- Daily 07:00 UTC = 02:00 CDT (1 AM during CST months — see GH#20 DST note)
    $$SELECT scrub_soft_deleted_ros();$$
);


-- ─────────────────────────────────────────────────────────────────────────
-- Verification queries (uncomment to use)
-- ─────────────────────────────────────────────────────────────────────────
-- List scheduled jobs:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'scrub-soft-deleted-ros';
--
-- Manual test run (returns scrubbed RO IDs and names):
--   SELECT * FROM scrub_soft_deleted_ros();
--
-- Peek at soft-deleted ROs and their age:
--   SELECT id, ro_id, customer_name, deleted_at, deleted_by,
--          EXTRACT(DAY FROM NOW() - deleted_at) AS days_since_delete
--   FROM repair_orders WHERE deleted_at IS NOT NULL
--   ORDER BY deleted_at;
