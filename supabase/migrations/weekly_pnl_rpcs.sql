-- ============================================================
-- WEEKLY P&L - PHASE 1 STAGE 2: RPCs (Session 99, 2026-06-10)
-- Spec: docs/specs/WEEKLY_PNL_SPEC.md v0.2 section 7
-- Requires Stage 1 (weekly_pnl_phase1.sql) to have run first.
--
-- weekly_pnl(p_start, p_end)        -> silo x week aggregates
-- weekly_pnl_detail(p_week, p_silo) -> per-RO drill-down rows
--
-- Security: SECURITY DEFINER (reads bypass RLS so cashiered
-- mirrors + staff rates resolve). Gate: authenticated callers
-- must have the Admin role; SQL-editor / service-role calls
-- (auth.uid() IS NULL) pass for ops + validation. EXECUTE is
-- revoked from anon/public.
--
-- Cost basis (Roland 2026-06-10): wholesale is PER UNIT; the
-- core_charge column stores FREIGHT (per the form label) entered
-- per WHOLE LINE -> part cost = wholesale * qty + core_charge.
-- Week = Monday 00:00 .. Sunday 23:59 America/Chicago.
-- Tech attribution (Roland 2026-06-10): staff.pnl_home_silo pin
-- ALWAYS wins over clock-in service_type (Rod/Zak/Travis=roof,
-- Tipton=solar, Ignacio=repair, Rudy=paint_body); 'Shop' logs ->
-- overhead regardless; floaters (Riley/Cooper/Tommy/managers)
-- attribute by clock-in selection. Requires weekly_pnl_home_silo.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION weekly_pnl(p_start DATE, p_end DATE)
RETURNS TABLE (
    week_start          DATE,
    service_silo        TEXT,
    ro_count            INT,
    hours               NUMERIC,
    labor_cost          NUMERIC,
    parts_cost_cum      NUMERIC,
    parts_cost_matched  NUMERIC,
    revenue_completed   NUMERIC,
    revenue_fallback    NUMERIC,
    revenue_wip         NUMERIC,
    target              NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_start DATE := date_trunc('week', p_start)::date;
    v_end   DATE := date_trunc('week', p_end)::date;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT has_role('Admin') THEN
        RAISE EXCEPTION 'weekly_pnl: Admin only';
    END IF;

    RETURN QUERY
    WITH silo_map(raw, silo) AS (
        VALUES ('roof','roof'), ('solar','solar'), ('vroom','vroom'),
               ('paint and body','paint_body'), ('repairs','repair'),
               ('repair','repair'), ('truetopper','truetopper'),
               ('detailing','detailing'), ('chassis','chassis')
    ),
    -- ---- time logs: live + cashiered mirrors -------------------
    all_logs AS (
        SELECT tl.id AS log_id, tl.ro_id AS ro_uuid, tl.service_type,
               (date_trunc('week', tl.clock_in AT TIME ZONE 'America/Chicago'))::date AS wk,
               COALESCE(tl.duration_seconds::numeric / 3600.0,
                        EXTRACT(EPOCH FROM (COALESCE(tl.clock_out, now()) - tl.clock_in)) / 3600.0,
                        0) AS hrs,
               COALESCE(s.hourly_rate, 0) AS rate,
               (s.email IS NOT NULL AND s.hourly_rate = 0) AS is_tester,
               s.pnl_home_silo AS home_silo
        FROM time_logs tl
        JOIN repair_orders ro ON ro.id = tl.ro_id
        LEFT JOIN staff s ON lower(s.email) = lower(tl.tech_email)
        WHERE ro.deleted_at IS NULL
          AND COALESCE(ro.is_training, false) = false
          AND tl.clock_in IS NOT NULL
        UNION ALL
        SELECT ctl.id, ctl.original_ro_id,
               ctl.source_data->>'service_type',
               (date_trunc('week', ((ctl.source_data->>'clock_in')::timestamptz) AT TIME ZONE 'America/Chicago'))::date,
               COALESCE((ctl.source_data->>'duration_seconds')::numeric / 3600.0,
                        EXTRACT(EPOCH FROM ((ctl.source_data->>'clock_out')::timestamptz
                                          - (ctl.source_data->>'clock_in')::timestamptz)) / 3600.0,
                        0),
               COALESCE(s.hourly_rate, 0),
               (s.email IS NOT NULL AND s.hourly_rate = 0),
               s.pnl_home_silo
        FROM cashiered_time_logs ctl
        LEFT JOIN staff s ON lower(s.email) = lower(ctl.source_data->>'tech_email')
        WHERE ctl.source_data->>'clock_in' IS NOT NULL
    ),
    ranged_logs AS (
        SELECT * FROM all_logs
        WHERE wk BETWEEN v_start AND v_end
          AND is_tester = false
          AND hrs > 0
    ),
    -- ---- silo attribution (comma-split, even split, overhead) --
    log_silos AS (
        SELECT rl.log_id, rl.ro_uuid, rl.wk, rl.hrs, rl.rate,
               COALESCE(
                   CASE WHEN lower(btrim(COALESCE(rl.service_type, ''))) = 'shop'
                            THEN ARRAY['overhead']::text[]
                        WHEN rl.home_silo IS NOT NULL
                            THEN ARRAY[rl.home_silo]
                   END,
                   m.silos,
                   ARRAY['overhead']::text[]) AS silos
        FROM ranged_logs rl
        LEFT JOIN LATERAL (
            SELECT array_agg(DISTINCT sm.silo) AS silos
            FROM unnest(string_to_array(COALESCE(rl.service_type, ''), ',')) t(raw)
            JOIN silo_map sm ON sm.raw = lower(btrim(t.raw))
        ) m ON true
    ),
    attributed AS (
        SELECT ls.ro_uuid, ls.wk, u.silo,
               ls.hrs / array_length(ls.silos, 1) AS hrs,
               ls.hrs * ls.rate / array_length(ls.silos, 1) AS cost
        FROM log_silos ls, unnest(ls.silos) u(silo)
    ),
    labor AS (
        SELECT a.wk, a.silo,
               COUNT(DISTINCT a.ro_uuid)::int AS ro_count,
               SUM(a.hrs) AS hours, SUM(a.cost) AS labor_cost
        FROM attributed a GROUP BY 1, 2
    ),
    active_silo AS (
        SELECT DISTINCT a.wk, a.silo, a.ro_uuid FROM attributed a WHERE a.silo <> 'overhead'
    ),
    active_ro AS (
        SELECT DISTINCT a.wk, a.ro_uuid FROM attributed a
    ),
    -- ---- parts: live + cashiered, per-unit cost basis ----------
    all_parts AS (
        SELECT p.ro_id AS ro_uuid, p.service_silo AS silo,
               COALESCE(p.wholesale_price, 0) * GREATEST(COALESCE(p.qty, 1), 1)
                   + COALESCE(p.core_charge, 0) AS cost,
               COALESCE(p.date_ordered, p.created_at::date) AS order_date
        FROM parts p
        JOIN repair_orders ro ON ro.id = p.ro_id
        WHERE ro.deleted_at IS NULL AND COALESCE(ro.is_training, false) = false
        UNION ALL
        SELECT cp.original_ro_id,
               cp.source_data->>'service_silo',
               COALESCE((cp.source_data->>'wholesale_price')::numeric, 0)
                   * GREATEST(COALESCE((cp.source_data->>'qty')::int, 1), 1)
                + COALESCE((cp.source_data->>'core_charge')::numeric, 0),
               COALESCE((cp.source_data->>'date_ordered')::date,
                        (cp.source_data->>'created_at')::timestamptz::date)
        FROM cashiered_parts cp
    ),
    parts_cum_all AS (
        -- cumulative-to-date parts on ROs the silo touched that week
        SELECT a.wk, a.silo, SUM(pp.cost) AS parts_cum
        FROM active_silo a
        JOIN all_parts pp ON pp.ro_uuid = a.ro_uuid AND pp.silo = a.silo
        WHERE pp.order_date <= a.wk + 6
        GROUP BY 1, 2
        UNION ALL
        -- silo-untagged parts roll up at RO level under 'unattributed'
        SELECT a.wk, 'unattributed', SUM(pp.cost)
        FROM active_ro a
        JOIN all_parts pp ON pp.ro_uuid = a.ro_uuid AND pp.silo IS NULL
        WHERE pp.order_date <= a.wk + 6
        GROUP BY 1, 2
    ),
    -- ---- work orders: live + cashiered -------------------------
    all_swos AS (
        SELECT swo.ro_id AS ro_uuid, swo.service_silo AS silo,
               COALESCE(swo.dollar_value, 0) AS value,
               swo.completed_at, NULL::timestamptz AS archived_at
        FROM service_work_orders swo
        JOIN repair_orders ro ON ro.id = swo.ro_id
        WHERE ro.deleted_at IS NULL AND COALESCE(ro.is_training, false) = false
        UNION ALL
        SELECT csw.original_ro_id,
               csw.source_data->>'service_silo',
               COALESCE((csw.source_data->>'dollar_value')::numeric, 0),
               (csw.source_data->>'completed_at')::timestamptz,
               csw.archived_at
        FROM cashiered_service_work_orders csw
    ),
    swo_rec AS (
        SELECT sw.*,
               CASE WHEN COALESCE(sw.completed_at, sw.archived_at) IS NOT NULL
                    THEN (date_trunc('week', COALESCE(sw.completed_at, sw.archived_at) AT TIME ZONE 'America/Chicago'))::date
               END AS rec_wk
        FROM all_swos sw
    ),
    rev AS (
        SELECT sr.rec_wk AS wk, sr.silo,
               COALESCE(SUM(sr.value) FILTER (WHERE sr.completed_at IS NOT NULL), 0) AS revenue_completed,
               COALESCE(SUM(sr.value) FILTER (WHERE sr.completed_at IS NULL), 0) AS revenue_fallback
        FROM swo_rec sr
        WHERE sr.rec_wk BETWEEN v_start AND v_end
        GROUP BY 1, 2
    ),
    -- ---- parts matched to recognized revenue (GP input) --------
    ro_single_silo AS (
        SELECT sw.ro_uuid FROM all_swos sw GROUP BY 1 HAVING COUNT(DISTINCT sw.silo) = 1
    ),
    parts_matched AS (
        SELECT sr.rec_wk AS wk, sr.silo, SUM(pp.cost) AS parts_matched
        FROM (SELECT DISTINCT s2.rec_wk, s2.silo, s2.ro_uuid FROM swo_rec s2
               WHERE s2.rec_wk BETWEEN v_start AND v_end) sr
        JOIN all_parts pp ON pp.ro_uuid = sr.ro_uuid
         AND (pp.silo = sr.silo
              OR (pp.silo IS NULL AND sr.ro_uuid IN (SELECT ro_uuid FROM ro_single_silo)))
        GROUP BY 1, 2
    ),
    -- ---- WIP: silo touched the RO this week, not yet recognized -
    wip AS (
        SELECT a.wk, a.silo, SUM(sw.value) AS revenue_wip
        FROM active_silo a
        JOIN swo_rec sw ON sw.ro_uuid = a.ro_uuid AND sw.silo = a.silo
        WHERE COALESCE(sw.rec_wk, DATE '9999-01-01') > a.wk
        GROUP BY 1, 2
    ),
    -- ---- targets ------------------------------------------------
    tgt AS (
        SELECT w.wk, st.service_silo AS silo,
               (SELECT s2.weekly_target FROM silo_targets s2
                 WHERE s2.service_silo = st.service_silo
                   AND s2.effective_date <= w.wk
                 ORDER BY s2.effective_date DESC LIMIT 1) AS target
        FROM (SELECT generate_series(v_start, v_end, '7 days')::date AS wk) w
        CROSS JOIN (SELECT DISTINCT service_silo FROM silo_targets) st
    ),
    keys AS (
        SELECT l.wk, l.silo FROM labor l
        UNION SELECT pc.wk, pc.silo FROM parts_cum_all pc
        UNION SELECT r.wk, r.silo FROM rev r
        UNION SELECT wp.wk, wp.silo FROM wip wp
        UNION SELECT t.wk, t.silo FROM tgt t WHERE t.target IS NOT NULL
    )
    SELECT k.wk, k.silo,
           COALESCE(l.ro_count, 0),
           ROUND(COALESCE(l.hours, 0), 2),
           ROUND(COALESCE(l.labor_cost, 0), 2),
           ROUND(COALESCE(pc.parts_cum, 0), 2),
           ROUND(COALESCE(pm.parts_matched, 0), 2),
           ROUND(COALESCE(r.revenue_completed, 0), 2),
           ROUND(COALESCE(r.revenue_fallback, 0), 2),
           ROUND(COALESCE(wp.revenue_wip, 0), 2),
           t.target
    FROM keys k
    LEFT JOIN labor l          ON l.wk = k.wk AND l.silo = k.silo
    LEFT JOIN parts_cum_all pc ON pc.wk = k.wk AND pc.silo = k.silo
    LEFT JOIN parts_matched pm ON pm.wk = k.wk AND pm.silo = k.silo
    LEFT JOIN rev r            ON r.wk = k.wk AND r.silo = k.silo
    LEFT JOIN wip wp           ON wp.wk = k.wk AND wp.silo = k.silo
    LEFT JOIN tgt t            ON t.wk = k.wk AND t.silo = k.silo
    WHERE k.wk BETWEEN v_start AND v_end
    ORDER BY k.wk, k.silo;
END;
$$;

REVOKE ALL ON FUNCTION weekly_pnl(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION weekly_pnl(DATE, DATE) TO authenticated, service_role;


-- ============================================================
-- weekly_pnl_detail: per-RO drill-down for one silo-week
-- p_silo: a silo key, 'overhead', or 'unattributed'
-- ============================================================
CREATE OR REPLACE FUNCTION weekly_pnl_detail(p_week DATE, p_silo TEXT)
RETURNS TABLE (
    ro_code             TEXT,
    customer_name       TEXT,
    rv                  TEXT,
    src                 TEXT,
    hours               NUMERIC,
    labor_cost          NUMERIC,
    parts_cost_cum      NUMERIC,
    med_req_to_order_d  NUMERIC,
    med_order_to_recv_d NUMERIC,
    wo_value            NUMERIC,
    wo_status           TEXT,
    tech_done_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_wk DATE := date_trunc('week', p_week)::date;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT has_role('Admin') THEN
        RAISE EXCEPTION 'weekly_pnl_detail: Admin only';
    END IF;

    RETURN QUERY
    WITH silo_map(raw, silo) AS (
        VALUES ('roof','roof'), ('solar','solar'), ('vroom','vroom'),
               ('paint and body','paint_body'), ('repairs','repair'),
               ('repair','repair'), ('truetopper','truetopper'),
               ('detailing','detailing'), ('chassis','chassis')
    ),
    all_logs AS (
        SELECT tl.id AS log_id, tl.ro_id AS ro_uuid, tl.service_type,
               (date_trunc('week', tl.clock_in AT TIME ZONE 'America/Chicago'))::date AS wk,
               COALESCE(tl.duration_seconds::numeric / 3600.0,
                        EXTRACT(EPOCH FROM (COALESCE(tl.clock_out, now()) - tl.clock_in)) / 3600.0,
                        0) AS hrs,
               COALESCE(s.hourly_rate, 0) AS rate,
               (s.email IS NOT NULL AND s.hourly_rate = 0) AS is_tester,
               s.pnl_home_silo AS home_silo
        FROM time_logs tl
        JOIN repair_orders ro ON ro.id = tl.ro_id
        LEFT JOIN staff s ON lower(s.email) = lower(tl.tech_email)
        WHERE ro.deleted_at IS NULL
          AND COALESCE(ro.is_training, false) = false
          AND tl.clock_in IS NOT NULL
        UNION ALL
        SELECT ctl.id, ctl.original_ro_id,
               ctl.source_data->>'service_type',
               (date_trunc('week', ((ctl.source_data->>'clock_in')::timestamptz) AT TIME ZONE 'America/Chicago'))::date,
               COALESCE((ctl.source_data->>'duration_seconds')::numeric / 3600.0,
                        EXTRACT(EPOCH FROM ((ctl.source_data->>'clock_out')::timestamptz
                                          - (ctl.source_data->>'clock_in')::timestamptz)) / 3600.0,
                        0),
               COALESCE(s.hourly_rate, 0),
               (s.email IS NOT NULL AND s.hourly_rate = 0),
               s.pnl_home_silo
        FROM cashiered_time_logs ctl
        LEFT JOIN staff s ON lower(s.email) = lower(ctl.source_data->>'tech_email')
        WHERE ctl.source_data->>'clock_in' IS NOT NULL
    ),
    log_silos AS (
        SELECT rl.log_id, rl.ro_uuid, rl.hrs, rl.rate,
               COALESCE(
                   CASE WHEN lower(btrim(COALESCE(rl.service_type, ''))) = 'shop'
                            THEN ARRAY['overhead']::text[]
                        WHEN rl.home_silo IS NOT NULL
                            THEN ARRAY[rl.home_silo]
                   END,
                   m.silos,
                   ARRAY['overhead']::text[]) AS silos
        FROM all_logs rl
        LEFT JOIN LATERAL (
            SELECT array_agg(DISTINCT sm.silo) AS silos
            FROM unnest(string_to_array(COALESCE(rl.service_type, ''), ',')) t(raw)
            JOIN silo_map sm ON sm.raw = lower(btrim(t.raw))
        ) m ON true
        WHERE rl.wk = v_wk AND rl.is_tester = false AND rl.hrs > 0
    ),
    attributed AS (
        SELECT ls.ro_uuid, u.silo,
               ls.hrs / array_length(ls.silos, 1) AS hrs,
               ls.hrs * ls.rate / array_length(ls.silos, 1) AS cost
        FROM log_silos ls, unnest(ls.silos) u(silo)
    ),
    week_ros AS (
        SELECT a.ro_uuid, SUM(a.hrs) AS hours, SUM(a.cost) AS labor_cost
        FROM attributed a
        WHERE (p_silo IN ('overhead') AND a.silo = 'overhead')
           OR (p_silo = 'unattributed')                -- RO-level: any silo activity
           OR (a.silo = p_silo)
        GROUP BY 1
    ),
    all_parts AS (
        SELECT p.ro_id AS ro_uuid, p.service_silo AS silo,
               COALESCE(p.wholesale_price, 0) * GREATEST(COALESCE(p.qty, 1), 1)
                   + COALESCE(p.core_charge, 0) AS cost,
               COALESCE(p.date_ordered, p.created_at::date) AS order_date,
               p.created_at::date AS req_date,
               p.date_ordered, p.date_received
        FROM parts p
        UNION ALL
        SELECT cp.original_ro_id,
               cp.source_data->>'service_silo',
               COALESCE((cp.source_data->>'wholesale_price')::numeric, 0)
                   * GREATEST(COALESCE((cp.source_data->>'qty')::int, 1), 1)
                + COALESCE((cp.source_data->>'core_charge')::numeric, 0),
               COALESCE((cp.source_data->>'date_ordered')::date,
                        (cp.source_data->>'created_at')::timestamptz::date),
               (cp.source_data->>'created_at')::timestamptz::date,
               (cp.source_data->>'date_ordered')::date,
               (cp.source_data->>'date_received')::date
        FROM cashiered_parts cp
    ),
    ro_parts AS (
        SELECT pp.ro_uuid,
               SUM(pp.cost) AS parts_cum,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY (pp.date_ordered - pp.req_date))
                   FILTER (WHERE pp.date_ordered IS NOT NULL) AS med_req_to_order,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY (pp.date_received - pp.date_ordered))
                   FILTER (WHERE pp.date_received IS NOT NULL AND pp.date_ordered IS NOT NULL) AS med_order_to_recv
        FROM all_parts pp
        WHERE pp.order_date <= v_wk + 6
          AND ((p_silo = 'unattributed' AND pp.silo IS NULL)
               OR (p_silo NOT IN ('overhead','unattributed') AND pp.silo = p_silo)
               OR (p_silo = 'overhead' AND false))
        GROUP BY 1
    ),
    all_swos AS (
        SELECT swo.ro_id AS ro_uuid, swo.service_silo AS silo,
               COALESCE(swo.dollar_value, 0) AS value, swo.status,
               swo.tech_done_at, swo.completed_at
        FROM service_work_orders swo
        UNION ALL
        SELECT csw.original_ro_id,
               csw.source_data->>'service_silo',
               COALESCE((csw.source_data->>'dollar_value')::numeric, 0),
               csw.source_data->>'status',
               (csw.source_data->>'tech_done_at')::timestamptz,
               (csw.source_data->>'completed_at')::timestamptz
        FROM cashiered_service_work_orders csw
    ),
    ro_ident AS (
        SELECT ro.id AS ro_uuid, ro.ro_id AS code, ro.customer_name, ro.rv, 'live'::text AS src
        FROM repair_orders ro
        UNION ALL
        SELECT c.original_ro_id, c.ro_id, c.customer_name, c.rv, 'cashiered'
        FROM cashiered c
    )
    SELECT ri.code, ri.customer_name, ri.rv, ri.src,
           ROUND(wr.hours, 2), ROUND(wr.labor_cost, 2),
           ROUND(COALESCE(rp.parts_cum, 0), 2),
           ROUND(rp.med_req_to_order::numeric, 1),
           ROUND(rp.med_order_to_recv::numeric, 1),
           sw.value, sw.status, sw.tech_done_at, sw.completed_at
    FROM week_ros wr
    JOIN ro_ident ri ON ri.ro_uuid = wr.ro_uuid
    LEFT JOIN ro_parts rp ON rp.ro_uuid = wr.ro_uuid
    LEFT JOIN all_swos sw ON sw.ro_uuid = wr.ro_uuid AND sw.silo = p_silo
    ORDER BY wr.labor_cost DESC;
END;
$$;

REVOKE ALL ON FUNCTION weekly_pnl_detail(DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION weekly_pnl_detail(DATE, TEXT) TO authenticated, service_role;


-- ============================================================
-- VERIFY: last 4 weeks of P&L (run as-is in the SQL editor)
-- ============================================================
SELECT * FROM weekly_pnl(CURRENT_DATE - 28, CURRENT_DATE);
