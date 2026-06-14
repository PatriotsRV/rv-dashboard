# Manager Daily Report — Iteration 1 Spec

> **Status:** Draft v0.1 (Session 109, 2026-06-14)
> **Author:** Roland + Claude design session
> **Companion to:** `send-admin-pnl-report` (rule-based admin v1, shipped Session 101), `WEEKLY_PNL_SPEC.md`, `MESSAGING_AUTOMATION_SPEC.md`
> **TODO it fulfills:** "Daily Ops Health report v2 → the daily MANAGER report" + roadmap items (b) AI commentary and (c) manager-facing variant.

---

## 1. Vision — the AI Assistant Manager

A per-manager email that lands first thing every morning and answers three questions for that manager, in priority order:

1. **Is my work list actually being worked?** (techs checking in, hours flowing onto my ROs)
2. **What is about to become a fire?** (near-term promised/delivery dates, overdue parts, reminders, customer questions — flagged and color-coded)
3. **Is my data good enough that the P&L can even see my work?** (WOs defined + valued, labor attributed, parts tagged)

This is the **first iteration of an AI assistant for every manager** — silo managers, the parts manager, and the insurance manager. It exists to fix one specific failure mode: **a manager picking easy jobs over hard jobs, letting the hard ones turn into customer fires.** The report makes the hard, time-sensitive, financially-important work impossible to ignore.

### 1.1 The hard line: GUIDE, not JUDGE (this iteration)

Iteration 1 is a **pure assistant** — it flags, prioritizes, and explains. It does **not** score managers, rank them, or produce any HR-facing output.

A separate, silent **guidance log** is captured in the background from day one (§7) so that a future "judge" phase has a clean, auditable trail. But scoring, revenue-goal carrot/stick, and any termination/bonus signal are **explicitly out of scope** until two gates are met:

- **Data-trust gate:** silo-level data completeness sustained > 90% (see §6 P&L Readiness — the report itself is what drives this up).
- **Human-in-the-loop gate:** any adverse personnel action stays a human decision; the AI log is decision-*support*, never decision-*maker*.

> **Why this matters:** a tool that simultaneously helps a manager and visibly builds a case to fire him gets gamed or ignored, and the signal is lost. Worse, scoring managers on today's incomplete data (70% of active ROs have no work order) would be indefensible. The assistant earns the right to become the judge by first cleaning the data it would later be judged on.

---

## 2. Scope

### In scope (Iteration 1)
- One email per active manager, every weekday morning.
- Sections: **List Activity**, **Fire Watch** (color-coded flags), **P&L Readiness**, **AI narrative** ("your day in priority order").
- Per-role variants (silo / parts / insurance).
- Deep links from every flag straight to the RO.
- Silent guidance-log capture.

### Out of scope (later phases)
- Manager scoring / ranking / leaderboards.
- Revenue-goal carrot-and-stick logic.
- Inbound customer-message flags (gated on Sendblue Q6–Q8 webhook work).
- Manager-facing labor-efficiency vs. *estimated* hours (gated on the `service_work_orders.estimated_hours` column — see §8).

---

## 3. Architecture

**Decision (D1, locked):** **repurpose the existing `send-manager-report` edge function** — its current output is low-value and managers don't act on it. Rebuild it around this spec rather than standing up a new function. It shares a common rule-engine module with `send-admin-pnl-report` (the admin roll-up *across* managers); this function is one scoped, high-signal email *per* manager. Guiding principle from Roland: **only send good, informative emails** — every send must earn the manager's attention so they read and act.

```
send-manager-report (edge fn — repurposed)
  ├─ resolve active managers (staff: role in manager tiers, active=true)
  ├─ for each manager:
  │    ├─ gather their work list (manager_work_lists) + the ROs on it
  │    ├─ gather time_logs (attributed via weekly_pnl silo logic)
  │    ├─ gather WOs, parts, dates for those ROs
  │    ├─ run RULE ENGINE  → structured flags[] + readiness{}     (deterministic)
  │    ├─ run AI NARRATIVE → prose from flags[] only              (LLM, summarize-not-invent)
  │    └─ render role-scoped HTML email
  ├─ write guidance_log rows (silent)
  └─ send via existing email transport (send-quote-email pattern)
```

- **Schedule:** weekday cron, ~6:00 AM CDT (`0 11 * * 1-5` UTC), mirroring the admin report. Weekend handling per §5.5.
- **Recipients (D4, locked):** each manager's own email, with **admins (Roland + Lynn) CC'd on every manager email** for historical awareness. Admin CC list via `app_config` (reuse `admin_report_recipients`).
- **Determinism:** the rule engine produces every flag and number. The LLM only writes the human-readable narrative *from* those flags — it never sources facts itself. This keeps the report accurate and auditable, which is non-negotiable given the trail may one day inform personnel decisions.

