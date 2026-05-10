-- ═══════════════════════════════════════════════════════════════════════════
-- GH#33 Phase 4 — Cross-RO clock-in guardrail (Session 65, 2026-05-10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Closes the gap that allowed Ignacio Ochoa to be clocked into 3 ROs
-- simultaneously on Tue May 5 2026 (the bug that produced the 15.5h drill-down
-- modal Roland flagged → fixed display-side in worklist-report.html v1.11).
--
-- ROOT CAUSE
-- ──────────
-- The cross-RO clock-in guard in checkin.html load() is CLIENT-SIDE ONLY and
-- has four documented bypasses:
--   (A) Page loaded while offline           → loadFromCache() runs, no DB query
--   (B) navigator.onLine lies (false true)  → Supabase fetch silently fails,
--                                              code falls through to loadFromCache
--   (C) PWA / cached page reuse             → load() may not re-run at all
--   (D) Offline queue replay (drainQueue)   → only checks (tech, ro), not (tech)
--
-- The DB UNIQUE index from GH#33 Phase 1 (idx_time_logs_one_open_per_tech_ro)
-- is scoped to (tech_email, ro_id) — same RO, not same tech across ROs.
--
-- THIS MIGRATION
-- ──────────────
-- Adds two layers of server-side defense:
--   (Step 3) BEFORE INSERT trigger auto-closes any prior open session for the
--            same tech on a different RO at NEW.clock_in. Catches every code
--            path: foreground, offline replay, cached page, manual SQL.
--   (Step 4) UNIQUE partial index per (tech_email) WHERE clock_out IS NULL.
--            Hard backstop — if the trigger has a bug or someone disables it,
--            the index throws 23505. Belt-and-suspenders.
--
-- Pre-flight + cleanup (Steps 1+2) are required because the index creation
-- in Step 4 will fail if any tech currently has > 1 open session.
--
-- ORDER OF OPERATIONS
-- ───────────────────
-- Run in this order in Supabase SQL Editor:
--   Step 1: review pre-flight result (read-only)
--   Step 2: run cleanup ONLY if Step 1 returned rows
--   Steps 3+4: run together (function + trigger + index, atomic)
--   Step 5: verify
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Step 1: Pre-flight ────────────────────────────────────────────────────
-- Find techs with multiple currently-open sessions. If this returns ANY rows,
-- run Step 2 cleanup before proceeding to Step 3+4. Read-only; safe to re-run.

SELECT tech_email,
       COUNT(*)            AS open_session_count,
       array_agg(id ORDER BY clock_in DESC)       AS log_ids,
       array_agg(ro_id ORDER BY clock_in DESC)    AS ro_ids,
       array_agg(clock_in ORDER BY clock_in DESC) AS clock_ins
  FROM time_logs
 WHERE clock_out IS NULL
 GROUP BY tech_email
HAVING COUNT(*) > 1;


-- ─── Step 2: Cleanup (ONLY if Step 1 returned rows) ────────────────────────
-- For each tech with multiple open sessions, keep the MOST RECENT open and
-- close the others. clock_out is set to LEAST(next_session_clock_in, now-1min,
-- clock_in + 8h) — capped at 8h so labor cost isn't grossly inflated by an
-- ancient stuck session.

WITH ranked AS (
    SELECT id,
           tech_email,
           clock_in,
           ROW_NUMBER() OVER (PARTITION BY tech_email ORDER BY clock_in DESC) AS rn,
           LEAD(clock_in) OVER (PARTITION BY tech_email ORDER BY clock_in DESC) AS next_clock_in
      FROM time_logs
     WHERE clock_out IS NULL
)
UPDATE time_logs t
   SET clock_out = LEAST(
                       COALESCE(r.next_clock_in, NOW() - INTERVAL '1 minute'),
                       r.clock_in + INTERVAL '8 hours'
                   ),
       duration_seconds = GREATEST(0,
           EXTRACT(EPOCH FROM (LEAST(
               COALESCE(r.next_clock_in, NOW() - INTERVAL '1 minute'),
               r.clock_in + INTERVAL '8 hours'
           ) - r.clock_in))::INTEGER
       ),
       close_reason = 'auto_cleanup_pre_uniq_index',
       updated_at = NOW()
  FROM ranked r
 WHERE t.id = r.id
   AND r.rn > 1;  -- keep most-recent (rn=1), close the rest


-- ─── Step 3: Trigger function + trigger ────────────────────────────────────
-- Auto-close any prior open session for this tech on a DIFFERENT RO when a
-- new clock-in lands. Catches every code path that lacks the client guard.
-- SECURITY DEFINER so the trigger can update other rows for the same tech
-- regardless of caller's RLS scope.

CREATE OR REPLACE FUNCTION auto_close_prior_open_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Backfill INSERTs that already include clock_out are passed through unchanged.
    IF NEW.clock_out IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Defensive: skip if tech_email missing.
    IF NEW.tech_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Auto-close any prior OPEN session for this tech on a DIFFERENT RO.
    -- clock_out = NEW.clock_in is the safest assumption: tech can only be
    -- physically present at one RV at a time, so the new clock-in IS the
    -- end-of-prior signal. Same-RO duplicates are blocked by
    -- idx_time_logs_one_open_per_tech_ro (GH#33 Phase 1) which throws 23505
    -- — that error path is handled by checkin.html (existing behavior).
    UPDATE time_logs
       SET clock_out        = NEW.clock_in,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NEW.clock_in - clock_in))::INTEGER),
           close_reason     = 'auto_replaced_by_new_session',
           updated_at       = NOW()
     WHERE tech_email  = NEW.tech_email
       AND clock_out  IS NULL
       AND ro_id      IS DISTINCT FROM NEW.ro_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_prior_open_session ON time_logs;
CREATE TRIGGER trg_auto_close_prior_open_session
    BEFORE INSERT ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION auto_close_prior_open_session();


-- ─── Step 4: UNIQUE partial index per (tech_email) ─────────────────────────
-- Hard backstop. With Step 3 trigger in place this should never fire in
-- practice (the trigger pre-closes the prior session before the INSERT
-- proceeds). But if a code path bypasses the trigger (e.g. session
-- replication role replica, future trigger disable), the index throws 23505.

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_logs_one_open_per_tech
    ON time_logs (tech_email) WHERE clock_out IS NULL;


-- ─── Step 5: Verify ────────────────────────────────────────────────────────

SELECT 'Trigger installed:' AS check, COUNT(*) AS cnt
  FROM pg_trigger WHERE tgname = 'trg_auto_close_prior_open_session';

SELECT 'Per-tech UNIQUE index installed:' AS check, COUNT(*) AS cnt
  FROM pg_indexes WHERE indexname = 'idx_time_logs_one_open_per_tech';

SELECT 'Currently-open sessions per tech (max should be ≤ 1):' AS check,
       COALESCE(MAX(per_tech), 0) AS max_open_per_tech
  FROM (
      SELECT tech_email, COUNT(*) AS per_tech
        FROM time_logs WHERE clock_out IS NULL
       GROUP BY tech_email
  ) t;
