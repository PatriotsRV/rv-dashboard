-- ============================================================================
-- closed_no_charge_s183.sql — Session 183 (2026-08-25)
--
-- WHAT THIS DOES
--   1. Adds an 18th RO status: 'Closed - No Charge'  (17 -> 18)
--      Widens BOTH CHECK constraints — repair_orders AND cashiered.
--      (S172 lesson: v1.460 shipped 'Off Lot - Returning' UI-only and it was
--       silently broken for 50 days because only one side was widened.)
--
--   2. Moves the review-request trigger OFF the Sunday archive sweep and ONTO
--      the RO status change.
--      BEFORE: AFTER INSERT ON cashiered  -> customer asked up to 7 days late,
--              because the ask was keyed to the weekly archive cron, not to
--              when the customer actually picked up their RV.
--      AFTER:  AFTER INSERT OR UPDATE ON repair_orders, fired when status
--              becomes 'Delivered/Cashed Out'. The existing 24h delay
--              (app_config.review_request_delay_minutes) is unchanged, so the
--              ask now lands the day after pickup.
--
--   3. Suppresses the review request entirely for 'Closed - No Charge'.
--      That status exists for ROs where no work was billed — totaled-out
--      insurance claims that pay an admin fee, warranty closes, etc. Asking
--      those customers for a review looks bad. (Seven such texts went out
--      between 7/27 and 8/24 under the old behavior.)
--
--   4. NEW: cancels a still-pending review request if the RO is moved back OFF
--      a terminal status inside the delay window. Without this, a mis-click
--      followed by a correction still texts the customer 24h later.
--
--   5. Widens archive_cashiered_ros() so the Sunday sweep files BOTH terminal
--      statuses. 'Closed - No Charge' archives exactly like a normal cash-out —
--      photo_library (photos AND docs), insurance_data, notes, parts, time
--      logs, work orders and audit trail all carry over via archive_one_ro().
--
-- IDEMPOTENT — safe to re-run.
-- RUN IN: Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Status vocabulary: 17 -> 18 on BOTH tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
ALTER TABLE public.repair_orders ADD CONSTRAINT repair_orders_status_check
  CHECK (status = ANY (ARRAY[
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress', 'Repairs Completed',
    'Waiting for QA/QC', 'Ready for pickup', 'Delivered/Cashed Out',
    'Closed - No Charge'
  ]::text[]));

ALTER TABLE public.cashiered DROP CONSTRAINT IF EXISTS cashiered_status_check;
ALTER TABLE public.cashiered ADD CONSTRAINT cashiered_status_check
  CHECK (status = ANY (ARRAY[
    'Not On Lot', 'On Lot', 'Scheduled', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress', 'Repairs Completed',
    'Waiting for QA/QC', 'Ready for pickup', 'Delivered/Cashed Out',
    'Closed - No Charge'
  ]::text[]));

-- ----------------------------------------------------------------------------
-- 2. Review request now fires on STATUS CHANGE, not on archive
-- ----------------------------------------------------------------------------

-- Retire the old archive-keyed trigger. The function is replaced below rather
-- than dropped, so nothing else that references it breaks.
DROP TRIGGER IF EXISTS trg_enqueue_review_request ON public.cashiered;

CREATE OR REPLACE FUNCTION public.enqueue_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_enabled text;
  v_delay   int;
  v_pk      text;
begin
  -- Only ever enqueue for a real cash-out. 'Closed - No Charge' is deliberately
  -- excluded: no work was billed, so no review is asked for.
  if new.status is distinct from 'Delivered/Cashed Out' then
    return new;
  end if;

  -- Fire only on the TRANSITION into the status, never on an unrelated UPDATE
  -- to a row that already sits there (otherwise every later edit re-enqueues).
  -- NOTE: nested IF, not a single AND — PL/pgSQL does not guarantee
  -- short-circuit evaluation, and OLD is unassigned on INSERT.
  if TG_OP = 'UPDATE' then
    if old.status is not distinct from new.status then
      return new;
    end if;
  end if;

  select value into v_enabled from app_config where key = 'review_request_enabled';
  if coalesce(v_enabled, 'true') <> 'true' then return new; end if;

  v_pk := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
  if v_pk is null or length(v_pk) < 10 then return new; end if;

  -- Opt-out guard (STOP): never enqueue for an opted-out conversation.
  if exists (select 1 from conversations c
             where c.phone_key = v_pk and c.opted_out_at is not null) then
    return new;
  end if;

  -- Frequency guard (Kenect parity): max one per 60 days per number,
  -- and never stack a second pending request.
  if exists (select 1 from review_requests r
             where r.phone_key = v_pk
               and (r.status = 'pending'
                    or (r.status = 'sent' and r.sent_at > now() - interval '60 days'))) then
    return new;
  end if;

  select coalesce(nullif(value,'')::int, 1440) into v_delay
    from app_config where key = 'review_request_delay_minutes';
  v_delay := coalesce(v_delay, 1440);

  insert into review_requests (ro_id, phone, phone_key, customer_name,
                               scheduled_at, source)
  values (new.ro_id, new.phone, v_pk, new.customer_name,
          now() + make_interval(mins => v_delay), 'ro_cashiered');
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_enqueue_review_request_status ON public.repair_orders;
CREATE TRIGGER trg_enqueue_review_request_status
  AFTER INSERT OR UPDATE OF status ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_review_request();

-- ----------------------------------------------------------------------------
-- 3. Un-ring the bell: status moved back off a terminal state inside the
--    delay window cancels the still-pending ask.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_pending_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if old.status = 'Delivered/Cashed Out'
     and new.status is distinct from 'Delivered/Cashed Out' then
    update review_requests
       set status = 'cancelled',
           error_message = 'RO status moved off Delivered/Cashed Out before send'
     where ro_id = new.ro_id
       and status = 'pending';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_cancel_pending_review_request ON public.repair_orders;
CREATE TRIGGER trg_cancel_pending_review_request
  AFTER UPDATE OF status ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.cancel_pending_review_request();

-- ----------------------------------------------------------------------------
-- 4. Sunday sweep files BOTH terminal statuses
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
BEGIN
  FOR ro_id_row IN
    SELECT id FROM repair_orders
    WHERE status IN ('Delivered/Cashed Out', 'Closed - No Charge')
      AND deleted_at IS NULL
  LOOP
    IF archive_one_ro(ro_id_row.id) THEN
      archived_count := archived_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'archive_cashiered_ros: archived % RO(s) at %', archived_count, now();
END;
$function$;

COMMIT;

-- ============================================================================
-- VERIFY — run these after COMMIT and paste the output.
-- ============================================================================

-- (a) Both constraints must list 18 statuses including 'Closed - No Charge'
select conrelid::regclass as tbl,
       (pg_get_constraintdef(oid) like '%Closed - No Charge%') as has_new_status
from pg_constraint
where conname in ('repair_orders_status_check','cashiered_status_check');

-- (b) Trigger inventory: expect trg_enqueue_review_request_status and
--     trg_cancel_pending_review_request on repair_orders, and NO
--     trg_enqueue_review_request left on cashiered.
select c.relname as table_name, t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname in ('trg_enqueue_review_request',
                   'trg_enqueue_review_request_status',
                   'trg_cancel_pending_review_request')
order by 1, 2;

-- (c) Sweep now covers both terminal statuses
select pg_get_functiondef(p.oid) like '%Closed - No Charge%' as sweep_widened
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'archive_cashiered_ros';