---

## 4. Section A — List Activity ("is my list being worked?")

Answers whether the manager's list is alive and where the hours are going.

| Metric | Source | Notes |
|---|---|---|
| Techs clocked into my ROs today | `time_logs` (clock_in today, ro_id ∈ my list) | live pulse |
| Hours on my list — today / WTD | `time_logs.duration_seconds`, weekly_pnl silo attribution | Mon–Sun week |
| ROs on my list getting time vs. sitting | join list → time_logs | the core "easy vs. hard" tell |
| Idle ROs (on list, no time logged in N days) | list minus recent time_logs | default N = 3 working days |

**The signal that matters most:** ROs that are *on the list* but receiving **no labor** while higher-urgency flags sit on them. That juxtaposition — "this RO is idle AND its promised date is Thursday AND its parts are overdue" — is the assistant's whole reason for existing.

---

## 5. Section B — Fire Watch (color-coded flags)

Deterministic rules → three severity bands. Each flag carries: severity, RO deep-link, the driving fact, and a one-line "why it matters."

### 5.1 Severity bands
- 🔴 **Critical** — needs action today; a customer fire is imminent or already starting.
- 🟠 **Warning** — needs action this week; will become critical if ignored.
- 🟡 **Watch** — keep an eye on it; usually a data or aging signal.

### 5.2 Flag catalog (Iteration 1)

| # | Flag | Rule | Severity | Data today? |
|---|---|---|---|---|
| F1 | Promised date due/overdue | `promised_date <= today` AND status not in completed set | 🔴 | ✅ `repair_orders.promised_date` (set on ~26% of active ROs) |
| F2 | Promised date approaching, no active work | `promised_date` within 3 days AND no time_logs in last 3 working days | 🟠 | ✅ |
| F3 | Part past ETA, near-term promised | part `eta < today` AND `date_received IS NULL` AND RO `promised_date` within ~3 days | 🔴 | ✅ `parts.eta`/`date_received` (83 open parts past ETA lot-wide) |
| F4 | Part past ETA (general) | part `eta < today` AND `date_received IS NULL` | 🟠 | ✅ |
| F5 | Part ordered, no ETA, aging | `date_ordered` > 3 business days ago AND `eta IS NULL` AND not received | 🟠 | ✅ (mirrors send-parts-report "call the supplier") |
| F6 | Reminder due | reminder/important-note mechanism (see §5.4 data dependency) | 🟠 | ⚠ depends on reminder storage — see §5.4 |
| F7 | Customer asking status | inbound Sendblue message classified as a status question | 🔴 | ❌ gated on Sendblue inbound (Q6–Q8) — schema slot reserved |
| F8 | Aging tech-done, not closed | WO `tech_done_at` set, `completed_at` null, > 6 business days (matches R9) | 🟡 | ✅ `service_work_orders.tech_done_at/completed_at` |
| F9 | Idle RO on list | on list, no time logged in N working days, not completed | 🟡 | ✅ |

> F7 ships dark with its schema slot in place so the inbound wire-in is additive later.

### 5.3 Weekend / Monday escalation
Promised dates and ETAs that fell on Sat/Sun must escalate on the **Monday** run, not silently pass. Rule: on a Monday run, treat "due/overdue" as `<= today` (which naturally includes the weekend), and additionally tag anything that came due Sat–Sun with a "rolled over the weekend" note so it doesn't read as brand-new-today.

### 5.4 Reminder data dependency (F6 — to resolve)
Confirmed candidate stores exist: **`notes`** (likely a typed note convention) and **`scheduled_notifications`**. F6 should map onto whichever already carries manager reminders — most likely a `notes.type` value or a `scheduled_notifications` row — rather than adding a new table. Confirm the exact convention before building F6. **Decision needed (D3).**

### 5.5 Fire Watch covers the WHOLE list
Per Roland's directive: flags are computed for **every RO on the list, including the ones NOT being worked on.** Idle is not a reason to skip an RO — it's often the reason to flag it harder.

---

## 6. Section C — P&L Readiness (the CFO core)

A per-manager **completeness score** plus the specific missing inputs, framed as dollar consequences. This is the fairest possible accountability metric for iteration 1 because it measures only whether the manager did **their own data job** — nothing subjective — and it is the lever that drags data trust toward the > 90% gate.

### 6.1 Why it leads the financial story
Combed from live data this session:

| Reality (active, non-training ROs) | Count | P&L impact |
|---|---|---|
| Active ROs with **no work order at all** | **82 / 117 (70%)** | revenue invisible — P&L cannot see the RO |
| WOs on active ROs valued at **$0/blank** | 9 of 50 | labor spent with no margin to measure |
| Unattributed labor (Shop/blank), last 14d | 39 / 294 (13%) | inflates Overhead, starves silo margins |
| Open parts with **no `service_silo`** | 114 | drives the ~$19k Unattributed row |
| Active staff with no `hourly_rate` (ex-admin) | 4 (≈3 are $0 testers) | that labor cost reads $0 → silo looks falsely profitable |
| WO tech-done but not manager-completed | 1 (grows) | revenue earned, never recognized |

