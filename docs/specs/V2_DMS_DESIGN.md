# PRVS RO Dashboard v2.0 — **"Provose"** (PRVS OS, a play on Jarvis): AI-first shop management on a DMS spine

> **Draft 2 — Session 195 (2026-10-04): name = Provose; all 7 Roland decisions answered (§10); Lightspeed is the live system of record for invoicing + sales tax, so Phase 1 exit = Lightspeed parity (§6, §10.4).** Draft 1 — Session 194 (2026-10-03). Roland's directive: take the best of every DMS (Lightspeed, IDS, Blackpurl, Tekmetric, Shopmonkey, Fullbay…), use their structures as the inputs, and build an AI front end on a DMS-shaped core that runs the whole lifecycle — ad → lead → AI response → RO → multi-service work → invoicing with full P&L audit → review follow-up → after-service upsell. v1 was the proof of concept; v2 is the product.
> Research inputs: `docs/research/V2_RESEARCH_01..04_*.md` (Session 194). Security baseline: `docs/specs/SECURITY_AI_ROADMAP.md` (Phase 1 largely complete S194).
> Status legend: 🔒 locked decision · 🟡 proposed, needs Roland · ❓ open question

## 1. Principles (the things we do not re-argue)

1. 🔒 **Security first, then AI on top.** v2 ships only behind the Cloudflare front door with a private repo (Phase 1), RLS on every table, and every AI call logged with its exact payload (S192 invariants).
2. 🔒 **Adopt the DMS spine; do not reinvent it.** Every tool surveyed converges on the same objects and lifecycle (Research 01/02 §table stakes). We use their vocabulary where it is standard, so anyone who has used Tekmetric or Lightspeed recognises v2 on day one.
3. 🔒 **The AI is the workspace, not a router** (Roland S192). The assistant reads and acts on the same tables the screens do; screens remain as the "hot standby" and for dense data entry.
4. 🔒 **AI picks from a catalogue; the client validates; the AI never touches money or data directly** (the S190/S191 safe pattern, extended: the AI may *draft* an estimate line, a customer message, a job split — a human or a rule commits it).
5. 🔒 **Money is modelled at the line, with cost and sale on every line, and the invoice is a snapshot** (Research 04). No GL — QuickBooks is the ledger (Blackpurl's lesson; Lightspeed's GL is its #1 complaint).
6. 🔒 **One identity per person, as simple as possible** (Roland S194: the current PIN → Google → MFA chain is unacceptable). Direction: phone-number identity; Workspace mailboxes become a business choice, not a technical requirement.
7. 🔒 **RVs sit for weeks and have several payers.** v2's differentiator vs every auto-shop SaaS is first-class per-job holds, per-job payers (customer / insurance / warranty / internal) with their own receivables, and department (silo) queues. Nobody surveyed does this well (Research 02 §e).

## 2. Lifecycle, end to end

```
 Ad / web form / call / text / walk-in
        │  (Meta Lead Ads webhook, Google Ads webhook, SMS provider, web form, GBP phone)
        ▼
 LEAD ──AI first reply <60s──► Engaged ──► Qualified ──► Booked ──► Showed
        │                                                          │
        └─ Needs Human / Nurture / Opted-out (side states)         ▼
                                                        RO (Estimate stage)
                                                          ├─ Job A  (payer: customer)   approve/decline per job
                                                          ├─ Job B  (payer: insurance)  supplement = new estimate version
                                                          └─ Job C  (payer: warranty)
                                                          ▼
                                            RO Working stage: per-job holds (parts / adjuster / customer / sublet),
                                            tech clocks on JOBS, DVI photos, parts request→order→receive→allocate
                                                          ▼
                                            RO Done stage: one INVOICE PER PAYER, deposits applied, AR by payer,
                                            QBO outbox, period close
                                                          ▼
                                            Post-service: review request (no gating), service-interval reminders,
                                            history-driven upsell campaigns (consent-gated, capped)
```

## 3. Domain model (v2 core)

Names follow the surveyed consensus. **Bold = new in v2**; plain = exists in v1 and carries forward (possibly renamed).

| Entity | Purpose | Key fields / notes |
|---|---|---|
| `customer` | Person/company we bill | name, phones[], emails[], consent_status/source/at, opted_out_at, tz, qbo_id |
| `unit` | The RV | VIN, year/make/model/type/length, floorplan; **multi-owner history** (Blackpurl) |
| **`lead`** | Inbound interest before an RO | source (meta/google/web/call/text/walk-in), campaign/ad ids, stage, raw payload, `next_action_at` |
| `conversation` / `message` | All channels, one thread per contact | direction, sender (ai/staff/customer), provider_id, `prompt_version`, `tool_calls` (audit) |
| **`appointment`** | Drop-off / return visit | contact, lead, ro, slot, status (booked/confirmed/showed/no-show); capacity per silo/bay |
| `ro` | The repair event | ro_number, customer, unit, **stage** (Estimate / Working / Done — fixed), opened/closed, RECT clock |
| **`ro_job`** | Unit of approval, payer and hold | silo (dept), title, **payer_type**, approval_status (pending/approved/declined), **hold_reason** (parts/adjuster/customer/sublet/none), flag_hours, estimate_version |
| **`ro_line`** | Every money line | type (labor/part/sublet/fee/discount), qty, unit_cost, unit_price, billed_hours, labor_rate_type, taxable, tax_code, core_charge, freight; sale_amount + cost_amount generated |
| **`service_kit`** / canned job | Preset labor + parts + margin | Blackpurl "service kits"; the AI's estimate catalogue |
| **`inspection`** (DVI) | Photos/video findings → estimate | per job; shareable link to customer |
| `part` / inventory, **`vendor`**, **`purchase_order`** | Request → order → receive → allocate | markup matrix (**AI-tuned to a GP target**, Shop-Ware); cores as liability; supersessions |
| **`payer`** / **`payer_split`** | Insurance carrier, warranty co., internal | per job: pct / fixed / deductible / cap; its own AR |
| **`invoice`** / **`invoice_line`** | One per payer per RO; immutable after finalize | gap-free number, status draft/final/void, **snapshotted** lines, qbo_id + SyncToken |
| **`payment`** | Money received | method, is_deposit (liability until applied), applied_to_invoice |
| `time_entry` | Clock data | **type: shift / job / nonproductive**; cost_rate → labor_cost. v1 clock-in is RO-level single-service (S103); v2 clocks on jobs |
| `task`, `task_event` | Shop task manager (S186) | carries forward |
| **`campaign`**, **`sequence`**, **`sequence_step`** | Follow-up and marketing automation | caps, quiet hours, stop conditions |
| **`handoff`** | AI → human queue | reason, priority, SLA, resolved_by |
| `audit_log` (trigger-written) | Who changed what | already the v1 pattern; extend to every money table |
| **`qbo_outbox`** | Idempotent sync queue | requestid = invoice.id:version, attempts, last_error |

Carry-forward tables that get *renamed into* the model rather than rebuilt: `repair_orders`→`ro`, `service_work_orders`+`service_tasks`→`ro_job` (+ `ro_line`), `parts`→`ro_line(type=part)` + inventory, `time_logs`→`time_entry(type=job)`, `ro_receivables`→`invoice` balances by payer, `cashiered_*`→ no mirror tables — closed ROs stay in place with `stage=Done` and are archived by policy, not by copying (the S-era mirror/union gotchas disappear).

## 4. Lifecycle states (locked vocabulary)

- **RO stage** (fixed, three): `Estimate` → `Working` → `Done`. Shop-defined sub-labels per stage (Tekmetric pattern) reset when the stage changes. v1's 20-odd `status` values map onto stage + sub-label + hold (mapping table to be written with Lynn/Brandon — the status batch tabled in S178 folds in here).
- **Job approval**: `pending` → `approved` | `declined`. **Declined is a deliberate action** that feeds close ratio; all-declined ROs are "Posted as Declined", never deleted.
- **Job hold** (independent of RO stage): `none` / `parts` / `adjuster` / `customer` / `sublet`. **Stalled-job aging** = time in a hold; this is the RECT driver.
- **Invoice**: `draft` → `final` → (`void` with reason | `credit` memo). Finalized invoices are never edited.
- **Lead**: `new` → `ai_engaged` → `qualified` → `booked` → `showed` → `post_service` → `review_requested` → `nurture`; side states `needs_human`, `opted_out` (terminal).

## 5. The AI layer — what it may and may not do

**May, autonomously:** reply to customer-initiated texts from approved content; collect RV + issue details; offer open slots and book/reschedule within rules; send reminders and approved sequences; draft estimate lines from a kit catalogue + tech voice note/photos; draft a job split from a complaint; draft customer status updates when a hold starts/ends or a promised date slips; answer "is my RV ready?" from RO + parts status; create a handoff; answer natural-language questions over the schema (Ask Spike / Lightspeed Command Center class, but for *service*).

**May not, ever:** commit a money line, finalize an invoice, record a payment, change a job's approval, close an RO, promise a completion date or parts availability, quote a final price, diagnose as certain, touch refunds/credits/warranty/insurance disputes, message anyone without consent or outside quiet hours, reply to a negative review without human approval.

**Mechanics:** a state machine with `next_action_at` decides *whether* to contact; the LLM decides only *what to say* and *which tool to call*. One `send_message()` function enforces consent, opt-out, quiet hours (Texas mini-TCPA), per-contact caps. Every AI message, prompt version, model and tool call is logged (extends `assistant_log` / `planner_ai_log`). Shadow mode (AI drafts, human approves) precedes autonomy for every new capability.

## 6. Build phases (each ends with a releasable increment)

| Phase | Deliverable | Depends on |
|---|---|---|
| **0 — Front door** | SECURITY_AI_ROADMAP Phase 1: ✅ Cloudflare gate live + promoted (S195) · ✅ shop-IP bypass proven · ✅ **phone/SMS login at the gate (Descope OIDC + Textly, S195)** · 🔒 NEXT BUILD: phone-OTP sign-in INSIDE the app (Supabase Auth + Send-SMS hook over Textly) replacing Google, same `auth.uid` per person; then URL handout → deep-link repoint → repo private → GitHub Pages off | S195 state |
| **1 — Money model** | `ro_job` / `ro_line` with cost + sale, payer splits, one-invoice-per-payer, deposits, AR aging by payer, gap-free numbering, period close, QBO outbox (one-way). Taxability as a per-item table. Migrates v1 ROs in place. | 0; ❓ tech cost-rate policy; ❓ CPA on Texas RV tax |
| **2 — Jobs as the unit of work** | Approve/decline per job with text/e-sign link, holds + stalled-job aging, DVI photos per job, service kits, tech clock-on-job, parts request→PO→receive→allocate, AI estimate drafting (shadow) | 1 |
| **3 — Lead engine (WooSender replacement)** | Meta/Google/web/SMS ingestion, lead pipeline, AI first reply + qualify + book (shadow → auto), handoff queue, reactivation sequences, lead→RO→invoice attribution | 0, 2 (appointments) |
| **4 — Post-service loop** | Review requests from RO completion (no gating; complaint interception to a human), service-interval reminders, history-driven upsell campaigns with consent + caps | 1, 3 |
| **5 — The AI workspace** | `board.html` hot-standby + reader-mode assistant on minimized payloads (SECURITY_AI_ROADMAP Phases 2–3), NL queries over the money model (RECT, GP by silo, declined-work value, effective labor rate) | 1–4 |
| **6 — Lightspeed retirement** | Lightspeed TODAY = final RO build (parts + labor), invoice, cash-out, monthly sales-tax reports, NTP parts price book (wholesale + retail), RV VIN lookup (S195, Roland). Retirement = Phase 1 parity + a parallel-run month reconciling Provose invoice/tax totals against Lightspeed, then cut over; NTP price feed + VIN decode are Phase 2 deliverables | 1, 2 |

Rough sizing: each phase is several sessions, Phase 1 the longest. This is a quarter-plus of weekends, not a weekend. Phase 0 is this weekend.

## 7. KPIs v2 computes natively (from Research 04, definitions locked)
RECT per silo · labor GP% · parts GP% · total GP% · effective labor rate · productivity (flag/clock) · efficiency (flag/actual on job) · ARO · WIP aging buckets · unbilled WIP · AR aging by payer type · declined-work value · department P&L · absorption rate. Definitions are shown in the UI; never mixed.

## 8. Decisions needed from Roland — ✅ ALL ANSWERED S195, see §10 (original questions kept for the record)
1. **Tech cost rates** — loaded hourly cost per tech (wage + taxes + benefits), flat-rate vs hourly per person. Without this, labor margin is fiction (Research 04 pitfall #1).
2. **Texas sales tax on RV work** — is an RV a "motor vehicle" for repair-labor exemption; is roof/solar/cabinetry work tangible property or real-property improvement? CPA answer before Phase 1 hard-codes a tax table.
3. **Identity** — phone-OTP sign-in (Supabase Auth, SMS) replacing Google, so Workspace seats can go. Confirms Principle 6.
4. **What Lightspeed still does** for PRVS today (defines Phase 6).
5. **PITR** once invoices and payments live in this DB (BACKUP_RESTORE.md §4c).
6. **Media backup to R2** — yes/no (BACKUP_RESTORE.md §4d).
7. Visual base for `board.html`: S121 design tokens vs current CSS (SECURITY_AI_ROADMAP open decision).

## 9. Non-goals for v2.0
Building a general ledger; mobile native apps (web first, as v1); replacing Textly/SMS provider; multi-location.


## 10. Decision log — Session 195 (2026-10-04), all seven answered

| # | Decision | Answer (Roland) | What it fixes in the design |
|---|---|---|---|
| 1 | Tech cost rates | Mix of **employees and contractors; everyone is hourly** (no flat-rate, no commission). Employees cost more only via employer payroll taxes + unemployment insurance — no health insurance or other benefits. Contractors = straight hourly rate. `staff.hourly_rate` already holds base pay per person. | `staff.hourly_rate` = base pay (unchanged). NEW `staff.worker_type` (`employee`/`contractor`) + `staff.pay_type` (default `hourly`; `flat_rate` modelled, unused). ONE shop-wide config `employee_burden_pct` (default **10%**; employer FICA + FUTA + TX SUTA; refine from payroll/CPA) applied to employees only. `labor_cost = clock_hours × hourly_rate × (1 + burden if employee)`. No per-person burden entry. |
| 2 | Texas sales tax | **Parts are taxed, labor never, on every job** as practised today. Unsure on upgrade/installation work and lump-sum cases → pass to CPA (or AI research of the Texas code as information, not advice). | `tax_code` on every `ro_line` + a taxability table (line_type × tax_code → taxable). Defaults: part=taxable, labor=exempt, sublet/fee=per CPA (provisional: follow the dominant line). **Monthly sales-tax report** is a Phase 1 deliverable (today it comes from Lightspeed). Roland action: 3 CPA questions (towable RVs as motor vehicles / upgrade vs repair / lump-sum). Nothing in Phase 1 is blocked. |
| 3 | Identity | **Confirmed**: phone-OTP in the app replaces Google; Google hidden as fallback ~2 weeks then removed. | First V2 build (Phase 0 remainder): Supabase Auth phone + Send-SMS hook → Textly; attach phones to EXISTING auth users (same `auth.uid`, RLS/roles/history untouched); `login.html`; pages' no-session branch → `login.html`; Access session lengthened to ~1 month. Unblocks the S179 Workspace-seat sequence. |
| 4 | What Lightspeed still does | **System of record for money**: final RO build (parts + labor), invoice, cash-out, monthly sales-tax reporting; NTP parts price book (wholesale + retail); RV VIN data lookup. PRVS RO DB is the operational tool, Lightspeed the official close-out. Kenect link gone with Kenect. Roland wants Lightspeed gone at v2.0 and wants its functions mirrored + bettered. | Phase 1 exit criteria = Lightspeed parity for RO→invoice→cash-out→tax report, proven by a **parallel-run month** (every RO closed in both; totals reconciled). **Lightspeed data access:** Lightspeed EVO exposes a dealer-enabled "3PA data services API" (credentials issued per integrator by Lightspeed, dealer enables once) — Roland action: ask the Lightspeed rep to enable 3PA data services for an in-house integration (expect a partner agreement and possibly a monthly fee). **Fallback that needs no permission:** Lightspeed's own report exports (ROs, parts, tax) — enough to profile current usage, tax rates and parts markup and to migrate history. Phase 2 adds NTP price-book access (NTP dealer feed/API — to research) and VIN decode (NHTSA vPIC free API covers RV/trailer VINs for year/make/model; paid RV spec data optional). |
| 5 | PITR | **On when invoices/payments go live** (start of Phase 1). | Budget ~$125/mo from Phase 1; until then the verified daily dump + restore drill (S195) is the recovery story. |
| 6 | Media backup (R2) | **Yes — next backup session.** | Second workflow: list `rv-media` via Storage API → sync new/changed objects to Cloudflare R2 (same account as Pages). |
| 7 | board.html visual base | **Show both first** — mock the same screen on S121 tokens and on current CSS, Roland picks. | TODO: two static mocks of the RO board + one RO card (same data) before Phase 5 UI work. |

**Name:** the v2.0 dashboard is **Provose** (PRVS OS, a play on Jarvis). Use it in UI copy, docs and repo naming from here on; `index.html`/v1 stays "RO Dashboard" until replaced.
