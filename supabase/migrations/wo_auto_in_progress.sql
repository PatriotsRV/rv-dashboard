-- ============================================================================
-- WO AUTO-FLIP: not_started -> in_progress at first tech clock-in (Session 103)
-- ============================================================================
-- Problem (found Session 102, Dez Rock PRVS-7BE2-236F): tech clock-in auto-flips
-- the RO status (checkin v1.33) but NOTHING flips the silo WO's
-- service_work_orders.status -- Dez Rock's $24k Solar WO sat not_started through
-- 3 weeks of clocked hours, so Weekly P&L WIP/recognition looked dead.
--
-- Fix: AFTER INSERT trigger on time_logs (trigger > RPC: catches offline-replay
-- inserts too, mirrors the GH#33 auto-close pattern). On clock-in, map the
-- comma-separated service_type tokens to WO silos (same map as the weekly_pnl
-- RPC) and UPGRADE ONLY any matching not_started WO to in_progress.
-- Never downgrades in_progress / awaiting_customer_approval / customer_approved
-- / completed. Each flip writes an audit_log row attributed
-- '<tech> (auto via clock-in)' -- same convention as checkin v1.33 RO auto-status.
-- 'Shop' / blank / unmapped service types are a no-op.
--
-- Leaves managers only the Done-Done click (pairs with the P&L adoption TODO).
--
-- STAGE 1 pre-flight (run first, read-only): count of open WOs the backfill hits.
-- Result when written: 16 rows (incl. both Dez Rock WOs).
-- ============================================================================

-- STAGE 2: trigger function + trigger -------------------------------------

CREATE OR REPLACE FUNCTION auto_flip_wo_in_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_silos     text[];
    v_wo        RECORD;
    v_tech_name text;
BEGIN
    IF NEW.ro_id IS NULL THEN RETURN NEW; END IF;

    -- service_type tokens -> WO silos (mirrors the weekly_pnl RPC silo_map)
    SELECT array_agg(DISTINCT m.silo) INTO v_silos
    FROM unnest(string_to_array(COALESCE(NEW.service_type, ''), ',')) t(raw)
    JOIN (VALUES ('roof','roof'), ('solar','solar'), ('vroom','vroom'),
                 ('paint and body','paint_body'), ('repairs','repair'),
                 ('repair','repair'), ('truetopper','truetopper'),
                 ('detailing','detailing'), ('chassis','chassis')
         ) m(raw, silo) ON m.raw = lower(btrim(t.raw));

    IF v_silos IS NULL THEN RETURN NEW; END IF;   -- Shop / blank / unmapped

    SELECT COALESCE(s.name, NEW.tech_email, 'unknown') INTO v_tech_name
    FROM staff s WHERE lower(s.email) = lower(COALESCE(NEW.tech_email, ''));
    IF v_tech_name IS NULL THEN v_tech_name := COALESCE(NEW.tech_email, 'unknown'); END IF;

    FOR v_wo IN
        UPDATE service_work_orders swo
           SET status = 'in_progress', updated_at = now()
         WHERE swo.ro_id = NEW.ro_id
           AND swo.service_silo = ANY (v_silos)
           AND swo.status = 'not_started'        -- UPGRADE ONLY
        RETURNING swo.service_silo
    LOOP
        INSERT INTO audit_log (ro_id, user_email, user_name, field_changed,
                               old_value, new_value, changed_at)
        VALUES (NEW.ro_id, NEW.tech_email,
                v_tech_name || ' (auto via clock-in)',
                'wo_status:' || v_wo.service_silo,
                'not_started', 'in_progress', now());
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flip_wo_in_progress ON time_logs;
CREATE TRIGGER trg_auto_flip_wo_in_progress
    AFTER INSERT ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION auto_flip_wo_in_progress();

-- STAGE 3: one-time historical backfill ------------------------------------
-- Flips every currently-not_started WO whose silo already has clocked hours
-- on that RO (16 rows at time of writing). Audit-logged per WO.

WITH silo_map(raw, silo) AS (
    VALUES ('roof','roof'), ('solar','solar'), ('vroom','vroom'),
           ('paint and body','paint_body'), ('repairs','repair'),
           ('repair','repair'), ('truetopper','truetopper'),
           ('detailing','detailing'), ('chassis','chassis')
),
log_silos AS (
    SELECT DISTINCT tl.ro_id, sm.silo
    FROM time_logs tl,
         unnest(string_to_array(COALESCE(tl.service_type, ''), ',')) t(raw)
    JOIN silo_map sm ON sm.raw = lower(btrim(t.raw))
    WHERE tl.ro_id IS NOT NULL
),
flipped AS (
    UPDATE service_work_orders swo
       SET status = 'in_progress', updated_at = now()
      FROM repair_orders ro, log_silos ls
     WHERE ro.id = swo.ro_id
       AND ro.deleted_at IS NULL
       AND COALESCE(ro.is_training, false) = false
       AND ls.ro_id = swo.ro_id
       AND ls.silo = swo.service_silo
       AND swo.status = 'not_started'
    RETURNING swo.ro_id, swo.service_silo
)
INSERT INTO audit_log (ro_id, user_email, user_name, field_changed,
                       old_value, new_value, changed_at)
SELECT f.ro_id, 'system',
       'PRVS system (historical backfill S103)',
       'wo_status:' || f.service_silo,
       'not_started', 'in_progress', now()
FROM flipped f;

-- STAGE 4: verify ----------------------------------------------------------
-- (a) trigger installed:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'time_logs'::regclass AND NOT tgisinternal;
--   expect: trg_auto_close_prior_open_session + trg_auto_flip_wo_in_progress
-- (b) backfill audit rows:
--   SELECT count(*) FROM audit_log WHERE user_name = 'PRVS system (historical backfill S103)';
--   expect: 16
-- (c) no remaining not_started WOs with clocked silo hours:
--   re-run the STAGE 1 pre-flight count; expect 0
