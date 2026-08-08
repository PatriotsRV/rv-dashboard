-- ============================================================================
-- cashiered_full_detail_s171.sql — Session 171 (2026-08-08)
-- ER 09084bc5 (Lynn, LARGE): cash-out permanently destroyed data.
--
-- TWO defects, one root cause (a duplicated allowlist):
--   1. Both archive paths (Saturday cron archive_cashiered_ros() AND the
--      client-side ⚙️ Archive button) copy a 26-column allowlist into
--      `cashiered` that OMITS photo_library, planned_dropoff_date,
--      pickup_date, key_status, keypad_code, keep_plugged_in and
--      urgent_update — then hard-delete the repair_orders row. The photo/doc
--      library (storage paths in photo_library jsonb) became unreachable;
--      reactivateRO could not restore any of it.
--   2. WORSE (found this session, not in the ER): the client-side path never
--      wrote the cashiered_* child mirrors at all — those live only inside
--      archive_cashiered_ros(). A manual ⚙️ Archive lost parts, time logs,
--      notes, audit trail, WOs and tasks with NO mirror. (Verified: no
--      trigger covers it; mirrors are written only by the cron function.)
--
-- Fix at the shape: ONE per-RO SQL body — archive_one_ro() — used by both
-- the cron loop and a NEW client-facing RPC archive_single_ro(). The client
-- JS stops duplicating the insert+delete entirely (v1.494).
--
-- Storage objects are never deleted by archiving, so preserving
-- photo_library preserves working file access for archived ROs.
--
-- Roland: paste this entire file into the Supabase SQL editor and Run.
-- Idempotent — safe to run twice.
-- ============================================================================

-- ── 1. Widen cashiered: the 7 dropped columns (types match repair_orders) ──

ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS photo_library        JSONB;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS planned_dropoff_date DATE;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS pickup_date          DATE;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS key_status           TEXT;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS keypad_code          TEXT;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS keep_plugged_in      BOOLEAN;
ALTER TABLE cashiered ADD COLUMN IF NOT EXISTS urgent_update        TEXT;

-- ── 2. archive_one_ro(): the single per-RO archive body ──
-- Same semantics as the S73 loop body, plus the 7 columns.
-- ON CONFLICT (already archived): skips snapshot, still deletes the live row
-- — unchanged from the S73 behavior.

