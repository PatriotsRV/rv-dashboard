-- ER 9b823d25 — Session 120 (2026-06-21)
-- Widen scheduled_notifications.source CHECK to allow the cross-silo
-- service-add notification source. Adds 'service_added_notify' to the
-- Session 119 set (manual + drop-off + promised + pickup reminders).
alter table public.scheduled_notifications
  drop constraint if exists scheduled_notifications_source_check;
alter table public.scheduled_notifications
  add constraint scheduled_notifications_source_check
  check (source = any (array[
    'manual',
    'auto_dropoff_reminder',
    'auto_promised_reminder',
    'auto_pickup_reminder',
    'service_added_notify'
  ]));
