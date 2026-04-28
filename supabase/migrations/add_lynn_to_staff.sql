-- Migration: Add Lynn Shepard to staff table
-- Session 59 | 2026-04-28
-- Lynn has Admin rights in user_roles but had no staff row.
-- The Schedule Notification modal uses _staffCache (staff table) for recipient list,
-- so she was invisible. Adding her with sr_manager role, $0 hourly_rate (excluded from
-- labor cost reports), and NULL service_silo (appears in selectable list but not
-- pre-checked on any silo's notifications).

INSERT INTO public.staff (name, email, role, hourly_rate, active, service_silo)
VALUES ('Lynn Shepard', 'lynn@patriotsrvservices.com', 'sr_manager', 0.00, true, NULL);
