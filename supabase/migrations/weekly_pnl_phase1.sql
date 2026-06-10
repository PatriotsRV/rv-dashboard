-- ============================================================
-- WEEKLY P&L - PHASE 1 MIGRATION (Session 99, 2026-06-10)
-- Spec: docs/specs/WEEKLY_PNL_SPEC.md v0.2
-- Additive only. Safe to re-run (IF NOT EXISTS / NULL guards).
-- Stage 1 of 2: tables + columns + backfills + cron move.
-- Stage 2 (separate file weekly_pnl_rpcs.sql): the RPCs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. silo_targets: weekly revenue targets per silo, with history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS silo_targets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_silo    TEXT NOT NULL,
    weekly_target   NUMERIC(10,2) NOT NULL,
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_silo, effective_date)
);

ALTER TABLE silo_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silo_targets_select ON silo_targets;
CREATE POLICY silo_targets_select ON silo_targets
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS silo_targets_admin_write ON silo_targets;
CREATE POLICY silo_targets_admin_write ON silo_targets
    FOR ALL TO authenticated
    USING (has_role('Admin')) WITH CHECK (has_role('Admin'));

-- Seed (Roland 2026-06-10), effective the current week (Mon 2026-06-08).
-- To apply targets to historical weeks later, INSERT rows with an
-- earlier effective_date.
INSERT INTO silo_targets (service_silo, weekly_target, effective_date, created_by)
VALUES
    ('roof',   20000, DATE '2026-06-08', 'roland@patriotsrvservices.com'),
    ('solar',  20000, DATE '2026-06-08', 'roland@patriotsrvservices.com'),
    ('vroom',  20000, DATE '2026-06-08', 'roland@patriotsrvservices.com'),
    ('repair', 15000, DATE '2026-06-08', 'roland@patriotsrvservices.com')
ON CONFLICT (service_silo, effective_date) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Two-stage WO completion columns (spec section 5)
--    tech_done_*  = tech-lead "Done" (leading indicator)
--    completed_*  = manager "Done Done" (revenue recognition)
-- ------------------------------------------------------------
ALTER TABLE service_work_orders
    ADD COLUMN IF NOT EXISTS tech_done_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS tech_done_by TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_by TEXT;

-- Approximate backfill for WOs already at status='completed'.
UPDATE service_work_orders
SET completed_at = updated_at,
    completed_by = 'backfill_from_updated_at'
WHERE status = 'completed' AND completed_at IS NULL;

-- ------------------------------------------------------------
-- 3. parts.service_silo + backfill (spec section 3, Q2)
-- ------------------------------------------------------------
ALTER TABLE parts ADD COLUMN IF NOT EXISTS service_silo TEXT;

-- 3a. Strongest signal: part -> service_task -> work order -> silo.
UPDATE parts p
SET service_silo = swo.service_silo
FROM service_tasks st
JOIN service_work_orders swo ON swo.id = st.work_order_id
WHERE p.service_task_id = st.id
  AND p.service_silo IS NULL;

-- 3b. RO has exactly one WO silo -> all its untagged parts get it.
UPDATE parts p
SET service_silo = one.service_silo
FROM (
    SELECT ro_id, MIN(service_silo) AS service_silo
    FROM service_work_orders
    GROUP BY ro_id
    HAVING COUNT(DISTINCT service_silo) = 1
) one
WHERE p.ro_id = one.ro_id
  AND p.service_silo IS NULL;

-- Remaining NULLs = multi-silo ROs with no task link; reported as
-- (unattributed) until re-tagged via the new part-form dropdown (P3).

-- ------------------------------------------------------------
-- 4. Move cashiered archiver Saturday 5 PM -> Sunday 5 PM CDT
--    (Adjustment 3: align archiving with the Mon-Sun report week)
-- ------------------------------------------------------------
SELECT cron.alter_job(jobid, schedule => '0 22 * * 0')
FROM cron.job
WHERE jobname = 'archive-cashiered-ros';

-- ------------------------------------------------------------
-- 5. VERIFY
-- Expect: targets_seeded=4, swo_cols=4, completed_backfilled >= 0,
--         parts_tagged + parts_untagged = 224 (as of 2026-06-10),
--         archiver_schedule = '0 22 * * 0'
-- ------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM silo_targets) AS targets_seeded,
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_name = 'service_work_orders'
        AND column_name IN ('tech_done_at','tech_done_by','completed_at','completed_by')) AS swo_cols,
    (SELECT COUNT(*) FROM service_work_orders
      WHERE completed_by = 'backfill_from_updated_at') AS completed_backfilled,
    (SELECT COUNT(*) FROM parts WHERE service_silo IS NOT NULL) AS parts_tagged,
    (SELECT COUNT(*) FROM parts WHERE service_silo IS NULL) AS parts_untagged,
    (SELECT schedule FROM cron.job WHERE jobname = 'archive-cashiered-ros') AS archiver_schedule;
