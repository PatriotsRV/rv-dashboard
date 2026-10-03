# V2 Research 04 — Shop money model: job costing, multi-payer invoicing, QBO sync, KPIs, audit, Texas tax

> Session 194 (2026-10-03). Subagent research feeding `docs/specs/V2_DMS_DESIGN.md`.
> Sourcing caveat: Intuit limits page unreadable (QBO limits from memory + snippets). Texas tax rests on a secondary article citing Comptroller Pubs 94-113 / 96-259 — **verify with CPA / Comptroller before hard-coding.** Vendor details for Tekmetric/Shopmonkey/Fullbay/Lightspeed/IDS from general knowledge.
> Sources: https://bradyware.com/service-excellence-proficiency/ · https://handsoffsalestax.com/texas-sales-tax-auto-repair/ · https://developer.intuit.com/app/developer/qbo/docs/learn/limits-and-throttles · https://coefficient.io/quickbooks-api/quickbooks-api-rate-limits · https://ezel.ai/tax-rulings/tx/9312l1271g03-motor-vehicle-separated-repair-contracts-agreed-sales-price-of

## 1. Job costing model (consensus)
RO → jobs (concerns / "lines" in dealer speak) → typed lines. **Each line carries its own sale AND its own cost; RO GP = Σ line GP.**
- **Labor:** billed hours = flat-rate (book/flagged) or actual; billed = hours × rate; **rate varies by labor type: customer-pay, warranty, insurance, internal.** Cost is separate: actual clocked hours × tech cost rate, or flat-rate payout. Systems that skip cost show 100% labor margin. **Store flag AND actual hours per job.**
- **Parts:** qty, unit cost, list, sell, matrix rule used. Matrices = cost-range tiers with markup% or margin%. **Cores = separate liability-style line** (billed, refunded/credited on return). **Freight:** capitalize into cost OR bill as fee — pick one policy. Parts GP = sell − cost.
- **Sublet:** vendor cost + markup, own line type.
- **Shop supplies / environmental fees:** fee line, % of labor or parts with cap; revenue with ~zero cost or offset against supplies expense.
- **Discounts:** negative line tagged to source (promo, goodwill, insurance adjustment); RO-level discounts allocated back to department.
- **Taxes:** per line from taxable flag, summed on invoice; **tax is pass-through, never revenue.**

**Dealer-side service P&L:** split customer-pay / warranty / internal / sublet; each with labor sales+cost, parts sales+cost, sublet sales+cost, GP; expenses variable vs fixed. **Absorption rate** = dept GP / total fixed+variable expenses (NADA-style); standalone-shop analogue = GP / overhead.

## 2. Multi-payer invoicing
**The RO is not the invoice.** Money sits at the **job level with payer assignment per job** (some systems per line).
- **Insurance:** customer pays deductible; carrier pays rest; **supplements = added scope approved later → versioned estimates**; customer-pay portion covers betterment / non-covered.
- **Extended warranty / manufacturer:** pays covered labor+parts at its own labor rate + parts markup caps; customer pays deductible + uncovered.
- **Deductible is a line/allocation, not a discount.**
- **Deposits = customer liability (unearned revenue)** until applied. Partial payments reduce balance.
- **Internal ROs** (shop units, manufacturer warranty claims): payer = internal; internal-sales/internal-expense pair or cost-only, separate pay type.
- **Revenue recognition:** accrual = on completion + invoicing, not cash. Each payer has its own AR balance.
- **Recommendation: one invoice per payer per RO** → clean AR aging by payer type + clean QBO sync.

## 3. QuickBooks Online integration
- **Objects:** Customer, Item (→ income account), Invoice (or SalesReceipt for paid-at-pickup), Payment, Deposit, **Class (department)**, Location, JournalEntry (COGS/adjustments), TimeActivity, TaxCode.
- **Direction:** mature integrations are one-way shop→QBO for invoices/payments; two-way only for customer/item masters. **Shop system is source of truth for transactions.**
- **Departments → Class per invoice line.**
- **COGS:** (1) QBO inventory per item — fragile for shops; (2) **summary JournalEntries per day/period** (parts COGS, sublet, labor allocation) — robust. Prefer (2).
- **Rate limits (verify):** ~500 req/min/realm, 10 concurrent, batch 30 ops/call, HTTP 429 → back off.
- **Failure modes:** duplicate invoices after retry; tax-code mismatch; deleted/renamed items/accounts; closed-period edits; **refresh tokens rotate, expire after ~100 days unused**; customer-name collisions; tax rounding differences.

## 4. Time clock → payroll
- **Two layers:** `shift` time (clock in/out → payroll) and `job` time (punch on/off RO job → costing). PRVS v1 already has per-RO time_logs (single-service by design, S103).
- Exports: QuickBooks Time (TimeActivity), Gusto, ADP — hours by employee by period, regular vs OT.
- Flat-rate techs: paid flagged × rate (often with guarantee); hourly: clock hours. Flat-rate labor cost per job = flagged × pay rate; reconcile at period end. OT >40/wk federal; flat-rate needs regular-rate calc — confirm with payroll/counsel.
- **Loaded cost rate** = (wage + payroll taxes + benefits) / hours. Unassigned time (waiting, training, cleanup) = overhead, tracked as `nonproductive` so efficiency is honest.

## 5. KPIs — exact formulas

