-- ============================================================
-- Retroactive 12h → 8h labor recalc (Session 53, 2026-04-21)
-- ============================================================
-- Per Roland: the 12h cap inflated historical labor costs on the Work
-- List Report. This script rewrites any time_log that was closed by the
-- 12h cap (close_reason='auto_eod' with clock_out = clock_in + 12h) to
-- instead have clock_out = clock_in + 8h. Marker close_reason is
-- rewritten to 'auto_eod_8h_recalc' so future queries can distinguish
-- corrected rows from the new 5 PM EOD closes (auto_eod_5pm).
--
-- Run ORDER:
--   1. Preview (SELECT) — eyeball the rowset first.
--   2. UPDATE — commits the rewrite.
--   3. Verify — SELECT same set, confirm close_reason='auto_eod_8h_recalc'.
-- ============================================================

-- 1. PREVIEW. Run this first. Copy the count + first-10 sample back to Claude if unsure.
SELECT
    tl.id,
    tl.tech_email,
    tl.tech_name,
    (tl.clock_out - tl.clock_in)                                        AS current_duration,
    ROUND(EXTRACT(EPOCH FROM tl.clock_out - tl.clock_in) / 3600.0, 2)   AS current_hours,
    tl.clock_in                                                          AS current_clock_in,
    tl.clock_out                                                         AS current_clock_out_12h,
    (tl.clock_in + interval '8 hours')                                  AS new_clock_out_8h,
    r.ro_id                                                              AS ro_short_id,
    r.customer_name,
    tl.close_reason                                                      AS current_reason
FROM time_logs tl
LEFT JOIN repair_orders r ON r.id = tl.ro_id
WHERE tl.close_reason = 'auto_eod'
  AND ABS(EXTRACT(EPOCH FROM (tl.clock_out - tl.clock_in)) - 43200) < 60  -- within 60s of exactly 12h
ORDER BY tl.clock_in DESC;

-- 2. THE REWRITE. Run only after preview looks correct.
--    Matches same WHERE-clause as preview so we only touch 12h-cap rows.
UPDATE time_logs
SET clock_out    = clock_in + interval '8 hours',
    close_reason = 'auto_eod_8h_recalc'
WHERE close_reason = 'auto_eod'
  AND ABS(EXTRACT(EPOCH FROM (clock_out - clock_in)) - 43200) < 60;

-- 3. VERIFY. Should show zero 'auto_eod' rows with 12h durations (all rewritten),
--    and N 'auto_eod_8h_recalc' rows with 8h durations (N = count from preview).
SELECT
    close_reason,
    count(*) AS row_count,
    ROUND(AVG(EXTRACT(EPOCH FROM clock_out - clock_in) / 3600.0), 2) AS avg_hours
FROM time_logs
WHERE close_reason IN ('auto_eod', 'auto_eod_8h_recalc', 'auto_eod_5pm')
GROUP BY close_reason
ORDER BY close_reason;
