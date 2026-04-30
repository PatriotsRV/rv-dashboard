-- Migration: add_partial_hours_to_time_off.sql
-- Session 62 — 2026-04-30 — GH#38 partial day time off requests
--
-- Adds partial_hours column to time_off_requests.
-- NULL = full day request (existing behavior unchanged).
-- A numeric value (0.5–8.0) = partial day; stores the number of hours away.
--
-- Day value for stats: partial_hours / 8  (e.g. 2h = 0.25 days)
-- start_date = end_date for all partial day requests (single day only).
--
-- Run in Supabase SQL Editor before testing time-off.html v1.2.

ALTER TABLE time_off_requests
ADD COLUMN IF NOT EXISTS partial_hours NUMERIC(4,1)
    CHECK (partial_hours IS NULL OR (partial_hours >= 0.5 AND partial_hours <= 8.0));

COMMENT ON COLUMN time_off_requests.partial_hours IS
    'NULL = full day request. A value (0.5–8.0) = partial day hours away. Day fraction = partial_hours / 8.';