### 6.2 Readiness checklist (per manager, scoped to their list/silo)

**Revenue defined**
- R1 — every RO on my list has at least one WO. *(F: ROs with no WO)*
- R2 — every WO has a non-zero `dollar_value`.
- R3 — every WO has the correct `service_silo`.

**Labor captured**
- R4 — my techs' hours land in a silo, not Shop/blank. *(unattributed labor)*
- R5 — every tech who logged time has an `hourly_rate` set.
- R6 — no phantom-hour days (auto_eod ⚠ pattern, already detected in worklist-report v1.18).

**Cost matched**
- R7 — every open part on my ROs has a `service_silo`. **Also surfaced in the Parts Manager email** (D-parts): the parts manager has the bandwidth to clear silo-less parts lot-wide, so the 114 untagged open parts appear as an actionable list in *his* report too, not only the silo managers'.
- R8 — parts exist only on ROs that have a WO to book them against.

**Revenue recognized**
- R9 — WOs marked tech-done get manager-completed within **6 business days** (the Done-Done event). *(Widened from 3 days per Roland — recognition can legitimately span more than one work week; revisit once adoption data shows the real distribution.)*

### 6.3 Score
```
readiness_score = (checks passing) / (checks applicable) × 100
```
Only **applicable** checks count (a parts manager isn't dinged for R6). Render as a single % with the failing items listed beneath, each as a dollar-framed sentence and a deep link. Trend the score over time (store daily snapshot — feeds both the manager's progress view and the §1.1 data-trust gate).

### 6.4 Margin-sanity & efficiency flags (activate once WOs exist)
- M1 — WO where logged labor cost > 55% of its `dollar_value` (underpriced or overrun).
- M2 — WO marked tech-done with **zero** recorded labor (completed with no time = integrity red flag).
- M3 — **Actual vs. estimated hours overrun:** effective actual hours exceed the WO's estimate by > ~30%. Now buildable: `service_tasks` already carries `est_hours`, `actual_hours`, and `billed_hours` per sub-item, and the WO-level `estimated_hours` (added S109) backstops basic WOs. **Effective WO estimate = sum of task `est_hours` when the WO has tasks, else WO-level `estimated_hours` (COALESCE — tasks win, never double-counted).** This is the true labor-efficiency signal, not just labor-as-%-of-revenue.

---

## 7. Guidance Log (silent capture, for the future judge)

Captured from day one; shown to no one in iteration 1.

```
manager_guidance_log
  id              uuid pk
  run_date        date
  manager_email   text
  ro_id           text/uuid
  flag_code       text        -- F1..F9, R1..R9, M1..M2
  severity        text        -- critical|warning|watch
  recommendation  text        -- what the report told them to do
  -- adherence resolved on a later run, not at write time:
  adhered         boolean     -- did the flagged condition get acted on by next run?
  resolved_at     timestamptz
  created_at      timestamptz default now()
```

