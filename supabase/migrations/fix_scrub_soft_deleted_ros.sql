-- Migration: fix_scrub_soft_deleted_ros.sql
-- Session 115 (2026-06-17)
--
-- Bug: the nightly auto-purge job (cron jobid 6 'scrub-soft-deleted-ros',
-- 0 7 * * *) had been FAILING every run for 8+ days. cron.job_run_details
-- showed the same error daily:
--   ERROR: operator does not exist: text = uuid
--   DELETE FROM manager_work_lists WHERE ro_id = target.id
-- so NO soft-deleted ROs were ever purged and the Recently Deleted bucket
-- filled with "auto-purge overdue" rows. (No data harm -- the function is one
-- transaction, so each failed run rolled back cleanly; it just never deleted.)
--
-- Two defects, both fixed here:
--   1) manager_work_lists.ro_id is TEXT holding the RO UUID as a string, so
--      `ro_id = target.id` (uuid) is an invalid text=uuid comparison. Cast the
--      uuid: `ro_id = target.id::text`. (Same TEXT-ro_id gotcha that needed a
--      ::uuid cast in the manager report.)
--   2) The service_tasks cleanup looped service_work_orders and deleted by a
--      non-existent column `service_tasks.wo_id`. service_tasks has BOTH
--      work_order_id and a direct ro_id, so the loop is replaced with a single
--      `DELETE FROM service_tasks WHERE ro_id = target.id`. Defect 2 was masked
--      until defect 1 was fixed (the function always aborted on the manager_
--      work_lists line first, and only for no-WO ROs reached it at all).
--
-- After applying, a manual `SELECT * FROM scrub_soft_deleted_ros();` cleared a
-- 35-RO overdue backlog; 0 overdue remain.

CREATE OR REPLACE FUNCTION public.scrub_soft_deleted_ros()
 RETURNS TABLE(ro_id_scrubbed uuid, ro_name text, scrubbed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    target RECORD;
    scrubbed_count INT := 0;
BEGIN
    FOR target IN
        SELECT id, ro_id AS ro_text_id, customer_name
        FROM repair_orders
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '7 days'
    LOOP
        DELETE FROM service_tasks        WHERE ro_id = target.id;
        DELETE FROM service_work_orders  WHERE ro_id = target.id;
        DELETE FROM notes                WHERE ro_id = target.id;
        DELETE FROM parts                WHERE ro_id = target.id;
        DELETE FROM time_logs            WHERE ro_id = target.id;
        DELETE FROM audit_log            WHERE ro_id = target.id;
        DELETE FROM insurance_scans      WHERE ro_id = target.id;
        DELETE FROM manager_work_lists   WHERE ro_id = target.id::text;
        DELETE FROM repair_orders        WHERE id    = target.id;

        scrubbed_count := scrubbed_count + 1;
        RETURN QUERY SELECT target.id, target.customer_name, NOW();
    END LOOP;

    RAISE NOTICE 'scrub_soft_deleted_ros: % RO(s) scrubbed', scrubbed_count;
    RETURN;
END;
$function$;
