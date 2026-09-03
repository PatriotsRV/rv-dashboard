-- ============================================================================
-- delivered_no_review_s187.sql — Session 187 (2026-09-03)
--
-- Adds a 19th RO status: 'Delivered - No Review'  (18 -> 19)
-- Roland directive S187: "a new Delivered/Cashed Out (no review) status, for
-- customers we don't want the 'give us a review' notice going to."
--
-- ── WHAT IT IS ────────────────────────────────────────────────────────────
-- A REAL cash-out. The customer paid; the work was billed. The ONLY difference
-- from 'Delivered/Cashed Out' is that no review request is ever enqueued.
-- Roland's S187 call: behaves identically to a normal cash-out in every other
-- respect — same S185 outstanding-payment prompt, same S183 dollar-value gate,
-- same archive, same progress %, same reports.
--
-- ── WHY IT IS NOT 'Closed - No Charge' ────────────────────────────────────
-- S183's 'Closed - No Charge' already archives-without-review, so the MECHANISM
-- is proven and reused here. But its meaning is "nothing was billed" (totaled-
-- out insurance paying an admin fee, warranty closes). Filing a paying customer
-- under it would corrupt every dollar report that keys on status. Different
-- meaning, different status.
--
-- ── HOW THE REVIEW SUPPRESSION WORKS: BY DOING NOTHING ────────────────────
-- 🔴 enqueue_review_request() IS DELIBERATELY NOT TOUCHED BY THIS MIGRATION.
-- Its first guard is already:
--       if new.status is distinct from 'Delivered/Cashed Out' then return new;
-- so ANY status that is not exactly that literal is silently excluded. The new
-- status inherits suppression for free. Re-creating the function to "add" an
-- exclusion would be pure risk — a live function rewritten for no behavior
-- change — so it is left alone on purpose. Verified against the LIVE function
-- definition this session, not against a migration file.
--
-- ── FREE BONUS, WORTH KNOWING ─────────────────────────────────────────────
-- cancel_pending_review_request() fires on `old.status = 'Delivered/Cashed Out'
-- AND new.status is distinct from it`. So moving an RO from Delivered/Cashed
-- Out -> Delivered - No Review INSIDE the 24h delay window CANCELS the pending
-- ask. That is exactly the "oops, don't text this one" recovery path, and it
-- works without a line of new code. Also untouched.
--
-- ── WHAT THIS MIGRATION ACTUALLY CHANGES (4 things) ───────────────────────
--   1. repair_orders_status_check  18 -> 19
--   2. cashiered_status_check      18 -> 19
--      (S172 lesson: v1.460 shipped 'Off Lot - Returning' UI-only and it was
--       silently broken for 50 days because only ONE side was widened. Both.)
--   3. archive_cashiered_ros() — the Sunday sweep files the new status too.
--      🔴 REBUILT FROM THE LIVE DEFINITION, NOT FROM closed_no_charge_s183.sql.
--      That FILE predates S185 and has NO receivable hold; copying it would
--      have silently deleted the S185 ARCHIVE HOLD — the exact class of defect
--      the S185 pg_constraint rule exists to prevent. The held_count query and
--      the archive loop below both carry the hold, unchanged.
--   4. prune_cashiered_worklists() — see the PRE-EXISTING BUG note below.
--
-- ── 🔴 PRE-EXISTING BUG FIXED IN PASSING (found S187, introduced S183) ─────
-- prune_cashiered_worklists() (cron job 12, 07:30 daily) removes closed ROs
-- from managers' work lists. It filters on status = 'Delivered/Cashed Out'
-- ONLY. S183 widened the ARCHIVE sweep for 'Closed - No Charge' but never
-- widened THIS one, so since 2026-08-25 every no-charge RO has stayed on its
-- manager's work list until the Sunday archive removed it by other means.
-- Low harm, but it is the same S172 half-widening class. All three terminal
-- statuses are now listed. This is a REAL behavior change beyond the S187 ask —
-- called out here so it is not mistaken for scope creep.
--
-- ── NO DATA IS MIGRATED ───────────────────────────────────────────────────
-- No existing RO is reclassified. The new status is available going forward;
-- nothing moves into it automatically.
--
-- IDEMPOTENT — safe to re-run. RUN IN: Supabase SQL Editor.
-- Pairs with index.html v1.503 (do NOT promote the client before this runs —
-- S185 ordering lesson: the client half is what users meet first).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1 + 2. Status vocabulary: 18 -> 19 on BOTH tables
--    The 18 existing values were read from pg_constraint live this session
--    (S185 rule) and confirmed IDENTICAL on both tables — no drift to preserve.
-- ----------------------------------------------------------------------------

