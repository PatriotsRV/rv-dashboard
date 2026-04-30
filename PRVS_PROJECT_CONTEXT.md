# PRVS RO Dashboard — Claude Project Context
> **This file lives in the Claude Project knowledge base.**
> It is the mobile-accessible bridge between the Claude Project (iPhone) and the Cowork session (laptop).
> Updated at the end of every Cowork session as part of the STOP checklist.
> The full technical memory lives in CLAUDE_CONTEXT.md inside the rv-dashboard repo.

---

## 🗂 Project Identity

| Field | Value |
|---|---|
| **Project** | Patriots RV Services (PRVS) Dashboard |
| **Owner** | Roland Shepard — roland@patriotsrvservices.com |
| **Live URL** | https://patriotsrv.github.io/rv-dashboard/ |
| **GitHub Repo** | https://github.com/PatriotsRV/rv-dashboard |
| **Current Version** | v1.413 (index.html) · v1.9 (worklist-report.html) · **v1.31 (checkin.html)** · v1.6 (customer-checkin.html) · **v1.2 (time-off.html)** · send-parts-report v1.8 — Session 62 |
| **Supabase Project** | axfejhudchdejoiwaetq |
| **Cowork Workspace** | rv-dashboard folder on Roland's laptop |

---

## 📐 Implementation Specs (2026-04-10 — Perplexity)

> **Five implementation specs in `docs/specs/`.** Written by Perplexity Computer, reviewed by Roland, merged via PR #15. Claude Cowork executes one session/phase at a time.

| Spec | Sessions | Priority | Status |
|---|---|---|---|
| `SECURITY_REMEDIATION.md` — 10 security issues (XSS, RBAC, auth gaps, API key exposure, etc.) | S1–S7 | 🔴 **ASAP** | ✅ **ALL COMPLETE** — 2026-04-11 |
| `TWILIO_SMS_SPEC.md` — Full SMS integration replacing Kenect | Phase 1–3 | 🔴 After port | ⏳ Not started |
| `TOAST_SYSTEM_SPEC.md` — Replace alert() with toast notifications | 1 session | 🟠 High | ✅ **COMPLETE** — 2026-04-11 |
| `UNIFIED_SEARCH_SPEC.md` — Global search bar | 1 session | 🟠 High | ✅ **COMPLETE** — 2026-04-12 |
| `MODULARIZATION_ROADMAP.md` — Split index.html into 18 ES modules | Phase 0–19 | 🟡 Long-term | ⏳ Not started |

**Next up:** Twilio SMS after number port, then Modularization long-term

**Workflow:** Perplexity researches/writes specs → pushes to `docs/specs/` → Claude Cowork reads and executes

---

## 📋 ACTIVE TODO LIST
> Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium
> Use this list from your iPhone to log updates between laptop sessions.

### 🔴 Blocking / Top Priority
- ~~**Security Remediation**~~ ✅ **ALL 10 ISSUES COMPLETE** — 2026-04-11.
- **GH#1 — Twilio number port** — Full guide in `docs/specs/TWILIO_SMS_SPEC.md` Section 2. Blocks customer-facing SMS (Stage 3). ⏳ Roland action — can wait until tech SMS (Stage 1) is stable
- **GH#4 v1 — Twilio Stage 1 tech SMS reminders** — Session 53 completed account setup, number purchase (+19404882313), A2P Brand approval, Campaign submission. **Session 55 (2026-04-25): Campaign REJECTED (code 30909, unverifiable verbal consent) → RESUBMITTED employee-only scope with Employee SMS Consent Form (.docx + .pdf built). PENDING TCR RE-VETTING (1-5 days from 2026-04-25).** Roland to-do: (1) Add PRVS logo to Employee SMS Consent Form + print/sign one copy, (2) distribute to staff for written opt-in, (3) grab Twilio Auth Token from Console → save to password manager. After TCR approval (~30 min Cowork): set 3 Supabase secrets, deploy edge functions, configure webhook, smoke test. ⏳ Blocked on A2P re-approval

