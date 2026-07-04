-- inbound_message_notify_source.sql (Session 132, 2026-07-04, GH#39)
-- Widen scheduled_notifications.source CHECK to allow 'inbound_message_notify':
-- the projectblue-webhook edge fn (v1.1) enqueues a notification to the RO's
-- silo manager(s) + admins when an inbound customer text routes to an RO.
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
        'inbound_message_notify'::text
    ]));
