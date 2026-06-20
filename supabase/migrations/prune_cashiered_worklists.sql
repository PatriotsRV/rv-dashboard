-- [ER 91a03260 S118] Auto-remove a cashed-out RO from manager worklists the day AFTER
-- it is marked Delivered/Cashed Out (Roland). The RO stays on the list the day it is
-- cashed out (so the manager sees it completed that day), then drops off the next day.
--
-- "Day after" is enforced by gating on the RO's last-update DATE (Chicago local) being
-- before today: a row cashed out today still shows today; tomorrow's run removes it.
-- updated_at is reliably maintained by the trg_set_updated_at trigger (S115).
-- manager_work_lists.ro_id is TEXT holding the RO uuid, so it needs a ::uuid cast.

CREATE OR REPLACE FUNCTION public.prune_cashiered_worklists()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  WITH del AS (
    DELETE FROM public.manager_work_lists mwl
    USING public.repair_orders ro
    WHERE ro.id = mwl.ro_id::uuid
      AND ro.status = 'Delivered/Cashed Out'
      AND (ro.updated_at AT TIME ZONE 'America/Chicago')::date
            < (now() AT TIME ZONE 'America/Chicago')::date
    RETURNING mwl.id
  )
  SELECT count(*) INTO removed FROM del;
  RETURN removed;
END;
$$;

-- Daily at 07:30 UTC (= 02:30 CDT), before managers start. Idempotent re-schedule.
SELECT cron.unschedule('prune-cashiered-worklists')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-cashiered-worklists');

SELECT cron.schedule(
  'prune-cashiered-worklists',
  '30 7 * * *',
  $$SELECT public.prune_cashiered_worklists();$$
);
