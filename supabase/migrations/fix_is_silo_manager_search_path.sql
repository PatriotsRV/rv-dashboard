CREATE OR REPLACE FUNCTION is_silo_manager(silo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role('Admin')
    OR EXISTS (
      SELECT 1 FROM staff
      WHERE email = (auth.jwt() ->> 'email')
        AND active = true
        AND (
          role = 'sr_manager'
          OR (role = 'manager' AND service_silo = silo)
        )
    );
$$;