CREATE OR REPLACE FUNCTION archive_one_ro(p_ro_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ro_row           record;
  week_num         int;
  week_label       text;
  days_on_lot      int;
  now_ts           timestamptz := now();
  new_cashiered_id uuid;
  ins_jsonb        jsonb;
BEGIN
  SELECT * INTO ro_row FROM repair_orders
   WHERE id = p_ro_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  week_num   := EXTRACT(week FROM now_ts)::int;
  week_label := 'Week ' || week_num || ' ' || EXTRACT(year FROM now_ts)::int;

  days_on_lot := CASE
    WHEN ro_row.date_arrived IS NOT NULL
      THEN (now_ts::date - ro_row.date_arrived::date)
    WHEN ro_row.date_received IS NOT NULL
      THEN (now_ts::date - ro_row.date_received::date)
    ELSE 0
  END;

  BEGIN
    IF ro_row.insurance_data IS NULL
       OR length(trim(ro_row.insurance_data::text)) = 0 THEN
      ins_jsonb := NULL;
    ELSE
      ins_jsonb := ro_row.insurance_data::text::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ins_jsonb := NULL;
  END;

  new_cashiered_id := NULL;
  INSERT INTO cashiered (
    original_ro_id, ro_id, customer_name, phone, email, address, rv, vin,
    repair_type, description, technician, date_received, date_arrived,
    promised_date, pct_complete, dollar_value, status, urgency, customer_type,
    ro_type, photo_url, insurance_data, days_on_lot, date_closed, week_label,
    archived_at,
    photo_library, planned_dropoff_date, pickup_date,
    key_status, keypad_code, keep_plugged_in, urgent_update
  ) VALUES (
    ro_row.id, ro_row.ro_id, ro_row.customer_name, ro_row.phone,
    ro_row.email, ro_row.address, ro_row.rv, ro_row.vin,
    ro_row.repair_type, ro_row.description, ro_row.technician,
    ro_row.date_received, ro_row.date_arrived, ro_row.promised_date,
    COALESCE(ro_row.pct_complete, 0), ro_row.dollar_value, ro_row.status,
    ro_row.urgency, ro_row.customer_type, COALESCE(ro_row.ro_type, 'standard'),
    ro_row.photo_url, ins_jsonb,
    days_on_lot, now_ts::date, week_label, now_ts,
    ro_row.photo_library, ro_row.planned_dropoff_date, ro_row.pickup_date,
    ro_row.key_status, ro_row.keypad_code, ro_row.keep_plugged_in,
    ro_row.urgent_update
  )
  ON CONFLICT (original_ro_id) DO NOTHING
  RETURNING id INTO new_cashiered_id;

  IF new_cashiered_id IS NOT NULL THEN
    INSERT INTO cashiered_parts (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, p.id, ro_row.id, to_jsonb(p.*)
      FROM parts p WHERE p.ro_id = ro_row.id;

    INSERT INTO cashiered_time_logs (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, t.id, ro_row.id, to_jsonb(t.*)
      FROM time_logs t WHERE t.ro_id = ro_row.id;

    INSERT INTO cashiered_notes (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, n.id, ro_row.id, to_jsonb(n.*)
      FROM notes n WHERE n.ro_id = ro_row.id;

    INSERT INTO cashiered_audit_log (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, a.id, ro_row.id, to_jsonb(a.*)
      FROM audit_log a WHERE a.ro_id = ro_row.id;

    INSERT INTO cashiered_insurance_scans (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, i.id, ro_row.id, to_jsonb(i.*)
      FROM insurance_scans i WHERE i.ro_id = ro_row.id;

    INSERT INTO cashiered_service_work_orders (cashiered_id, source_id, original_ro_id, source_data)
    SELECT new_cashiered_id, swo.id, ro_row.id, to_jsonb(swo.*)
      FROM service_work_orders swo WHERE swo.ro_id = ro_row.id;

    INSERT INTO cashiered_service_tasks
      (cashiered_id, source_id, original_ro_id, original_work_order_id, source_data)
    SELECT new_cashiered_id, st.id, ro_row.id, st.work_order_id, to_jsonb(st.*)
      FROM service_tasks st WHERE st.ro_id = ro_row.id;
  END IF;

  DELETE FROM repair_orders WHERE id = ro_row.id;
  RETURN true;
END;
$$;

-- Private: only the cron function and the gated RPC call this.
REVOKE ALL ON FUNCTION archive_one_ro(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION archive_one_ro(uuid) FROM anon;
REVOKE ALL ON FUNCTION archive_one_ro(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION archive_one_ro(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION archive_one_ro(uuid) TO service_role;

-- ── 3. archive_cashiered_ros(): cron loop now delegates to archive_one_ro ──

CREATE OR REPLACE FUNCTION archive_cashiered_ros()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ro_id_row       record;
  archived_count  int := 0;
BEGIN
  FOR ro_id_row IN
    SELECT id FROM repair_orders
    WHERE status = 'Delivered/Cashed Out'
      AND deleted_at IS NULL
  LOOP
    IF archive_one_ro(ro_id_row.id) THEN
      archived_count := archived_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s) at %', archived_count, now();
END;
$$;

GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO postgres;
GRANT EXECUTE ON FUNCTION archive_cashiered_ros() TO service_role;

-- ── 4. archive_single_ro(): the client-facing RPC (manager+ gated) ──
-- Replaces the client-side insert+delete pair in archiveROInSupabase
-- (js/ro-crud.js v1.494) — the manual ⚙️ Archive now gets the child mirrors
-- and the full column set transactionally.

CREATE OR REPLACE FUNCTION archive_single_ro(p_ro_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Only managers and admins can archive an RO';
  END IF;
  RETURN archive_one_ro(p_ro_id);
END;
$$;

REVOKE ALL ON FUNCTION archive_single_ro(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION archive_single_ro(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION archive_single_ro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_single_ro(uuid) TO service_role;

-- ── VERIFY ──
-- V1: 7 new columns present
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='cashiered' AND column_name IN
--   ('photo_library','planned_dropoff_date','pickup_date','key_status',
--    'keypad_code','keep_plugged_in','urgent_update');
-- V2: 3 functions exist
--   SELECT proname FROM pg_proc WHERE proname IN
--   ('archive_one_ro','archive_cashiered_ros','archive_single_ro');
