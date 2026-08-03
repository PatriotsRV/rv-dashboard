-- S166 (2026-08-03): short_links table for the messages v1.22 branded video
-- links. The v1.21 link-based video send exposed the raw Supabase storage URL
-- (project ref + bucket + path) to customers; v1.22 sends
-- https://patriotsrv.github.io/rv-dashboard/v.html?c=<code> instead, and
-- v.html resolves code -> url via anon REST and redirects.
--
-- RLS: anon SELECT is REQUIRED (customers are not authenticated) — the table
-- holds only code -> public-URL mappings, no PII; the target URLs are already
-- public-bucket objects, so this exposes nothing new. INSERT is any
-- authenticated staff (same bar as the message-media bucket upload policy).
-- No UPDATE/DELETE policies — links are immutable once sent.
--
-- Explicit GRANTs: future-proofing per the S124 note (Supabase removing
-- default public-schema Data API grants for new tables after 2026-10-30).
--
-- Idempotent: IF NOT EXISTS / OR REPLACE guards throughout.

CREATE TABLE IF NOT EXISTS public.short_links (
    code text PRIMARY KEY,
    url text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text
);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shortlinks_anon_select ON public.short_links;
CREATE POLICY shortlinks_anon_select ON public.short_links
    FOR SELECT USING (true);

DROP POLICY IF EXISTS shortlinks_auth_insert ON public.short_links;
CREATE POLICY shortlinks_auth_insert ON public.short_links
    FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT ON public.short_links TO anon;
GRANT SELECT, INSERT ON public.short_links TO authenticated;

COMMENT ON TABLE public.short_links IS
    'S166 messages v1.22: branded short links (v.html?c=<code>) for customer-facing video URLs. anon SELECT by design — customers resolve codes unauthenticated; rows hold only public-bucket URLs, no PII.';
