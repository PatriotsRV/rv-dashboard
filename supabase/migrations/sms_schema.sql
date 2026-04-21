-- ============================================================
-- Twilio SMS Schema (Session 53, 2026-04-21) — DORMANT
-- ============================================================
-- Lightweight SMS groundwork for Stage 1 (tech shift-end reminders).
-- Dormant until Roland completes Twilio account setup + A2P 10DLC + sets
-- the TWILIO_* Supabase secrets. The edge functions return 503 when
-- secrets are missing, so running this migration is safe anytime.
--
-- This is a SUBSET of the full TWILIO_SMS_SPEC.md schema — enough for
-- outbound tech reminders and inbound YES/OUT/STOP replies. The full
-- customer-facing SMS (sms_templates, auto-send triggers, compose modal)
-- comes in Stage 3, after the number port completes.
-- ============================================================

-- 1. staff.phone_number + sms_opt_in_at
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ;

COMMENT ON COLUMN staff.phone_number IS
  'E.164 format phone number (e.g. +15551234567). NULL = no SMS will be sent to this staff member. A2P 10DLC compliance requires sms_opt_in_at to also be set before sending.';

COMMENT ON COLUMN staff.sms_opt_in_at IS
  'Timestamp when staff member verbally consented to SMS notifications. Required for A2P compliance. Roland logs this when collecting phone numbers. Reply STOP sets this back to NULL.';

-- 2. sms_log table — audit of every outbound + inbound message.
--    Kept minimal; no RO foreign key yet (techs don't text per-RO, they
--    text per-session). FK can be added in Stage 3 when customer SMS ships.
CREATE TABLE IF NOT EXISTS sms_log (
    id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    time_log_id     UUID          REFERENCES time_logs(id) ON DELETE SET NULL,
    phone_to        TEXT          NOT NULL,
    phone_from      TEXT          NOT NULL,
    message_body    TEXT          NOT NULL,
    twilio_sid      TEXT,
    status          TEXT          DEFAULT 'queued',  -- queued|sending|sent|delivered|failed|undelivered|received
    direction       TEXT          DEFAULT 'outbound', -- outbound | inbound
    error_code      INTEGER,
    error_message   TEXT,
    context         TEXT,        -- e.g. 'shift_end_reminder', 'tech_reply_yes', 'tech_reply_out'
    created_at      TIMESTAMPTZ   DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_log_time_log_id ON sms_log (time_log_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_phone_to    ON sms_log (phone_to);
CREATE INDEX IF NOT EXISTS idx_sms_log_created_at  ON sms_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_log_twilio_sid  ON sms_log (twilio_sid);

COMMENT ON TABLE sms_log IS
  'Audit log of all tech-facing SMS (Stage 1). Customer-facing SMS will extend this schema in Stage 3.';
COMMENT ON COLUMN sms_log.time_log_id IS
  'Which clock-in session this message relates to. Lets twilio-webhook correlate a YES/OUT reply to the session the tech was reminded about.';
COMMENT ON COLUMN sms_log.context IS
  'What the message was for: shift_end_reminder | tech_reply_yes | tech_reply_out | tech_reply_stop | extension_confirm | clockout_confirm | test.';

-- 3. RLS — block all client access. Edge functions use service role.
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

DO $blk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'sms_log'
          AND policyname = 'sms_log_no_client_access'
    ) THEN
        CREATE POLICY sms_log_no_client_access ON sms_log
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END
$blk$;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'staff'
  AND column_name IN ('phone_number', 'sms_opt_in_at')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sms_log'
ORDER BY ordinal_position;
