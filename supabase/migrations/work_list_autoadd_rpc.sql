-- [ER cbc70a86 S128] add_ro_to_silo_work_lists()
-- Auto-add a repair order to the Manager Work List of each involved silo's
-- team lead, called from customer-checkin.html after a drop-off / scheduled-drop
-- RO is committed.
--
-- WHY SECURITY DEFINER: manager_work_lists RLS ("Users manage own work list")
-- only allows an authenticated user to insert rows where manager_email = their
-- own email. The check-in is run by the front desk, who must write to OTHER
-- managers' lists, so the insert is done inside this definer function (owned by
-- a privileged role) which bypasses that with_check.
--
-- Behavior:
--   * For each silo key in p_silos, find active team lead(s) in staff where
--     service_silo = that key (roles manager / sr_manager / parts_manager).
--   * If a silo has NO mapped lead (today: roof, paint_body, chassis, detailing,
--     truetopper), fall back to all active sr_managers so the RO is never dropped.
--   * Skip a (manager, ro, silo) combo that already exists (idempotent — safe on
--     a returning-customer re-check-in or a double submit).
--   * priority = that manager's current MAX(priority)+1 (append to bottom).
--   * Returns the number of rows actually inserted.
--
-- ro_id is stored as TEXT holding the RO UUID (existing column convention), so
-- p_ro_id is cast to text on insert.

CREATE OR REPLACE FUNCTION public.add_ro_to_silo_work_lists(p_ro_id uuid, p_silos text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ro_name  text;
    v_silo     text;
    v_email    text;
    v_targets  text[];
    v_next_pri integer;
    v_inserted integer := 0;
BEGIN
    -- Trust the DB for the display name, not the caller. Unknown / deleted RO => no-op.
    SELECT customer_name INTO v_ro_name
    FROM repair_orders
    WHERE id = p_ro_id AND deleted_at IS NULL;
    IF v_ro_name IS NULL THEN
        RETURN 0;
    END IF;

    FOREACH v_silo IN ARRAY COALESCE(p_silos, ARRAY[]::text[])
    LOOP
        -- Team lead(s) mapped to this silo
        SELECT array_agg(email) INTO v_targets
        FROM staff
        WHERE active IS DISTINCT FROM false
          AND email IS NOT NULL
          AND role IN ('manager', 'sr_manager', 'parts_manager')
          AND service_silo = v_silo;

        -- Fallback: no mapped lead for this silo -> all active sr_managers
        IF v_targets IS NULL OR array_length(v_targets, 1) IS NULL THEN
            SELECT array_agg(email) INTO v_targets
            FROM staff
            WHERE active IS DISTINCT FROM false
              AND email IS NOT NULL
              AND role = 'sr_manager';
        END IF;

        IF v_targets IS NULL THEN
            CONTINUE;
        END IF;

        FOREACH v_email IN ARRAY v_targets
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM manager_work_lists
                WHERE manager_email = v_email
                  AND ro_id = p_ro_id::text
                  AND service_silo IS NOT DISTINCT FROM v_silo
            ) THEN
                SELECT COALESCE(MAX(priority), 0) + 1 INTO v_next_pri
                FROM manager_work_lists
                WHERE manager_email = v_email;

                INSERT INTO manager_work_lists (manager_email, ro_id, ro_name, priority, service_silo)
                VALUES (v_email, p_ro_id::text, v_ro_name, v_next_pri, v_silo);

                v_inserted := v_inserted + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_ro_to_silo_work_lists(uuid, text[]) TO authenticated;
