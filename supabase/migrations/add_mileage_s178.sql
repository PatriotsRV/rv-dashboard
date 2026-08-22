-- add_mileage_s178.sql — Session 178 (2026-08-22)
-- ER ac8265c8 (Lynn): add mileage to the repair order.
--
-- THREE parts, because archive_one_ro() enumerates columns (S171 lesson —
-- anything not named there is silently DROPPED at cash-out):
--   1. repair_orders.mileage  (free text, like key_status — no CHECK; S118 precedent)
--   2. cashiered.mileage      (the archive twin)
--   3. archive_one_ro() recreated with mileage carried through.
--      Body is otherwise IDENTICAL to cashiered_full_detail_s171.sql
--      (live md5 46e1eaa7ba43859d6b4d2f4fed77e2f4 verified 2026-08-22).
--
-- ⚠️ RUN THIS BEFORE PROMOTING v1.498 — the Edit-RO save payload includes
-- mileage from v1.498 on, and errors on a DB without the column.

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS mileage text;
ALTER TABLE cashiered     ADD COLUMN IF NOT EXISTS mileage text;

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
    mileage,
    repair_type, description, technician, date_received, date_arrived,
    promised_date, pct_complete, dollar_value, status, urgency, customer_type,
    ro_type, photo_url, insurance_data, days_on_lot, date_closed, week_label,
    archived_at,
    photo_library, planned_dropoff_date, pickup_date,
    key_status, keypad_code, keep_plugged_in, urgent_update
  ) VALUES (
    ro_row.id, ro_row.ro_id, ro_row.customer_name, ro_row.phone,
    ro_row.email, ro_row.address, ro_row.rv, ro_row.vin,
    ro_row.mileage,
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
