-- ============================================================================
-- ro_receivables_s185.sql — Session 185 (2026-08-26)
--
-- THE PROBLEM (Roland + service manager, S185)
--   ROs are routinely cashed out and the RV delivered while an insurance or
--   extended-warranty check is still in the mail. Today nothing records that a
--   balance is outstanding, so the only thing standing between PRVS and an
--   uncollected check is somebody remembering. `repair_orders` carries
--   `dollar_value` and `deductible` and has NO concept of collected-vs-owed.
--
-- WHY THIS IS NOT A 19th STATUS (design call, S185)
--   The first instinct was a status: 'Cashed Out - Awaiting Final Payment'.
--   Rejected for three concrete reasons:
--
--   1. THE SUNDAY SWEEP FORCES A LOSING CHOICE. archive_cashiered_ros() files
--      terminal statuses into `cashiered`. In the sweep -> the receivable lands
--      on an archived RO (and `cashiered` still has no photo_library/doc UI —
--      open TODO). Out of the sweep -> the RO sits on the active board forever
--      and inflates the unwatched-RO count S183 measured at 39/88.
--
--   2. IT WOULD SILENTLY KILL THE REVIEW REQUEST. enqueue_review_request()
--      keys on `status = 'Delivered/Cashed Out'`, exactly. These customers were
--      billed and did pick up — the review should still fire. A 19th status
--      suppresses it with no error. That is the S172 "widened one side only"
--      failure in a new costume.
--
--   3. A STATUS IS A LABEL, NOT A NUMBER. "Awaiting payment" is not actionable.
--      "$3,400 from Progressive, 14 days overdue" is.
--
--   So: the RO keeps status 'Delivered/Cashed Out' and the money moves into its
--   own record. Service state and financial state are orthogonal and are now
--   modelled that way. An RO can carry TWO receivables (insurance + extended
--   warranty on one claim), which a status column could never represent.
--
-- WHAT THIS DOES
--   1. Creates `ro_receivables` + RLS + partial index on the open rows.
--   2. Widens scheduled_notifications.source CHECK to add
--      'receivable_followup'. The 13 existing values were read LIVE from
--      pg_constraint, not copied from the newest migration file — seven
--      separate migrations have widened this constraint and each re-lists the
--      whole array, so the newest FILE is not the source of truth. (S127 gotcha)
--   3. ARCHIVE HOLD: archive_cashiered_ros() now skips any RO with an open
--      receivable. This is the piece that actually prevents the loss — the RO
--      stays put until the money lands or is written off.
--   4. enqueue_receivable_reminders(): re-nudges info@ every 7 days for any
--      open receivable that is due or overdue. Daily cron 8:30 AM CDT.
--   5. Seeds app_config.receivable_reminder_email = info@patriotsrvservices.com
--      so the recipient can change without a release.
--
-- IDEMPOTENT — safe to re-run.
-- RUN IN: Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ro_receivables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ro_receivables (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ro_id             UUID          NOT NULL REFERENCES public.repair_orders(id) ON DELETE CASCADE,

  -- Snapshots, deliberately denormalised. The RO archives into `cashiered` once
  -- this clears, and the FK above goes with it. These two columns keep the
  -- receivable legible in a report after that happens.
  ro_display_id     TEXT,
  customer_name     TEXT,

  payer_type        TEXT          NOT NULL
                    CHECK (payer_type IN ('insurance', 'extended_warranty', 'customer', 'other')),
  payer_name        TEXT,                    -- 'Progressive', 'Good Sam ESP'
  amount_expected   NUMERIC(10,2) NOT NULL CHECK (amount_expected > 0),
  amount_received   NUMERIC(10,2),
  expected_by       DATE,
  method            TEXT,                    -- 'mailed check', 'ACH', 'card'

  status            TEXT          NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'paid', 'written_off', 'cancelled')),

  opened_by_email   TEXT          NOT NULL,
  opened_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  cleared_by_email  TEXT,
  cleared_at        TIMESTAMPTZ,

  last_reminder_at  TIMESTAMPTZ,
  reminder_count    INT           NOT NULL DEFAULT 0,

  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A cleared receivable must say who cleared it and when.
  CONSTRAINT ro_receivables_cleared_complete CHECK (
    status = 'open'
    OR (cleared_by_email IS NOT NULL AND cleared_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.ro_receivables IS
  'S185: money still owed on an RO that has already been cashed out and delivered — '
  'typically an insurance or extended-warranty check in the mail. An open row HOLDS '
  'the RO out of the Sunday archive sweep until it is paid, written off, or cancelled.';

CREATE INDEX IF NOT EXISTS idx_ro_receivables_open
  ON public.ro_receivables (expected_by)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_ro_receivables_ro_id
  ON public.ro_receivables (ro_id);

ALTER TABLE public.ro_receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ro_receivables_authenticated_full_access" ON public.ro_receivables;
CREATE POLICY "ro_receivables_authenticated_full_access"
  ON public.ro_receivables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- keep updated_at honest
CREATE OR REPLACE FUNCTION public.touch_ro_receivables_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_ro_receivables ON public.ro_receivables;
CREATE TRIGGER trg_touch_ro_receivables
  BEFORE UPDATE ON public.ro_receivables
  FOR EACH ROW EXECUTE FUNCTION public.touch_ro_receivables_updated_at();


-- ----------------------------------------------------------------------------
-- 2. scheduled_notifications.source — 13 -> 14
--
--    The 13 existing values below were read live from pg_constraint on
--    2026-08-26. Do NOT copy this list from an older migration file; seven
--    migrations have widened this constraint independently and re-listing a
--    stale array silently DROPS whichever source someone added in between.
-- ----------------------------------------------------------------------------

ALTER TABLE public.scheduled_notifications
  DROP CONSTRAINT IF EXISTS scheduled_notifications_source_check;

ALTER TABLE public.scheduled_notifications
  ADD CONSTRAINT scheduled_notifications_source_check
  CHECK (source = ANY (ARRAY[
    'manual',
    'auto_dropoff_reminder',
    'auto_promised_reminder',
    'auto_pickup_reminder',
    'service_added_notify',
    'urgent_update_notify',
    'inbound_message_notify',
    'stale_message_alarm',
    'conversation_assigned',
    'assigned_inbound_notify',
    'review_feedback_notify',
    'unreplied_eod_reminder',
    'approval_notify',
    'receivable_followup'
  ]::text[]));


-- ----------------------------------------------------------------------------
-- 3. Recipient lives in app_config so it can change without a release
-- ----------------------------------------------------------------------------

INSERT INTO public.app_config (key, value, label)
VALUES ('receivable_reminder_email', 'info@patriotsrvservices.com',
        'Where outstanding-payment reminders are sent')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_config (key, value, label)
VALUES ('receivable_reminder_interval_days', '7',
        'Days between re-nudges while a receivable stays open')
ON CONFLICT (key) DO NOTHING;

-- Kill switch for the counter prompt. Set to 'false' to stop asking
-- "collected in full?" on every billed cash-out — no release required.
INSERT INTO public.app_config (key, value, label)
VALUES ('cashout_balance_prompt', 'true',
        'Ask "collected in full?" when cashing out a billed RO')
ON CONFLICT (key) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4. ARCHIVE HOLD — the sweep skips ROs with an open receivable
--
--    This is the load-bearing change. Everything else is reporting.
--    Body is otherwise byte-for-byte the S183 version (verified live against
--    pg_get_functiondef before editing).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_cashiered_ros()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ro_id_row       record;
  archived_count  int := 0;
  held_count      int := 0;
BEGIN
  SELECT count(*) INTO held_count
    FROM repair_orders ro
   WHERE ro.status IN ('Delivered/Cashed Out', 'Closed - No Charge')
     AND ro.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM ro_receivables r
                  WHERE r.ro_id = ro.id AND r.status = 'open');

  FOR ro_id_row IN
    SELECT id FROM repair_orders ro
    WHERE ro.status IN ('Delivered/Cashed Out', 'Closed - No Charge')
      AND ro.deleted_at IS NULL
      -- [S185] ARCHIVE HOLD: an RO with money still outstanding stays on the
      -- books. Clearing the receivable (paid / written_off / cancelled) releases
      -- it and the next sweep files it normally.
      AND NOT EXISTS (SELECT 1 FROM ro_receivables r
                       WHERE r.ro_id = ro.id AND r.status = 'open')
  LOOP
    IF archive_one_ro(ro_id_row.id) THEN
      archived_count := archived_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s), held % for open receivables, at %',
    archived_count, held_count, now();
