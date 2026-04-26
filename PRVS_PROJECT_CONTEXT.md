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
| **Current Version** | v1.412 (index.html) · v1.9 (worklist-report.html) · v1.30 (checkin.html) · v1.5 (customer-checkin.html) · v1.0 (time-off.html NEW) — Session 57 |
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
- **GH#37 — Modal readability (translucent backdrop bleed-through)** (Session 56) — bump `.modal-overlay` alpha to 0.85+ with `backdrop-filter: blur(4px)`, ensure `.modal-content` fully opaque. Sweep all modals. ~30-45 min. ⏳ Open
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
- **GH#24 Phase 3 — Shop Operations: Shop Tasks + Time Logging** ⏳ Open
- **GH#8 — Switchblade tile view** — Compact tile layout mode. ⏳ Open
- **Update solar parts pricing** — Current Epoch + Victron catalog pricing. ⏳ Open
- **`isManagerOrAbove()` helper refactor** — Consolidate 5+ scattered role checks. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **Complete QB Compliance section** — developer.intuit.com → PRVS Dashboard → Keys and credentials → Production → Compliance (~40 min). 🔴 BLOCKS GH#6
- **Supabase: Maximize log retention** — Settings → Logs. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts notifications. ⏳ Roland action
- **GitHub Release v1.410/v1.411/v1.411-hotfix/v1.412** — Optional: tag/release individually or wait for next consolidated release. ⏳ Roland action — optional
- **Modularization** — Long-term. Spec ready in `docs/specs/MODULARIZATION_ROADMAP.md`. ⏳ Not started

---

## ✅ Recently Completed
- ✅ **GH#38 Phase 1 — time-off.html v1.0 SHIPPED (2026-04-26, Session 57)** — New `time-off.html` standalone page. Monthly calendar + list views. Sick/vacation/personal/general request types. Manager/admin sees all employees; tech sees own. Backdating supported. Stats strip. 3-trigger notification system: (1) immediate `submitted` email to all active managers/admins on save, (2) day-before reminder via `scheduled_notifications`, (3) morning-of reminder via `scheduled_notifications`. `send-quote-email` v1.9 adds `time_off_notify` type (3 contexts). Confirmation popup modal on submit ("Submission does not guarantee approval"). 🏖 Time Off header button added to index.html. Commits: `855447f` (Phase 1), `2d65f95` (notifications), `14c823d` (confirmation popup).
- ✅ **GH#6 QB Integration — Intuit app created, App Details 100% (2026-04-26, Session 57)** — Intuit Developer app "PRVS Dashboard" created (App ID: cfb4185b-568e-4011-a732-199bd0ac1fc1). App Details section 100% complete: EULA (patriotsrvservices.com/terms-of-service), Privacy Policy, host domain (patriotsrv.github.io), categories (Time Tracking + Employees and Payroll), regulated industries (none), hosting (US). Compliance section (0% / 40 min) deferred by Roland. Full 8-step roadmap documented in CLAUDE_CONTEXT.md GH#6 TODO.
- ✅ **GH#35 — Nik Polizzo fully offboarded (2026-04-26, Session 57)** — GitHub org removed + Slack deactivated + shared-secret rotation complete. All access fully revoked across DB + Auth + SSO + GitHub + Slack + secrets.
- ✅ **v1.412 — Schedule Notification UI refinements + 4-stage audit trail (2026-04-25, Session 56, commit `06df15d`)** — 🔔 button moved to top of every standard RO card as prominent red-outlined banner. Full audit trail to RO Status notes for every lifecycle event: scheduled (manual + auto), cancelled, sent, failed. Edge function v1.0 redeployed.
- ✅ **v1.411 GH#ER1+ER2 Unified Scheduled Notifications (2026-04-25, Session 56, commit `47fd547`)** — `scheduled_notifications` table + `process-scheduled-notifications` edge function + pg_cron every 15 min. 🔔 modal on RO card. customer-checkin.html auto-inserts morning-before drop-off reminder. Edit RO Planned Drop Off Date field wired. Round-trip smoke test successful.
- ✅ **v1.410 GH#ER3 "Ready to Work" RO status (2026-04-25, Session 56, commit `f2e6f2a`)** — New status between Awaiting parts and In progress. Lime `#84cc16`. 13 touchpoints. Spanish "Listo para Trabajar."
- ✅ **v1.409-stable consolidated GitHub Release published (2026-04-25, Session 56)** — Restore-point release supersedes v1.283–v1.409 + worklist v1.3–v1.9 + checkin v1.30 + customer-checkin v1.4 backlog. Tag at commit `b256a17`.

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

*Last updated: 2026-04-26 — Session 57 (END) — index v1.412 · worklist-report v1.9 · checkin.html v1.30 · customer-checkin.html v1.5 · time-off.html v1.0 (NEW). Session delivered: (1) GH#38 Phase 1 complete — time-off.html v1.0 with 3-trigger notification system (immediate submit email + day-before + morning-of scheduled_notifications). (2) GH#38 submission confirmation popup. (3) send-quote-email v1.9 with time_off_notify type. (4) GH#6 QB Integration started — Intuit Developer app created, App Details 100% complete; Compliance section deferred; full 8-step roadmap documented. (5) GH#35 Nik Polizzo fully offboarded — GitHub + Slack + shared-secret rotation complete. 3 commits + context files updated.*
