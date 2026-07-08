-- stamp_date_received_on_parts.sql  (S135, 2026-07-08)
--
-- WHY: The "CAME IN - RECEIVE THEM" box in send-parts-report used to window on
-- parts.updated_at, which any edit bumps (and the S115 set_updated_at trigger
-- fires on every UPDATE), so parts received days ago re-surfaced as if they had
-- just arrived. The report now windows on parts.date_received instead. But the
-- quick "Received" button (js/parts.js markPartReceived) sets status='Received'
-- WITHOUT stamping date_received, so 116 of 225 received parts have a NULL
-- receipt date. This trigger records the receipt date at the moment a part
-- transitions INTO 'Received' on ANY path (quick button, parts form, console
-- check-in, future paths) so the date-based report window works correctly.
--
-- DESIGN:
--   * Only stamps when NEW.status='Received' AND NEW.date_received IS NULL.
--   * Only on the TRANSITION into Received (INSERT already-Received, or an
--     UPDATE where OLD.status was not 'Received'). This is deliberate: editing
--     an already-Received part must NOT (re)stamp today's date, or it would
--     wrongly resurface the part in the "CAME IN" box — the exact bug we are
--     fixing. Existing NULL-date received parts therefore stay NULL (they were
--     received long ago and should not appear as "just came in").
--   * Uses the shop-local calendar day (America/Chicago) so an evening receipt
--     is dated to the shop's day, matching how staff think about "today".
--   * Never overwrites an explicitly-provided date_received (form entry wins).
--
-- SAFE TO RE-RUN: idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- Coexists with the S115 trg_set_updated_at BEFORE trigger (different column).

CREATE OR REPLACE FUNCTION stamp_date_received()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Received' AND NEW.date_received IS NULL THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Received' THEN
      NEW.date_received := (now() AT TIME ZONE 'America/Chicago')::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_date_received ON parts;
CREATE TRIGGER trg_stamp_date_received
BEFORE INSERT OR UPDATE ON parts
FOR EACH ROW
EXECUTE FUNCTION stamp_date_received();
