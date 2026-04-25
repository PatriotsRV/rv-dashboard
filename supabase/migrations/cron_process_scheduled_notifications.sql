-- ============================================================
-- GH#ER1 + GH#ER2 — pg_cron schedule for scheduled notifications
-- Session 56 (2026-04-25)
--
-- Schedules an HTTP POST to the `process-scheduled-notifications`
-- edge function every 15 minutes. The edge function fetches all
-- pending rows whose scheduled_at <= NOW() and sends them.
--
-- PREREQUISITES:
--   1. `pg_net` extension enabled (Supabase: Database → Extensions)
--   2. `pg_cron` extension enabled (already enabled — used by other jobs)
--   3. Edge function `process-scheduled-notifications` DEPLOYED
--      with `--no-verify-jwt` flag:
--        supabase functions deploy process-scheduled-notifications --no-verify-jwt
--   4. GMAIL_USER + GMAIL_APP_PASSWORD secrets set in Supabase
--      Edge Function settings (already set — used by send-parts-report)
-- ============================================================

-- Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ─────────────────────────────────────────────────────────────────────────
-- 1. SQL function that invokes the edge function via pg_net
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION invoke_process_scheduled_notifications()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/process-scheduled-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION invoke_process_scheduled_notifications() IS
  'Fires HTTP POST to process-scheduled-notifications edge function. Called every 15 min by pg_cron.';


-- ─────────────────────────────────────────────────────────────────────────
-- 2. Schedule every 15 minutes
-- ─────────────────────────────────────────────────────────────────────────
-- Unschedule any previous incarnation first (idempotent re-runs)
DO $$
BEGIN
    PERFORM cron.unschedule('process-scheduled-notifications');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-scheduled-notifications',
    '*/15 * * * *',  -- every 15 minutes
    $$SELECT invoke_process_scheduled_notifications();$$
);


-- ─────────────────────────────────────────────────────────────────────────
-- Verification queries (uncomment to use)
-- ─────────────────────────────────────────────────────────────────────────
-- List the cron job:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname = 'process-scheduled-notifications';
--
-- Manual test (fires the edge function once):
--   SELECT invoke_process_scheduled_notifications();
--   -- Then check net._http_response for the response:
--   SELECT id, status_code, content_type, content::text, error_msg
--   FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- Peek at pending rows that the next run will process:
--   SELECT id, ro_id, scheduled_at, recipient_emails, subject, source
--   FROM scheduled_notifications
--   WHERE status = 'pending' AND scheduled_at <= NOW()
--   ORDER BY scheduled_at;
--
-- Recent activity:
--   SELECT id, source, status, fired_at, error_message
--   FROM scheduled_notifications
--   ORDER BY COALESCE(fired_at, created_at) DESC LIMIT 20;
