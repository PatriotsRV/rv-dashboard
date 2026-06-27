-- [ER a7d1474e S127] Always-visible urgent-update banner field on RO cards.
-- (1) Additive nullable text column on repair_orders.
-- (2) Widen scheduled_notifications.source CHECK to allow the new notify source,
--     so setting/changing the urgent update can enqueue an immediate notification.
-- Both alter EXISTING tables, so the default Data API grant already covers them.

ALTER TABLE public.repair_orders
    ADD COLUMN IF NOT EXISTS urgent_update text;

COMMENT ON COLUMN public.repair_orders.urgent_update IS 'Free-text urgent note shown as an always-visible red banner on the RO card. Changing it notifies the silo manager(s) + admins.';

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
        'urgent_update_notify'::text
    ]));
