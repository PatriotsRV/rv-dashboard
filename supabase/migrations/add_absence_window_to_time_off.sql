-- [ER 88395acc S127] Partial-day time off: capture the exact absence window
-- (clock-out time -> return time), in addition to the derived partial_hours.
-- Additive + nullable; existing rows keep working (partial_hours only).
-- Altering an EXISTING table, so the default Data API grant already covers it.

ALTER TABLE public.time_off_requests
    ADD COLUMN IF NOT EXISTS absence_start_time time,
    ADD COLUMN IF NOT EXISTS absence_end_time   time;

COMMENT ON COLUMN public.time_off_requests.absence_start_time IS 'Partial-day: time the employee clocks out (local). NULL for full-day or legacy hours-only records.';
COMMENT ON COLUMN public.time_off_requests.absence_end_time   IS 'Partial-day: time the employee returns (local). NULL for full-day or legacy hours-only records.';
