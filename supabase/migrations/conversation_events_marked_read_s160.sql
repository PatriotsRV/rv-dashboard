-- S160 (2026-07-27): widen conversation_events.event CHECK to allow 'marked_read'
-- for the messages.html v1.14 per-conversation Mark read/seen button.
-- (Pattern: same as the scheduled_notifications.source CHECK widen, S127 gotcha —
--  drop + re-add with the full value list.)
--
-- Idempotent: DROP IF EXISTS + ADD.

ALTER TABLE public.conversation_events
    DROP CONSTRAINT IF EXISTS conversation_events_event_check;

ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_event_check
    CHECK (event IN (
        'assigned',
        'unassigned',
        'closed',
        'reopened',
        'opted_out',
        'opted_in',
        'marked_read'   -- S160: messages v1.14 Mark read/seen
    ));

COMMENT ON CONSTRAINT conversation_events_event_check ON public.conversation_events IS
    'Widened S160 to add marked_read (messages.html v1.14 per-conversation needs-reply reset).';
