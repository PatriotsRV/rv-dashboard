-- ============================================================
-- BRANDON_INSURANCE_WO_WRITER.sql
-- Session 68 (2026-05-18) — Insurance WO Writer role
-- ============================================================
-- Adds a new RBAC role 'Insurance WO Writer' that grants
-- cross-silo Work Order create/update + template rights,
-- without approve/close/reassign/delete/re-price.
--
-- First user: Brandon Dillon (brandon@patriotsrvservices.com),
-- the insurance manager. He inputs WO data from insurance
-- estimates and from templates created by silo managers.
--
-- Status: RAN BY ROLAND 2026-05-18.
--         Verification SELECT returned: 1, 1, 1, 1.
-- ============================================================

-- 1a. New role
INSERT INTO roles (name) VALUES ('Insurance WO Writer')
ON CONFLICT (name) DO NOTHING;

-- 1b. Assign Brandon
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'brandon@patriotsrvservices.com'
  AND r.name = 'Insurance WO Writer'
ON CONFLICT DO NOTHING;

-- 2. Helper function — true if current user holds the role
CREATE OR REPLACE FUNCTION public.is_insurance_wo_writer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.id = auth.uid() AND r.name = 'Insurance WO Writer'
  );
$$;

-- 3. RLS — extend INSERT/UPDATE policies only. DELETE policies left
--    untouched, so DB blocks deletion even if a UI bug exposes it.
DROP POLICY IF EXISTS swo_insert ON service_work_orders;
CREATE POLICY swo_insert ON service_work_orders
  FOR INSERT WITH CHECK (
    is_silo_manager(service_silo) OR is_sr_manager_or_admin() OR is_insurance_wo_writer()
  );

DROP POLICY IF EXISTS swo_update ON service_work_orders;
CREATE POLICY swo_update ON service_work_orders FOR UPDATE
  USING     (is_silo_manager(service_silo) OR is_sr_manager_or_admin() OR is_insurance_wo_writer())
  WITH CHECK(is_silo_manager(service_silo) OR is_sr_manager_or_admin() OR is_insurance_wo_writer());

DROP POLICY IF EXISTS st_insert ON service_tasks;
CREATE POLICY st_insert ON service_tasks FOR INSERT WITH CHECK (
  is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
  OR is_sr_manager_or_admin() OR is_insurance_wo_writer()
);

DROP POLICY IF EXISTS st_update ON service_tasks;
CREATE POLICY st_update ON service_tasks FOR UPDATE
  USING (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR assigned_tech_email = (SELECT auth.jwt() ->> 'email')
    OR is_sr_manager_or_admin() OR is_insurance_wo_writer()
  )
  WITH CHECK (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR assigned_tech_email = (SELECT auth.jwt() ->> 'email')
    OR is_sr_manager_or_admin() OR is_insurance_wo_writer()
  );
-- NOTE: swo_delete + st_delete intentionally NOT extended → Brandon cannot delete.

-- 4. BEFORE UPDATE trigger — column-level guardrails on service_work_orders.
--    RLS can't restrict columns natively; this trigger does it.
CREATE OR REPLACE FUNCTION enforce_insurance_wo_writer_swo_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE locked_statuses TEXT[] := ARRAY['awaiting_customer_approval','customer_approved','completed'];
BEGIN
  -- Only enforce when caller is an Insurance WO Writer AND not also admin /
  -- sr_manager / silo manager (silo managers retain full rights on their silo).
  IF is_insurance_wo_writer()
     AND NOT is_sr_manager_or_admin()
     AND NOT is_silo_manager(NEW.service_silo)
  THEN
    -- Pricing lock: once dollar_value > 0, no further edits by an Insurance WO Writer.
    -- Initial value entered on a fresh WO (OLD.dollar_value = 0) is allowed.
    IF COALESCE(OLD.dollar_value,0) > 0
       AND NEW.dollar_value IS DISTINCT FROM OLD.dollar_value THEN
      RAISE EXCEPTION 'Insurance WO Writer cannot modify dollar_value once it is set (current: $%)', OLD.dollar_value;
    END IF;
    -- Status lock: cannot move WO to awaiting_customer_approval, customer_approved, completed.
    IF NEW.status = ANY(locked_statuses)
       AND OLD.status <> NEW.status THEN
      RAISE EXCEPTION 'Insurance WO Writer cannot move status to %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_insurance_wo_writer_swo_limits ON service_work_orders;
CREATE TRIGGER trg_insurance_wo_writer_swo_limits
BEFORE UPDATE ON service_work_orders
FOR EACH ROW EXECUTE FUNCTION enforce_insurance_wo_writer_swo_limits();

-- 5. BEFORE INSERT/UPDATE trigger — block tech assignment + terminal task statuses
--    on service_tasks for Insurance WO Writers.
CREATE OR REPLACE FUNCTION enforce_insurance_wo_writer_st_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  silo TEXT;
  locked_task_statuses TEXT[] := ARRAY['awaiting_approval','completed'];
BEGIN
  SELECT service_silo INTO silo FROM service_work_orders WHERE id = NEW.work_order_id;
  IF is_insurance_wo_writer()
     AND NOT is_sr_manager_or_admin()
     AND NOT is_silo_manager(silo)
  THEN
    IF NEW.assigned_tech_email IS NOT NULL THEN
      RAISE EXCEPTION 'Insurance WO Writer cannot assign techs';
    END IF;
    IF NEW.status = ANY(locked_task_statuses) THEN
      RAISE EXCEPTION 'Insurance WO Writer cannot move task status to %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_insurance_wo_writer_st_limits ON service_tasks;
CREATE TRIGGER trg_insurance_wo_writer_st_limits
BEFORE INSERT OR UPDATE ON service_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_insurance_wo_writer_st_limits();

-- 6. Verify
SELECT
  (SELECT count(*) FROM roles WHERE name='Insurance WO Writer') AS role_exists,
  (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
    WHERE r.name='Insurance WO Writer' AND u.email='brandon@patriotsrvservices.com') AS brandon_assigned,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_insurance_wo_writer_swo_limits') AS swo_trigger,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_insurance_wo_writer_st_limits') AS st_trigger;
-- Expected: 1, 1, 1, 1   ← Roland confirmed 2026-05-18
