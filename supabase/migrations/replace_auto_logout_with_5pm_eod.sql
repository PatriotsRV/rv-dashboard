-- ============================================================
-- GH#32 v2 (Session 53, 2026-04-21) — Replace 12h cap with 5 PM EOD cron
-- ============================================================
-- Why: The 12h cap (auto_close_stale_time_logs + its pg_cron at 02:00 UTC)
-- inflated labor costs on the Work List Report. A tech who forgot to clock
-- out at 5 PM would accumulate 12h of phantom labor until the nightly cron
-- fired. Roland's direction (2026-04-21): kill the 12h cap entirely, do a
-- hard EOD close at 5 PM CDT Mon-Fri, and layer SMS reminder/extension on
-- top once Twilio is live (Stage 2, dormant for now).
--
-- This migration:
--   1. Drops the old cron job + function (12h cap).
--   2. Adds `reminded_at` and `extended_at` columns on time_logs —
--      dormant until Twilio is live. Present now so the 5 PM cron can
--      respect extended_at from day 0.
--   3. Creates close_open_time_logs_eod() — closes any open session at
--      NOW() (= 5 PM CDT when the cron fires), setting close_reason =
--      'auto_eod_5pm'. Respects extended_at: any session extended within
--      the last hour is skipped.
--   4. Schedules the cron Mon-Fri at 22:00 UTC (5 PM CDT). No weekend
--      job — weekends rely on ad-hoc tech vigilance + the hourly report
--      refresh surfacing stale-open sessions. Per Roland: weekend work
--      normally ends 2-3 PM, so drift is limited.
--
-- Idempotent: safe to re-run. Unschedules the old job only if it exists,
-- drops the function with IF EXISTS, adds columns with IF NOT EXISTS,
-- CREATE OR REPLACE on the new function, unschedules the new job before
-- scheduling (so a re-run rotates it).
-- ============================================================

-- 1. Drop the old 12h cap cron + function
DO $blk$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-stale-time-logs') THEN
        PERFORM cron.unschedule('auto-close-stale-time-logs');
    END IF;
END
$blk$;

DROP FUNCTION IF EXISTS auto_close_stale_time_logs();

-- 2. New columns on time_logs (dormant until Twilio is live)
ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extended_at TIMESTAMPTZ;

COMMENT ON COLUMN time_logs.reminded_at IS
  'Timestamp of most recent 4:45 PM SMS reminder. Dormant until Twilio live. Used by twilio-webhook to correlate replies to a session.';

COMMENT ON COLUMN time_logs.extended_at IS
  'Timestamp of most recent tech SMS "YES" reply extending their session by 1h. The 5 PM EOD cron skips rows where extended_at > now() - 1h. NULL = no extension; cron will close them.';

-- Update the column comment on close_reason to document the new values
COMMENT ON COLUMN time_logs.close_reason IS
  'NULL = normal tech-initiated clock_out. "auto_eod_5pm" = closed by the M-F 5 PM EOD cron (close_open_time_logs_eod). "auto_eod_8h_recalc" = retroactively rewritten from a prior 12h-cap close. Legacy value "auto_eod" = closed by the deprecated 12h cap (retained for rows not yet rewritten).';

-- 3. The new closing function. SECURITY DEFINER so pg_cron can UPDATE
--    regardless of RLS. Explicit search_path per S7 hygiene.
CREATE OR REPLACE FUNCTION close_open_time_logs_eod()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    closed_count integer := 0;
BEGIN
    UPDATE time_logs
    SET clock_out    = NOW(),
        close_reason = 'auto_eod_5pm'
    WHERE clock_out IS NULL
      AND clock_in IS NOT NULL
      AND clock_in < NOW()
      -- Skip rows the tech extended via SMS within the last hour.
      -- Pre-Twilio, extended_at is always NULL so every open row is closed.
      AND (extended_at IS NULL OR extended_at < NOW() - interval '1 hour');

    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$fn$;

COMMENT ON FUNCTION close_open_time_logs_eod() IS
  'EOD hard-close. Runs M-F 22:00 UTC (5 PM CDT). Closes any open time_log UNLESS extended_at > now() - 1h. Returns count closed. Invoked by pg_cron close-open-time-logs-eod.';

-- 4. Schedule Mon-Fri at 22:00 UTC (5 PM CDT / 4 PM CST — DST caveat).
DO $blk$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-open-time-logs-eod') THEN
        PERFORM cron.unschedule('close-open-time-logs-eod');
    END IF;
END
$blk$;

SELECT cron.schedule(
    'close-open-time-logs-eod',
    '0 22 * * 1-5',   -- Mon-Fri only
    $cron$SELECT close_open_time_logs_eod();$cron$
);

-- ------------------------------------------------------------
-- 5. Verification — paste any result back to me
-- ------------------------------------------------------------

-- Old cron gone?
SELECT count(*) AS old_12h_cron_gone
FROM cron.job
WHERE jobname = 'auto-close-stale-time-logs';
-- Should return 0

-- New cron scheduled?
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'close-open-time-logs-eod';

-- New columns present?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'time_logs'
  AND column_name IN ('reminded_at', 'extended_at', 'close_reason')
ORDER BY column_name;

-- How many open sessions right now? (just FYI — next M-F at 5 PM CDT these close)
SELECT count(*) AS currently_open_sessions
FROM time_logs
WHERE clock_out IS NULL;
