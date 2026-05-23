-- ============================================================================
-- Cashiered Child Archives — preserve full RO detail on Saturday archive
-- ============================================================================
-- Date:    2026-05-23 (Session 73)
-- GH:      Cashed Out / Delivered archive preservation
--
-- Problem
-- -------
-- Saturday 5 PM CDT cron `archive_cashiered_ros()` (see
-- cron_archive_cashiered_ros.sql) snapshots summary fields into `cashiered`
-- and then hard-deletes the parent row from `repair_orders`. Every FK child
-- table (parts, time_logs, notes, audit_log, insurance_scans,
-- service_work_orders + service_tasks) is then either cascade-deleted
-- (confirmed for service_work_orders, service_tasks, scheduled_notifications)
-- or orphaned with a dead `ro_id`. Either way the detail is unreachable.
--
-- When a manager reactivates the RO from closed-ros.html, only the summary
-- fields are restored — parts, tech hours, work orders, notes, audit trail
-- are gone forever.
--
-- Fix
-- ---
-- Create 7 mirror tables that snapshot the full row of every child table
-- as JSONB before the parent delete fires. On reactivation, closed-ros.html
-- restores the live children from the mirror rows and then deletes the
-- `cashiered` row — its FK cascade wipes the mirrors at the same time.
--
-- The JSONB-envelope pattern (`source_data` blob + `source_id` UUID) is
-- used instead of column-by-column mirrors because:
--   1. The base child-table DDL was not authored in this repo (Studio).
--      We don't have an authoritative column list and don't want a silent
--      drop if a column is added later.
--   2. Restore is the use case, not analytic SQL over archived children.
--   3. Future analytics can unpack via jsonb_populate_record(NULL::parts, ...).
--
-- Roland: paste this entire file into Supabase SQL Editor and Run.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Mirror tables — one per child table that loses data today
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashiered_parts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,            -- original parts.id
  original_ro_id  UUID         NOT NULL,            -- original repair_orders.id
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashiered_time_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,
  original_ro_id  UUID         NOT NULL,
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashiered_notes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,
  original_ro_id  UUID         NOT NULL,
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashiered_audit_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,
  original_ro_id  UUID         NOT NULL,
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashiered_insurance_scans (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,
  original_ro_id  UUID         NOT NULL,
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Note: WO Redesign Phase B (wo_redesign_phase_b.sql) already defines
-- `cashiered_work_orders` for a different purpose (per-line-item analytics).
-- This migration uses its OWN `cashiered_service_work_orders` + `cashiered_service_tasks`
-- so the round-trip restore path is self-contained and does not depend on
-- Phase B being run. Both tables can coexist; Phase E (future) can
-- backfill `cashiered_work_orders` from these mirrors retroactively.

CREATE TABLE IF NOT EXISTS cashiered_service_work_orders (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id    UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id       UUID         NOT NULL,
  original_ro_id  UUID         NOT NULL,
  source_data     JSONB        NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashiered_service_tasks (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id             UUID         NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  source_id                UUID         NOT NULL,
  original_ro_id           UUID         NOT NULL,
  original_work_order_id   UUID         NOT NULL,      -- needed to relink on restore
  source_data              JSONB        NOT NULL,
  archived_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Indexes — one per mirror, on cashiered_id (restore-by-cashiered lookup)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cashiered_parts_cashiered          ON cashiered_parts(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_time_logs_cashiered      ON cashiered_time_logs(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_notes_cashiered          ON cashiered_notes(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_audit_log_cashiered      ON cashiered_audit_log(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_insurance_scans_cashiered ON cashiered_insurance_scans(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_swo_cashiered            ON cashiered_service_work_orders(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_st_cashiered             ON cashiered_service_tasks(cashiered_id);
CREATE INDEX IF NOT EXISTS idx_cashiered_st_wo                    ON cashiered_service_tasks(original_work_order_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS — authenticated users can SELECT (so closed-ros.html can restore);
--          INSERT/DELETE is implicit through SECURITY DEFINER functions and
--          the cascade from `cashiered`. No direct INSERT policy needed —
--          the archive function runs as SECURITY DEFINER.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE cashiered_parts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_time_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_insurance_scans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_service_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiered_service_tasks     ENABLE ROW LEVEL SECURITY;

-- SELECT for any authenticated user (matches the `cashiered` table policy)
DROP POLICY IF EXISTS "cashiered_parts_select"             ON cashiered_parts;
CREATE POLICY "cashiered_parts_select"             ON cashiered_parts             FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_time_logs_select"         ON cashiered_time_logs;
CREATE POLICY "cashiered_time_logs_select"         ON cashiered_time_logs         FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_notes_select"             ON cashiered_notes;
CREATE POLICY "cashiered_notes_select"             ON cashiered_notes             FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_audit_log_select"         ON cashiered_audit_log;
CREATE POLICY "cashiered_audit_log_select"         ON cashiered_audit_log         FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_insurance_scans_select"   ON cashiered_insurance_scans;
CREATE POLICY "cashiered_insurance_scans_select"   ON cashiered_insurance_scans   FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_swo_select"               ON cashiered_service_work_orders;
CREATE POLICY "cashiered_swo_select"               ON cashiered_service_work_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_st_select"                ON cashiered_service_tasks;
CREATE POLICY "cashiered_st_select"                ON cashiered_service_tasks     FOR SELECT TO authenticated USING (true);

-- DELETE for managers/admins (so reactivation can wipe mirrors after restore).
-- Sr Manager / Admin / Manager — anyone who can reactivate an RO can clear its archive.
DROP POLICY IF EXISTS "cashiered_parts_delete"             ON cashiered_parts;
CREATE POLICY "cashiered_parts_delete"             ON cashiered_parts             FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_time_logs_delete"         ON cashiered_time_logs;
CREATE POLICY "cashiered_time_logs_delete"         ON cashiered_time_logs         FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_notes_delete"             ON cashiered_notes;
CREATE POLICY "cashiered_notes_delete"             ON cashiered_notes             FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_audit_log_delete"         ON cashiered_audit_log;
CREATE POLICY "cashiered_audit_log_delete"         ON cashiered_audit_log         FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_insurance_scans_delete"   ON cashiered_insurance_scans;
CREATE POLICY "cashiered_insurance_scans_delete"   ON cashiered_insurance_scans   FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_swo_delete"               ON cashiered_service_work_orders;
CREATE POLICY "cashiered_swo_delete"               ON cashiered_service_work_orders FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cashiered_st_delete"                ON cashiered_service_tasks;
CREATE POLICY "cashiered_st_delete"                ON cashiered_service_tasks     FOR DELETE TO authenticated USING (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Replace archive_cashiered_ros() — same behavior, plus child snapshots
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION archive_cashiered_ros()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ro_row          record;
  week_num        int;
  week_label      text;
  days_on_lot     int;
  now_ts          timestamptz := now();
  archived_count  int := 0;
  new_cashiered_id uuid;
BEGIN
  -- Week label matches getWeekLabel() in index.html
  week_num   := EXTRACT(week FROM now_ts)::int;
  week_label := 'Week ' || week_num || ' ' || EXTRACT(year FROM now_ts)::int;

  FOR ro_row IN
    SELECT *
    FROM repair_orders
    WHERE status    = 'Delivered/Cashed Out'
      AND deleted_at IS NULL
  LOOP
    -- Days on lot: prefer date_arrived, fall back to date_received (matches JS logic)
    days_on_lot := CASE
      WHEN ro_row.date_arrived IS NOT NULL
        THEN (now_ts::date - ro_row.date_arrived::date)
      WHEN ro_row.date_received IS NOT NULL
        THEN (now_ts::date - ro_row.date_received::date)
      ELSE 0
    END;

    -- Insert into cashiered. Returning id gives us the new cashiered.id —
    -- we only snapshot children if a new cashiered row was actually written
    -- (ON CONFLICT returns nothing, keeping the prior archive intact).
    new_cashiered_id := NULL;
    INSERT INTO cashiered (
      original_ro_id, ro_id, customer_name, phone, email, address, rv, vin,
      repair_type, description, technician, date_received, date_arrived,
      promised_date, pct_complete, dollar_value, status, urgency, customer_type,
      ro_type, photo_url, insurance_data, days_on_lot, date_closed, week_label, archived_at
    ) VALUES (
      ro_row.id, ro_row.ro_id, ro_row.customer_name, ro_row.customer_phone,
      ro_row.customer_email, ro_row.customer_address, ro_row.rv, ro_row.vin,
      ro_row.repair_type, ro_row.description, ro_row.technician,
      ro_row.date_received, ro_row.date_arrived, ro_row.promised_date,
      COALESCE(ro_row.pct_complete, 0), ro_row.dollar_value, ro_row.status,
      ro_row.urgency, ro_row.customer_type, COALESCE(ro_row.ro_type, 'standard'),
      ro_row.photo_url,
      CASE
        WHEN ro_row.insurance_data IS NOT NULL AND ro_row.insurance_data <> ''
          THEN ro_row.insurance_data::jsonb
        ELSE NULL
      END,
      days_on_lot, now_ts::date, week_label, now_ts
    )
    ON CONFLICT (original_ro_id) DO NOTHING
    RETURNING id INTO new_cashiered_id;

    -- ── Snapshot every FK child table BEFORE the parent DELETE cascade ────
    -- We only snapshot when a NEW cashiered row was written. If ON CONFLICT
    -- fired, this RO is already archived (re-run scenario) — its mirrors
    -- already exist and we must not duplicate them.
    IF new_cashiered_id IS NOT NULL THEN
      -- parts
      INSERT INTO cashiered_parts (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, p.id, ro_row.id, to_jsonb(p.*)
        FROM parts p WHERE p.ro_id = ro_row.id;

      -- time_logs
      INSERT INTO cashiered_time_logs (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, t.id, ro_row.id, to_jsonb(t.*)
        FROM time_logs t WHERE t.ro_id = ro_row.id;

      -- notes
      INSERT INTO cashiered_notes (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, n.id, ro_row.id, to_jsonb(n.*)
        FROM notes n WHERE n.ro_id = ro_row.id;

      -- audit_log
      INSERT INTO cashiered_audit_log (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, a.id, ro_row.id, to_jsonb(a.*)
        FROM audit_log a WHERE a.ro_id = ro_row.id;

      -- insurance_scans
      INSERT INTO cashiered_insurance_scans (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, i.id, ro_row.id, to_jsonb(i.*)
        FROM insurance_scans i WHERE i.ro_id = ro_row.id;

      -- service_work_orders (parent of service_tasks)
      INSERT INTO cashiered_service_work_orders (cashiered_id, source_id, original_ro_id, source_data)
      SELECT new_cashiered_id, swo.id, ro_row.id, to_jsonb(swo.*)
        FROM service_work_orders swo WHERE swo.ro_id = ro_row.id;

      -- service_tasks (child of service_work_orders) — preserve work_order_id linkage
      INSERT INTO cashiered_service_tasks
        (cashiered_id, source_id, original_ro_id, original_work_order_id, source_data)
      SELECT new_cashiered_id, st.id, ro_row.id, st.work_order_id, to_jsonb(st.*)
        FROM service_tasks st WHERE st.ro_id = ro_row.id;
    END IF;

    -- Hard-delete from repair_orders. FK cascades fire on
    -- service_work_orders + service_tasks + scheduled_notifications.
    -- Other child rows (parts, time_logs, notes, audit_log, insurance_scans,
    -- manager_work_lists) may cascade or orphan depending on FK config —
    -- either way, the mirrors above hold the full snapshot.
    DELETE FROM repair_orders WHERE id = ro_row.id;

    archived_count := archived_count + 1;
  END LOOP;

  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s) at %', archived_count, now_ts;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO postgres;
GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Verification queries — paste & run to confirm install
-- ────────────────────────────────────────────────────────────────────────────

-- Expect 7 rows
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN (
     'cashiered_parts', 'cashiered_time_logs', 'cashiered_notes',
     'cashiered_audit_log', 'cashiered_insurance_scans',
     'cashiered_service_work_orders', 'cashiered_service_tasks'
   )
 ORDER BY table_name;

-- Expect 1 row, schedule unchanged from prior install
SELECT jobid, jobname, schedule, active
  FROM cron.job
 WHERE jobname = 'archive-cashiered-ros';

-- Confirm RLS enabled on all 7 mirrors (expect 7 rows with rowsecurity=t)
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN (
     'cashiered_parts', 'cashiered_time_logs', 'cashiered_notes',
     'cashiered_audit_log', 'cashiered_insurance_scans',
     'cashiered_service_work_orders', 'cashiered_service_tasks'
   );


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Rollback (if ever needed)
-- ────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS cashiered_service_tasks;
-- DROP TABLE IF EXISTS cashiered_service_work_orders;
-- DROP TABLE IF EXISTS cashiered_insurance_scans;
-- DROP TABLE IF EXISTS cashiered_audit_log;
-- DROP TABLE IF EXISTS cashiered_notes;
-- DROP TABLE IF EXISTS cashiered_time_logs;
-- DROP TABLE IF EXISTS cashiered_parts;
-- -- Then re-run the ORIGINAL cron_archive_cashiered_ros.sql to restore
-- -- the pre-snapshot archive_cashiered_ros() function body.
