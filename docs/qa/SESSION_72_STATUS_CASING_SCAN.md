# PRVS Dashboard — Session 72 Status-Casing Static Scan Report

**Baseline:** v1.417 (index.html) · v1.33 (checkin.html) · v1.14 (worklist-report) · v1.8 (customer-checkin) · v1.1 (closed-ros) · v1.1 (analytics) · v2.1 (solar) · v1.3 (time-off) · commit `c4c4ea3` on `main`
**Scan date:** 2026-05-23
**Scope:** 7 scans, read-only. NO code changes made. Awaiting review before patching.

---

## 1. Executive Summary

- **Found ONE live capital-P writer that the Session 71 grep missed:** `closed-ros.html` line 816, the cashiered-RO reactivation flow. Hardcodes `status: 'In Progress'` (capital P) AND skips `audit_log` entirely. This is the third ghost-write path Roland predicted — and almost certainly explains why fresh capital-P rows can keep appearing.
- **Backfill blind spot identified:** Session 71's UPDATE included `AND deleted_at IS NULL`, so soft-deleted rows (`deleted_at IS NOT NULL`) were skipped — explaining 2 of the 3 stragglers Roland reported. The audit batch INSERT had the same exclusion, which is also why one straggler ended up with a null audit writer.
- **No other ghost-write paths found.** All other writes to `repair_orders.status` (index.html `updateROStatus`, `confirmSchedule`, `appendToSupabase`; checkin.html v1.33 clockIn; customer-checkin.html INSERT) use canonical casing AND write `audit_log` where appropriate (or are initial INSERTs where there's no prior state to audit).
- **i18n is safe.** The `t()` function output never round-trips into a DB write. `<select>` always submits the `value` attribute (canonical), not the translated label.
- **Cross-table casing consistency holds for other enums.** Urgency, ro_type, role names, parts_status, parts.status, service_tasks.status, service_silo all internally consistent within their respective tables (though they use different conventions — see Medium-severity finding M-3).

---

## 2. Findings by Severity

### 🔴 BLOCKING

#### **B-1** — `closed-ros.html:816` writes capital-P + skips audit_log (Scan 1 & 2)

**File:** `closed-ros.html:799-822` — RO reactivation flow.

**What:** When a manager/admin reactivates a previously-cashiered RO back to the active dashboard, the code INSERTs into `repair_orders` with:

```javascript
// closed-ros.html:816
status:          'In Progress',   // ❌ capital P, hardcoded
```

Two compounding bugs in one line:

1. **Wrong casing** — writes `'In Progress'` (capital P), but canonical is `'In progress'` (lowercase p). This is the exact pattern Session 71 fixed in `checkin.html`, re-introduced here.
2. **Discards original status** — even if the cashiered row had a correct lowercase value, this line forcibly overwrites it with `'In Progress'`. The original status from the `cashiered` table is read into `ro` (line 791) but never used in the INSERT payload.
3. **No `audit_log` write** — no record of who reactivated the RO or that the status changed.

**Why it matters:** Every reactivation creates a fresh capital-P row that escapes the Session 71 backfill and reintroduces the casing bug. This is exactly the "fresh capital-P row" Roland is seeing. The "three stragglers" he mentioned almost certainly include rows that were reactivated post-v1.33.

**Remediation:**
- Read the original status from `ro.status` (from `cashiered`) and normalize it to canonical casing — OR force it to `'In progress'` *with the canonical lowercase value*.
- Write an `audit_log` row attributed to the reactivating user.
- Use a constant or `STATUS.IN_PROGRESS` reference (Scan 4) instead of a literal.

**Estimated effort:** 15 minutes.

#### **B-2** — Backfill blind spot left 3 rows unfixed (Scan 3)

**File:** Session 71 inline SQL (no migration committed).

**What:** The backfill UPDATE was:
```sql
UPDATE repair_orders
   SET status = 'In progress', updated_at = NOW()
 WHERE status = 'In Progress' AND deleted_at IS NULL;
```

The `AND deleted_at IS NULL` exclusion skipped soft-deleted rows. The audit batch INSERT had the same exclusion, so those rows also missed getting an audit entry — which is why Roland sees one with a null writer.

**Why it matters:** Two of Roland's three stragglers are flagged DELETE (Condry, Crawford) — those are soft-deleted rows the backfill excluded by design. The third (Crawford with null audit writer) is in the same bucket but for a different reason. Result: 3 rows still in capital-P state.

**Also:** the backfill never touched the `cashiered` table — if any cashiered rows have capital-P, they're still there waiting to be reactivated into fresh trouble.

**Remediation:** Run a follow-up UPDATE that *includes* soft-deleted rows AND covers the cashiered table:

```sql
-- Both tables, including soft-deleted
UPDATE repair_orders SET status = 'In progress', updated_at = NOW()
 WHERE status = 'In Progress';   -- no deleted_at filter
UPDATE cashiered SET status = 'In progress'
 WHERE status = 'In Progress';
```

Plus an `audit_log` INSERT batch that uses the same broad WHERE.

**Estimated effort:** 5 minutes.

---

### 🟠 HIGH

#### **H-1** — DB-level CHECK constraint not present (Scan 5)

**File:** `repair_orders.status` column has NO CHECK constraint — confirmed by reviewing all migrations.

**What:** Postgres accepts any string value for `status`. The only enforcement is application-side, which has been demonstrably insufficient (the bug class survived for 75 days).

**Why it matters:** Without a DB-level guard, every future code path that writes to `status` is a potential reintroduction site. Layer 1 (application) is fragile; we need Layer 2 (database) for "once and for all."

**Remediation:** Apply the CHECK constraint migration in Section 4 below.

**Estimated effort:** 10 minutes (run SQL + verify).

#### **H-2** — `ALL_STATUSES` is incomplete and locally-scoped (Scan 4)

**File:** `index.html:9870-9874` — array `ALL_STATUSES` lists 10 statuses but is missing `'Scheduled'` (which is set by `confirmSchedule` at line 6924 and exists in `STATUS_PROGRESS_MAP` line 4117).

**What:** Inconsistency — `STATUS_PROGRESS_MAP` has 11 statuses, `ALL_STATUSES` has 10. The Compact-by-Status view renders one column per `ALL_STATUSES` entry; `Scheduled` ROs are silently omitted from that view.

**Why it matters:** Symptom of having multiple status lists in different scopes. No single source of truth. New statuses (like 'Scheduled' added later) get added to some places but not others.

**Remediation:** Promote the canonical status list to a top-level constant and reference it everywhere. See M-1 below for full recommendation.

**Estimated effort:** 30 minutes if done as standalone task; 0 minutes if combined with M-1.

---

### 🟡 MEDIUM

#### **M-1** — No central status constants module (Scan 4)

**What:** Status strings are hardcoded as literals in:
- 6 status dropdowns across 2 HTML files (index.html lines 9164–9174, 9309–9319, 15146–15155; customer-checkin.html implicit via formData)
- 10 filter buttons (index.html 3645–3654)
- 1 progress map (index.html 4113–4123)
- 1 color map (index.html 9858–9867)
- 1 ALL_STATUSES array (index.html 9870–9874)
- 1 Spanish translation map (index.html 9998–10011 — with 3 defensive duplicate-casing entries: 10002, 10006, 10010)
- 6 string-comparison sites for behavioral logic (8307, 8404–8406, 8989, 8991, 9148, 9201, 9480, 9484, 9825, 9813, 9815, etc.)
- Multiple in checkin.html, customer-checkin.html, closed-ros.html, worklist-report.html

**Why it matters:** Magic-string sprawl. Every literal is a potential casing/typo regression site. v1.33's `const IN_PROGRESS` (checkin.html:1287) was a one-file fix; a project-wide constant would prevent this.

**Recommendation:** Inline a shared constants block via a single `<script src="js/status-constants.js">` loaded by every HTML page. Since this project is no-bundler vanilla-JS on GitHub Pages, use a plain global object:

```javascript
// js/status-constants.js — load on every HTML page that touches status
window.PRVS_STATUS = Object.freeze({
    NOT_ON_LOT:          'Not On Lot',
    ON_LOT:              'On Lot',
    SCHEDULED:           'Scheduled',
    AWAITING_APPROVAL:   'Awaiting Approval',
    AWAITING_PARTS:      'Awaiting parts',
    READY_TO_WORK:       'Ready to Work',
    IN_PROGRESS:         'In progress',     // canonical lowercase
    REPAIRS_COMPLETED:   'Repairs Completed',
    WAITING_FOR_QA:      'Waiting for QA/QC',
    READY_FOR_PICKUP:    'Ready for pickup',
    DELIVERED:           'Delivered/Cashed Out',
});
window.PRVS_STATUS_LIST = Object.freeze(Object.values(window.PRVS_STATUS));
```

Then replace every literal `'In progress'` with `PRVS_STATUS.IN_PROGRESS` and use `PRVS_STATUS_LIST` to populate dropdowns/filters.

**Estimated effort:** 2-3 hours (touches every HTML file with status literals).

#### **M-2** — Defensive duplicate-key Spanish translations (Scan 1)

**File:** `index.html:9998-10011`

**What:** Translation map contains BOTH casings for 3 statuses as defensive fallback:
- Line 10001: `'Awaiting parts': 'Esperando Partes'` (canonical)
- Line 10002: `'Awaiting Parts': 'Esperando Partes'` (defensive duplicate)
- Line 10005: `'In progress': 'En Progreso'` (canonical)
- Line 10006: `'In Progress': 'En Progreso'` (defensive duplicate)
- Line 10009: `'Ready for pickup': 'Listo para Recoger'` (canonical)
- Line 10010: `'Ready for Pickup': 'Listo para Recoger'` (defensive duplicate)

**Why it matters:** These duplicates were added (probably by Roland historically) as a stopgap because the codebase was writing inconsistent casing. They're a hint that someone knew the casing bug existed. **They also actively mask the casing problem from Spanish users** — Spanish-speaking staff see the correctly-translated badge regardless of which casing the DB has, so they never report the bug.

**Recommendation:** After M-1 + B-2 (the cleanup batch) confirm no capital-P writes happen anywhere, **delete the 3 defensive duplicates**. If a casing bug ever re-emerges, the visible English-fallback in Spanish UI becomes a built-in alarm.

**Estimated effort:** 5 minutes (delete 3 lines).

#### **M-3** — Cross-table casing inconsistency (Scan 6 — preventive)

**What:** Different enum-like fields use different casing conventions:
- `repair_orders.status`: **TitleCase mixed** ('Not On Lot', 'On Lot', 'In progress', 'Delivered/Cashed Out') — historical, the source of the v1.33 bug
- `repair_orders.parts_status`: **lowercase** ('sourcing', 'outstanding', 'received', 'estimate')
- `repair_orders.urgency`: **TitleCase** ('Critical', 'High', 'Medium', 'Low')
- `repair_orders.ro_type`: **lowercase** ('standard', 'insurance', 'internal', 'warranty', 'shop', 'hybrid')
- `parts.status`: **TitleCase** ('Sourcing', 'Outstanding', 'Received', 'Estimate', 'Ordered', 'In Transit', etc.)
- `service_tasks.status` / `service_work_orders.status`: **lowercase_snake_case** ('not_started', 'in_progress', 'awaiting_approval', 'awaiting_parts', 'completed')
- `service_work_orders.service_silo`: **lowercase** (8 values: 'repair', 'vroom', 'solar', 'roof', 'paint_body', 'chassis', 'detailing', 'truetopper')
- `staff.role`: **lowercase** ('sr_manager', 'manager', 'parts_manager', 'tech', 'admin')
- `user_roles → roles.name`: **TitleCase** ('Admin', 'Sr Manager', 'Manager', 'Solar', 'Insurance WO Writer')

Within each field, casing is consistent. Across fields, it's a Yes-and-No-and-snake-case jumble.

**Why it matters:** Future-Claude (or future-Roland) will write code that mixes one convention with another. The pattern that bit you for `status` is just as easy to repeat for any of these. Not a bug today, but a class of bug worth preventing.

**Recommendation:** Document the per-field convention in a comment block in CLAUDE_CONTEXT.md Known Issues. Apply CHECK constraints (similar to Section 4) to `urgency`, `ro_type`, `parts_status`, `parts.status`, `service_tasks.status`, and `service_work_orders.status` so the database enforces each field's convention.

**Estimated effort:** 1 hour (write + apply 6 small CHECK constraints, mostly copy-paste).

---

### 🔵 LOW

#### **L-1** — Display-vs-value asymmetry in status dropdowns (Scan 1)

**File:** `index.html:9164-9174` and `9309-9319`

**What:** Two of the three status dropdowns use TitleCase display labels (e.g., "Awaiting Parts", "In Progress", "Ready for Pickup") while the `value=` attribute uses canonical mixed casing ('Awaiting parts', 'In progress', 'Ready for pickup'). The third dropdown (New RO form, line 15146-15155) matches display to value (both canonical).

**Why it matters:** Cosmetic inconsistency; doesn't cause functional bugs since `<select>` returns the `value` attribute on change. But it makes the codebase harder to read and review — same string appears in two different forms.

**Recommendation:** Pick one convention. Either (a) make all display labels match canonical values (so "In progress" is shown to users) or (b) keep TitleCase for display everywhere but apply title-casing dynamically via a helper. (a) is simpler.

**Estimated effort:** 10 minutes.

#### **L-2** — `solar.html:2985` may create rows with NULL status (Scan 2)

**File:** `solar.html:2985-2992` — `createRO()` function in solar.html INSERTs into `repair_orders` but does NOT include `status` in the payload.

**What:** Solar's "create RO" flow uses a different INSERT schema (`customer_name`, `year`, `make`, `model`, `customer_email`, `customer_phone` — no `status`). Postgres will use the column default; if no default exists, the row gets `status=NULL`.

**Why it matters:** Likely benign — `loadDataFromSupabase` defaults NULL to 'Not On Lot' in JS memory (index.html:11054). But the DB row itself remains NULL until a user manually changes the status. NULL status is awkward for SQL queries and reports.

**Recommendation:** Add `status: 'Not On Lot'` (canonical) to the INSERT payload, AND set a Postgres column default `DEFAULT 'Not On Lot'` as part of the CHECK constraint migration in Section 4.

**Estimated effort:** 5 minutes.

#### **L-3** — `TASK_STATUS_LABELS` mixes display strings with constants (Scan 6 — minor)

**File:** `index.html:10257-10263` — `TASK_STATUS_LABELS` map keys are lowercase snake_case (canonical for service_tasks.status) but values include emoji ("✅ Completed") and display formatting. Same in `TASK_STATUS_COLORS`. Future-readability concern only.

**Why it matters:** None functionally. Just an example of display logic mixed with constants.

**Recommendation:** Split into `TASK_STATUS_LABELS` (plain text) and `TASK_STATUS_DISPLAY` (with emoji/formatting) if/when constants module M-1 is built.

**Estimated effort:** Trivial — fold into M-1.

---

## 3. Recommended Fix Order

The fix order is chosen to satisfy the **"once and for all"** goal in 3 layers, as Roland wrote it. Each step makes the next safer.

### Step 1 — Apply database CHECK constraint (Section 4 below) — **the keystone**

Run the migration. Once applied, ANY application-level bug writing capital-P fails loudly with a Postgres error. This is the load-bearing fix.

**Why first:** Even if Step 2 fails or stragglers remain, Step 1 prevents new bad writes. Existing capital-P rows must be cleaned up first (Step 2) so the constraint can apply.

**Order within Step 1:**
1. Run the cleanup UPDATEs (no `deleted_at IS NULL` filter, includes `cashiered`)
2. Verify zero capital-P remaining in either table
3. Apply the CHECK constraint
4. Verify with a deliberate bad-INSERT attempt that fails as expected

### Step 2 — Fix B-1 (closed-ros.html reactivation flow)

Replace the hardcoded `'In Progress'` with canonical casing AND add `audit_log` insert. v1.4 bump on closed-ros.html, attribute the audit row to `<reactivator> (auto via reactivation)` following the v1.33 convention.

**Why second:** Once Step 1's CHECK constraint is in place, this code is currently broken — every reactivation will throw `23514 check_violation`. The fix unblocks reactivations.

### Step 3 — Backfill missing audit_log entries for stragglers (Scan 3 follow-up)

Roland mentioned one of the three stragglers has a null audit writer. Insert a synthetic audit row attributed to `'v1.33 cleanup (Session 72)'` matching prior convention.

**Why third:** Audit trail integrity. The Crawford row's null writer is a data-quality concern, not a bug.

### Step 4 — Decide on B-1 cleanup for 2 DELETE-flagged rows

Roland mentioned Condry and Crawford are already flagged for removal. Either soft-delete them properly (set `deleted_at`), hard-delete them via Recently Deleted modal, or merge them via the duplicate-manager flow. The casing fix (Step 1) will have normalized their `status` to lowercase too.

### Step 5 — Optional improvements (M-1, M-2, M-3, L-1, L-2)

Lower priority. M-1 (status constants module) is the biggest investment and provides the most ongoing value. M-2 (delete defensive duplicates) is a 5-minute win that turns Spanish-UI into a regression alarm. L-2 (solar.html status default) is a 5-minute defensive add.

### Step 6 — Re-run Session 71's ghost-write enumerator

Confirm zero ghost-write rows remain in either `repair_orders` or `cashiered`. This is the final verification before declaring the bug class closed.

---

## 4. Database-Level Guard Migration (Section 5 deliverable)

**File to create:** `supabase/migrations/status_casing_check_constraint.sql`

```sql
-- ============================================================
-- Status Casing CHECK Constraint — Session 72 (2026-05-23)
-- ============================================================
-- Enforces the canonical status set at the database layer so any
-- application-level bug writing wrong casing fails loudly with a
-- 23514 check_violation Postgres error rather than silently
-- corrupting data.
--
-- Canonical set (matches index.html ALL_STATUSES + 'Scheduled'):
--   'Not On Lot'
--   'On Lot'
--   'Scheduled'
--   'Awaiting Approval'
--   'Awaiting parts'           (lowercase 'p' — historical)
--   'Ready to Work'
--   'In progress'              (lowercase 'p' — canonical)
--   'Repairs Completed'
--   'Waiting for QA/QC'
--   'Ready for pickup'         (lowercase 'p' — historical)
--   'Delivered/Cashed Out'
--
-- Applied to BOTH repair_orders AND cashiered.
-- ============================================================

-- ── Step 1: Pre-flight check ─────────────────────────────────
-- Must return 0 rows in both tables before applying constraints.
-- If non-zero, run the cleanup UPDATEs first.
SELECT 'repair_orders' AS tbl, status, COUNT(*) AS bad_rows
  FROM repair_orders
 WHERE status NOT IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  )
 GROUP BY status
 UNION ALL
SELECT 'cashiered' AS tbl, status, COUNT(*) AS bad_rows
  FROM cashiered
 WHERE status NOT IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  )
 GROUP BY status;

-- ── Step 2: Cleanup any remaining bad rows (no deleted_at filter) ──
-- This catches the 3 stragglers Session 71's backfill missed
-- (soft-deleted rows) and any cashiered rows.
UPDATE repair_orders
   SET status = 'In progress', updated_at = NOW()
 WHERE status = 'In Progress';   -- NO deleted_at filter this time

UPDATE cashiered
   SET status = 'In progress'
 WHERE status = 'In Progress';

-- Audit batch for the cleanup
INSERT INTO audit_log (ro_id, user_email, user_name, field_changed, old_value, new_value, changed_at)
SELECT id,
       'roland@patriotsrvservices.com',
       'v1.33 cleanup (Session 72) — including soft-deleted + cashiered',
       'status',
       'In Progress',
       'In progress',
       NOW()
  FROM repair_orders
 WHERE status = 'In progress'
   AND updated_at >= NOW() - INTERVAL '5 minutes';

-- ── Step 3: Apply the constraint to repair_orders ────────────
ALTER TABLE repair_orders
  ADD CONSTRAINT repair_orders_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;   -- NOT VALID skips checking existing rows; flip below

-- Validate against existing rows (safe — Step 2 cleaned them)
ALTER TABLE repair_orders
  VALIDATE CONSTRAINT repair_orders_status_check;

-- ── Step 4: Same constraint on cashiered ─────────────────────
ALTER TABLE cashiered
  ADD CONSTRAINT cashiered_status_check
  CHECK (status IN (
    'Not On Lot', 'On Lot', 'Scheduled',
    'Awaiting Approval', 'Awaiting parts',
    'Ready to Work', 'In progress',
    'Repairs Completed', 'Waiting for QA/QC',
    'Ready for pickup', 'Delivered/Cashed Out'
  ))
  NOT VALID;

ALTER TABLE cashiered
  VALIDATE CONSTRAINT cashiered_status_check;

-- ── Step 5: Set a column default on repair_orders.status ─────
-- Closes L-2: solar.html INSERTs that omit status now default to canonical
-- 'Not On Lot' instead of getting NULL.
ALTER TABLE repair_orders
  ALTER COLUMN status SET DEFAULT 'Not On Lot';

-- ── Step 6: Verification ─────────────────────────────────────
-- Confirm constraints are in place and active.
SELECT conname, contype, conrelid::regclass AS table_name,
       pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conname IN ('repair_orders_status_check', 'cashiered_status_check');

-- Confirm zero bad rows post-cleanup.
SELECT 'repair_orders' AS tbl, COUNT(*) AS capital_p_remaining
  FROM repair_orders WHERE status = 'In Progress'
 UNION ALL
SELECT 'cashiered' AS tbl, COUNT(*) AS capital_p_remaining
  FROM cashiered WHERE status = 'In Progress';

-- ── Step 7: Deliberate bad-insert test (REMOVE OR COMMENT IN PROD) ─
-- Should fail with: ERROR:  23514 new row for relation "repair_orders"
--                   violates check constraint "repair_orders_status_check"
-- BEGIN;
-- INSERT INTO repair_orders (ro_id, customer_name, status)
--   VALUES ('PRVS-TEST-XXXX', 'CHECK CONSTRAINT TEST', 'In Progress');
-- ROLLBACK;
```

### Rollback SQL

```sql
-- ── ROLLBACK: status_casing_check_constraint.sql ─────────────
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
ALTER TABLE cashiered     DROP CONSTRAINT IF EXISTS cashiered_status_check;
ALTER TABLE repair_orders ALTER COLUMN status DROP DEFAULT;
-- Note: the data cleanup (Step 2) is NOT rolled back — that's a data
-- correctness fix, not a constraint. To revert the data, restore from
-- the daily backup (.github/workflows/backup.yml runs daily).
```

---

## 5. Appendix — Full Status Literal Census (Scan 1)

> Production files only. Backups (`backups/*.html`) and documentation files (`CLAUDE_CONTEXT*`, `docs/qa/*`, release notes) excluded — they describe rather than execute.

### A. `index.html` — 95 occurrences total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 3645-3654 | 'Not On Lot' / 'On Lot' / 'Awaiting Approval' / 'Awaiting parts' / 'Ready to Work' / 'In progress' / 'Repairs Completed' / 'Waiting for QA/QC' / 'Ready for pickup' / 'Delivered/Cashed Out' | READ (filter buttons) | ✅ | Filter bar |
| 3720, 3741, 3762, 3804, 3825, 3846, 3867, 3888 | various — fixture data | n/a (sampleData array) | ✅ | Fake demo data — never persisted |
| 4113-4123 | All 11 statuses (incl. 'Scheduled') | READ | ✅ | `STATUS_PROGRESS_MAP` |
| 4384, 4388, 4390 | 'Not On Lot' | READ (compare) | ✅ | `updateROStatus` — dateArrived auto-set logic |
| 4421 | 'Ready for pickup' | READ (compare) | ✅ | `updateROStatus` — Slack trigger gate |
| 6920, 6924, 6934 | 'Scheduled' | **WRITE** (with audit_log) | ✅ | `confirmSchedule` — properly audited |
| 8308, 8404-8406 | 'Not On Lot', 'Delivered/Cashed Out', 'Ready for pickup' | READ (compare) | ✅ | days-on-lot logic, hideFromBoard logic |
| 8989-8991 | 'Awaiting parts' | READ (filter logic) | ✅ | Filter includes any RO with outstanding parts |
| 9148, 9201, 9480-9484 | 'Delivered/Cashed Out', 'Scheduled' | READ (gate UI buttons) | ✅ | Schedule / reactivate button visibility |
| 9164-9174 | All 10 statuses | READ (option value), DISPLAY (option text — TitleCase) | ✅ value · ⚠️ asymmetric display | Compact view status dropdown — see L-1 |
| 9240 | 'Not On Lot' | DISPLAY (t() key) | ✅ | "Days" label fallback |
| 9309-9319 | All 10 statuses | READ (option value), DISPLAY (option text — TitleCase via t()) | ✅ value · ⚠️ asymmetric display | Card status dropdown — see L-1 |
| 9813, 9815 | 'In progress', 'Awaiting parts' | READ (filter for stat strip) | ✅ | Stat strip counts |
| 9825 | 'Not On Lot' | READ (filter) | ✅ | Days-on-lot exclusion |
| 9858-9867 | All 10 statuses | READ (lookup) | ✅ | `statusColorMap` |
| 9870-9874 | 10 statuses — **missing 'Scheduled'** | READ | ⚠️ Incomplete | `ALL_STATUSES` — see H-2 |
| 9998-10011 | All 10 canonical + **3 defensive duplicate-casing keys** ('Awaiting Parts', 'In Progress', 'Ready for Pickup') | READ (translation lookup) | ✅ canonical · ⚠️ defensive duplicates present | Spanish translation map — see M-2 |
| 10259-10261 | 'In Progress', 'Awaiting Approval', 'Awaiting Parts' (all TitleCase) | READ (display label lookup) | n/a (different field — `service_tasks.status` lowercase_snake → display title) | `TASK_STATUS_LABELS` for WO tasks — DIFFERENT FIELD, no conflict |
| 11054 | 'Not On Lot' | READ (default in `fromRow` mapper) | ✅ | In-memory default if `row.status` is null — NOT a DB write |
| 11400 | 'Not On Lot' | **WRITE** (INSERT default) | ✅ | `appendToSupabase` — initial INSERT, no audit needed (no prior state) |
| 14024 | 'On Lot' | **WRITE** (Shop RO INSERT default) | ✅ | New RO form Shop override — initial INSERT |
| 15146-15155 | All 10 statuses | READ (option value), DISPLAY (matches value) | ✅ | New RO form status dropdown — internally consistent (only dropdown of the three that is) |

### B. `checkin.html` — 9 occurrences total (post-v1.33)

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 6, 19, 23, 31, 32, 36 | 'In Progress' / 'In progress' | DOCUMENTATION | n/a | v1.33 release-note comment block |
| 1277, 1280, 1287 | 'In progress' / 'In Progress' | DOCUMENTATION + `const IN_PROGRESS = 'In progress'` | ✅ canonical (the constant) | v1.33 fix code |
| 1291 | `IN_PROGRESS` (via constant) | **WRITE** (with audit_log) | ✅ | clockIn auto-status — v1.33 fixed |

### C. `customer-checkin.html` — 2 occurrences total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 1935 | 'Scheduled' | **WRITE** (INSERT default) | ✅ | New Customer Entry default |
| 1937 | 'On Lot' / 'Scheduled' | **WRITE** (INSERT — drop-off branch) | ✅ | RV Customer Drop Off mode |

### D. `worklist-report.html` — 2 occurrences total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 1700, 2877 | 'Not On Lot' | READ (compare) | ✅ | Days-on-lot exclusion |

### E. `closed-ros.html` — 1 occurrence total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| **816** | **'In Progress' (capital P, hardcoded)** | **WRITE (INSERT — reactivation)** | **❌ WRONG CASING + no audit_log** | **B-1 BLOCKING — see Section 2** |

### F. `supabase/migrations/cron_archive_cashiered_ros.sql` — 2 occurrences total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 5, 35 | 'Delivered/Cashed Out' | READ (WHERE clause + comment) | ✅ | Saturday archiver — selects only delivered/cashed rows |

### G. `supabase/functions/send-manager-report/index.ts` — 1 occurrence total

| Line | Exact literal | READ/WRITE | Canonical? | Context |
|---|---|---|---|---|
| 355 | 'Delivered/Cashed Out' | READ (filter) | ✅ | Excludes delivered/cashed ROs from report |

### Census Summary

| Category | Count | Notes |
|---|---|---|
| Total literal occurrences (production code, ignoring docs/backups) | **~112** | High magic-string density — see M-1 |
| WRITE operations | 7 sites | 1 BLOCKING (closed-ros:816), 6 canonical/audited |
| WRITE operations with wrong casing | **1** | closed-ros.html:816 |
| WRITE operations missing audit_log | 4 | 3 INSERTs (acceptable — no prior state) + 1 in closed-ros:816 (NOT acceptable) |
| READ-only (compare/filter/lookup/display) | ~105 | All canonical or display-only |
| Display-vs-value asymmetric (TitleCase display, mixed-case value) | 20 (2 dropdowns × 10 options) | L-1 cosmetic — `<select>` returns value, no functional bug |
| Defensive duplicate-casing entries | 3 | Spanish translation map — see M-2 |
| Incomplete status lists (missing 'Scheduled') | 1 | ALL_STATUSES — see H-2 |

---

## 6. STOPPING POINT

**No code changes have been made.** This report is read-only static analysis.

Awaiting Roland's review and decision on which findings to patch and in what order. The recommended order is Section 3; the database migration in Section 4 is the keystone and should run first (after the cleanup UPDATEs in its own Step 2).

---

*Report compiled by Claude — Session 72 static scan. Single-pass, exhaustive, no fixes applied.*
