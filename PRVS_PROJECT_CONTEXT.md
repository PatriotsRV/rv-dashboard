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
| **Current Version** | v1.409 (index.html) · v1.7 (worklist-report.html — Session 52) |
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
- ~~**Security Remediation**~~ ✅ **ALL 10 ISSUES COMPLETE** — 2026-04-11. S1 (XSS × 44), S2 (RBAC), S3 (analytics auth), S4 (Anthropic key proxy), S5 (console.log cleanup), S6 (onclick migration), S7 (CORS + session tokens + calendar config + search_path). 10 commits + 2 hotfixes. 5 Edge Functions redeployed. 2 SQL migrations run.
- **GH#1 — Twilio number port** — Roland must gather carrier info + create Twilio account. Full guide in `docs/specs/TWILIO_SMS_SPEC.md` Section 2. Blocks all SMS features. ⏳ Roland action
- **GH#4 — Twilio SMS build** — Full spec in `docs/specs/TWILIO_SMS_SPEC.md`. Replaces Kenect. ⏳ Waiting on number port

### 🟠 High Priority
- **GH#31 — Finish Work List Reporting (MAJOR umbrella, Session 52 → ongoing)** — v1.3–v1.7 shipped in Session 52 (labor cost rollups, Labor Load chart, tester/training exclusion, customer names in bar footers, auto-logout audit tiles). **Substantial follow-up surface still to build** across 12 sub-items, each its own session: (1) aggregate dollar_value rollups (manager/silo/grand total, separate from labor cost), (2) per-RO enriched chips ($/hr, risk flags, days-to-close projection), (3) velocity / throughput analytics ($ closed per week, avg $-days-on-lot, needs cashiered join + time-window picker), (4) alternative sort orders in the Labor Load chart (days-on-lot, urgency, labor/value ratio), (5) inline time-edit UI on Staff Status tiles (for adjusting chronic auto-logout techs without Supabase SQL), (6) time-window filter on the chart (today/week/30d/lifetime), (7) optional tile-level auto-close summary indicator if per-session orange proves insufficient, (8) per-silo labor attribution (currently an RO on two silo lists shows same total in both lanes), (9) formal manager scoring KPI (deltas, flags, baselines), (10) "AI manager of managers" groundwork (schema + export hooks, the North Star), (11) export / print views, (12) comparison / trending views over time. Priority within the umbrella flexes as Roland uses v1.3–v1.7. 🔄 Initiative — many sessions
- **GH#33 — Debounce / dedupe tech clock-ins** (Session 52) — Ignacio had 6 clock-in rows on same RO within 8 seconds 2026-04-17. Double-tap misfire OR offline-queue replay. Auto-logout (GH#32) caught them but pre-cap they contributed 6× phantom active-tech counts. Fix: `checkin.html` `clockIn()` debounce same-(tech,RO) within N sec + offline-queue dedupe on replay. ⏳ Open
- **GH#26 — New RO Statuses: "Not on Lot" + "On Lot"** (Session 51) — Both status values already exist in dropdown per Roland's test. Scope narrowed to: verify CHECK constraint allows both, add filter buttons + badge styles if missing, wire customer-checkin modes to set them (New Customer Entry → `Not on Lot`; drop-off arrival transitions → `On Lot`). Pairs with GH#27. ⏳ Open
- **GH#27 — Drop-Off form RO lookup + pre-populate** (Session 51) — When customer starts `customer-checkin.html` "RV Customer Drop Off" mode, look up existing `status='Not on Lot'` RO by phone OR email OR customer name. Pre-populate core fields (including RV if present, editable). Multi-match → picker. No match → blank form (walk-in). On submit: transition RO `"Not on Lot"` → `"On Lot"`, audit field edits, fire GH#28 email. ⏳ Open
- **GH#28 — Customer Arrived / Dropped Off staff email** (Session 51) — New `customer_arrived` email type on `send-quote-email`. Fires on drop-off submission when matched RO transitions to `"On Lot"` (pairs with GH#27). Recipient: repair@patriotsrvservices.com. Action banner: "Pictures and normal check-in procedures / RO updates need to take place." Shared-secret X-PRVS-Secret auth. ⏳ Open
- **GH#23 — Morning Manager Report (data quality banner fix)** — Data quality banner ($0.00 warning) not firing for sr_manager reports. Multi-silo work list lookup needs fresh investigation. Deferred from Session 44. 🔄 In Progress
- **GH#23 — Map service_silo values to each manager in staff table** — Needed for per-silo RV filtering in send-manager-report to work correctly. ⏳ Open
- **GH#20 — Slack Integration (remaining triggers)** — Test `ro_urgency_critical`, `part_received`, `warranty_ro_opened`. Audit & configure all 5 event types. Deploy final. 🔄 In Progress
- **GH#5c — Polish Work Orders UI** — Mobile layout, remaining bugs. 🔄 In Progress
- **GH#17 — Customer Check-In Page** — Front desk RO intake + RAF e-signature. Session 50: Lead Staff Notification built; mode rename; shared-secret auth. Still living form — Roland will add more fields pre-go-live. 🔄 In Progress
- **GH#6 — Employee Time Clock** — Full time clock in dashboard. ⏳ Open

