-- ═══════════════════════════════════════════════════════════════════════════
-- GH#33 Phase 4 — Historical cross-RO overlap backfill (Session 65, 2026-05-10)
-- ═══════════════════════════════════════════════════════════════════════════
-- One-time cleanup of historical time_logs rows where the same tech had
-- overlapping clock-in windows on DIFFERENT ROs. Applies the same logic the
-- new BEFORE INSERT trigger applies going forward, but retroactively.
--
-- WHY THIS MATTERS
-- ────────────────
-- Until the GH#33 Phase 4 trigger shipped today, a tech could clock into
-- RO B at 7:49 AM without clocking out of RO A at 7:36 AM. RO A's row
-- would sit open until the 5 PM EOD cron closed it at 9.4h. The 9.4h
-- credit on RO A is wrong — the tech was at RO B from 7:49 AM onward.
--
-- This cascades into every labor-summing surface in worklist-report.html:
-- per-RO labor chip, per-silo split, per-silo subtotal, per-manager total,
-- grand-total labor chip, Labor Load chart bar heights. All silently
-- inflated by the over-credited orphan rows.
--
-- (The per-tech-day surfaces — drill-down modal, tile mini-bars, tile
-- inline summary — are already correct because worklist-report.html v1.11
-- uses wall-clock union math there.)
--
-- WHAT THIS DOES
-- ──────────────
-- For each tech, in clock_in chronological order: when row N's clock_out
-- is later than row N+1's clock_in AND they're on different ROs, rewrite
-- row N's clock_out to row N+1's clock_in. close_reason becomes
-- 'auto_replaced_by_new_session' (same value the live trigger writes —
-- worklist-report.html v1.12 already renders these as the purple
-- "↻ switched RO" badge in the tile audit + drill-down modal).
--
-- Same-RO duplicates (multiple opens on the same RO, same tech) are NOT
-- touched here — those are a different data quality issue (rapid-fire
-- double-tap or replay storm, GH#33 Phase 1 / Phase 2 territory).
--
-- ORDER OF OPERATIONS
-- ───────────────────
-- Run in this order in Supabase SQL Editor:
--   Step 1: scope analysis (read-only, shows magnitude before applying)
--   Step 2: row-by-row preview (read-only, shows specific changes)
--   Step 3: APPLY (the only mutating step)
--   Step 4: verify no cross-RO overlaps remain
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Step 1: Scope analysis ────────────────────────────────────────────────
-- How many rows will be affected, and how much labor does that strip out?
-- Read-only.

WITH ranked AS (
    SELECT id, tech_email, ro_id, clock_in, clock_out,
           LEAD(clock_in) OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_clock_in,
           LEAD(ro_id)    OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_ro_id
      FROM time_logs
     WHERE clock_out IS NOT NULL
       AND clock_in  IS NOT NULL
), to_fix AS (
    SELECT id, tech_email, ro_id, clock_in,
           clock_out                                      AS old_clock_out,
           next_clock_in                                  AS new_clock_out,
           EXTRACT(EPOCH FROM (clock_out      - clock_in))/3600.0 AS old_hours,
           EXTRACT(EPOCH FROM (next_clock_in  - clock_in))/3600.0 AS new_hours
      FROM ranked
     WHERE next_clock_in IS NOT NULL
       AND clock_out  > next_clock_in
       AND next_ro_id IS DISTINCT FROM ro_id
)
SELECT COUNT(*)                                           AS rows_to_rewrite,
       COUNT(DISTINCT tech_email)                         AS techs_affected,
       ROUND(SUM(old_hours - new_hours)::NUMERIC, 1)      AS total_hours_stripped,
       ROUND(MIN(old_hours - new_hours)::NUMERIC, 2)      AS smallest_strip_hours,
       ROUND(MAX(old_hours - new_hours)::NUMERIC, 2)      AS largest_strip_hours,
       ROUND(AVG(old_hours - new_hours)::NUMERIC, 2)      AS avg_strip_hours
  FROM to_fix;


-- ─── Step 2: Row-by-row preview ────────────────────────────────────────────
-- See exactly which rows will change. Sorted by largest hour-reduction first
-- so the most egregious cases (Ignacio's Jeannie 9.4h → ~13min) are at top.
-- Read-only.

WITH ranked AS (
    SELECT id, tech_email, ro_id, clock_in, clock_out,
           LEAD(clock_in) OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_clock_in,
           LEAD(ro_id)    OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_ro_id
      FROM time_logs
     WHERE clock_out IS NOT NULL AND clock_in IS NOT NULL
)
SELECT r.id,
       r.tech_email,
       ro.ro_id          AS ro_label,
       ro.customer_name,
       r.clock_in,
       r.clock_out       AS old_clock_out,
       r.next_clock_in   AS new_clock_out,
       ROUND((EXTRACT(EPOCH FROM (r.clock_out - r.clock_in))/3600.0)::NUMERIC, 2) AS old_hours,
       ROUND((EXTRACT(EPOCH FROM (r.next_clock_in - r.clock_in))/3600.0)::NUMERIC, 2) AS new_hours,
       ROUND(((EXTRACT(EPOCH FROM (r.clock_out - r.clock_in)) - EXTRACT(EPOCH FROM (r.next_clock_in - r.clock_in)))/3600.0)::NUMERIC, 2) AS hours_stripped
  FROM ranked r
  LEFT JOIN repair_orders ro ON ro.id = r.ro_id
 WHERE r.next_clock_in  IS NOT NULL
   AND r.clock_out      > r.next_clock_in
   AND r.next_ro_id     IS DISTINCT FROM r.ro_id
 ORDER BY hours_stripped DESC, r.tech_email, r.clock_in;


-- ─── Step 3: APPLY backfill ────────────────────────────────────────────────
-- THE ONLY MUTATING STEP. Review Steps 1+2 first.
-- Sets close_reason = 'auto_replaced_by_new_session' (same value the live
-- trigger writes — worklist-report.html v1.12 renders these the same way).

WITH ranked AS (
    SELECT id, tech_email, ro_id, clock_in, clock_out,
           LEAD(clock_in) OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_clock_in,
           LEAD(ro_id)    OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_ro_id
      FROM time_logs
     WHERE clock_out IS NOT NULL AND clock_in IS NOT NULL
)
UPDATE time_logs t
   SET clock_out        = r.next_clock_in,
       duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (r.next_clock_in - r.clock_in))::INTEGER),
       close_reason     = 'auto_replaced_by_new_session',
       updated_at       = NOW()
  FROM ranked r
 WHERE t.id = r.id
   AND r.next_clock_in IS NOT NULL
   AND r.clock_out     > r.next_clock_in
   AND r.next_ro_id    IS DISTINCT FROM r.ro_id;


-- ─── Step 4: Verify ────────────────────────────────────────────────────────
-- Should return 0. If anything > 0, there are still overlapping pairs that
-- weren't caught (likely chained overlaps that need a second backfill pass —
-- re-run Step 3 if so).

WITH ranked AS (
    SELECT tech_email, clock_in, clock_out, ro_id,
           LEAD(clock_in) OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_clock_in,
           LEAD(ro_id)    OVER (PARTITION BY tech_email ORDER BY clock_in) AS next_ro_id
      FROM time_logs
     WHERE clock_out IS NOT NULL AND clock_in IS NOT NULL
)
SELECT 'Remaining cross-RO overlaps (should be 0):' AS check,
       COUNT(*) AS cnt
  FROM ranked
 WHERE next_clock_in IS NOT NULL
   AND clock_out  > next_clock_in
   AND next_ro_id IS DISTINCT FROM ro_id;
