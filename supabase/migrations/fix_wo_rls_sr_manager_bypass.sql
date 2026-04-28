-- Fix: Add sr_manager / admin bypass to service_work_orders + service_tasks write policies
-- Kevin McHenry (sr_manager, NULL silo) was blocked by is_silo_manager() on all writes.
-- is_silo_manager() returns false when staff.service_silo IS NULL, so sr_managers with
-- no assigned silo could SELECT work orders but not INSERT/UPDATE/DELETE them.
-- Run date: 2026-04-28

-- 1. Helper function: returns true if current user has Sr Manager or Admin role
CREATE OR REPLACE FUNCTION public.is_sr_manager_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r       ON r.id = ur.role_id
    WHERE u.id = auth.uid()
    AND r.name IN ('Sr Manager', 'Admin')
  );
$$;

-- 2. service_work_orders — drop + recreate write policies with sr_manager/admin bypass
DROP POLICY IF EXISTS swo_insert ON public.service_work_orders;
CREATE POLICY swo_insert ON public.service_work_orders
  FOR INSERT WITH CHECK (is_silo_manager(service_silo) OR is_sr_manager_or_admin());

DROP POLICY IF EXISTS swo_update ON public.service_work_orders;
CREATE POLICY swo_update ON public.service_work_orders
  FOR UPDATE
  USING     (is_silo_manager(service_silo) OR is_sr_manager_or_admin())
  WITH CHECK(is_silo_manager(service_silo) OR is_sr_manager_or_admin());

DROP POLICY IF EXISTS swo_delete ON public.service_work_orders;
CREATE POLICY swo_delete ON public.service_work_orders
  FOR DELETE USING (is_silo_manager(service_silo) OR is_sr_manager_or_admin());

-- 3. service_tasks — drop + recreate write policies with sr_manager/admin bypass
DROP POLICY IF EXISTS st_insert ON public.service_tasks;
CREATE POLICY st_insert ON public.service_tasks
  FOR INSERT WITH CHECK (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR is_sr_manager_or_admin()
  );

DROP POLICY IF EXISTS st_update ON public.service_tasks;
CREATE POLICY st_update ON public.service_tasks
  FOR UPDATE
  USING (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR assigned_tech_email = (SELECT auth.jwt() ->> 'email')
    OR is_sr_manager_or_admin()
  )
  WITH CHECK (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR assigned_tech_email = (SELECT auth.jwt() ->> 'email')
    OR is_sr_manager_or_admin()
  );

DROP POLICY IF EXISTS st_delete ON public.service_tasks;
CREATE POLICY st_delete ON public.service_tasks
  FOR DELETE USING (
    is_silo_manager((SELECT service_silo FROM service_work_orders WHERE id = work_order_id))
    OR is_sr_manager_or_admin()
  );
