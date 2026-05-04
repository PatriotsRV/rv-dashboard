# Work Order Redesign — Implementation Spec

> **Status:** Draft v1 · Author: Claude Cowork (Session 64) · Reviewer: Roland · Branch: `wo-redesign`
> **Folds into:** GH#5 (umbrella) · supersedes the narrow GH#5c "Polish Work Orders UI" scope
> **Reference ROs:** Tom Farnam `PRVS-0D28-1307` (primary) · Mike Bruce `PRVS-5669-2842` (alternate) · Don & Linda Adams `PRVS-6E03-0829` (multi-silo target)
> **Dashboard version at start:** `index.html` v1.413

---

## 1. Goals

The current Work Order system (GH#5 / GH#5c, shipped Session 27–30) gives managers a place to plan tasks per service silo, but it has structural gaps that hurt daily use:

1. **A WO can exist without content** — a manager creates the silo container then never adds tasks. From the board there is no nudge that this RO is under-planned.
2. **Active ROs frequently have no WO at all.** The dashboard does not visually flag this.
3. **Parts and labor live separately from line items.** Parts attach to the RO; time logs attach to the RO. There is no per-line-item ledger of "what does fixing the kitchen leak actually cost in parts + labor."
4. **No copy/paste path to CDK Lightspeed.** Roland's wife cashes ROs out by manually re-keying data — slow, error-prone.
5. **Tech check-ins are RO-level.** A 4-hour session on a repair RO might cover 3 different tasks. We can't attribute the time to specific work, which means we have no real per-repair-type pricing data over time.
6. **One billed vs actual labor field.** Variance between "hours we actually spent" and "hours we charged the customer" is invisible — useful pricing intelligence is being thrown away.
7. **Manager Work Lists don't surface WO health.** A manager can have 8 ROs on their list with zero tasks defined and no signal that they're behind on planning.

The redesign aims to:

- **Make the per-line-item RO TO-DO the visual centerpiece of every active RO**
- **Track parts + labor at the line-item level** (not just RO level)
- **Track two labor fields** — `actual_hours` (sum of tech check-ins, internal) and `billed_hours` (customer-facing). Variance over time = pricing intelligence.
- **Support sub-items where needed** without forcing them on every line
- **Templates that pre-populate parts + install labor**, not just steps
- **Missing-WO visual nudges** that escalate over time, especially on Manager Work Lists
- **Copy/paste WO export** that drops cleanly into Lightspeed at cash-out

## 2. Non-Goals (this redesign)

- No Lightspeed API integration (the customer-facing system has no API we can rely on; copy/paste is fine)
- No tech-side "edit my hours" beyond the existing end-of-day entry pattern
- No parts inventory management beyond what the current `parts` table tracks
- No automatic billing decisions — `billed_hours` is always manager-set
- No customer-facing WO display — internal tool only

## 3. Reference Data

The data scan run at the start of Session 64 returned **18 ROs with WO content**. Top candidates for spec examples:

| Role | RO ID | Customer | RV | Status | Silos | WOs | Tasks | est_hrs | Parts | Time logs |
|---|---|---|---|---|---|---|---|---|---|---|
| **Primary** | `PRVS-0D28-1307` | Tom Farnam | Bounder | On Lot | repair | 1 | 3 | 3/3 | 4 | 6.32h |
| Alternate | `PRVS-5669-2842` | Mike Bruce | Tiffin | On Lot · High | repair | 1 | 2 | 2/2 | 4 | 16.63h |
| Multi-silo target | `PRVS-6E03-0829` | Don & Linda Adams | Thor Aria | Not On Lot | (3 in repair_type, 1 in WO) | 1 | 3 | 3/3 | 2 | 4.98h |
| Empty-WO | `PRVS-3CDA-AAFC` | Ann & Ken Hill | Thor Ace | Cashed Out | repair, roof, solar, vroom | 4 | **0** | — | 5 | 76.36h |
| Done state | `PRVS-7F4E-4370` | Sheldon Gilbert | Cougar | In Progress | repair | 1 | 2 | 2/2 (both completed) | 3 | 13.42h |

**Key observations from the data:**

- We don't have **a single clean multi-silo real-world WO** in production. Most ROs that touch multiple silos still have only one WO container. The current UI has not made multi-silo WOs cheap enough to build. This is a target the redesign should fix.
- `PRVS-3CDA-AAFC` has 4 silos × 0 tasks. Real-world example of "manager built containers, never planned." Phase A1 needs to flag this state, not just zero-WO.
- Cashiered ROs lose **all** WO history because `service_work_orders.ro_id REFERENCES repair_orders(id) ON DELETE CASCADE`, and the archive function hard-deletes the parent. This means Roland's stated goal of "accurate per-line-item labor data for future repair pricing" is silently bleeding history every Saturday at 5 PM. **Phase B introduces an additive `cashiered_work_orders` snapshot table to fix this without breaking the cascade.**

## 4. Architecture Decisions

### 4.1 Branch + additive migrations + feature flag

- **All work happens on `wo-redesign`** branch off `main`. GitHub Pages serves only `main`, so staff are unaffected during development.
- **All schema changes are additive.** No column renames, no drops, no breaking CHECK constraints. Old code keeps working against the existing shape; new code reads/writes new columns.
- **Phases C–L hide behind `localStorage.PRVS_WO_REDESIGN === '1'`.** Roland flips the flag in his own browser to exercise the feature; everyone else sees the existing UI. Phase M removes the flag and ships universally.
- **Phases A1 and A2 are additive UI without behavior change** — they ship to `main` without a flag, because the only thing they introduce is a missing-WO badge and a polished WO summary chip. Both default-safe to "show nothing" if data is missing.

### 4.2 Why not a separate repo or staging Supabase?

A second repo or staging Supabase project sounds safer than it is:

- GitHub Pages serves only `main` — branches are already invisible to staff.
- Edge Functions and pg_cron all run on one Supabase project regardless of repo. A forked repo cannot isolate `send-parts-report`, the WO RLS policies, or the cron jobs.
- A second repo introduces drift risk and divergent history. Single-dev project does not warrant the cognitive overhead.
- For unavoidable destructive testing in the future, a free-tier Supabase staging project (one config swap in `index.html`) is the right tool — but the WO redesign is fully additive and does not need it.

### 4.3 Feature flag pattern

Mirror the existing `currentViewMode` localStorage pattern:

```js
const WO_REDESIGN_ENABLED = localStorage.getItem('PRVS_WO_REDESIGN') === '1';
```

Read once at module load. Every redesign-aware code path conditions on this flag and falls through to existing behavior when off. To turn on:

```js
localStorage.setItem('PRVS_WO_REDESIGN', '1'); location.reload();
```

To turn off:

```js
localStorage.removeItem('PRVS_WO_REDESIGN'); location.reload();
```

## 5. Phase Plan

| # | Phase | Effort | Gates on | Ships to | Flag |
|---|---|---|---|---|---|
| **A1** | Missing-WO visual reminder (RO card + Manager Work List, 3-tier escalation) | ~2 hr | None | `main` | None |
| **A2** | RO-card WO summary polish (per-silo chip with task count + completion %) | ~2 hr | None | `main` | None |
| **B** | Foundational additive schema migration (Roland runs SQL) | ~1.5 hr code + 5 min SQL | None | branch | None |
| **C** | Manager line-item check-off (with audit log) | ~3 hr | B | branch (PR) | flagged |
| **D** | Parts on WO line items (price + install labor + lifecycle: ordered/received/installed) | ~5 hr | B | branch (PR) | flagged |
| **E** | Two labor fields (`actual_hours` from check-ins, `billed_hours` editable) | ~3 hr | B | branch (PR) | flagged |
| **F** | Tech check-in to specific line items (`checkin.html` change, offline queue) | ~4 hr | B | branch (PR) | flagged |
| **G** | Sub-item (parent/child) support in WO render + edit | ~3 hr | B | branch (PR) | flagged |
| **H** | Template enrichment (typical parts + install labor on templates) | ~3 hr | B | branch (PR) | flagged |
| **I** | Copy/paste WO export for CDK Lightspeed cash-out | ~4 hr | D, E | branch (PR) | flagged |
| **J** | End-of-day labor entry path for techs (alternate to live check-in) | ~3 hr | F | branch (PR) | flagged |
| **K** | Variance/pricing analytics (actual vs billed over time) | ~3 hr | E + ~2 weeks of data | branch (PR) | flagged |
| **L** | Manager Work List escalation tier upgrade (deeper than A1) | ~2 hr | A1, C | branch (PR) | flagged |
| **M** | Remove `PRVS_WO_REDESIGN` flag, make new UI default | ~1 hr | C–L done + manager sign-off | `main` | flag removed |

**Total dev time:** ~38 hours · ~11 sessions

### 5.1 Dependency graph

```
A1, A2 (independent, ship to main)
              │
              ▼
B (schema migration — ROLAND RUNS SQL)
              │
   ┌──────────┼──────────┬────────┬────────┬────────┐
   ▼          ▼          ▼        ▼        ▼        ▼
   C          D          E        F        G        H
                         │        │
                         ▼        ▼
                         K        J        ┌─ I (depends on D + E)
                         (data-gated)      │
                                           ▼
                                           L (depends on A1 + C)
                                           │
                                           ▼
                                           M (final ship)
```

### 5.2 Recommended sequence for "manager visibility ASAP"

1. **Session 64 (this session):** Spec + A1 + A2 + B SQL staged → PR
2. **Session 65 (you wake):** Roland reviews PR, merges A1+A2 to main, runs B SQL, gives feedback
3. **Session 66:** Phase C (manager check-off) on branch, behind flag
4. **Session 67–70:** D, E, F in any order based on Roland's priorities
5. **Session 71+:** G, H, I, J as availability allows
6. **Session ~75:** K (after a few weeks of E data accumulated)
7. **Session ~76:** L
8. **Session ~77:** M — flag removed, ship

## 6. Schema Diff (Phase B)

All changes are **additive**. Existing columns untouched. Existing rows untouched. Old code paths unaffected.

### 6.1 `service_work_orders` — relax silo CHECK to all 8 silos

The existing CHECK constraint allows only `repair, vroom, solar, roof, paint_body`. The codebase's `SERVICE_SILOS` constant defines 8: those plus `chassis, detailing, truetopper`. Any manager attempting to build a WO for the latter 3 currently fails the CHECK silently.

```sql
ALTER TABLE service_work_orders
  DROP CONSTRAINT IF EXISTS service_work_orders_service_silo_check;
ALTER TABLE service_work_orders
  ADD CONSTRAINT service_work_orders_service_silo_check
  CHECK (service_silo IN ('repair', 'vroom', 'solar', 'roof', 'paint_body',
                          'chassis', 'detailing', 'truetopper'));
```

### 6.2 `service_tasks` — add line-item columns

```sql
ALTER TABLE service_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id      UUID REFERENCES service_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS actual_hours        NUMERIC(6,2) DEFAULT 0,    -- summed from time_logs
  ADD COLUMN IF NOT EXISTS billed_hours        NUMERIC(6,2),              -- nullable; manager-set
  ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ,               -- when manager checked off
  ADD COLUMN IF NOT EXISTS completed_by_email  TEXT;

CREATE INDEX IF NOT EXISTS idx_service_tasks_parent ON service_tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tasks_completed ON service_tasks(completed_at) WHERE completed_at IS NOT NULL;
```

**Notes:**
- `parent_task_id` is nullable. Most tasks remain top-level. Sub-items reference their parent. Self-FK with `ON DELETE CASCADE` so deleting a parent removes its sub-items cleanly.
- `actual_hours` is computed/cached from `time_logs.service_task_id` rollup (Phase F + E). Default 0 lets old code render correctly during migration.
- `billed_hours` is nullable on purpose — until a manager sets it, the system falls back to `est_hours` for invoice-side display.
- `completed_at` and `completed_by_email` form the check-off audit pair (Phase C). The existing `status='completed'` enum value remains valid; the timestamp adds when + who.

### 6.3 `parts` — link to specific line items + lifecycle

```sql
ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS service_task_id    UUID REFERENCES service_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status   TEXT
    CHECK (lifecycle_status IN ('ordered', 'received', 'installed')),
  ADD COLUMN IF NOT EXISTS date_installed     DATE,
  ADD COLUMN IF NOT EXISTS installed_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_parts_service_task ON parts(service_task_id) WHERE service_task_id IS NOT NULL;
```

**Notes:**
- `service_task_id` is **nullable** so the existing RO-level parts model continues to work unchanged. New parts linked to a task; old parts remain RO-level.
- `lifecycle_status` is a simplified rollup of the richer `parts.status` field (Ordered/Sourcing/Outstanding/Backordered/Received/Installed/Returned). Lifecycle status is what shows on the line item in the new UI; the detailed `status` continues to drive the existing parts modal.
- `ON DELETE SET NULL` so deleting a task doesn't delete the part — part survives at RO level if line item goes away.

### 6.4 `time_logs` — link to specific line items

```sql
ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS service_task_id UUID REFERENCES service_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_logs_service_task ON time_logs(service_task_id) WHERE service_task_id IS NOT NULL;
```

**Notes:**
- Nullable. Existing time logs remain RO-level. New flag-on check-ins (Phase F) attach to a specific task.
- `ON DELETE SET NULL` — same reasoning as parts.

### 6.5 New table — `wo_template_task_parts` (Phase H typical parts on templates)

```sql
CREATE TABLE IF NOT EXISTS wo_template_task_parts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id        UUID NOT NULL REFERENCES wo_template_tasks(id) ON DELETE CASCADE,
  part_name               TEXT NOT NULL,
  part_number             TEXT,
  supplier                TEXT,
  qty                     INT  DEFAULT 1,
  wholesale_price         NUMERIC(10,2),
  retail_price            NUMERIC(10,2),
  install_hours           NUMERIC(5,2),
  notes                   TEXT,
  sort_order              INT DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_template_task_parts_template_task
  ON wo_template_task_parts(template_task_id);

ALTER TABLE wo_template_task_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wttp_select" ON wo_template_task_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "wttp_modify" ON wo_template_task_parts FOR ALL TO authenticated
  USING (is_sr_manager_or_admin())
  WITH CHECK (is_sr_manager_or_admin());
```

### 6.6 New table — `cashiered_work_orders` (preserve WO history past archive)

When an RO is archived to `cashiered`, the `ON DELETE CASCADE` from the parent delete wipes the entire WO tree. Roland needs that history for future per-repair-type pricing analytics.

```sql
CREATE TABLE IF NOT EXISTS cashiered_work_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashiered_id        UUID NOT NULL REFERENCES cashiered(id) ON DELETE CASCADE,
  original_ro_id      UUID NOT NULL,
  service_silo        TEXT NOT NULL,
  status              TEXT,
  dollar_value        NUMERIC(10,2),
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ,
  archived_tasks_json JSONB,  -- denormalized snapshot of all service_tasks at archive time, with their parts + actual/billed hours
  archived_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashiered_wo_cashiered ON cashiered_work_orders(cashiered_id);
ALTER TABLE cashiered_work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cwo_select" ON cashiered_work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "cwo_insert" ON cashiered_work_orders FOR INSERT TO authenticated
  WITH CHECK (is_sr_manager_or_admin());
```

The Saturday cashiered cron (`archive_cashiered_ros()`) will be amended in **Phase E** to also snapshot the WO tree as JSONB into this table before the cascade fires. This is documented in the spec but the cron change ships with E (since it depends on E's `actual_hours`/`billed_hours` to be meaningful).

### 6.7 Phase B verification queries (Roland runs after the migration)

```sql
-- Confirm new columns exist
SELECT column_name FROM information_schema.columns
 WHERE table_name='service_tasks' AND column_name IN
       ('parent_task_id','actual_hours','billed_hours','completed_at','completed_by_email');
-- Expect 5 rows.

SELECT column_name FROM information_schema.columns
 WHERE table_name='parts' AND column_name IN
       ('service_task_id','lifecycle_status','date_installed','installed_by_email');
-- Expect 4 rows.

SELECT column_name FROM information_schema.columns
 WHERE table_name='time_logs' AND column_name='service_task_id';
-- Expect 1 row.

-- Confirm CHECK constraint relaxed
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname='service_work_orders_service_silo_check';
-- Should mention all 8 silos.

-- Confirm new tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('wo_template_task_parts','cashiered_work_orders');
-- Expect 2 rows.
```

## 7. Phase A1 — Missing-WO Visual Reminder

### 7.1 What it does

On every active RO card and in every Manager Work List row, render a badge if the RO is missing a WO or has empty WOs. Color escalates with time.

### 7.2 What counts as "active"

An RO is **active** if its status is **NOT** in:

- `Not On Lot`
- `Delivered/Cashed Out`
- `Ready for pickup`

Plus `roType !== 'shop'` and `isTraining === false` (shop ROs and training ROs don't get the nudge).

### 7.3 What counts as "missing WO"

| State | Treated as | Badge text |
|---|---|---|
| Zero `service_work_orders` rows for the RO | Missing | `🔧 No WO yet` |
| WOs exist but all have zero `service_tasks` | Empty | `🔧 WO exists — no tasks` |
| At least one task exists | Healthy | (no badge) |

### 7.4 Escalation tiers

The badge color and emphasis escalate based on the larger of:

- Days since RO `date_received`
- Days since this RO was added to a Manager Work List (when rendering inside the work list panel — uses `manager_work_lists.created_at`)

| Days | Tier | Color | Border | Label addition |
|---|---|---|---|---|
| 0–2 | Soft | Amber `#f59e0b` on `rgba(245,158,11,0.12)` background | 1px amber | — |
| 3–5 | Hot | Orange `#ea580c` on `rgba(234,88,12,0.15)` | 2px orange | `· {N}d` |
| 6+ | Critical | Red `#dc2626` on `rgba(220,38,38,0.18)` | 2px red, pulse animation | `🔥 · {N}d` |

The pulse animation reuses the existing `slideIn`/`pulse` CSS pattern already in the file.

### 7.5 Where it renders

**Standard RO card** — between the schedule notification banner button (line 8959) and the urgency selector badge (line 8965). Visible at the top of the card, hard to miss.

**Manager Work List sidebar** — appended to the row's name span in `renderWorkList()` (line 8597). Same color tier system; days computed from `item.created_at`.

**Compact view** — inserted into the chips bucket alongside parts/insurance chips (line 8849ff). Smaller pill, no pulse (compact view discourages animation).

### 7.6 Data load

`loadDataFromSupabase()` gets one new query parallel to the parts query (line 10783). Returns `(ro_id, count_wos, count_tasks)` per RO, attached to each row before `rowToRO(row)`. Cached on `ro._woSummary`. Manager Work List looks up by `ro._supabaseId` against `currentData`.

### 7.7 Implementation hooks (line numbers v1.413)

| Concern | File | Line | Change |
|---|---|---|---|
| Load WO summary | `index.html` | ~10786 | New query batch alongside parts |
| Build summary map | `index.html` | ~10805 | `woSummaryMap` |
| Attach to RO | `index.html` | ~10808 | `row._wo_summary = woSummaryMap[row.id]` |
| Standard card badge | `index.html` | ~8964 | New `${woMissingBadge(ro)}` block |
| Compact card chip | `index.html` | ~8864 | Append to `chips` |
| Work list row badge | `index.html` | ~8602 | Append to nameSpan |
| Helper function | `index.html` | new | `woMissingBadge(ro, daysOverride)` |
| CSS | `index.html` | ~3360 | `.wo-missing-badge` rules |

### 7.8 Worked example — Don & Linda Adams (`PRVS-6E03-0829`)

`repair_type` = "Vroom, Repairs, TrueTopper". `service_work_orders` has 1 row (silo=repair). `service_tasks` has 3 rows under that WO. Status: Not On Lot → **does not qualify as active**, so no badge. Once Don & Linda's RV arrives and status flips to On Lot, the redesign would render no badge (their `repair` WO has tasks) — but a **second** problem surfaces: the RO is supposed to cover Vroom + TrueTopper too, with no WOs for either. Phase A1 v1 only flags zero-or-empty top-level WOs; v2 (in Phase L) will flag "RO claims silos in `repair_type` that have no WO container."

### 7.9 Worked example — Ann & Ken Hill (`PRVS-3CDA-AAFC`)

4 WOs (repair, roof, solar, vroom), 0 tasks across all of them. Status `Delivered/Cashed Out` → not active, no badge. But during the RO's active lifetime, A1 would have shown `🔧 WO exists — no tasks` from day 1, escalating to red after 6 days. Exactly the kind of nudge that would have caught this gap before cash-out.

### 7.10 Spanish translations

Add to `TRANSLATIONS_ES`:

| English | Spanish |
|---|---|
| `🔧 No WO yet` | `🔧 Sin Orden de Trabajo` |
| `🔧 WO exists — no tasks` | `🔧 OT existe — sin tareas` |

## 8. Phase A2 — RO-Card WO Summary Polish

### 8.1 What it does

Replace nothing — this is purely additive — but **add a per-silo WO summary chip block** on every standard RO card showing at-a-glance task counts and completion percentage for each WO that exists.

The existing 🔧 Work Orders button in `card-actions-primary` (line 9208) stays. The Build/Edit modal stays. A2 only affects the **summary display on the card itself**, not the modal.

### 8.2 Format

For each `service_work_orders` row attached to the RO:

```
🔧 Repair · 2/3 tasks done · 12.5h est
```

Color band on the chip indicates completion:
- 0% → gray (`#9ca3af`)
- 1–66% → amber (`#f59e0b`)
- 67–99% → blue (`#3b82f6`)
- 100% → green (`#22c55e`)

If task count is 0, the chip reads `🔧 Repair · empty` and links to the existing A1 missing-WO badge (no double-nudge).

### 8.3 Where it renders

On the standard RO card, between the parts badge (line 9006) and the QR collapsible (line 9018). One row of horizontally-laid-out chips that wrap on narrow viewports.

Compact view: not added (compact has its own dense info layout; would clutter).

### 8.4 Data source

Same `_wo_summary` blob loaded for A1. A2 needs the silo breakdown too:

```js
ro._wo_summary = {
  total_wos: 1,
  total_tasks: 3,
  completed_tasks: 0,
  silos: [
    { silo: 'repair', task_count: 3, completed: 0, est_hours: 6.5 }
  ]
};
```

### 8.5 Implementation hooks

| Concern | File | Line | Change |
|---|---|---|---|
| Load summary with silos | `index.html` | ~10786 | Extend A1 query (single SELECT covers both phases) |
| Card chip block | `index.html` | ~9006 | New `${woSummaryChips(ro, index)}` block |
| Helper function | `index.html` | new | `woSummaryChips(ro, index)` |
| CSS | `index.html` | ~3360 | `.wo-summary-chip` + `.wo-summary-chip-bar` rules |

### 8.6 Click behavior

Tapping any chip opens the existing 🔧 Work Orders modal scrolled to that silo's section. Reuses `openWorkOrderModal(roIndex)` plus a new `?focusSilo=<key>` URL hash.

## 9. Phase C — Manager Line-Item Check-Off

### 9.1 What it does

Behind the `PRVS_WO_REDESIGN` flag. In the Work Orders modal's task list, each task row gets a clickable checkbox visible to Service Managers, Sr Managers, and Admins (NOT techs).

### 9.2 Click behavior

- On click, set `service_tasks.completed_at = NOW()`, `completed_by_email = current user`, and `status = 'completed'`.
- Write an audit log entry: `writeAuditLog(roId, [{ field: 'task:'+task.id+':completed', oldValue: '', newValue: 'YYYY-MM-DDTHH:MM:SSZ' }])`.
- On uncheck, clear all 3 fields and audit-log the reversal.
- Visual: completed task → strikethrough title + green checkmark icon + small `✓ {firstname} · {time-ago}` line below.

### 9.3 Role gate

```js
function canCheckOffTask() {
  return isAdmin() || hasRole('Manager') || hasRole('Sr Manager');
}
```

(Once `isManagerOrAbove()` helper from the existing TODO ships, swap to that.)

Tech accounts see the checkmark state but the checkbox is disabled (`pointer-events: none`).

### 9.4 Hooks

| Concern | File | Line | Change |
|---|---|---|---|
| Task render template | `index.html` | ~14025 | New checkbox + completed-by line |
| Click handler | `index.html` | new | `toggleTaskCheckoff(taskId, woId)` |
| RLS | `service_tasks` | (existing) | Already allows manager UPDATE; no RLS change needed |

### 9.5 Worked example — Tom Farnam (`PRVS-0D28-1307`)

Tom's RO has 1 WO (repair) with 3 tasks. After Phase C ships and Roland flips the flag:

1. Bobby clicks the WO modal → sees Tom's 3 tasks, each with a checkbox.
2. Bobby checks "Replace door seal" → `service_tasks` row updates → audit log entry written → row re-renders with strikethrough + `✓ Bobby · just now`.
3. Mauricio sees the checkmark on his next dashboard refresh (Phase 1 of GH#36 realtime sync makes this near-instant).

### 9.6 Edge cases

- A task with sub-items (`parent_task_id IS NOT NULL`): checking the parent does NOT auto-check children. They are independent checkpoints.
- A task with `actual_hours > billed_hours`: checking it shows a small `⚠ {variance}h over` chip next to the timestamp. Manager can ignore (the variance is the data we want).
- Completed task with linked parts in `lifecycle_status='ordered'`: warns `⚠ Parts not received yet` — does not block the check-off, but the manager sees the conflict.

## 10. Phases D–M (Stubs)

Detailed specs for each phase will be authored as they approach. Stubs follow.

### 10.1 Phase D — Parts on WO Line Items

Extend the part form modal with a "Link to task" picker (defaults to RO-level). Existing parts get a one-time UI prompt for managers to retroactively link them. Lifecycle status (ordered/received/installed) renders inline on the task row with a 3-state pill. Receiving a part marks `date_received`; installing marks `date_installed` + `installed_by_email`. Phase D adds a `Cost rollup` summary on each task row: `Parts $X · Install $Y · Total $Z` and a `Cost rollup` summary on the silo header.

### 10.2 Phase E — Two Labor Fields

`actual_hours` is computed from `time_logs.service_task_id` rollup at task save time (or via a SELECT trigger; design TBD in Phase E spec). `billed_hours` is a plain numeric input on the task row, manager-editable. UI shows both side by side with a variance indicator: `Actual 4.2h · Billed 3.5h · Δ +0.7h`. Variance color: gray when within ±10%, amber when 10–25%, red when >25%.

The Saturday cashiered cron is amended in this phase to populate `cashiered_work_orders.archived_tasks_json` before the cascade fires, preserving variance + parts data forever.

### 10.3 Phase F — Tech Check-In to Specific Line Items

`checkin.html` v1.32: when a tech opens a check-in QR for an RO that has WO tasks, show a task picker after the existing service-type chips. Tech taps a task → `service_task_id` is included in the `time_logs` insert payload. Multiple techs on the same task → hours aggregate naturally because `actual_hours` is computed from SUM of all log durations matching the task. Offline queue carries `service_task_id` verbatim — same pattern as `shop_activity` carry-through in v1.31.

### 10.4 Phase G — Sub-Item Support

`parent_task_id` already in DB from Phase B. Phase G adds: an `Add Sub-Item` button on every task row in edit mode; sub-items render indented one level under their parent; sub-items have their own est_hours / actual_hours / billed_hours / parts; collapsing the parent collapses all children. No nesting beyond 2 levels (CHECK constraint or app-layer enforcement).

### 10.5 Phase H — Template Enrichment with Parts

`wo_template_task_parts` table from Phase B becomes useful here. Template editor adds a "Typical Parts" section per task — name, supplier, qty, wholesale, retail, install hours. Loading a template into a WO copies parts as `lifecycle_status=null` placeholder rows on the new task; manager finalizes them with real PO numbers when ordering. Replace vs Merge logic on template load extends to parts (as it currently does for tasks).

### 10.6 Phase I — Lightspeed Copy/Paste Export

A `Copy for Lightspeed` button on the WO modal generates a tab-delimited text block sized to fit Lightspeed's parts + labor entry columns. Format (one row per task + one row per part):

```
Type	Description	Qty	Hours	Unit Price	Notes
Labor	Repair: Replace door seal	1	2.5	95.00	[task-uuid]
Part	Door seal kit	1		45.00	Supplier: NAPA #X-1234
Labor	Repair: Reseal slide-out	1	3.0	95.00	[task-uuid]
Part	Sika sealant 3-pack	1		28.00	Supplier: NAPA #SK-3
```

The button writes to `navigator.clipboard.writeText()` and toasts `Copied — paste into Lightspeed`. Phase I's spec session will include real-Lightspeed paste-target verification with Lynn (or whoever runs cash-out).

### 10.7 Phase J — End-of-Day Labor Entry

Some techs will forget to clock in mid-task. Phase J adds a `Backfill hours` button on each task row in checkin.html visible to the assigned tech. Tap → numeric input `Hours worked today` → INSERT into `time_logs` with `clock_in = NOW() - hours`, `clock_out = NOW()`, `service_task_id = task.id`, `close_reason = 'tech_eod_backfill'`. Same task can receive backfills from multiple techs across multiple days.

### 10.8 Phase K — Variance / Pricing Analytics

Folds into `worklist-report.html`. New section: "Repair Type Pricing Intelligence." For each `repair_type` value seen across cashiered ROs (joined with `cashiered_work_orders.archived_tasks_json`), show:

- Avg `est_hours` planned
- Avg `actual_hours` clocked
- Avg `billed_hours` invoiced
- Variance: actual vs estimated (planning quality), billed vs actual (recovery rate)
- $/hr revenue (`dollar_value / billed_hours`)

Surfaces patterns like "Roof reseals consistently bill 30% under actual" or "Solar installs are estimated 40% high" — pricing intelligence we currently lose every Saturday.

### 10.9 Phase L — Manager Work List Escalation Tier Upgrade

Phase A1's escalation is purely "missing WO." Phase L extends to:

- Stale tasks (last `updated_at` > 5 days ago, status not completed)
- Overdue tasks (estimated hours × $/hr exceeds RO `dollar_value` — over-budget)
- Parts hold (any task has a part with `lifecycle_status='ordered'` and `eta < today`)
- Multi-silo gap (RO `repair_type` lists silos with no WO container — the Don & Linda case)

Each surfaces as a small pill on the work list row with consistent yellow→orange→red coloring. Hover/tap reveals the underlying issue.

### 10.10 Phase M — Remove Flag, Ship

Strip the `WO_REDESIGN_ENABLED` checks from every code path. Make new render the only render. Bump version to v1.500 (signaling major). Update training guide. Push to main.

## 11. Edge Cases Surfaced from Production Data

| Case | Source | Spec coverage |
|---|---|---|
| WO container with zero tasks | Ann & Ken Hill, Robert Stebbins | Phase A1 flags as `🔧 WO exists — no tasks` |
| RO with multi-silo `repair_type` but only one WO container | Don & Linda Adams | Phase L flags; Phase A2's per-silo chips make it visually obvious |
| Cashiered RO loses all WO history | All cashiered with `task_count > 0` | Phase B adds `cashiered_work_orders` table; Phase E populates it from cron |
| Tester ROs (Kevin McHenry) | `PRVS-625C-7CAB-2` | Existing `isTester(email)` filter in worklist-report; new badges respect `is_training` |
| Soft-deleted RO with active WO | H.W. Sandy Herrmann, Jodee Touiaant | `loadDataFromSupabase` already filters `deleted_at IS NULL`; redesign inherits |
| RO with 86 time logs for 2 tasks | Harry Jarrett (122h on 2 tasks) | Phase E variance display reveals planning gap (estimated 12h, actual 122h) |
| Multiple techs on same task | (Will become common after Phase F) | `actual_hours = SUM` aggregation; per-task contribution breakdown in modal |
| Tech checks into RO without picking task | Existing tech behavior | Phase F: `service_task_id` is NULL — time still attributes to RO, just not to a specific task. Backfill flow lets tech assign it later. |

## 12. Two-Labor-Fields Semantics

- **`actual_hours`** is internal data — never shown to customers. Updated automatically as techs check into tasks. Source of truth: `SUM(time_logs.duration WHERE service_task_id = task.id)`.
- **`billed_hours`** is what hits Lightspeed and the invoice. Defaults to `est_hours` until a manager edits it. Manager can set it before, during, or after work.
- The two are **always reported separately** in any UI a manager sees. They are **never reported separately to the customer** — only `billed_hours × rate` is.
- Variance (actual − billed) accumulates over time. Phase K surfaces the trend per repair type.

**Why this matters per Roland's directive:** "Variance between the two = useful pricing intelligence over time." A roof reseal that estimates 4h and consistently actuals 6h but bills only 4h is a money-losing job pattern that we can identify within ~10 cashiered ROs once the data starts flowing.

## 13. Lightspeed Copy Format Detail (for Phase I)

Format will be **tab-delimited (TSV)**, one row per task labor entry, plus one row per linked part. Lightspeed accepts paste into its parts + labor grid. Header row optional (Roland will tell us in Phase I after testing with Lynn).

Worked example for Tom Farnam (`PRVS-0D28-1307`) when Phase I + E are live:

```tsv
Labor	Repair: Replace door seal	1	2.5	95.00	[task ABC-1]
Part	Door seal kit	1		45.00	NAPA #X-1234 · Received 2026-04-21 · Installed 2026-04-22 by Mauricio
Labor	Repair: Reseal slide-out	1	3.0	95.00	[task ABC-2]
Part	Sika sealant 3-pack	1		28.00	NAPA #SK-3 · Received 2026-04-22 · Installed 2026-04-22 by Mauricio
Labor	Repair: Test electrical	1	1.0	95.00	[task ABC-3]
```

Total billed: 6.5h labor + $73 parts = $691.50 — matches Tom's `dollar_value = $1,267.50` reasonably given his existing line item costs would be added.

## 14. Rollback Plan (Per Phase)

| Phase | Rollback |
|---|---|
| A1, A2 | Revert merge commit on `main`. Pure UI; no data, no schema. Zero risk. |
| B | Run reverse migration: `ALTER TABLE service_tasks DROP COLUMN parent_task_id, DROP COLUMN actual_hours, DROP COLUMN billed_hours, DROP COLUMN completed_at, DROP COLUMN completed_by_email; ALTER TABLE parts DROP COLUMN service_task_id, DROP COLUMN lifecycle_status, DROP COLUMN date_installed, DROP COLUMN installed_by_email; ALTER TABLE time_logs DROP COLUMN service_task_id; DROP TABLE wo_template_task_parts; DROP TABLE cashiered_work_orders;` Existing data untouched. |
| C–L | Disable feature flag (`localStorage.removeItem('PRVS_WO_REDESIGN')`). Existing UI still works. Branch unchanged. Optional: revert that phase's PR. |
| M | Re-merge a "restore-flag" commit and ship to main. |

## 15. Open Questions for Roland

These will surface as we approach each phase. None block A1, A2, or B.

1. **Lightspeed format details** (Phase I) — does Lightspeed's paste target accept a header row? Are there column constraints? Real-test session needed.
2. **Tech rate model** (Phase E) — `staff.hourly_rate` is the cost rate. Is there a customer-billing rate too, or do we always bill at a fixed shop rate (~$95/hr) regardless of which tech worked? Affects how Phase E displays $-cost vs $-revenue.
3. **Sub-item depth limit** (Phase G) — 2 levels max, or unlimited? Recommend 2.
4. **Cashiered WO snapshot trigger** (Phase B/E) — should the snapshot fire on every WO update too, not just at archive? Trade-off: realtime cost intelligence vs DB write volume.
5. **Lifecycle status on existing parts** (Phase D) — at flag-on time, do we backfill `lifecycle_status` from the existing `parts.status` field, or leave NULL until manager edits? Recommend leave NULL; new UI shows a "Set lifecycle status" prompt.

## 16. Spec Change Log

- **v1 — 2026-05-03 (Session 64)** — Initial draft. Phases A1+A2+B+C in detail; D–M as stubs. Reference RO chosen as Tom Farnam.

---

*Authored by Claude Cowork (Sonnet) under Roland's direction. Review and override any decision freely; this is a draft, not a contract.*
