# PRVS Dashboard — Session 71 Weekend Regression QA/QC

**Baseline:** v1.417 (index.html) · v1.33 (checkin.html) · v1.14 (worklist-report) · v1.8 (customer-checkin) · v1.1 (closed-ros) · v1.1 (analytics) · v2.1 (solar) · v1.3 (time-off) · commit `f168970` on `main`
**Run on:** Production (https://patriotsrv.github.io/rv-dashboard/) — hard refresh first (Cmd-Shift-R or device-side clear cache)
**Tester:** ___________________________   **Date:** _________   **Time:** _________

> Mark each row **PASS** / **FAIL** / **N/A**. For any FAIL, capture:
> (a) what you did, (b) what you expected, (c) what actually happened, (d) screenshot if visual.
> File issues at the bottom of this doc or in Enhancement Requests (🪔 Wishes button).

---

## Section 1 — v1.33 Fix Verification (HIGH PRIORITY)

These tests verify the bug fixed in Session 71 stays fixed.

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 1.1 | Pick any RO with `status != 'In progress'`. Open `checkin.html?ro=<RO_ID>` on phone. Click Clock In. | Status changes to `'In progress'` (lowercase p). Blue badge color. Audit log gets new row attributed to `<You> (auto via clock-in)`. RO Status Notes gets timestamped `⏱ AUTO-STATUS:` entry. | | |
| 1.2 | Repeat 1.1 on **a tablet/laptop** (not phone) — verify casing is correct on desktop too. | Same as 1.1. | | |
| 1.3 | Open the Edit RO modal on the RO from test 1.1. Open the status dropdown. | The dropdown shows `In progress` correctly selected (highlighted). Pre-v1.33 this would have shown nothing selected. | | |
| 1.4 | Verify Spanish translation: toggle dashboard to Spanish (globe button), find the same RO. | Status badge reads "En Progreso" — not "In Progress" (literal English fallback). | | |
| 1.5 | Click the "In progress" filter button on the board. | The RO from test 1.1 is included in the filter results. | | |
| 1.6 | Run audit query (Supabase SQL Editor): `SELECT user_name, COUNT(*) FROM audit_log WHERE field_changed='status' AND new_value='In progress' AND changed_at >= NOW() - INTERVAL '1 day' GROUP BY user_name ORDER BY 2 DESC;` | At least one row with `user_name` ending in `(auto via clock-in)` — confirms the v1.33 audit-log writes are landing. | | |
| 1.7 | Run ghost-write enumerator (the SQL from Session 71 chat — "GHOST-WRITE ENUMERATOR"). | Zero rows where `current_db_status = 'In Progress'` (capital P) — confirms historical backfill ran and no new capital-P writes are happening. | | |

---

## Section 2 — Status Workflow (every dropdown path)

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 2.1 | New RO form → save with status="Not On Lot". | RO appears with gray badge, no date_arrived. | | |
| 2.2 | Change that RO's status via the card dropdown from "Not On Lot" → "On Lot". | Status flips to "On Lot", green badge, `date_arrived` auto-fills today. Audit log records change. | | |
| 2.3 | Walk an RO through every status in order: On Lot → Awaiting Approval → Awaiting parts → Ready to Work → In progress → Repairs Completed → Waiting for QA/QC → Ready for pickup → Delivered/Cashed Out. | Each transition logs an audit_log entry. `pct_complete` updates per STATUS_PROGRESS_MAP. Badge color changes correctly. | | |
| 2.4 | Compact view (≤768px): tap row body to expand. Use inline status dropdown to change status. | Same audit + status update as test 2.3. Panel collapses after change. | | |
| 2.5 | Schedule modal (📅 button): create a calendar event for an RO. | Status auto-flips to "Scheduled" with `pct_complete=45`. Audit log records change. | | |
| 2.6 | Saturday 5 PM CDT — verify the cashiered archiver fires. Set an RO to "Delivered/Cashed Out" before Saturday. | After Saturday, the RO should be in `cashiered` table and removed from `repair_orders`. (Known issue from Session 71: 2 historical rows didn't archive — see Bug #4 follow-up.) | | |

---

## Section 3 — RBAC Tiers (role-based access)

Test each role with a separate account (or sign in as them temporarily).

| ID | Role | Test | Expected | Result | Notes |
|---|---|---|---|---|---|
| 3.1 | Admin (Roland) | All header buttons visible: Time Off, Closed ROs, Recently Deleted, Wishes, Search, Customer Check-In, Settings | All present | | |
| 3.2 | Sr Manager (Kevin, Ryan) | Header: Time Off, Closed ROs, Wishes, Search, Customer Check-In. WO buttons available. | All present | | |
| 3.3 | Manager (silo manager) | Header: Time Off, Closed ROs, Wishes, Search, Customer Check-In. WO buttons available on own silo. | All present | | |
| 3.4 | Parts Manager (Bobby) | Set Parts Status button visible on RO cards. | Present | | |
| 3.5 | Insurance WO Writer (Brandon) | Walk through Tests 1–7 from Session 69 GH#40 plan | All pass | | |
| 3.6 | Tech | NO admin buttons. Can clock in/out via checkin.html. | Clean tech view | | |
| 3.7 | Lynn (Admin-only, no silo) | After hard refresh + sign-out/in: Time Off + Closed ROs + Wishes + Search + Customer Check-In + Settings all visible. | All present (regression for v1.417 fix) | | |

---

## Section 4 — Tech Check-In Flow (heavily exercised by v1.33)

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 4.1 | Clock in on an RO. Clock out. | Both events log to `time_logs`. Status flips to "In progress" on clock-in only. | | |
| 4.2 | Clock in on RO-A. While clocked in, open checkin.html for RO-B. | "Still Clocked In" prompt OR cross-RO trigger auto-closes RO-A. Both should work. | | |
| 4.3 | Shop RO clock-in: open a `ro_type='shop'` RO. | Shop activity picker appears (5 options). Required before Clock In. Selected activity stored in `time_logs.shop_activity`. | | |
| 4.4 | Offline test: turn on airplane mode, clock in. | Clock-in queued offline. When network returns, the queue drains, time_logs row appears. | | |
| 4.5 | Spanish toggle on checkin.html. | All UI strings translate. Shop activity picker labels translated. | | |
| 4.6 | Click Clock In rapidly 3x in 2 seconds. | Only ONE time_logs row created (Phase 1 dedupe guards). | | |
| 4.7 | After v1.33: open audit_log for any RO a tech just clocked into. Find the `(auto via clock-in)` row. | Row exists, attributed to tech, old/new values correct casing. | | |

---

## Section 5 — Parts Workflow

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 5.1 | Submit a parts request on an RO. | Parts chip on card flips to "Requested". Email fires to repair@. Sourcing row in parts table. | | |
| 5.2 | Set parts status to Outstanding / Received / Estimate via Parts Status modal. | Chip updates. Audit + status note logged. | | |
| 5.3 | "Notify Requester — Parts Ordered" button. | Email fires to requester. Status note logged. | | |
| 5.4 | Set ETA on a part via Manage Parts. | ETA auto-notification email fires. | | |
| 5.5 | Morning + afternoon parts report (Mon-Fri 8am / 3pm CDT). | Both emails arrive. Section 1 excludes estimate-only parts and soft-deleted ROs. | | |

---

## Section 6 — Work Orders (incl. GH#40 Insurance WO Writer)

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 6.1 | Build a WO on an RO. Add tasks. Save. | WO appears with tasks. Total estimated hours rolls up. | | |
| 6.2 | Mark a task complete (manager). | Task status changes. Audit logged. | | |
| 6.3 | Save WO as Template. Apply template to another RO. | Tasks copied with correct silo. | | |
| 6.4 | As Brandon (Insurance WO Writer): create cross-silo WO for an RO. | Banner appears. Pricing editable until non-zero. Tech assignment disabled. | | |
| 6.5 | As Brandon: try to mark a task as "completed" or assign a tech via DevTools (direct DB call). | Trigger blocks the write — Postgres error returned. | | |
| 6.6 | As Riley (silo manager): regression — unrestricted WO building on own silo. | Full WO controls. | | |

---

## Section 7 — Customer Check-In (front desk)

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 7.1 | New Customer Entry mode — submit a lead. | New RO created with status="Scheduled". `lead_staff_notify` email fires. | | |
| 7.2 | RV Customer Drop Off — Returning Customer search by name. | Searches both `repair_orders` AND `cashiered` (v1.8 fix). Shows "Past customer" pill for cashiered hits. | | |
| 7.3 | RV Customer Drop Off — leaving today. | RO created with status="On Lot", `date_received=today`, RAF email fires with embedded signature. | | |
| 7.4 | RV Customer Drop Off — scheduled date. | RO with status="Scheduled", `planned_dropoff_date` set, auto-reminder scheduled for 8am CDT day before. | | |
| 7.5 | Warranty drop-off mode. | RO with `ro_type='warranty'`, Critical urgency, $0, lead_staff_notify fires with warranty header. | | |

---

## Section 8 — Compact Mobile View (≤768px)

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 8.1 | Open dashboard on phone in compact view. | 3-column grid (photo / summary / chevron). Desktop 6-col hidden. | | |
| 8.2 | Tap row body. | Expand panel slides open with status, urgency, quick actions. | | |
| 8.3 | Change status from compact expand. | Status updates, audit logged, panel collapses on re-render. | | |
| 8.4 | Photo bleed test: verify photo stays at 100% column width on mobile, doesn't bleed into summary. | Clean column boundary. | | |

---

## Section 9 — Search, Filters, Closed ROs, Time Off, Solar

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 9.1 | Unified Search: search by customer name, RO ID, VIN, RV, phone, parking spot. | Each hits all 10 fields. Matches highlighted. | | |
| 9.2 | Filter buttons: status, urgency, RO type, service silo. | All filter correctly. Multiple filters compound (AND). | | |
| 9.3 | Closed ROs page: search/sort/reactivate. | Reactivation inserts back to `repair_orders` and deletes from `cashiered`. | | |
| 9.4 | Time Off: submit Full Day + Partial Day requests. | Both save. Calendar chips show first name + hours. Email notifications fire. | | |
| 9.5 | Solar quote: build a quote, generate PDF. | PDF downloads, includes battery Wh (GH#11 still TODO — check current state). | | |

---

## Section 10 — Edge Cases & Regression

| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 10.1 | Soft-delete an RO via Admin Delete RO. | Row hidden from board. Appears in Recently Deleted modal. Auto-purges in 7 days. | | |
| 10.2 | Restore from Recently Deleted. | Row reappears on board. | | |
| 10.3 | Duplicate manager: create two ROs with same customer/RV/date. | Merge Dupes button appears. Merge consolidates correctly. | | |
| 10.4 | Insurance scan: upload insurance PDF on an RO. | claude-vision-proxy extracts data, populates form. | | |
| 10.5 | Sign out and back in (Google SSO + Supabase). | RBAC role buttons reappear correctly. | | |
| 10.6 | Refresh dashboard after 90+ seconds idle. | Data still loads (no stale auth error). | | |

---

## Issues Logged During QA

> Add any failures here as you go. One bug per row.

| # | Section | Test ID | Description | Severity | Priority |
|---|---|---|---|---|---|
|   |   |   |   |   |   |
|   |   |   |   |   |   |
|   |   |   |   |   |   |

**Severity:** 🔴 blocking · 🟠 high · 🟡 medium · 🔵 low
**Priority:** P0 (fix Mon) · P1 (this week) · P2 (next sprint) · P3 (backlog)

---

## Sign-Off

- [ ] All Section 1 tests pass (v1.33 verification — MUST PASS)
- [ ] Section 2 dropdown paths verified
- [ ] Each role tested (Section 3)
- [ ] Tech check-in fully exercised (Section 4)
- [ ] No regressions in parts / WO / customer-checkin / time-off
- [ ] All FAIL rows logged in Issues table above

Tester signature: ___________________________   Date completed: _________

---

## Reference

- v1.33 commit: `f168970`
- Pre-fix baseline tag (rollback point if needed): `v1.409-stable`
- Ghost-write enumerator query: see Session 71 chat or `CLAUDE_CONTEXT.md` GH#29c section
- Casing backfill SQL: run via Supabase SQL Editor; verify with `SELECT COUNT(*) WHERE status='In Progress'` returns 0