### 🟠 High Priority
- **GH#36 — Realtime sync + auto-refresh** (Session 56) — **Phase 1 (~30 min):** add `setInterval(loadDataFromSupabase, 90_000)` to dashboard pages (index.html, worklist-report, closed-ros, analytics). **Phase 2 (~1 session):** Supabase Realtime channel subscription on `repair_orders` for instant cross-user sync. Phase 2 supersedes Phase 1. ⏳ Open — Phase 1 first
- ~~**GH#37 — Modal readability**~~ ✅ **DONE v1.413 (Session 60)** — opaque `.modal-content` CSS + darker overlay. All 5 affected modals fixed.
- **GH#31 — Finish Work List Reporting (MAJOR umbrella)** — v1.3–v1.9 shipped. ~10 sub-items remaining: aggregate dollar_value rollups, per-RO enriched chips, velocity/throughput analytics, alt chart sort orders, inline time-edit UI, time-window filter, per-silo labor attribution, manager scoring KPI, AI manager-of-managers groundwork, export/print, comparison/trending. 🔄 Initiative — many sessions
- **GH#33 Phase 2 — Systemic historical dupe scan across all time_logs** — After Phase 1 baseline (1 week), scan full table for (tech, ro) pairs with 2+ clock-ins within 30s. Preview → Roland reviews → batch delete. ⏳ Open — after 1 week of Phase 1 baseline
- **GH#26 — New RO Statuses: "Not on Lot" + "On Lot"** (Session 51) — Verify CHECK constraint, filter buttons + badge styles, wire customer-checkin modes. Pairs with GH#27. ⏳ Open
- **GH#27 — Drop-Off form RO lookup + pre-populate** (Session 51) — Look up existing `status='Not on Lot'` RO by phone/email/name. Pre-populate fields. Multi-match → picker. On submit: transition RO + audit + fire GH#28 email. ⏳ Open
- **GH#28 — Customer Arrived / Dropped Off staff email** (Session 51) — New `customer_arrived` email type. Action banner. ⏳ Open
- **GH#23 — Morning Manager Report (data quality banner fix)** — $0.00 warning not firing for sr_manager reports. 🔄 In Progress
- **GH#23 — Map service_silo values to each manager in staff table** — Needed for per-silo filtering. ⏳ Open
- **GH#20 — Slack Integration (remaining triggers)** — Test `ro_urgency_critical`, `part_received`, `warranty_ro_opened`. 🔄 In Progress
- **GH#5c — Polish Work Orders UI** — Mobile layout, remaining bugs. 🔄 In Progress
- **GH#17 — Customer Check-In Page** — Front desk RO intake + RAF e-signature. Session 50: Lead Staff Notification built; mode rename; shared-secret auth. Living form — Roland will add fields pre-go-live. 🔄 In Progress
- **GH#6 — QuickBooks Payroll Integration** (Session 57, IN PROGRESS) — Push `time_logs` + `time_off_requests` weekly to QB as TimeActivity entries. Intuit Developer app created + App Details 100% complete. **Blocked on: Compliance section (0% / ~40 min).** Roland actions to complete: (A) Complete Compliance at developer.intuit.com → PRVS Dashboard → Keys and credentials → Production → Compliance. (B) Copy production Client ID + Secret to password manager. (C) Run OAuth Playground → authorize Patriots RV QB company → capture Realm ID + Refresh Token. (D) Store 4 Supabase secrets: `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REALM_ID`, `QB_REFRESH_TOKEN`. (E) Look up QB Employee IDs (QB → Payroll → Employees → URL has ID). (F) Look up QB Pay Item IDs (Regular, Sick, Vacation, Personal, General). Then Claude builds: `qb_employee_id` on staff, `qb_pay_items` config table, `qb_sync_log`, `quickbooks-sync` Edge Function, weekly pg_cron. 🔄 Blocked on Roland Compliance + credentials

