-- notification_watchdog_s199.sql  (Session 199, 2026-10-08)
--
-- WHY: two silent notification outages (S116 -> 4 months, S194 -> 4 days) were invisible because
-- cron.job_run_details says "succeeded" when net.http_post merely hands back a request id. The
-- only signals were (a) due `pending` rows piling up in scheduled_notifications and (b) 401 rows in
-- net._http_response (6-hour retention). This function reads both. It is called every 15 minutes
-- by the Production Smoke Test workflow (.github/workflows/prod-smoke.yml, job `notifications`)
-- over SUPABASE_DB_URL; a non-empty `problems` array fails the workflow, which emails Roland.
-- That channel depends on NOTHING in PRVS (no edge fn, no Gmail, no scheduled_notifications row).
--
-- Read-only. No table changes. Safe to re-run.

create or replace function public.notification_watchdog()
returns jsonb
language sql
stable
security invoker
set search_path = public, net, pg_temp
as $$
  with stale as (
    select count(*) as n,
           coalesce(round(extract(epoch from (now() - min(scheduled_at))) / 60), 0)::int as oldest_min
    from public.scheduled_notifications
    where status = 'pending' and scheduled_at < now() - interval '2 hours'
  ),
  due_now as (
    select count(*) as n from public.scheduled_notifications
    where status = 'pending' and scheduled_at <= now()
  ),
  fn401 as (
    select count(*) as n
    from net._http_response r
    where r.status_code = 401 and r.created > now() - interval '6 hours'
  ),
  last_sent as (
    select max(fired_at) as at from public.scheduled_notifications where status = 'sent'
  ),
  failed6h as (
    select count(*) as n from public.scheduled_notifications
    where status = 'failed' and fired_at > now() - interval '6 hours'
  ),
  deferred as (
    select count(*) as n from public.scheduled_notifications
    where status = 'pending' and error_message like 'DEFERRED%'
  )
  select jsonb_build_object(
    'checked_at',          now(),
    'stale_pending',       (select n from stale),
    'oldest_pending_min',  (select oldest_min from stale),
    'due_now',             (select n from due_now),
    'deferred_pending',    (select n from deferred),
    'http_401_last_6h',    (select n from fn401),
    'failed_last_6h',      (select n from failed6h),
    'last_sent_at',        (select at from last_sent),
    'problems', (
      select coalesce(jsonb_agg(p), '[]'::jsonb) from (
        select 'STALE_PENDING: ' || (select n from stale) || ' due notification(s) still pending after 2h (oldest '
               || (select oldest_min from stale) || ' min) - process-scheduled-notifications is not delivering' as p
        where (select n from stale) > 0
        union all
        select 'HTTP_401: ' || (select n from fn401) || ' x 401 in net._http_response in the last 6h - a cron-called edge fn '
               || 'lost --no-verify-jwt (redeploy via scripts/deploy_fn.sh)'
        where (select n from fn401) > 0
      ) x
    )
  );
$$;

comment on function public.notification_watchdog() is
  'S199: health read for the notification pipeline. problems[] non-empty = page Roland. Called by prod-smoke.yml every 15 min.';

-- Not for browsers. The workflow connects as postgres over SUPABASE_DB_URL.
revoke all on function public.notification_watchdog() from public, anon, authenticated;

-- VERIFY (run after): should return a jsonb with problems = [] on a healthy day
select public.notification_watchdog();
