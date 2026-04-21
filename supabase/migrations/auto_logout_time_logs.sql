-- ============================================================
-- GH#32 (Session 52) — Auto-logout stale time_logs
-- ============================================================
-- Caps any open time_log session at 12 hours from clock_in via a
-- nightly pg_cron job. Prevents techs who forget to clock out at
-- end-of-day (or over a weekend) from polluting the Work List Report
-- with runaway "active" hours.
--
-- Rule chosen by Roland (Session 52): 12-hour rolling cap, not a
-- fixed EOD wall-clock time. Tolerant of staggered / night shifts.
-- Any open time_log whose clock_in is more than 12h ago gets:
--   clock_out    = clock_in + interval '12 hours'
--   close_reason = 'auto_eod'
--
-- Schedule: daily (7 days/week) at 02:00 UTC = 9 PM CDT (Apr–Nov)
--           / 8 PM CST (Nov–Mar). Same DST caveat as the other
--           pg_cron jobs (see GitHub Issue #20 — update offsets
--           Nov 2026).
--
-- Idempotent: safe to re-run. The ADD COLUMN is IF NOT EXISTS, the
-- function is CREATE OR REPLACE, and the cron schedule is unscheduled
-- first if present.
-- ============================================================

-- 1. Add audit column
ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS close_reason TEXT;

COMMENT ON COLUMN time_logs.close_reason IS
  'NULL = normal tech-initiated clock_out. "auto_eod" = closed by nightly auto-logout (clock_in + 12h cap). Future: geofence_exit, admin_force, etc.';

-- 2. The closing function. SECURITY DEFINER so pg_cron (running as a
--    service role) can UPDATE time_logs regardless of RLS. Explicit
--    search_path per our S7 security hygiene.
CREATE OR REPLACE FUNCTION auto_close_stale_time_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    closed_count integer := 0;
BEGIN
    UPDATE time_logs
    SET clock_out    = clock_in + interval '12 hours',
        close_reason = 'auto_eod'
    WHERE clock_out IS NULL
      AND clock_in IS NOT NULL
      AND clock_in < now() - interval '12 hours';

    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$fn$;

COMMENT ON FUNCTION auto_close_stale_time_logs() IS
  'Nightly auto-logout cap. Closes any open time_log with clock_in > 12h ago. Returns count of rows closed. Invoked by pg_cron job auto-close-stale-time-logs.';

-- 3. Unschedule any prior version of the job (idempotent re-run guard)
DO $blk$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-stale-time-logs') THEN
        PERFORM cron.unschedule('auto-close-stale-time-logs');
    END IF;
END
$blk$;

-- 4. Schedule daily at 02:00 UTC (9 PM CDT / 8 PM CST)
SELECT cron.schedule(
    'auto-close-stale-time-logs',
    '0 2 * * *',
    $cron$SELECT auto_close_stale_time_logs();$cron$
);

-- ------------------------------------------------------------
-- 5. Verification — paste any result back to me
-- ------------------------------------------------------------

-- How many open sessions would be closed right now? (diagnostic preview)
SELECT count(*) AS stale_open_session_count
FROM time_logs
WHERE clock_out IS NULL
  AND clock_in IS NOT NULL
  AND clock_in < now() - interval '12 hours';

-- Confirm column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'time_logs' AND column_name = 'close_reason';

-- Confirm the cron job is scheduled
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'auto-close-stale-time-logs';

-- Optional: run it manually once to close any existing stale rows RIGHT NOW.
-- Returns the count of rows closed. Comment out if you want the nightly run to do it.
SELECT auto_close_stale_time_logs() AS closed_now;

-- Optional: see the rows it just closed
SELECT id, tech_email, ro_id, clock_in, clock_out, close_reason
FROM time_logs
WHERE close_reason = 'auto_eod'
ORDER BY clock_out DESC
LIMIT 20;
