-- ============================================================================
-- GH#29b — Duplicate & Test RO Detection Queries
-- ============================================================================
-- Run these in Supabase SQL Editor (https://supabase.com/dashboard).
-- READ-ONLY detection — no DELETE/UPDATE. Review results, then triage with
-- the 🔗 Merge Dupes admin button or targeted DELETE statements.
--
-- Related code fix: v1.408 (Session 51) — see CLAUDE_CONTEXT.md GH#29.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- Q1: Exact (customer_name, date_received) duplicates in repair_orders
-- ─────────────────────────────────────────────────────────────────────────
-- These are the rows the v1.408 bug was targeting. Any group with
-- count > 1 is a candidate for Merge Dupes or cleanup.
SELECT
    customer_name,
    date_received,
    COUNT(*)              AS dupe_count,
    ARRAY_AGG(id ORDER BY created_at) AS supabase_ids,
    ARRAY_AGG(ro_id ORDER BY created_at) AS ro_ids,
    ARRAY_AGG(status ORDER BY created_at) AS statuses,
    ARRAY_AGG(rv ORDER BY created_at) AS rvs
FROM repair_orders
GROUP BY customer_name, date_received
HAVING COUNT(*) > 1
ORDER BY dupe_count DESC, customer_name;


-- ─────────────────────────────────────────────────────────────────────────
-- Q2: Base-ID dupes (same PRVS-XXXX-XXXX hash, with or without -2/-3 suffix)
-- ─────────────────────────────────────────────────────────────────────────
-- Matches the detection logic in findDuplicateGroups() / getBaseROId()
-- in index.html. Base ID is ro_id stripped of any trailing -N suffix.
SELECT
    REGEXP_REPLACE(ro_id, '-\d+$', '') AS base_ro_id,
    COUNT(*)              AS dupe_count,
    ARRAY_AGG(ro_id ORDER BY created_at) AS all_ro_ids,
    ARRAY_AGG(customer_name ORDER BY created_at) AS customer_names,
    ARRAY_AGG(status ORDER BY created_at) AS statuses
FROM repair_orders
WHERE ro_id IS NOT NULL
GROUP BY REGEXP_REPLACE(ro_id, '-\d+$', '')
HAVING COUNT(*) > 1
ORDER BY dupe_count DESC;


-- ─────────────────────────────────────────────────────────────────────────
-- Q3: Suspected test/fake customer rows
-- ─────────────────────────────────────────────────────────────────────────
-- Surfaces obvious test-signature names. REVIEW EACH before deleting —
-- a real customer named "Testerman" is unlikely but not impossible.
SELECT
    id,
    ro_id,
    customer_name,
    rv,
    status,
    date_received,
    created_at
FROM repair_orders
WHERE
    LOWER(customer_name) ~ '\y(test|tester|testing|fake|dummy|sample|delete ?me|xxx|asdf|qwerty|john ?doe|jane ?doe)\y'
    OR LOWER(customer_name) ~ '^[a-z]{1,3}$'                  -- 1–3 letter names
    OR LOWER(customer_name) LIKE '%test%'
    OR customer_name ~ '^\d+$'                                -- all-numeric names
ORDER BY created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────
-- Q4: Same customer_name in BOTH repair_orders AND cashiered
-- ─────────────────────────────────────────────────────────────────────────
-- Not necessarily a bug (a customer may have a closed RO and a new one)
-- but useful to surface the exact case Roland reported:
-- "entered the same fake name in customer-checkin, then tried to Cashier".
SELECT
    ro.customer_name,
    COUNT(DISTINCT ro.id)  AS active_count,
    COUNT(DISTINCT c.id)   AS cashiered_count,
    ARRAY_AGG(DISTINCT ro.ro_id) AS active_ro_ids,
    ARRAY_AGG(DISTINCT c.ro_id)  AS cashiered_ro_ids
FROM repair_orders ro
JOIN cashiered c USING (customer_name)
GROUP BY ro.customer_name
ORDER BY active_count DESC, cashiered_count DESC;


-- ─────────────────────────────────────────────────────────────────────────
-- Q5: Quick totals — sanity check before & after cleanup
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'repair_orders' AS table_name, COUNT(*) AS row_count FROM repair_orders
UNION ALL
SELECT 'cashiered',                   COUNT(*)              FROM cashiered
UNION ALL
SELECT 'notes',                       COUNT(*)              FROM notes
UNION ALL
SELECT 'parts',                       COUNT(*)              FROM parts
UNION ALL
SELECT 'time_logs',                   COUNT(*)              FROM time_logs;


-- ─────────────────────────────────────────────────────────────────────────
-- Q6: FULL FIELD DUMP for every row inside a duplicate (name, date) group
-- ─────────────────────────────────────────────────────────────────────────
-- Use this to manually review duplicates. Returns every column on every row
-- that belongs to a (customer_name, date_received) group with >1 members,
-- clustered together so you can compare side-by-side.
--
-- In Supabase SQL Editor, click **Export → CSV** on the result set and save
-- to ~/rv-dashboard/tmp/dupes_full.csv (or wherever convenient) — then paste
-- the path back into the chat and I'll read it directly.
WITH dupe_groups AS (
    SELECT customer_name, date_received
    FROM repair_orders
    GROUP BY customer_name, date_received
    HAVING COUNT(*) > 1
)
SELECT ro.*
FROM repair_orders ro
JOIN dupe_groups dg USING (customer_name, date_received)
ORDER BY ro.customer_name, ro.date_received, ro.created_at;


-- ─────────────────────────────────────────────────────────────────────────
-- Q7: FK child counts per duplicate row
-- ─────────────────────────────────────────────────────────────────────────
-- For each RO in a dupe group, shows how many child rows reference it
-- (notes, parts, time_logs, audit_log, insurance_scans). High-FK rows
-- usually have real work logged against them — prefer merging INTO those
-- rather than deleting them. Zero-FK rows are the safest to DELETE outright.
WITH dupe_groups AS (
    SELECT customer_name, date_received
    FROM repair_orders
    GROUP BY customer_name, date_received
    HAVING COUNT(*) > 1
)
SELECT
    ro.id,
    ro.ro_id,
    ro.customer_name,
    ro.date_received,
    ro.rv,
    ro.status,
    ro.created_at,
    (SELECT COUNT(*) FROM notes           n WHERE n.ro_id = ro.id) AS note_ct,
    (SELECT COUNT(*) FROM parts           p WHERE p.ro_id = ro.id) AS part_ct,
    (SELECT COUNT(*) FROM time_logs       t WHERE t.ro_id = ro.id) AS time_ct,
    (SELECT COUNT(*) FROM audit_log       a WHERE a.ro_id = ro.id) AS audit_ct,
    (SELECT COUNT(*) FROM insurance_scans i WHERE i.ro_id = ro.id) AS ins_ct
FROM repair_orders ro
JOIN dupe_groups dg USING (customer_name, date_received)
ORDER BY ro.customer_name, ro.date_received, ro.created_at;


-- ============================================================================
-- CLEANUP GUIDANCE (do NOT copy-paste unless you have triaged results above)
-- ============================================================================
-- Preferred path for customer dupes:
--   Use the 🔗 Merge Dupes admin button in the dashboard — it handles FK
--   reassignment on notes/parts/time_logs/insurance_scans/audit_log and
--   merges photo_library before deleting the duplicate row.
--
-- For pure test junk with no real customer data and no FK references:
--   1) First confirm no FKs reference the target id:
--        SELECT 'notes'      AS tbl, COUNT(*) FROM notes           WHERE ro_id = '<UUID>'
--        UNION ALL SELECT 'parts',   COUNT(*) FROM parts           WHERE ro_id = '<UUID>'
--        UNION ALL SELECT 'time',    COUNT(*) FROM time_logs       WHERE ro_id = '<UUID>'
--        UNION ALL SELECT 'ins',     COUNT(*) FROM insurance_scans WHERE ro_id = '<UUID>'
--        UNION ALL SELECT 'audit',   COUNT(*) FROM audit_log       WHERE ro_id = '<UUID>';
--   2) If all zero, delete:
--        DELETE FROM repair_orders WHERE id = '<UUID>';
--   3) Otherwise, cascade-delete the FK rows first (irreversible — export first).
-- ============================================================================
