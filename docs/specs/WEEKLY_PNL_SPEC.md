# Weekly P&L Spec — worklist-report.html

**Version:** v0.2 (Roland adjustments 1-4 + Q1-Q4 answers incorporated)
**Date:** 2026-06-10 (Session 99)
**Status:** APPROVED for Phase 1 (Roland, 2026-06-10)
**Owner page:** `worklist-report.html` (new section)
**Companion changes:** `js/work-orders.js` (manager Done-Done button), `checkin.html` (tech-lead Done button), `js/parts.js` (silo on parts), 1 SQL migration, 2 RPCs, cashiered cron move

---

## 1. Purpose (the CFO frame)

Roland currently has **no visibility into what ROs his tech teams work on week to week**. Revenue is only visible at cashier-out, but multi-silo jobs (Roof → Solar → Repair handoffs) span weeks across teams with separate work windows, so cashier-week revenue tells him nothing about *which team earned what, when*.

This feature is the **foundation of weekly profit & loss determination** for the shop. v1 answers, per week (current + historical):

- Which ROs did each team (silo) put hours into?
- What revenue is attached to that specific silo's work (the per-silo WO price, not the RO top line)?
- What did labor cost? What have parts cost on those jobs to date?
- How prompt were parts request → order → receive cycles?
- How did each team do against its weekly revenue target?
- What gross profit did the week produce?

**End-state vision (Roland, 2026-06-10):** this report becomes the data spine of a **virtual AI Shop Manager** — a daily manager report with AI guidance tied to weekly silo goals, plus AI observation of lot work weighted by days-on-lot, RO revenue, and other factors; ultimately scoring managers/teams daily + weekly, eventually tied to bonuses for exceeding goals. v1 is deliberately Admin-only until that maturity point (see §7).

## 2. The two-lens model

Work rolls over week to week and rarely finishes on a Friday, so v1 separates **activity** from **revenue recognition**:

