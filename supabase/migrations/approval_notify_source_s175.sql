-- ============================================================================
-- approval_notify_source_s175.sql  (Session 175, 2026-08-20)
--
-- Widen scheduled_notifications.source CHECK to allow 'approval_notify' —
-- the S175 Approved-status notification (silo managers + techs with time on
-- the RO get told the approval happened and they can move forward).
-- List = the 12 live values (verified against pg_constraint 2026-08-20)
-- + the new one. Run in the Supabase SQL Editor. Idempotent.
-- ============================================================================

alter table public.scheduled_notifications
  drop constraint if exists scheduled_notifications_source_check;

alter table public.scheduled_notifications
  add constraint scheduled_notifications_source_check
  check (source = any (array[
    'manual',
    'auto_dropoff_reminder',
    'auto_promised_reminder',
    'auto_pickup_reminder',
    'service_added_notify',
    'urgent_update_notify',
    'inbound_message_notify',
    'stale_message_alarm',
    'conversation_assigned',
    'assigned_inbound_notify',
    'review_feedback_notify',
    'unreplied_eod_reminder',
    'approval_notify'
  ]));
