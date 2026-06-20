-- Key Dates Phase 3 — Session 119 (2026-06-20)
-- Widen scheduled_notifications.source CHECK to allow the two new key-date
-- reminder sources. Was ('manual','auto_dropoff_reminder'); add promised + pickup.
alter table public.scheduled_notifications
  drop constraint if exists scheduled_notifications_source_check;
alter table public.scheduled_notifications
  add constraint scheduled_notifications_source_check
  check (source = any (array[
    'manual',
    'auto_dropoff_reminder',
    'auto_promised_reminder',
    'auto_pickup_reminder'
  ]));