END;
$function$;


-- ----------------------------------------------------------------------------
-- 5. The 7-day re-nudge
--
--    Inserts a pending scheduled_notifications row; the existing 15-minute
--    process-scheduled-notifications cron sends it. No new delivery machinery.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_receivable_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r             record;
  v_to          text;
  v_days        int;
  v_age         int;
  v_queued      int := 0;
BEGIN
  SELECT value INTO v_to FROM app_config WHERE key = 'receivable_reminder_email';
  v_to := coalesce(v_to, 'info@patriotsrvservices.com');

  SELECT value::int INTO v_days FROM app_config WHERE key = 'receivable_reminder_interval_days';
  v_days := coalesce(v_days, 7);

  FOR r IN
    SELECT * FROM ro_receivables
     WHERE status = 'open'
       AND expected_by IS NOT NULL
       AND expected_by <= current_date
       AND (last_reminder_at IS NULL
            OR last_reminder_at < now() - make_interval(days => v_days))
     ORDER BY expected_by ASC
  LOOP
    v_age := current_date - r.expected_by;

    INSERT INTO scheduled_notifications
      (ro_id, scheduled_at, recipient_emails, subject, body, source, created_by_email)
    VALUES (
      r.ro_id,
      now(),
      ARRAY[v_to],
      '💵 Outstanding payment: ' || coalesce(r.ro_display_id, 'RO')
        || ' — $' || to_char(r.amount_expected, 'FM999,999,990.00')
        || CASE WHEN v_age > 0 THEN ' (' || v_age || ' days overdue)' ELSE ' (due today)' END,
      'This RO was cashed out and delivered with a balance still outstanding.'
        || E'\n\n'
        || 'RO:            ' || coalesce(r.ro_display_id, '(unknown)') || E'\n'
        || 'Customer:      ' || coalesce(r.customer_name, '(unknown)') || E'\n'
        || 'Amount due:    $' || to_char(r.amount_expected, 'FM999,999,990.00') || E'\n'
        || 'Owed by:       ' || coalesce(r.payer_name, r.payer_type) || E'\n'
        || 'Method:        ' || coalesce(r.method, 'not recorded') || E'\n'
        || 'Expected by:   ' || to_char(r.expected_by, 'Mon DD, YYYY')
        || CASE WHEN v_age > 0 THEN '  (' || v_age || ' days overdue)' ELSE '' END || E'\n'
        || 'Cashed out by: ' || coalesce(r.opened_by_email, '(unknown)') || E'\n'
        || 'Reminders sent so far: ' || r.reminder_count || E'\n'
        || coalesce(E'\nNotes: ' || r.notes, '')
        || E'\n\n'
        || 'This RO is being HELD out of the weekly archive until the balance is '
        || 'cleared. Mark it paid or written off on the RO to release it.' || E'\n'
        || 'You will get this again in ' || v_days || ' days while it stays open.',
      'receivable_followup',
      'system@patriotsrvservices.com'
    );

    UPDATE ro_receivables
       SET last_reminder_at = now(),
           reminder_count   = reminder_count + 1
     WHERE id = r.id;

    v_queued := v_queued + 1;
  END LOOP;

  RAISE NOTICE 'enqueue_receivable_reminders: queued % reminder(s) to % at %', v_queued, v_to, now();
