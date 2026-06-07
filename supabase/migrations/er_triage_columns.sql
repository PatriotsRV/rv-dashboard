-- ============================================================
-- ER Triage Automation - Phase 2a: additive triage columns
-- Spec: docs/specs/ER_TRIAGE_AUTOMATION_SPEC.md (section 2)
-- Session 95, 2026-06-07
--
-- ADDITIVE ONLY - no existing column is touched, no data change.
-- Safe to run on production at any time. Idempotent (IF NOT EXISTS).
--
-- Verified before writing (Session 95, read-only MCP):
--   enhancement_requests has 11 columns, PK only, no CHECK constraints.
-- ============================================================

ALTER TABLE public.enhancement_requests
  ADD COLUMN IF NOT EXISTS triage_bucket  text,
  ADD COLUMN IF NOT EXISTS triage_loe     text,
  ADD COLUMN IF NOT EXISTS triage_verdict text,
  ADD COLUMN IF NOT EXISTS triage_run_at  timestamptz,
  ADD COLUMN IF NOT EXISTS triage_pr_url  text;

-- Integrity guards on the new (and only the new) columns.
-- Both allow NULL (untriaged rows stay NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enhancement_requests_triage_bucket_check'
  ) THEN
    ALTER TABLE public.enhancement_requests
      ADD CONSTRAINT enhancement_requests_triage_bucket_check
      CHECK (triage_bucket IS NULL OR triage_bucket IN
        ('done','bug','needed','data','duplicate'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enhancement_requests_triage_loe_check'
  ) THEN
    ALTER TABLE public.enhancement_requests
      ADD CONSTRAINT enhancement_requests_triage_loe_check
      CHECK (triage_loe IS NULL OR triage_loe IN ('S','M','L','XL'));
  END IF;
END $$;

-- Verification (run after; expect 5 rows):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name='enhancement_requests' AND column_name LIKE 'triage%';
