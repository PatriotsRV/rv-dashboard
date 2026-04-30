-- Cashiered RO Saturday Archiver (Session 61, 2026-04-29)
-- Replaces the legacy Google Sheets Saturday 5 PM archiver job.
-- Runs every Saturday at 22:00 UTC = 5:00 PM CDT (UTC-5) / 6:00 PM CST (UTC-6).
--
-- Moves all repair_orders with status = 'Delivered/Cashed Out' (not soft-deleted)
-- into the cashiered table, then hard-deletes them from repair_orders.
-- Field mapping mirrors archiveROInSupabase() in index.html (lines 11263-11306).
--
-- Roland: paste this entire file into Supabase SQL Editor and Run.

-- ── Step 1: Create the archiver function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION archive_cashiered_ros()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ro_row       record;
  week_num     int;
  week_label   text;
  days_on_lot  int;
  now_ts       timestamptz := now();
  archived_count int := 0;
BEGIN
  -- Week label matches getWeekLabel() in index.html
  week_num   := EXTRACT(isodow FROM now_ts)::int;  -- 1=Mon … 7=Sun
  week_num   := EXTRACT(week   FROM now_ts)::int;
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

    -- Insert into cashiered (ON CONFLICT DO NOTHING: safe to re-run if cron fires twice)
    INSERT INTO cashiered (
      original_ro_id,
      ro_id,
      customer_name,
      phone,
      email,
      address,
      rv,
      vin,
      repair_type,
      description,
      technician,
      date_received,
      date_arrived,
      promised_date,
      pct_complete,
      dollar_value,
      status,
      urgency,
      customer_type,
      ro_type,
      photo_url,
      insurance_data,
      days_on_lot,
      date_closed,
      week_label,
      archived_at
    ) VALUES (
      ro_row.id,
      ro_row.ro_id,
      ro_row.customer_name,
      ro_row.customer_phone,
      ro_row.customer_email,
      ro_row.customer_address,
      ro_row.rv,
      ro_row.vin,
      ro_row.repair_type,
      ro_row.description,
      ro_row.technician,
      ro_row.date_received,
      ro_row.date_arrived,
      ro_row.promised_date,
      COALESCE(ro_row.pct_complete, 0),
      ro_row.dollar_value,
      ro_row.status,
      ro_row.urgency,
      ro_row.customer_type,
      COALESCE(ro_row.ro_type, 'standard'),
      ro_row.photo_url,
      CASE
        WHEN ro_row.insurance_data IS NOT NULL AND ro_row.insurance_data <> ''
          THEN ro_row.insurance_data::jsonb
        ELSE NULL
      END,
      days_on_lot,
      now_ts::date,
      week_label,
      now_ts
    )
    ON CONFLICT (original_ro_id) DO NOTHING;

    -- Hard-delete from repair_orders only if cashiered insert succeeded
    -- (ON CONFLICT means it was already archived — still safe to delete)
    DELETE FROM repair_orders WHERE id = ro_row.id;

    archived_count := archived_count + 1;
  END LOOP;

  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s) at %', archived_count, now_ts;
END;
$$;

-- Grant execute to service role and postgres (pg_cron runs as postgres)
GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO postgres;
GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO service_role;

-- ── Step 2: Schedule the pg_cron job ─────────────────────────────────────────
-- Every Saturday at 22:00 UTC = 5:00 PM CDT

SELECT cron.schedule(
  'archive-cashiered-ros',   -- job name
  '0 22 * * 6',              -- every Saturday at 22:00 UTC
  $$SELECT archive_cashiered_ros();$$
);

-- ── Step 3: Verify ───────────────────────────────────────────────────────────

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'archive-cashiered-ros';