### 🟡 Medium Priority / Monitor
- **GH#29c — MONITOR status-change bug on unique ROs** (Session 51) — Staff previously reported status not sticking on non-dupe ROs. Post-v1.408 testing shows changes stick. Likely the v1.408 dupe-lookup fix resolved the underlying cause. If resurfaces: Chrome DevTools Network tab → filter `repair_orders` → capture PATCH response status + body. 🔍 Monitor
- **Extend `.select()` + row-count assertions** to all 13 v1.408 write sites (belt-and-suspenders). Already on GH#30 soft-delete. ⏳ Open
- **GH#34 — Offline-queue clock_out race with auto-logout** (Session 52) — If tech is offline 12+ hours and queues a clock_out that replays after the pg_cron auto-closes their session, the replay overwrites `close_reason='auto_eod'` with real tech-closed timestamp. Not wrong but misleading audit. Fix: conditional `UPDATE ... WHERE clock_out IS NULL` on offline-queue replay. Low priority until observed in production. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.308** — Backlog of unpublished releases. ⏳ Roland action
- **GitHub Release v1.402/v1.403/v1.404/v1.405/v1.406** — Warranty RO + Slack integration + Morning Manager Report + Shop Operations RO + Lead Staff Notification & X-PRVS-Secret auth. ⏳ Roland action
- **GitHub Release v1.407/v1.408/v1.409** (Session 51) — Tile bar wrap fix + GH#29 status-change bug fix + GH#30 Admin Delete RO. ⏳ Roland action
- **GitHub Releases worklist-report v1.3 → v1.7** (Session 52) — 5 commits: `84a93dd` (v1.3 monetary analytics), `b9c5be8` (v1.4 Labor Load chart), `f675a8f` (v1.5 tester+training exclusion), `b0a2241` (v1.6 customer name in bar footer), `2410494` (v1.7 auto-logout audit tiles). Tag each at github.com/PatriotsRV/rv-dashboard/releases/new. ⏳ Roland action
- **Supabase: Maximize log retention** — Settings → Logs. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts notifications. ⏳ Roland action
- **Migrate lead_staff_notify recipient to `app_config`** — Currently hardcoded to `repair@patriotsrvservices.com` in `send-quote-email`. Move to `app_config` table following the calendar ID pattern. ⏳ Open
- **Test remaining lead_staff_notify variants** — Verify warranty-only drop off, hybrid drop off, returning customer subject/header variants. 🔄 Open
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah. ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest from history. ⏳ Open
- **GH#21 — checkin.html Auth Persistence Fix** — Spec covered in Security Remediation Issue 3 pattern. ⏳ Open
- **`isManagerOrAbove()` helper refactor** — Consolidate 5+ scattered `isAdmin() || hasRole('Manager') || hasRole('Sr Manager')` checks. ⏳ Open
- **Modularization** — Long-term. Spec ready in `docs/specs/MODULARIZATION_ROADMAP.md`. Start after security + SMS stable. ⏳ Not started

---

