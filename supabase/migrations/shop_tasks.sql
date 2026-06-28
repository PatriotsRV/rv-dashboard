-- [ER 1fe68261 S128] shop_tasks — internal (non-customer) shop task tracker
-- Rod's ask: track tasks NOT tied to a customer unit (swap poly barrels, prep
-- roof bays for multiple units, etc.) so they don't get lost. Deliberately a
-- standalone list — NOT an RO/WO/silo — so it has zero impact on the board,
-- Weekly P&L, parts attribution, or manager reporting.
--
-- Access: UI is gated to managers/sr-managers/parts-managers/admins (the Shop
-- Tasks header button). RLS keeps it to authenticated users; create/complete/
-- delete is gated in the app by role (consistent with the rest of the dashboard,
-- whose RBAC is email/role based in the client, not in JWT claims).

CREATE TABLE IF NOT EXISTS public.shop_tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title         text NOT NULL,
    details       text,
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    assigned_to   text,            -- staff email, optional
    assigned_silo text,            -- SERVICE_SILOS key, optional
    sort_order    integer NOT NULL DEFAULT 0,
    created_by    text,
    completed_by  text,
    completed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_tasks_status_idx ON public.shop_tasks (status, created_at);

-- Shared updated_at maintenance (set_updated_at() from auto_set_updated_at.sql, S115)
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.shop_tasks;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON public.shop_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shop_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read shop tasks"   ON public.shop_tasks;
DROP POLICY IF EXISTS "Authenticated manage shop tasks" ON public.shop_tasks;

CREATE POLICY "Authenticated read shop tasks"
    ON public.shop_tasks FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated manage shop tasks"
    ON public.shop_tasks FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Explicit Data API grants (Supabase is removing the default public-schema
-- auto-grant for tables created after 2026-10-30; harmless to set now).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_tasks TO authenticated;
