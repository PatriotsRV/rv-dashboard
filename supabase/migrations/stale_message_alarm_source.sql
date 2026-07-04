-- stale_message_alarm_source.sql (Session 132, 2026-07-04, GH#39)
-- Widen scheduled_notifications.source CHECK to allow 'stale_message_alarm':
-- the projectblue-reconcile edge fn emails admins when outbound messages sit
-- in Project Blue's queue past the stale threshold (S130-class stall).
-- Alters an EXISTING table, so the default Data API grant already covers it.

ALTER TABLE public.scheduled_notifications
    DROP CONSTRAINT IF EXISTS scheduled_notifications_source_check;

ALTER TABLE public.scheduled_notifications
    ADD CONSTRAINT scheduled_notifications_source_check
    CHECK (source = ANY (ARRAY[
        'manual'::text,
        'auto_dropoff_reminder'::text,
        'auto_promised_reminder'::text,
        'auto_pickup_reminder'::text,
        'service_added_notify'::text,
        'urgent_update_notify'::text,
        'inbound_message_notify'::text,
        'stale_message_alarm'::text
    ]));
