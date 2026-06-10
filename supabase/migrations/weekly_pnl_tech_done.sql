-- ============================================================
-- WEEKLY P&L - STAGE 4: mark_wo_tech_done RPC (Session 99)
-- Spec: docs/specs/WEEKLY_PNL_SPEC.md v0.2 section 5, Stage 1.
--
-- Techs cannot UPDATE service_work_orders (RLS swo_update allows
-- only silo managers / sr+admin / insurance writer). This narrow
-- SECURITY DEFINER function lets any ACTIVE STAFF member set or
-- clear ONLY the tech_done_at/tech_done_by pair on a WO. It never
-- touches status, pricing, or completion - the manager Done-Done
-- path owns those. Returns the updated row's key fields.
-- ============================================================

CREATE OR REPLACE FUNCTION mark_wo_tech_done(p_wo_id UUID, p_done BOOLEAN)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_email TEXT := lower(COALESCE(auth.jwt() ->> 'email', ''));
    v_row service_work_orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'mark_wo_tech_done: authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM staff WHERE lower(email) = v_email AND active = true) THEN
        RAISE EXCEPTION 'mark_wo_tech_done: active staff only';
    END IF;

    UPDATE service_work_orders
    SET tech_done_at = CASE WHEN p_done THEN now() ELSE NULL END,
        tech_done_by = CASE WHEN p_done THEN v_email ELSE NULL END,
        updated_at   = now()
    WHERE id = p_wo_id
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'mark_wo_tech_done: work order not found';
    END IF;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'service_silo', v_row.service_silo,
        'tech_done_at', v_row.tech_done_at,
        'tech_done_by', v_row.tech_done_by
    );
END;
$$;

REVOKE ALL ON FUNCTION mark_wo_tech_done(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_wo_tech_done(UUID, BOOLEAN) TO authenticated;

-- VERIFY (expect one row listing the function):
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'mark_wo_tech_done';
