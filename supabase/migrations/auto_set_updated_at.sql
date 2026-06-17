-- Migration: auto_set_updated_at.sql
-- Session 115 (2026-06-17)
--
-- Problem: 14 public tables carry an updated_at column, but NONE had a trigger
-- maintaining it. The column was only correct when app code happened to set it,
-- and several write paths forget to (e.g. the returning-customer dup-RO update
-- branch in customer-checkin.html v1.12 left repair_orders.updated_at at its
-- creation time after a check-in modified the row).
--
-- Fix: one shared BEFORE UPDATE trigger function that forces updated_at = now()
-- on every row update, attached to all 14 tables. App paths that already set
-- updated_at use "now" anyway, so the trigger yields the same value and only
-- additionally covers the paths that forget. DB-only change; no index.html bump.
--
-- Idempotent: function is CREATE OR REPLACE; each trigger is DROP IF EXISTS first.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.repair_orders;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.parts;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.service_work_orders;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.service_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.service_tasks;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.service_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.time_logs;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.time_off_requests;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.time_off_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.enhancement_requests;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.enhancement_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.scheduled_notifications;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.scheduled_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.app_config;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.config;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.users;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.solar_project_store;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.solar_project_store
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.solar_settings;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.solar_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.wo_task_templates;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.wo_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
