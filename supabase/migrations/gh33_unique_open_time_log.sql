-- ============================================================
-- GH#33 Phase 1 (Session 53, 2026-04-21) — UNIQUE partial index
-- on (tech_email, ro_id) WHERE clock_out IS NULL.
-- ============================================================
-- Makes it physically impossible to have two OPEN clock-in rows
-- for the same tech on the same RO. Any second INSERT gets
-- rejected with 23505 unique_violation.
--
-- A tech can still legitimately clock in → out → in again on the
-- same RO — the partial predicate (clock_out IS NULL) excludes
-- closed rows from the uniqueness constraint.
--
-- RUN ORDER:
--   1. Step 1 preview — must return ZERO rows. If non-zero,
--      resolve the duplicates first (keep the best row, delete
--      the others) before the CREATE INDEX will succeed.
--   2. Step 2 CREATE INDEX — should succeed in < 1s on current
--      data volume.
--   3. Step 3 verification — confirms the index is present and
--      is actually a unique partial index.
-- ============================================================

-- 1. PREVIEW — find any current duplicates that would block CREATE.
--    MUST return zero rows. If not, list them + resolve before Step 2.
SELECT tech_email, ro_id, count(*) AS open_count,
       array_agg(id ORDER BY clock_in) AS time_log_ids,
       array_agg(clock_in ORDER BY clock_in) AS clock_ins
FROM time_logs
WHERE clock_out IS NULL
GROUP BY tech_email, ro_id
HAVING count(*) > 1;

-- 2. CREATE the unique partial index.
--    Use IF NOT EXISTS so re-runs don't error.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_logs_one_open_per_tech_ro
ON time_logs (tech_email, ro_id)
WHERE clock_out IS NULL;

COMMENT ON INDEX idx_time_logs_one_open_per_tech_ro IS
  'GH33 Phase 1 — prevents duplicate open clock-ins for same tech on same RO. INSERT of a second open row returns 23505 unique_violation. Closed rows (clock_out IS NOT NULL) are excluded from the index so re-clock-in after clock-out is allowed.';

-- 3. VERIFY — should return 1 row.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'time_logs'
  AND indexname = 'idx_time_logs_one_open_per_tech_ro';
