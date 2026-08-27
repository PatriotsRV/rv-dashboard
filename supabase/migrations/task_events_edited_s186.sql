-- ============================================================================
-- Task Manager: allow 'edited' in task_events.event (Session 186, 2026-08-27)
-- Companion to tasks-v1.3 (task editing). Full array re-listed per S185 rule.
-- ============================================================================
alter table task_events drop constraint if exists task_events_event_check;
alter table task_events add constraint task_events_event_check
  check (event in ('created','done','validated','rejected','cancelled',
                   'reassigned','due_changed','reminder_sent','escalated',
                   'edited'));   -- NEW S186 (tasks-v1.3)