## ✅ Recently Completed
- ✅ **GH#32 Auto-logout stale time_logs (2026-04-19, Session 52)** — New `time_logs.close_reason TEXT` column + `auto_close_stale_time_logs()` SECURITY DEFINER function + pg_cron `auto-close-stale-time-logs` daily at 02:00 UTC (9 PM CDT). 12h rolling cap: any open session >12h old gets `clock_out = clock_in + 12h` and `close_reason='auto_eod'`. First manual invocation auto-closed 9 stale sessions from 2026-04-17 (Mauricio, Cooper, Ignacio × 7). Confirmed via checkin.html audit that auto-closed techs can normally clock into new ROs next day.
- ✅ **worklist-report.html v1.7 — Auto-logout audit on Staff Status tiles (2026-04-19, Session 52, commit `2410494`)** — Today's auto-closed rows in expanded tile detail render with orange `.auto-eod` class + `⚠ auto Xh` badge. Prior-day auto-closes from last 14d appear in new `⚠ N auto-logouts · last 14 days` subsection at bottom of expanded detail. Tile's live green/red color unchanged — per-session orange only per Roland's correction. Enables chronic-forgetter audit pattern.
- ✅ **worklist-report.html v1.6 — Customer name in chart bar footer (2026-04-19, Session 52, commit `b0a2241`)** — Chart bar label stack swapped RO ID tail for customer name as primary identifier. RO ID moved below as secondary. Answers "who is this RO for?" at a glance.
- ✅ **worklist-report.html v1.5 — Tester + training RO exclusion + bar spread fix + v1.4 urgency bug (2026-04-19, Session 52, commit `f675a8f`)** — `isTester(email)` helper + `applyReportExclusions()` drops training ROs + tester time_logs from every report surface (stats strip, Staff Status tiles, accordion, chart, time details). Bar width fix: flex-grow bars so they spread across the silo lane instead of clustering left. Side-fix: added `urgency` to the `repair_orders` SELECT (v1.4 bars had been silently defaulting to gray).
- ✅ **worklist-report.html v1.4 — Labor Load chart (2026-04-19, Session 52, commit `b9c5be8`)** — Pure-CSS stacked bar chart above the manager accordions. One horizontal lane per active silo, vertical bars per RO sorted labor-cost desc. Bar height = labor $ or hours (toggle, persists to localStorage). Urgency color top-border. Per-tech stacked segments with deterministic HSL-hash color. Yellow dashed reference line at `dollar_value`. Click bar → smooth-scroll + flash the accordion row below. Collapsible, global Y-scale.
- ✅ **worklist-report.html v1.3 — Monetary analytics (2026-04-19, Session 52, commit `84a93dd`)** — New `staff.hourly_rate NUMERIC(6,2)` column + 18 seeded rates. Labor cost chip per RO row (color gradient vs `dollar_value`), per-silo + per-manager labor subtotals, gold Total Labor chip on top strip.
- ✅ **GH#30 Admin Delete RO — soft-delete + 1-week auto-scrub (2026-04-18, Session 51, v1.409)** — New `deleted_at`/`deleted_by` columns on `repair_orders`. 🗑 Delete RO admin wrap in Edit RO modal footer (FK-count confirm). 🗑 Recently Deleted admin header button + modal with ↩ Restore / 🗑 Delete Now (type-name-to-confirm). pg_cron `scrub-soft-deleted-ros` job ID 6, daily 02:00 CDT. Feature tested end-to-end on Roman placeholder. Commit: c6eecda.
- ✅ **GH#29 Status-change bug fix (2026-04-18, Session 51, v1.408)** — 13 write-path lookups switched from `(customerName + dateReceived)` to UUID-first `ro._supabaseId`. Fixes wrong-row writes when dupes exist. Commit: 0a486e4.
- ✅ **v1.407 Tile bar wrap fix (2026-04-18, Session 51)** — Header tile bar now `flex-wrap: wrap`. Commit: 1164a18.
- ✅ **GH#19 Lead Staff Notification (2026-04-16, Session 50)** — Staff notification email built for `customer-checkin.html` (new customer entry + warranty/hybrid drop off). Shared-secret `X-PRVS-Secret` auth. send-quote-email v1.8.

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
- **Edge Functions:** `roof-lookup` (AI), `send-quote-email` (email), `send-parts-report` (cron), `send-er-report` (cron), `claude-vision-proxy` (estimate scanner), `slack-notify` (Slack webhooks), `send-manager-report` (cron — GH#23 morning manager report)
- **SMS:** Twilio (planned — full spec in `docs/specs/TWILIO_SMS_SPEC.md`)
- **Roles:** Supabase RBAC via `user_roles` table — Admin, Sr Manager, Manager, Parts Manager, Tech (all hardcoded email arrays removed S2)

---

## 🔑 Key Rules (for Claude when working in this project)
- The authoritative technical memory is **CLAUDE_CONTEXT.md** in the GitHub repo — always read it at laptop session start
- Never use `accessToken` as an auth guard for Supabase — use `getSB() && supabaseSession`
- Always run `bash scripts/backup.sh` before every `git push`
- Always bump the version number in both the HTML comment block AND the visible `<span>` badge in the header
- Parts request notes use `type:'ro_status'` with body prefix `🔩 PARTS REQUESTED:` — never `type:'parts_request'`
- Commit and push after every meaningful change — never let work sit uncommitted

---

*Last updated: 2026-04-19 — Session 52 — index v1.409 · worklist-report v1.7 — GH#31 Monetary analytics + Labor Load chart + tester/training-RO exclusion + customer name in bar footer + auto-logout audit tiles (commits 84a93dd → 2410494) + GH#32 Auto-logout pg_cron (close_reason='auto_eod', 12h rolling cap) + GH#33/GH#34 follow-ups logged. GH#31 tagged as the major "Finish Work List Reporting" umbrella initiative — 12 sub-items ahead.*
