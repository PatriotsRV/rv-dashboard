-- Key Dates Phase 2 — Session 119 (2026-06-20)
-- Stores the Google Calendar event IDs created for each key date so calendar
-- writes are idempotent (update on change, delete on clear).
-- Shape: { "promised": { "Roof": "<eventId>", ... }, "pickup": { ... } }
-- Additive, nullable.
alter table public.repair_orders
  add column if not exists cal_event_ids jsonb;
