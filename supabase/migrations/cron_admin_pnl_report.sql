-- ============================================================
-- Daily Ops Health (Admin) report — pg_cron schedule
-- Session 101 (2026-06-11)
--
-- Schedules an HTTP POST to the send-admin-pnl-report edge function
-- at 6:00 AM America/Chicago, weekdays (11:00 UTC during CDT).
-- NOTE: pg_cron runs in UTC. When DST ends (CST = UTC-6), this fires
-- at 5:00 AM CT unless changed to '0 12 * * 1-5'.
--
-- PREREQUISITES:
--   1. pg_net + pg_cron enabled (already — used by other jobs)
--   2. Edge function deployed with --no-verify-jwt:
--        supabase functions deploy send-admin-pnl-report --no-verify-jwt
--   3. GMAIL_USER + GMAIL_APP_PASSWORD secrets set (already)
--   4. app_config recipients row (see below)
-- ============================================================

-- Recipients (comma-separated). Edit anytime.
INSERT INTO app_config (key, value, label)
VALUES ('admin_report_recipients',
        'roland@patriotsrvservices.com,lynn@patriotsrvservices.com',
        'Daily Ops Health (Admin) report recipients')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Invoker function
CREATE OR REPLACE FUNCTION invoke_send_admin_pnl_report()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-admin-pnl-report',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

-- Schedule: 6:00 AM CDT, Mon-Fri
SELECT cron.unschedule('send-admin-pnl-report-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-admin-pnl-report-daily');

SELECT cron.schedule(
  'send-admin-pnl-report-daily',
  '0 11 * * 1-5',
  $$SELECT invoke_send_admin_pnl_report()$$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'send-admin-pnl-report-daily';
