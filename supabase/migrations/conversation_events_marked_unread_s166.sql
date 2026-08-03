-- S166 (2026-08-03): widen conversation_events.event CHECK to allow 'marked_unread'
-- for the messages.html v1.18 per-conversation Mark unread button (inverse of
-- the v1.14 marked_read flip).
-- (Pattern: same as conversation_events_marked_read_s160.sql — drop + re-add
--  with the FULL value list.)
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
        'marked_read',   -- S160: messages v1.14 Mark read/seen
        'marked_unread'  -- S166: messages v1.18 Mark unread (inverse flip)
    ));

COMMENT ON CONSTRAINT conversation_events_event_check ON public.conversation_events IS
    'Widened S166 to add marked_unread (messages.html v1.18 Mark unread — inverse of the S160 marked_read flip).';
