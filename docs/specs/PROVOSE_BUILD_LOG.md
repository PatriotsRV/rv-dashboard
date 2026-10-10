# Provose Build Log

> The per-migration contract record for Provose (PRVS RO Dashboard v2.0). Spec: `docs/specs/V2_DMS_DESIGN.md`.
> One entry per migration. Applied = Roland ran it in the Supabase SQL Editor; Verified = Claude read it back over the read-only MCP.
> Scaffold decision (Provose 200): same repo + same Supabase project, new tables beside v1 (`repair_orders` untouched); pages under `provose/`, modules under `provose/js/`; migration files `supabase/migrations/provose_p<phase>_<nn>_*.sql`, idempotent, ASCII-only.

## Conventions every Provose table follows

- RLS enabled; `anon` revoked; explicit GRANTs to `authenticated` (Supabase drops default public grants 2026-10-30).
- Read = all staff; write = `is_manager_or_above()` for operational tables, `is_sr_manager_or_admin()` for config/tax.
- Audit: `provose_audit()` AFTER trigger (SECURITY DEFINER) writes old/new JSON + `auth.uid()` + email to `provose_audit_log` (readable by sr_manager/admin only).
- Money lives on `ro_line`; `sale_amount`, `cost_amount`, `tax_amount` are STORED GENERATED columns (a generated column may not reference another, so `tax_amount` restates the price expression).
- Tax is resolved by `provose_resolve_tax(line_type, subtype)` from the `taxability` table and SNAPSHOTTED onto the line (`taxable`, `tax_code`, `tax_rate`).

## Phase 1 - Money model

| # | File | Applied | Verified | Creates | Notes |
|---|---|---|---|---|---|
| P1-01 | `provose_p1_01_config_tax_payer.sql` | Provose 200, 2026-10-10 | yes: 1/2/9/2 rows, 6 triggers, 9 policies, RLS all | enums `provose_line_type` (labor/part/sublet/fee/discount), `provose_payer_type`, `provose_unit` (hour/ft/each), `provose_labor_rate_type` (retail/insurance/flat); `provose_audit_log` + `provose_audit()`; `provose_config` singleton (burden 10%, tax 6.25%, shop supplies 5%/$250, labor $195/$165, 0.25 h increment, accessory /0.75); `tax_code` (TX_STATE, NONE); `taxability` (9 rules from s11.2/11.6) + `provose_resolve_tax()`; `payer` (Customer self-pay, PRVS Internal) | Seeds ran before triggers attached, so seed rows have no audit entry. |
| P1-02 | `provose_p1_02_ro_job_ro_line.sql` | Provose 200 | yes: smoke job 1250/390/2h/169.50/1269.50/540/79.35/1888.85 exact | `ro_job` (v1 `ro_id` OR `external_ref`; payer default by trigger; approval pending/approved/declined; hold none/parts/adjuster/customer/sublet with `hold_started_at` clock; `labor_rate_type`; `shop_supplies_override`); `ro_line` (type/subtype, `unit`, signed `qty`/`unit_price`, `discount_amount`, `price_overrides_hours`, `tech_staff_id`, snapshotted tax, generated amounts, `source`, `import_ref`); `provose_shop_supplies_amount()` + `provose_apply_shop_supplies(job_id)` (formula 5% of labor cap $250, override wins, always a real taxable fee line); views `ro_job_totals`, `ro_totals` | Tax is computed on the UNDISCOUNTED price (s11.6, CPA Q5) - one expression in `tax_amount` to flip. Labor lines default `unit=hour`. |
| P1-04 | `provose_p1_04_sales_tax_report.sql` | Provose 200 | yes: Sep 2026 = 95,344.93 / 152,684.72 / 5,959.14 / 37 ROs / 222 lines = Lightspeed to the penny | `ro_job.closed_on`; view `provose_sales_tax_monthly` (month x tax_code); `provose_sales_tax_report(month)` | First version double-counted ROs across tax codes (68); fixed same session to count from lines. Reporting date = `closed_on` until P1-03 adds `invoice.finalized_at`. |

### Parity load (not a migration)

`docs/lightspeed/provose_load_2026-09.sql` (GITIGNORED - customer names). Generated from `2026-09_tax_report_by_tax_category.xls` (222 lines, 37 ROs) by the inline python in Provose 200. Loads one `ro_job` per Lightspeed doc (`external_ref = 'LS:<doc#>'`, `closed_on` = LS date, `approval_status = approved`) and one `ro_line` per tax-report line (`source = lightspeed_import`, `import_ref = 'LS:<doc#>:<n>'`). Taxable lines are typed `part`, non-taxable `labor` - the tax report carries no category, so PAM/ACC/SSS vs SLB/SM4 attribution is NOT in this load (the category CSV has it at RO x category level only). Idempotent: wipes `LS:%` jobs first.

**Rounding finding:** Lightspeed rounds per-line tax half-up (250.00 x 6.25% = 15.625 -> 15.63; 10 such lines in Sep). Postgres `round(numeric,2)` rounds half away from zero = same result. Tax on category-level aggregates would be 11 cents low (5,959.03) - the parity test MUST run at line level.

## Next (Phase 1 continued)

- P1-03: `invoice` / `invoice_line` (snapshot, gap-free number, draft -> final -> void), `payment` (deposits as liability), `payer_split`, finalize as a SECURITY DEFINER RPC; turn PITR on when this ships (s10.5). Reporting date moves to `invoice.finalized_at`.
- P1-05: `staff.worker_type` / `pay_type`, `time_entry` cost formula (`clock_hours x hourly_rate x (1 + burden if employee)`), AR aging by payer, `qbo_outbox` (table only).
- P1-06: `provose/ro.html` minimal RO builder (jobs + lines) so Lynn can run a parallel-run RO.
- Aug 2026 parity (the second month) once the Aug xls is parsed the same way.
