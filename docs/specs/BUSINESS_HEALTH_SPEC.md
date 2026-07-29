# Business Health Assessment — worklist-report.html v2

**Spec v1.0 — Session 162, 2026-07-29. Decisions locked with Roland same session.**

## Intent (Roland, S162)

Evolve worklist-report.html from a draft ops report into a full **Business Health
Assessment**: the owner opens one page and immediately sees how workers, jobs, and
numbers are performing this week and week-to-week. Capital health of ROs
(labor cost/time, parts cost), what techs are working on overall — including
non-billable Shop RO time.

## Locked decisions (S162)

| Decision | Choice |
|---|---|
| Utilization baseline | **40 hrs flat** for every tech (clocked ÷ 40) |
| Labor efficiency prereq | **Build it** — extend `estimated_hours` capture (column exists since v1.451, basic-WO fallback only) to task-based WOs; efficiency lights up as new WOs get estimates |
| Comparison frame | **WoW + 4-week average** on every KPI; targets shown where set |
| AI CFO brief | **On the page only** (no email), generated on open |
| Page | Enhance worklist-report.html in place (admin-only gate already correct) |

## Page layout v2 (top → bottom)

1. **Executive KPI band** — Revenue completed, GP $ / GP %, Labor cost, Parts
   cost, Billable %, WIP $. Each card: this week + Δ vs last week + Δ vs 4-week
   avg (arrow/color). Data: existing 12-week `weekly_pnl` fetch — client-side
   math, no new RPC.
2. **Margin-at-risk ROs** — per active RO: WO dollar_value vs cost burn
   (labor + parts to date), burn %, days open, aging bucket. Flag WIP ROs with
   burn > threshold (default 70%, decide with Roland). Needs new RPC
   `ro_margin_health()` (SECURITY DEFINER, Admin gate, unions cashiered mirrors).
3. **Per-tech economics table** — clocked hrs, utilization % (÷40), billable vs
   Shop/overhead split, realized $/hr (attributed revenue ÷ hrs), efficiency
   (actual vs estimated hrs) where estimates exist. Needs new RPC
   `weekly_tech_stats(p_start,p_end)` (rates live in staff — keep server-side).
4. **Overhead tile** — first-class: non-billable hrs, cost, % of total hrs,
   WoW trend. Data: `weekly_pnl` overhead silo rows (already computed).
5. **Trend sparklines** — 12-week: revenue, GP %, labor cost, overhead hrs.
   Client-side from the existing fetch.
6. **Data-hygiene / confidence score** — roll the existing `pnlSiloIssues`
   hints (unattributed parts, missing rates, no-WO ROs) into one visible score
   so a bad week is distinguishable from bad bookkeeping.
7. **AI CFO brief** — on-page narrative: biggest movers, margin-at-risk ROs,
   anomalies. New edge fn `business-health-brief` (Anthropic key server-side,
   admin JWT check, mirrors claude-vision-proxy pattern), fed the SAME
   aggregates the page computed (no independent queries — one source of truth).
8. Existing sections retained below the fold: Weekly P&L, Labor Load chart,
   per-silo view, staff tiles, manager work lists.

## Build phases

| Phase | Scope | Size |
|---|---|---|
| P1 | KPI band + WoW/4wk deltas + overhead tile + sparklines (client-only) | M |
| P2 | `estimated_hours` task-WO capture (index.html WO form) | S |
| P3 | `weekly_tech_stats` RPC + per-tech economics table | M |
| P4 | `ro_margin_health` RPC + margin-at-risk section + aging | M |
| P5 | Hygiene/confidence score | S |
| P6 | `business-health-brief` edge fn + on-page narrative | M |

P1 is pure client math on already-fetched data — highest value per line of code,
ship first. P3/P4 each need a migration (Admin-gated RPCs; remember the 2026-10-30
Data API grant change for any NEW tables — RPCs unaffected).

## Gotchas that bind this build

- `weekly_pnl` attribution: pnl_home_silo pin wins; 'Shop' logs → overhead; week
  = Mon–Sun America/Chicago (S99/S102).
- Any historical time_logs read MUST union `cashiered_time_logs` (S102).
- Unattributed silo is PARTS-ONLY by design (S101).
- `parts.core_charge` stores FREIGHT; part cost = wholesale × qty + core_charge (S99).
- Supabase JS 1000-row default cap — RPCs aggregate server-side, don't select raw rows (S151).
- `estimated_hours` is basic-WO fallback only today (S109) — P2 fixes that.
- WLR_VERSION single constant drives the version pill (S102).