ALTER TABLE public.repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
ALTER TABLE public.repair_orders ADD CONSTRAINT repair_orders_status_check
  CHECK (status = ANY (ARRAY[
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress', 'Repairs Completed',
    'Waiting for QA/QC', 'Ready for pickup', 'Delivered/Cashed Out',
    'Closed - No Charge', 'Delivered - No Review'
  ]::text[]));

ALTER TABLE public.cashiered DROP CONSTRAINT IF EXISTS cashiered_status_check;
ALTER TABLE public.cashiered ADD CONSTRAINT cashiered_status_check
  CHECK (status = ANY (ARRAY[
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress', 'Repairs Completed',
    'Waiting for QA/QC', 'Ready for pickup', 'Delivered/Cashed Out',
    'Closed - No Charge', 'Delivered - No Review'
  ]::text[]));

-- ----------------------------------------------------------------------------
-- 3. Sunday sweep files all THREE terminal statuses.
--    Body copied from the LIVE S185 definition; only the two status lists
--    changed. The receivable ARCHIVE HOLD is preserved verbatim.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_cashiered_ros()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ro_id_row       record;
  archived_count  int := 0;
  held_count      int := 0;
BEGIN
  SELECT count(*) INTO held_count
    FROM repair_orders ro
   WHERE ro.status IN ('Delivered/Cashed Out', 'Closed - No Charge',
                       'Delivered - No Review')
     AND ro.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM ro_receivables r
                  WHERE r.ro_id = ro.id AND r.status = 'open');

  FOR ro_id_row IN
    SELECT id FROM repair_orders ro
    WHERE ro.status IN ('Delivered/Cashed Out', 'Closed - No Charge',
                        'Delivered - No Review')
      AND ro.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM ro_receivables r
                       WHERE r.ro_id = ro.id AND r.status = 'open')
  LOOP
    IF archive_one_ro(ro_id_row.id) THEN
      archived_count := archived_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s), held % for open receivables, at %',
    archived_count, held_count, now();
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Work-list prune covers all three terminal statuses (S183 miss + S187 new)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_cashiered_worklists()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE removed integer;
BEGIN
  WITH del AS (
    DELETE FROM public.manager_work_lists mwl
    USING public.repair_orders ro
    WHERE ro.id = mwl.ro_id::uuid
      AND ro.status IN ('Delivered/Cashed Out', 'Closed - No Charge',
                        'Delivered - No Review')
      AND (ro.updated_at AT TIME ZONE 'America/Chicago')::date
            < (now() AT TIME ZONE 'America/Chicago')::date
    RETURNING mwl.id
  )
  SELECT count(*) INTO removed FROM del;
  RETURN removed;
END;
$function$;

COMMIT;

-- ============================================================================
-- VERIFY — run these after COMMIT and paste the output.
-- ============================================================================

-- (a) BOTH constraints must show true. If only one is true, STOP — that is the
--     S172 half-widened state and the status will throw 23514 on archive.
select conrelid::regclass::text as tbl,
       (pg_get_constraintdef(oid) like '%Delivered - No Review%') as has_new_status
from pg_constraint
where conname in ('repair_orders_status_check','cashiered_status_check')
order by 1;

-- (b) Both cron function bodies widened, and the S185 hold still present.
--     Expect: sweep_widened=true, hold_intact=true, prune_widened=true.
select
  (select pg_get_functiondef(oid) like '%Delivered - No Review%'
     from pg_proc where proname='archive_cashiered_ros'
      and pronamespace='public'::regnamespace)          as sweep_widened,
  (select pg_get_functiondef(oid) like '%ro_receivables%'
     from pg_proc where proname='archive_cashiered_ros'
      and pronamespace='public'::regnamespace)          as hold_intact,
  (select pg_get_functiondef(oid) like '%Delivered - No Review%'
     from pg_proc where proname='prune_cashiered_worklists'
      and pronamespace='public'::regnamespace)          as prune_widened;

-- (c) The review trigger must be UNCHANGED — it should still name ONLY
--     'Delivered/Cashed Out'. Expect suppresses_new_status = true.
--     (true here means the function does NOT mention the new status, which is
--     precisely what makes the new status skip the review ask.)
select pg_get_functiondef(oid) not like '%Delivered - No Review%'
         as suppresses_new_status
from pg_proc
where proname = 'enqueue_review_request'
  and pronamespace = 'public'::regnamespace;

-- (d) Smoke test the CHECK without leaving a row behind. Expect: no error,
--     and 0 rows remaining.
--     (Uses an existing RO id so the FK/child constraints are realistic.)
-- BEGIN;
--   UPDATE repair_orders SET status = 'Delivered - No Review'
--    WHERE ro_id = '<pick any active RO>';
--   SELECT ro_id, status FROM repair_orders WHERE status = 'Delivered - No Review';
-- ROLLBACK;
