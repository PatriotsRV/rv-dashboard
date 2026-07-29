-- ============================================================
-- send_checkin_reminder_s162.sql (Roland directive, Session 162, 2026-07-29)
-- ============================================================
-- Pairs with edge fn send-checkin-reminder v1.0.
-- pg_cron: fire the morning tech check-in reminder weekdays:
--   8:15 AM CT cohort (Mauricio, Ignacio)  -> 13:15 UTC during CDT
--   9:30 AM CT cohort (8 techs)            -> 14:30 UTC during CDT
-- ⚠ pg_cron runs in UTC. When DST ends (Nov 2026) these become
--   7:15 AM / 8:30 AM CST — same known drift as the admin report +
--   unreplied-reminder crons (S101/S158 gotcha). Shift each +1 hour
--   (14:15 / 15:30 UTC) that week if it matters.
-- No CHECK-constraint widening needed: this fn sends SMS only, writes
-- no scheduled_notifications rows.
-- Idempotent: safe to re-run.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.invoke_send_checkin_reminder(p_cohort text)
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare v_request_id bigint;
begin
  select net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-checkin-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('cohort', p_cohort),
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-checkin-reminder-815am') then
    perform cron.schedule('send-checkin-reminder-815am', '15 13 * * 1-5',
      'SELECT invoke_send_checkin_reminder(''815'')');
  end if;
  if not exists (select 1 from cron.job where jobname = 'send-checkin-reminder-930am') then
    perform cron.schedule('send-checkin-reminder-930am', '30 14 * * 1-5',
      'SELECT invoke_send_checkin_reminder(''930'')');
  end if;
end $$;

-- ── Report ──────────────────────────────────────────────────────────
select jobname, schedule, command from cron.job
  where jobname in ('send-checkin-reminder-815am', 'send-checkin-reminder-930am');
