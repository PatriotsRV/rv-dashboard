-- ============================================================
-- Sendblue Messages Schema (GH#39 Phase 2 POC, Session 98, 2026-06-09)
-- ============================================================
-- Greenfield messaging table for the Sendblue integration that replaces the
-- removed Kenect surface (v1.445). POC scope = OUTBOUND ONLY (dashboard ->
-- sendblue-send edge fn -> Sendblue -> customer iMessage/SMS), logged here.
-- Inbound reply routing + delivery/read status webhooks are DEFERRED until
-- Sendblue confirms webhook auth + status-callback mechanics (Q6-Q8 from the
-- 2026-06-09 vendor call).
--
-- Additive + safe to run anytime: the sendblue-send edge fn returns 503 when
-- the SENDBLUE_* secrets are missing, so nothing can send until configured.
-- Kept SEPARATE from the dormant Twilio-shaped sms_log (wrong shape for
-- iMessage threads: no RO link, no media array, no Sendblue message handle).
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    ro_id              UUID         REFERENCES repair_orders(id) ON DELETE SET NULL,
    ro_code            TEXT,        -- human PRVS-XXXX code, denormalized for display/search
    direction          TEXT         NOT NULL DEFAULT 'outbound'
                                    CHECK (direction IN ('outbound','inbound')),
    phone_to           TEXT,
    phone_from         TEXT,
    body               TEXT,
    media_url          TEXT[],      -- MMS attachments (outbound/inbound media; unused in the outbound POC)
    message_handle     TEXT,        -- Sendblue message handle (id) for status correlation
    status             TEXT         DEFAULT 'queued',
                                    -- queued | sent | delivered | read | failed | received | error
    is_imessage        BOOLEAN,     -- true = iMessage, false = SMS fallback (Sendblue was_downgraded), null = unknown
    error_code         TEXT,
    error_message      TEXT,
    context            TEXT,        -- 'ro_customer' | 'tech_reminder' | 'test' | ...
    sent_by            TEXT,        -- staff email that initiated an outbound send
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status_updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_ro_id          ON messages (ro_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at     ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_message_handle ON messages (message_handle);
CREATE INDEX IF NOT EXISTS idx_messages_phone_to       ON messages (phone_to);
CREATE INDEX IF NOT EXISTS idx_messages_phone_from     ON messages (phone_from);

COMMENT ON TABLE messages IS
  'Sendblue conversational messages (GH#39 Phase 2). Outbound logged by the sendblue-send edge fn (service role). Inbound + status updates land via the future sendblue-webhook edge fn. Authenticated dashboard users may READ; only the service role writes.';

-- ------------------------------------------------------------
-- RLS: authenticated users may READ (to render RO threads).
-- No client write policy exists, so INSERT/UPDATE/DELETE by authenticated
-- users are denied by default. All writes go through the edge functions
-- using the service role, which bypasses RLS entirely.
-- ------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $blk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'messages'
          AND policyname = 'messages_authenticated_read'
    ) THEN
        CREATE POLICY messages_authenticated_read ON messages
            FOR SELECT TO authenticated USING (true);
    END IF;
END
$blk$;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'messages';
