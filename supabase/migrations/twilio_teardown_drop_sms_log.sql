-- ============================================================
-- Twilio Teardown — drop sms_log (Session 106, 2026-06-14)
-- ============================================================
-- Roland moved messaging off Twilio/A2P (campaign rejected twice,
-- err 30909) to Sendblue / another provider. The twilio-sms and
-- twilio-webhook edge functions + docs/sms consent material were
-- removed from the repo this session.
--
-- sms_log is Twilio-shaped (twilio_sid, Twilio error codes) and was
-- verified EMPTY (0 rows) before this drop, so no data is lost.
--
-- DELIBERATELY KEPT (reusable by a future Sendblue messaging flow):
--   * staff.phone_number        -- 16 real records
--   * staff.sms_opt_in_at        -- consent timestamps (16 records)
--   * time_logs.reminded_at      -- generic reminder column, all NULL,
--   * time_logs.extended_at         wired into the live 5 PM EOD close fn
-- ============================================================

DROP TABLE IF EXISTS sms_log CASCADE;

-- Verification
SELECT to_regclass('public.sms_log') AS sms_log_should_be_null;
