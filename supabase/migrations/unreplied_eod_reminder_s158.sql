-- ============================================================
-- unreplied_eod_reminder_s158.sql (ER 93b00023, Session 158, 2026-07-25)
-- ============================================================
-- Pairs with edge fns textly-webhook v1.3 + send-unreplied-reminder v1.0.
-- (1) Widen the scheduled_notifications.source CHECK to allow
--     'unreplied_eod_reminder' (S119 gotcha: widen BEFORE the fn writes it).
-- (2) pg_cron: fire send-unreplied-reminder weekdays at 4:30 PM Central.
--     pg_cron runs in UTC: 21:30 UTC = 4:30 PM CDT. ⚠ When DST ends
--     (Nov 2026) this becomes 3:30 PM CST — same known drift as the admin
--     report cron (S101 gotcha). Adjust to 22:30 UTC that week if it matters.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Widen the source CHECK ───────────────────────────────────────
alter table scheduled_notifications
  drop constraint if exists scheduled_notifications_source_check;

alter table scheduled_notifications
  add constraint scheduled_notifications_source_check
  check (source = any (array[
    'manual'::text,
    'auto_dropoff_reminder'::text,
    'auto_promised_reminder'::text,
    'auto_pickup_reminder'::text,
    'service_added_notify'::text,
    'urgent_update_notify'::text,
    'inbound_message_notify'::text,
    'stale_message_alarm'::text,
    'conversation_assigned'::text,
    'assigned_inbound_notify'::text,
    'review_feedback_notify'::text,
    'unreplied_eod_reminder'::text     -- NEW S158
  ]));

-- ── 2. pg_cron: weekdays 4:30 PM CT (21:30 UTC during CDT) ─────────
create extension if not exists pg_net;

create or replace function public.invoke_send_unreplied_reminder()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare v_request_id bigint;
begin
  select net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-unreplied-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-unreplied-reminder-430pm') then
    perform cron.schedule('send-unreplied-reminder-430pm', '30 21 * * 1-5',
      'SELECT invoke_send_unreplied_reminder()');
  end if;
end $$;

-- ── Report ──────────────────────────────────────────────────────────
select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'scheduled_notifications_source_check') as source_check,
  (select count(*) from cron.job
    where jobname = 'send-unreplied-reminder-430pm') as cron_job;