### 🟡 Medium Priority / Open
- **GH#4 v2 — Twilio Stage 2** — wire 4:45 PM reminder pg_cron + smoke-test. ⏳ Blocked on GH#4 v1
- **GH#4 v3 — Twilio Stage 3 customer SMS** — after GH#1 number port. ⏳ Blocked on GH#1
- **GH#34 — Offline-queue clock_out race with auto-logout** — edge case, low priority until observed in production. ⏳ Open
- **Migrate lead_staff_notify recipient to `app_config`** — Currently hardcoded to repair@patriotsrvservices.com. ⏳ Open
- **Test remaining lead_staff_notify variants** — Warranty-only, hybrid drop off, returning customer variants. ⏳ Open
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah. ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest from history. ⏳ Open
- **GH#21 — checkin.html Auth Persistence Fix** — Add persistSession + storageKey + getSession() restore. ⏳ Open
- **GH#20b — QR print layout update** — RV Owner Name + RV Info alongside key-tag QR for 4.3"×6.3" laminating pouch. ⏳ Open
- **GH#24 Phase 2 — Shop Operations: Parts Returns** — Reverse-direction parts workflow. ⏳ Open
- ~~**GH#24 Phase 3 — Shop Operations: Shop Tasks + Time Logging**~~ ✅ **DONE v1.31 (Session 61)** — Shop activity picker on checkin.html, `shop_activity` column on `time_logs`. **⚠️ Roland must run 2 SQL migrations in Supabase SQL Editor:** `shop_activity_time_logs.sql` + `cron_archive_cashiered_ros.sql`
- **GH#8 — Switchblade tile view** — Compact tile layout mode. ⏳ Open
- **Update solar parts pricing** — Current Epoch + Victron catalog pricing. ⏳ Open
- **`isManagerOrAbove()` helper refactor** — Consolidate 5+ scattered role checks. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **Complete QB Compliance section** — developer.intuit.com → PRVS Dashboard → Keys and credentials → Production → Compliance (~40 min). 🔴 BLOCKS GH#6
- **Supabase: Maximize log retention** — Settings → Logs. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts notifications. ⏳ Roland action
- **GitHub Release v1.410/v1.411/v1.411-hotfix/v1.412/v1.413** — Optional: tag/release individually or wait for next consolidated release. ⏳ Roland action — optional
- **Modularization** — Long-term. Spec ready in `docs/specs/MODULARIZATION_ROADMAP.md`. ⏳ Not started

---

## ✅ Recently Completed
- ✅ **time-off.html v1.2 — GH#38 partial day + employee dropdown removal (2026-04-30, Session 62, commits `8ec431d` + `5bf2552`)** — v1.1: All users now submit time off for themselves only (employee dropdown removed from request modal). v1.2: Full Day / Partial Day toggle; `partial_hours NUMERIC(4,1)` column on DB (NULL = full day, 0.5–8.0 = partial hours); fractional day stats (e.g., 8.75 days); calendar/list view shows `⏱ Xh` chips for partials; reason field required for all requests. Migration `add_partial_hours_to_time_off.sql` run by Roland 2026-04-30.
- ✅ **checkin.html v1.31 — GH#24 Phase 3 Shop Activity Picker (2026-04-29, Session 61, commit `1b54a319`)** — Techs clocking into Shop ROs now see a purple activity-chip grid (Shop Cleanup, Moving RVs, Work Break, Running Errands, Part Pickup) instead of the service-type picker. Activity stored in new `time_logs.shop_activity` column. Clock-out summary shows "Activity" label. Spanish translations included. Offline queue carries the activity automatically. **Requires: `shop_activity_time_logs.sql` migration run in Supabase SQL Editor.**
- ✅ **Saturday Cashiered RO Archiver — pg_cron (2026-04-29, Session 61, commit `1b54a319`)** — Replaces the old Google Sheets Saturday 5 PM archiver. `archive_cashiered_ros()` SECURITY DEFINER function + pg_cron job every Saturday at 22:00 UTC (= 5 PM CDT). Moves only `status='Delivered/Cashed Out'` ROs to the `cashiered` table, then hard-deletes from `repair_orders`. Idempotent (ON CONFLICT DO NOTHING). Analytics page will see archived ROs automatically. **Requires: `cron_archive_cashiered_ros.sql` migration run in Supabase SQL Editor.**
- ✅ **v1.413 — GH#37 Modal readability fix (2026-04-28, Session 60, commits `263d528` + `6ee6da6`)** — Schedule Notification, Parts Request, Parts Request Details, Parts Status, and Recently Deleted modals were all transparent — `.modal-content` CSS class had zero definition (no background). Fixed: added `.modal-content` rule with opaque `var(--bg-surface)` background, border, border-radius, padding, shadow, animation. Also bumped `.modal-overlay` from `rgba(0,0,0,0.8)` → `rgba(0,0,0,0.88)` + `backdrop-filter:blur(3px)`. Roland confirmed: "Looks great."
- ✅ **send-parts-report v1.8 — Parts Report estimate bug fixed (2026-04-28, Session 59)** — Bobby was seeing 5 estimate-only ROs in Section 1. Fix: added `.not("parts_status","eq","estimate")` + `.is("deleted_at",null)`. Commit `521aeb9`.
- ✅ **Work Orders RLS — Sr Manager bypass added (2026-04-28, Session 59)** — Kevin McHenry had no WO access. New `is_sr_manager_or_admin()` DB function + 5 policy updates. Commit `042d723`.
- ✅ **customer-checkin.html v1.6 — 9 UX improvements (2026-04-27, Session 58)** — Photo optional, RAF email forced, expanded email summary, CID inline signature, drop-off Q moved to bottom, fixed version badge. Commits 760bdef→28948b9.
- ✅ **GH#38 Phase 1 — time-off.html v1.0 SHIPPED (2026-04-26, Session 57)** — Standalone time-off page. Calendar + list views. 3-trigger notification system. 🏖 Time Off header button on index.html.