### Lens 1 — Activity (works for ALL history from day one)
Driven entirely by `time_logs` + `parts`. No new workflow required.
Per silo per week: ROs touched, hours, labor cost, **cumulative parts cost to date on those ROs**, and **revenue in play** (the silo's WO dollar value on ROs touched but not yet completed = WIP pipeline).

### Lens 2 — Revenue completed (two-stage completion, manager-final)
A silo's revenue lands in the week its work order is **marked Done-Done by a manager** (see §5). Auditable: a human clicked it. The tech-lead "Done" is the leading indicator only — never the recognition event.

**Historical fallback:** ROs cashiered before `completed_at` existed recognize each silo WO's revenue in the **cashier week**, clearly labeled `(cashier-week fallback)` in the UI. As completion data accumulates, the fallback fades out naturally.

Targets compare against **completed revenue**. WIP shows what's coming.

## 3. Parts cost treatment (Adjustment 1)

Parts cost **sticks with the RO across its life**, not the spend week:

- **Every week an RO/silo appears in the report, its parts cost shows cumulative-to-date** (all parts on that RO/silo ordered up to the end of that week). Cost basis (Roland 2026-06-10): `wholesale_price` is per unit; the `core_charge` column stores FREIGHT (per the part-form label) entered per whole line -> **part cost = wholesale x qty + freight**.
- **For gross profit, parts cost is matched to revenue**: the silo-week that recognizes the WO's revenue (Done-Done week, or cashier-fallback week) absorbs that WO's full parts cost. Matching principle — costs land with the revenue they produced; no double-counting across weeks.
- **Promptness metrics (parts manager measurement)** — per part, from existing fields: request date (`created_at`), `date_ordered`, `date_received`. Drill-down shows per-part `requested → ordered` lag and `ordered → received` lag; silo-week and week-level medians surface in the matrix tooltip / drill-down header. This measures the parts team without distorting the P&L.

### Parts → silo attribution (Q2 answer: build it now)

Additive `service_silo TEXT` column on `parts` + a silo dropdown on the Add/Edit Part form (`js/parts.js` — module is runtime owner), defaulted intelligently (single-silo RO → that silo; multi-silo → require pick). Backfill for existing parts: attribute by the RO's silo set — single-silo ROs backfill cleanly; multi-silo ROs left NULL → reported under the RO with silo `(unattributed)` in drill-down, counted at RO level not silo level. Going forward every part carries its silo.

## 4. Week convention, cashiered cron move (Adjustment 3) & targets

**Week = Monday 00:00 through Sunday 23:59 America/Chicago.** UI label: `Week of Mon 6/8` (+ year when not current). All math uses date ranges; legacy `cashiered.week_label` is display-only.

**Cashiered cron moves Saturday 5 PM → Sunday 5 PM CDT** so archiving aligns with the week boundary and last-minute Sunday finish work pins to the week the techs actually did it (no orphan single-Sunday slivers). Change: unschedule `archive-cashiered-ros` ('0 22 * * 6') and reschedule at `'0 22 * * 0'` (Sunday 22:00 UTC = 5 PM CDT). Ships in the Phase 1 migration. Note: Sunday 5-11:59 PM work would archive before week close — acceptable; shop work ends 2-3 PM weekends.

### `silo_targets` table (new)

```sql
CREATE TABLE silo_targets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_silo    TEXT NOT NULL,
    weekly_target   NUMERIC(10,2) NOT NULL,
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_silo, effective_date)
);
```

A week uses the row with the greatest `effective_date <= week start` per silo — targets changeable over time with history. RLS: authenticated SELECT; writes admin-only.

**Seed values (Roland, 2026-06-10):**

| Silo key | Label | Weekly target |
|---|---|---|
| `roof` | Roof | $20,000 |
| `solar` | Solar | $20,000 |
| `vroom` | Vroom | $20,000 |
| `repair` | Repair (= "Service", confirmed Q1) | $15,000 |
| `paint_body` | Paint & Body | none (no row) |
| `chassis`, `detailing`, `truetopper` | — | none (no row) |

Silos without a target row still appear in the matrix (target/variance cells show `—`).

## 5. Two-stage WO completion (Adjustment 2)

`service_work_orders.status` already includes `'completed'`, but there is no one-click action, no timestamp, and historical usage is unreliable. Two stages, additive columns:

```sql
ALTER TABLE service_work_orders
    ADD COLUMN IF NOT EXISTS tech_done_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS tech_done_by   TEXT,
    ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_by   TEXT;

-- Approximate backfill for WOs already sitting at status='completed':
UPDATE service_work_orders
SET completed_at = updated_at, completed_by = 'backfill_from_updated_at'
WHERE status = 'completed' AND completed_at IS NULL;
```

### Stage 1 — Tech-lead "Done" (leading indicator)
Lives in the **tech check-in/out mechanism (`checkin.html`)**: when a tech lead clocks out of an RO (or from the RO's check-in view), a **"✅ Our work is done"** button per active silo WO sets `tech_done_at`/`tech_done_by`. Does NOT change `status`, does NOT recognize revenue. Surfaces on the dashboard WO view and the P&L drill-down as a `Tech done <date>` chip — the signal that the silo believes it's finished and the manager's QA/QC + customer conversation is now the gate. Adding new work (new WO or added tasks) naturally elongates the cycle; a manager can clear `tech_done_at` when add-on work arrives (audit-logged).

### Stage 2 — Manager "Done Done" (recognition event)
**"✓ Mark Completed"** button on each silo's WO view in `js/work-orders.js`, gated `isAdmin() || hasRole('Manager') || hasRole('Sr Manager')` (NOT Insurance WO Writer — DB trigger already blocks `completed`). Meaning: QA/QC passed, all known + requested work done, customer informed. Click → confirm → `UPDATE ... SET status='completed', completed_at=now(), completed_by=<email>` → `{ error }` destructured, audit-logged. Completed WOs show `✓ Completed <date> by <name>`; button becomes **"↩ Reopen"** (manager-level, per Q4 — restrict later if needed; reopen clears `completed_at/by`, returns status to `in_progress`, audit-logged; revenue simply moves with `completed_at`).

`tech_done_at → completed_at` lag is itself a metric (QA/manager responsiveness) — shown in drill-down, feeds the future AI Shop Manager scoring.

## 6. Data sources & lineage

| Component | Live source | Archived source (post-cashier) | Notes |
|---|---|---|---|
| Hours / labor $ | `time_logs` x `staff.hourly_rate` | `cashiered_time_logs.source_data` (JSONB mirror, S73) | Silo via SERVICE_TYPE_TO_SILO (worklist-report v1.10 map), comma-split defensive. |
| Parts cost + promptness | `parts` (`wholesale_price`, `core_charge`, `created_at`, `date_ordered`, `date_received`, NEW `service_silo`) | `cashiered_parts.source_data` | Cumulative-per-RO presentation; GP-matched at recognition week (§3). |
| Per-silo revenue | `service_work_orders.dollar_value` per (ro_id, service_silo) | `cashiered_service_work_orders.source_data` | THE per-silo price; WOs are silo-specific (Q3) — primary silo association mechanism. |
| Completion | NEW `tech_done_at` (lead) / `completed_at` (final) | `cashiered.archived_at` week fallback | §5. |
| RO identity | `repair_orders` (deleted_at IS NULL) | `cashiered` (original_ro_id, archived_at) | Union by original_ro_id. |
| Targets | NEW `silo_targets` | n/a | §4. |

**Exclusions (consistent with worklist-report):** testers (`staff.hourly_rate = 0`); training ROs (`is_training = true`); Shop + NULL/unknown `service_type` hours → separate **Overhead (unattributed)** row — real cost, no silo, no revenue, never silently dropped.

**Team attribution (Q3 + refined during P1 validation, 2026-06-10):** team = silo. NEW `staff.pnl_home_silo` column pins dedicated techs — **a pin ALWAYS wins over the clock-in service_type** (Roland: "if Rod/Zak/Travis are logging time, the RV has to be in their bay"). Pinned: Rod/Zak/Travis = roof, Tipton = solar, Ignacio = repair, Rudy = paint_body. Floaters (Riley, Cooper, Tommy, managers) attribute by clock-in `service_type`. `Shop` clock-ins -> overhead regardless of pin. Validated against the Dez Rock handoff case (roof wk 5/11 -> solar wk 6/08).

## 7. `weekly_pnl` RPC (server-side aggregation)

One read-only SECURITY DEFINER function so the page makes **one call per range** instead of client-joining full history. Future home of shop-expense joins + the daily AI manager report.

```
weekly_pnl(p_start DATE, p_end DATE)
  RETURNS TABLE (
    week_start         DATE,
    service_silo       TEXT,      -- silo key, or 'overhead'
    ro_count           INT,       -- distinct ROs with hours that week
    hours              NUMERIC,
    labor_cost         NUMERIC,   -- testers excluded
    parts_cost_cum     NUMERIC,   -- cumulative-to-date parts on ROs active that week
    parts_cost_matched NUMERIC,   -- parts absorbed by this week's recognized revenue (GP input)
    revenue_completed  NUMERIC,   -- WO dollar_value, completed_at in week
    revenue_fallback   NUMERIC,   -- cashier-week fallback portion (labeled)
    revenue_wip        NUMERIC,   -- WO $ of ROs touched, not completed
    target             NUMERIC    -- effective silo_targets row, NULL if none
  )
```

`weekly_pnl_detail(p_week_start DATE, p_silo TEXT)` powers drill-down: per-RO rows (customer, RV, hours, labor, parts cum, WO value, WO status, tech_done_at, completed_at, per-part promptness lags).

**Gross profit per week = (revenue_completed + revenue_fallback) - labor_cost - parts_cost_matched.**

**Validation gate before any UI:** run the RPC for a known recent week, reconcile against existing worklist-report labor numbers + manual spot-check of 2-3 ROs (including one multi-silo handoff RO). Math must tie out before pixels.

## 8. UI — Weekly P&L section in worklist-report.html

**ADMIN-ONLY for v1 (Adjustment 4)** — gated `isAdmin()`, stricter than the rest of the report. Visibility widens later via the daily Manager report + AI Shop Manager layer (§1 end-state), not by relaxing this gate ad hoc.

**Layer 1 — Week scorecard strip.** Selected week: Target | Revenue completed | Revenue WIP | Labor cost | Parts (matched) | **Gross profit** | GP %. Fallback revenue labeled inside the completed chip.

**Layer 2 — Silo x week matrix.** Week picker (default current, arrows back unlimited). Row per silo + Overhead + TOTAL. Columns: ROs | Hours | Labor $ | Parts cum $ | Revenue completed | WIP $ | Target | Variance (green >= target, amber >= 80%, red < 80%). Cells → Layer 3.

**Layer 3 — Drill-down modal.** Per-RO rows for the silo-week: RO deep link, customer, RV, hours, labor $, parts cum $ (+ per-part requested/ordered/received lags), WO value, WO status, `Tech done` chip, `✓ Completed` chip, tech-done→completed lag. The same RO under Roof in week 1 and Solar in week 3 = the handoff pipeline made visible.

**Trend table — last 13 weeks.** Row per week: completed revenue vs total target + GP, compact per-silo hit/miss strip.

escapeHtml on all rendering; `getSB()` + standard auth guard; no new globals beyond section state.

## 9. Phasing

| Phase | Scope | Est. |
|---|---|---|
| **P1 — Data layer** | Migration: silo_targets + seed; tech_done_at/by + completed_at/by + backfill; parts.service_silo + single-silo backfill; cashiered cron Sat→Sun move. RPCs weekly_pnl + weekly_pnl_detail. Raw validation table behind temp admin toggle; reconcile math. | ~1 session |
| **P2 — UI** | Scorecard + matrix + drill-down + 13-week trend in worklist-report.html (admin-only). Remove temp toggle. | ~1 session |
| **P3 — Completion buttons** | Manager Done-Done in js/work-orders.js; tech-lead Done in checkin.html (+ Spanish strings); parts silo dropdown in js/parts.js. Can split across P1/P2 sessions. | ~1 session |
| **P4 (future)** | `shop_expenses` daily table → net P&L ("what we need to make / made / profit"); freight (ER n28); parts margin lens; Admin Settings editor for silo_targets; burdened labor factor; tech→silo float mapping. | backlog |
| **P5 (vision)** | Daily Manager report + AI Shop Manager: AI guidance vs weekly silo goals, lot observation weighted by days-on-lot/RO revenue, daily+weekly manager/team scoring, bonus tie-in. | roadmap |

Branch: `feature/weekly-pnl` off pre-prod. worklist-report.html version bump per convention. Standard promote flow (local gate → FF pre-prod → soak → FF main + tag) with Claude-in-Chrome live regression.

## 10. Resolved questions (Roland, 2026-06-10)

- **Q1:** "Service" target = `repair` silo. ✅
- **Q2:** Add silo attribution to parts — `parts.service_silo` column + form dropdown, in scope now (§3). ✅
- **Q3:** Team = silo; primary association mechanism = silo-specific work orders, secondary = tech→silo mapping (floats exist). v1 uses service_type attribution; roster mapping later (§6). ✅
- **Q4:** Reopen stays manager-level; restrict later if needed. ✅

## 11. Known limitations (v1 — refine as this evolves)

- ~~Parts cost understated by freight~~ CORRECTED during P3 build: freight IS captured — the `core_charge` column is labeled "Freight Charge ($)" on the part form and is included in the cost basis (whole-line). ER n28 (parts+freight total display) remains a separate UI wish.
- Historical revenue weeks before the buttons existed are cashier-week approximations (labeled).
- Labor = `staff.hourly_rate` wage, not burdened cost — burden factor later.
- `completed_at` backfill from `updated_at` approximate for pre-existing completed WOs.
- Multi-silo ROs' pre-existing parts can't be silo-backfilled — RO-level `(unattributed)` until re-tagged.
- Weekly revenue = **earned work value**, not cash collected; cashier-out remains the cash event. Both true; different questions.