| KPI | Formula |
|---|---|
| Labor GP % | (labor sales − labor cost) / labor sales |
| Parts GP % | (parts sales − parts cost) / parts sales |
| Total GP % | (total sales − total COGS incl. sublet) / total sales |
| Effective labor rate | labor sales / hours billed (state flagged vs actual) |
| Productivity | flag (billed) hours / clock hours at work |
| Efficiency | flag hours / actual hours on the job ("in the stall") |
| Proficiency | productivity × efficiency (Bradyware); others: flag / total available hours — **state the definition in the UI, never mix** |
| ARO | total sales / closed RO count |
| WIP aging | open ROs bucketed 0–7 / 8–14 / 15–30 / 31+ days |
| Unbilled WIP | Σ accrued sales on open uninvoiced ROs |
| AR aging by payer | open invoice balance bucketed by days past invoice, grouped by payer type |
| Declined-work value | Σ line value on declined/unapproved jobs |
| Department P&L | dept sales − dept COGS − allocated direct expenses |
| Absorption rate | dept GP / (fixed + variable operating expenses) |
| RECT (from Research 01) | repair-event cycle time, per silo |

## 6. Audit trail expectations
- **Immutable invoice numbers:** sequential, gap-free, assigned at finalize, never reused.
- **Voids and credits, not edits:** finalized invoice never edited; credit memo + new invoice, or void keeping the number + reason.
- **Change log:** append-only who/when/table/row/old/new — **via triggers, not app code** (PRVS v1 `audit_log` + `planner_events` already follow this).
- **Period close:** closed-through date; posting blocked in DB and QBO; adjustments in current period.
- **Snapshotting:** invoice lines snapshot price, cost, tax rate, rule at finalize.

## 7. Texas sales tax (UNCERTAIN — verify)
Secondary source citing Comptroller Pubs 94-113 / 96-259:
- Repair/maintenance labor on a motor vehicle generally **not taxable if separately stated**.
- **Parts, lubricants, fluids taxable.** Fabrication labor taxable.
- **Lump-sum parts+labor → whole amount may be taxable.**
- Shop supplies: not addressed; treat as taxable until a Comptroller reference says otherwise.
- **Unverified and important:** whether an RV counts as a "motor vehicle"; whether towable / living-quarters work (solar, roof, appliances, cabinetry) is real-property improvement vs tangible personal property; treatment of upgrades/installs. **Make taxability a per-item + per-line-type table, not code.**

## (a) Schema sketch (Postgres)
```sql
ro(id, ro_number unique, customer_id, unit_id, dept_id, status, opened_at, closed_at, is_internal bool, created_by)
ro_job(id, ro_id, dept_id, title, payer_type, approval_status, flag_hours, estimate_version, declined bool)
ro_line(id, ro_job_id, type check (type in ('labor','part','sublet','fee','discount')),
        description, qty, unit_cost, unit_price, billed_hours, labor_rate_type,
        taxable bool, tax_code, core_charge, freight, item_id,
        sale_amount generated, cost_amount generated)
payer_split(id, ro_id, ro_job_id null, payer_id, payer_type, pct, fixed_amount, deductible_amount, cap_amount, rule)
invoice(id, invoice_number unique not null, ro_id, payer_id, status ('draft','final','void'), finalized_at,
        subtotal, tax_total, total, balance, voided_by, void_reason, credit_for_invoice_id, qbo_id, qbo_synctoken)
invoice_line(id, invoice_id, ro_line_id, dept_id, class_name, description, qty, unit_price, unit_cost,
             tax_code, tax_amount, line_total)   -- snapshots
payment(id, invoice_id null, customer_id, payer_id, amount, method, received_at, is_deposit bool, applied_to_invoice_id, qbo_id)
time_entry(id, employee_id, ro_job_id null, type ('shift','job','nonproductive'), started_at, ended_at, hours,
           cost_rate, labor_cost generated, approved_by)
audit_log(id, at, actor, table_name, row_id, action, old jsonb, new jsonb)
```
**GP:** line GP = sale − cost; labor cost = Σ time_entry.hours × cost_rate on that job (or flag × flat-rate pay); RO GP = Σ line GP excl. tax; discounts = negative sale, zero cost; GP by dept = group by invoice_line.dept_id; cores = liability until forfeited.

## (c) Recommended QBO sync design
- One-way app→QBO: Invoice (one per payer; Class per line), Payment, Deposit, daily summary JournalEntry for COGS + labor allocation. Customers: app is master, push on create/update, store qbo_id. Items + Classes pre-created in QBO, mapped once in a config table.
- **Idempotency:** QBO `requestid` param on creates = `invoice.id + ':' + version`; store `qbo_id` + `SyncToken`; check local qbo_id before any create.
- **Outbox table** (status, attempts, last_error), serial per realm, back off on 429.
- Voids → QBO void or CreditMemo; never delete in QBO.
- Nightly reconciliation: total invoiced + paid per day, app vs QBO; alert on drift.
- Guards: never sync drafts; block local edits to a synced invoice.

## (d) Top 5 pitfalls that wreck P&L accuracy
1. **No labor cost on jobs** → 100% labor margin, fictional dept P&L.
2. **Editing finalized invoices** → drift from QBO. Credits/voids only.
3. **Mixing revenue timing** — cash payments against accrual invoices; deposits booked as revenue.
4. **Parts/core handling** — cores, freight, returns booked as sales or missing from cost (PRVS v1 gotcha: `core_charge=FREIGHT`, S99).
5. **Wrong/unseparated tax treatment** — lump-sum billing or wrong taxable flag = Texas audit exposure.
Also: unassigned department on lines; shop supplies not offset; discounts not allocated to a department.
