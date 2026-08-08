-- ============================================================================
-- er_paperwork_s171.sql — Session 171 (2026-08-08)
-- ER triage paperwork per docs/ER_TRIAGE_2026-08-08.md item 7: close 6
-- unreviewed rows with no code work — 2 already-delivered → done, 4
-- duplicates → declined.
--
-- ⚠️ S125 rule: every statement is per-row guarded (id AND status='unreviewed');
-- safe to run twice — reruns no-op.
-- ⚠️ S119 trigger: flipping to 'done' EMAILS the requester (send-er-completion)
-- — the two done flips below will email Andrew Page and Brandon.
-- Declines do NOT email.
-- All 6 ids + statuses MCP-verified unreviewed 2026-08-08.
-- ============================================================================

BEGIN;

-- ── DONE (delivered, re-verified at HEAD by the 08-08 triage run) ──

-- 1c7f1410 (Andrew Page): messaging media attach — photo/PDF shipped
-- S151b/S158 (multi-attach), video shipped S166 (link-based v1.21).
UPDATE enhancement_requests
SET status = 'done',
    completion_notes = 'Delivered: photo/PDF attachments (up to 5 per send) shipped in the S158 Messages bundle, and video attach shipped 8/3 (link-based send — you get a branded short link the customer taps to watch, since carriers cap MMS at ~1MB). Available in the composer on the Messages board and the RO card thread.'
WHERE id = '1c7f1410-eac7-46f0-98d4-60377dc25e37'
  AND status = 'unreviewed';

-- 9d3806e7 (Brandon): customer notes section in the details pane — shipped
-- S154 (customer_note_entries + Add Notes modal in messages.html).
UPDATE enhancement_requests
SET status = 'done',
    completion_notes = 'Delivered: the Messages details pane has a customer-specific Notes section (Add Notes button, entries stamped with date + author, full history kept). Shipped with the S154 messages update.'
WHERE id = '9d3806e7-f83d-4e1d-93b3-b59e1c82b4eb'
  AND status = 'unreviewed';

-- ── DECLINED (duplicates folded into a canonical open ER) ──

-- 9031e101 (Riley): iPhone work-list tap doesn't reach the unit → dup of d4d0eeba
UPDATE enhancement_requests
SET status = 'declined',
    admin_notes = COALESCE(admin_notes || E'\n', '') || '[S171] Folded into ER d4d0eeba (same scroll-to-RO defect; one fix closes all three reports). Not declined on merit — tracked under the canonical ER.'
WHERE id = '9031e101-024c-4775-ba1f-a0e1d1b63364'
  AND status = 'unreviewed';

-- 1bc33dd6 (Brandon): scroll-to-customer misses filtered cards → dup of d4d0eeba
UPDATE enhancement_requests
SET status = 'declined',
    admin_notes = COALESCE(admin_notes || E'\n', '') || '[S171] Folded into ER d4d0eeba (same scroll-to-RO defect Brandon filed 07-22). Tracked under the canonical ER.'
WHERE id = '1bc33dd6-b6cd-4ebc-b9a4-e800032e413e'
  AND status = 'unreviewed';

-- 2b78696c (Lynn): back-to-top button → dup of 29654af7 (her own 07-06 ask)
UPDATE enhancement_requests
SET status = 'declined',
    admin_notes = COALESCE(admin_notes || E'\n', '') || '[S171] Duplicate of ER 29654af7 (same back-to-top ask, 07-06). Tracked under the canonical ER.'
WHERE id = '2b78696c-ecc2-43fa-a2c9-5038e1fffb79'
  AND status = 'unreviewed';

-- eb00a68d (Lynn): CANCELED status → dup of 972af03c (her own 07-17 ask)
UPDATE enhancement_requests
SET status = 'declined',
    admin_notes = COALESCE(admin_notes || E'\n', '') || '[S171] Duplicate of ER 972af03c (same Canceled-status ask, 07-17). Tracked under the canonical ER; planned as part of the one RO-fields build (Canceled + Totaled Out + mileage + soft archive).'
WHERE id = 'eb00a68d-4366-456c-97bc-8ed8f4b4ffe9'
  AND status = 'unreviewed';

COMMIT;

-- VERIFY (expect: 2 done, 4 declined, 0 unreviewed):
--   SELECT left(id::text,8), status FROM enhancement_requests
--   WHERE left(id::text,8) IN ('1c7f1410','9d3806e7','9031e101','1bc33dd6','2b78696c','eb00a68d');