END;
$function$;

COMMIT;


-- ----------------------------------------------------------------------------
-- 6. Daily cron — 8:30 AM CDT (13:30 UTC), weekdays.
--    Sits after the 7 AM manager report and the 8 AM parts report so the three
--    money-facing sends do not land on top of each other.
--    Run OUTSIDE the transaction above.
-- ----------------------------------------------------------------------------

SELECT cron.unschedule('enqueue-receivable-reminders')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enqueue-receivable-reminders');

SELECT cron.schedule(
  'enqueue-receivable-reminders',
  '30 13 * * 1-5',
  $$SELECT public.enqueue_receivable_reminders();$$
);


-- ============================================================================
-- VERIFY — run these after COMMIT and paste the output.
-- ============================================================================

-- (a) Table exists with the expected shape
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='ro_receivables'
 order by ordinal_position;

-- (b) source CHECK must now list 14 values INCLUDING receivable_followup
--     AND still include approval_notify (proves nothing was dropped)
select
  (pg_get_constraintdef(oid) like '%receivable_followup%') as has_new_source,
  (pg_get_constraintdef(oid) like '%approval_notify%')     as kept_approval_notify,
  (pg_get_constraintdef(oid) like '%unreplied_eod_reminder%') as kept_unreplied_eod
  from pg_constraint where conname='scheduled_notifications_source_check';

-- (c) Archive hold is live
select pg_get_functiondef(p.oid) like '%ro_receivables%' as sweep_holds
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='archive_cashiered_ros';

-- (d) Cron registered
select jobname, schedule, active from cron.job
 where jobname = 'enqueue-receivable-reminders';

-- (e) Config seeded
select key, value from app_config
 where key in ('receivable_reminder_email','receivable_reminder_interval_days');

-- (f) Dry run — should report "queued 0" on a clean install
select public.enqueue_receivable_reminders();