---

## 📱 How to Use This Project from Your iPhone

**To add a TODO item:**
> "Add to TODO (high priority): [describe the task]"

**To mark something done:**
> "Mark as done: [task name or description]"

**To log an idea for later:**
> "New idea: [describe it] — add as low priority TODO"

**To check what's next:**
> "What are my highest priority open items?"

**At your next laptop session**, tell Claude Cowork:
> "Here are my iPhone updates since last session: [paste or summarize the above]"
Claude will merge them into CLAUDE_CONTEXT.md automatically.

---

## 🏗 Tech Stack (quick reference)
- **Frontend:** Vanilla JS single-file `index.html` — deployed via GitHub Pages
- **Database:** Supabase (PostgreSQL) — project ref `axfejhudchdejoiwaetq`
- **Auth:** Google Identity Services → Supabase `signInWithIdToken`
- **Storage:** Supabase Storage (`rv-media` bucket)
- **Edge Functions:** `roof-lookup` (AI), `send-quote-email` (email — v1.9), `send-parts-report` (cron), `send-er-report` (cron), `claude-vision-proxy` (estimate scanner), `slack-notify` (Slack webhooks), `send-manager-report` (cron — GH#23), `process-scheduled-notifications` (cron — scheduled notifications)
- **SMS:** Twilio (planned — full spec in `docs/specs/TWILIO_SMS_SPEC.md`)
- **Roles:** Supabase RBAC via `user_roles` table — Admin, Sr Manager, Manager, Parts Manager, Tech

---

## 🔑 Key Rules (for Claude when working in this project)
- The authoritative technical memory is **CLAUDE_CONTEXT.md** in the GitHub repo — always read it at laptop session start
- Never use `accessToken` as an auth guard for Supabase — use `getSB() && supabaseSession`
- Always run `bash scripts/backup.sh` before every `git push`
- Always bump the version number in both the HTML comment block AND the visible `<span>` badge in the header
- Parts request notes use `type:'ro_status'` with body prefix `🔩 PARTS REQUESTED:` — never `type:'parts_request'`
- Commit and push after every meaningful change — never let work sit uncommitted

---

*Last updated: 2026-04-30 — Session 62 (END) — index v1.413 · worklist-report v1.9 · checkin.html v1.31 · customer-checkin.html v1.6 · time-off.html v1.2. Session delivered: time-off.html v1.1 (employee dropdown removal) + v1.2 (partial day support + required reason field). Migration add_partial_hours_to_time_off.sql run by Roland. Commits: 8ec431d + 5bf2552.*