- **Adherence** is computed by the *next* run comparing prior flags to current state (e.g., did the idle RO get time? did the overdue part get received or its ETA updated?).
- **Outcome attribution stays human-reviewed.** The log records the *pattern* (recommended X, manager did/didn't do X). Proving "skipping RO X caused complaint Y" is the hard, judgment-laden part and is explicitly *not* automated in any near phase.
- Add a **"fires prevented" counter** alongside any future avoidance log — the tool should take credit *for* managers, not only build a case against them. Balances the record and aids adoption.

---

## 8. Data dependencies & prerequisites

| Need | Status | Action |
|---|---|---|
| `repair_orders.promised_date` | ✅ exists, ~26% populated | report's R1/F1/F2 flags drive population up |
| `parts.eta / date_ordered / date_received / service_silo` | ✅ exists | none |
| `service_work_orders.dollar_value / tech_done_at / completed_at / service_silo` | ✅ exists | none |
| `time_logs` silo attribution | ✅ via weekly_pnl logic | reuse |
| `staff.hourly_rate` | ✅ exists (gaps = R5 flag) | none |
| Reminder store (F6) | ⚠ unconfirmed | **D3** — locate or defer |
| Inbound customer messages (F7) | ❌ Sendblue inbound not built | reserve slot; wire later (gated Q6–Q8) |
| `service_tasks.est_hours / actual_hours / billed_hours` | ✅ **already exist** (richer than first assumed) | per-sub-item labor estimate, actuals, and billed — 68% of active WOs already have task estimates. Enables true actual-vs-estimate efficiency (M3). |
| `service_work_orders.estimated_hours` | ✅ **added + wired (Session 109, v1.451)** | migration `wo_estimated_hours.sql` (nullable numeric) + WO modal "Estimated Hours — basic WO fallback" field + save path. Effective estimate = task rollup else this column. Live in prod DB; UI on `pre-prod` soak. |

---

## 9. Build phases

- **P1 — Rule engine + List Activity + P&L Readiness, admin-preview only.** Deterministic flags/score, rendered to an admin test recipient first (no manager emails yet). Validate numbers against the live dashboard.
- **P2 — Fire Watch flags F1–F5, F8, F9 + deep links.** Color-coded, whole-list coverage, weekend escalation.
- **P3 — AI narrative layer.** LLM summarizes the structured flags into "your day in priority order"; strict no-invented-facts prompt; falls back to rule-only text if the LLM is unavailable.
- **P4 — Per-role variants + per-manager send + guidance-log capture.** Silo / parts / insurance lenses; switch from admin-preview to real manager recipients; begin silent logging.
- **P5 (later) — F7 inbound flag** (post Sendblue Q6–Q8) and **estimated_hours** efficiency.
- **Judge phase (gated)** — scoring, revenue goals, carrot/stick. Only after data-trust > 90% and human-in-loop policy locked.

---

## 10. Open decisions

- **D1 — Edge function — ✅ LOCKED:** repurpose existing `send-manager-report`, sharing a rule module with `send-admin-pnl-report`. Principle: only send high-signal emails managers will act on.
- **D2 — Idle threshold N:** default 3 working days for F2/F9 idle detection. *(Claude's call — keep 3; revisit with adoption data.)*
- **D3 — Reminder source (F6):** map onto `notes` (typed convention) or `scheduled_notifications` — confirm exact convention at build time before wiring F6.
- **D4 — Admin visibility — ✅ LOCKED:** Roland + Lynn CC'd on **every** manager email (historical awareness), via `app_config.admin_report_recipients`.
- **D5 — Manager roster:** recipients = `manager` + `parts_manager` + `sr_manager`. Insurance variant keys off the `user_roles` "Insurance WO Writer" grant (no distinct `staff.role`). RO-set resolution: silo managers via their `manager_work_lists`; parts manager gets the lot-wide silo-less-parts list (R7). *(Claude's call — confirm at build.)*
- **D6 — Margin threshold — ✅ default set:** M1 fires at labor cost > 55% of WO `dollar_value`; tune after live data.
- **D-R9 — Done-Done window — ✅ LOCKED:** 6 business days (was 3).
- **D-est — estimated_hours — ✅ LOCKED:** build it (Session 109).

---

## 10.5 P1 rule-engine validation (Session 109, live data — Ryan)

Validated the deterministic engine against the live DB on Ryan's 21-RO list (paint_body + roof). All numbers computed correctly:

| Signal | Value |
|---|---|
| List ROs | 21 |
| Hours logged last 7d | 117.9h (list is active) |
| Idle ROs (no time in 3 working days) | 14 of 21 |
| R1 no work order | 3 |
| R2 WOs valued $0 | 5 |
| R3 null-silo WOs | 0 |
| R7 silo-less open parts | 19 |
| R9 stuck tech-done > 6 business days | 0 |
| F1 promised due/overdue | 3 |
| F4 parts past ETA | 9 |
| **RO-level readiness** | **48% (10 of 21 fully P&L-ready)** |

**Two guard rules discovered (must add at build):**
1. **Sentinel/invalid dates** — one flagged "fire" had `promised_date = 0001-01-01` (reads as 739,780 days overdue). Guard: a promised/ETA date only counts as a real flag when it's a sane value (e.g., year ≥ 2020). Invalid dates become their own readiness flag ("promised date is invalid — fix it"), NOT a Fire Watch overdue.
2. **Exclude soft-deleted / junk ROs** — a `…DELETE` test record appeared on the list. The report must apply the same exclusion filter the reports use (soft-deleted + training) before computing anything, or junk pollutes both the fires and the readiness denominator.

Net: the real fire on Ryan's list was a single legitimate 2-days-overdue RO (Aaron Stepich, On Lot) — exactly the signal the report exists to surface, once the two guards filter the noise.

## 11. Testing matrix (to expand at build)

- Readiness math on a manager with known gaps (seed a no-WO RO, a $0 WO, a silo-less part) → verify each fails the right check and the % is correct.
- Fire Watch severity banding on boundary dates (promised today / +3 / past).
- Weekend rollover (Monday run picks up Sat/Sun due dates).
- Per-role applicability (parts manager not dinged for R6; silo manager not dinged for parts-only checks).
- AI narrative contains no fact absent from the structured flags (adversarial check).
- Guidance-log adherence resolves correctly on a simulated next-day run.
```
