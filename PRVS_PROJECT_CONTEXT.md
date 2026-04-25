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
| **Current Version** | v1.412 (index.html) · v1.9 (worklist-report.html) · v1.30 (checkin.html) · v1.5 (customer-checkin.html) — Session 56 |
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
- **GH#1 — Twilio number port** — Full guide in `docs/specs/TWILIO_SMS_SPEC.md` Section 2. Blocks customer-facing SMS (Stage 3). ⏳ Roland action — can wait until tech SMS (Stage 1) is stable
- **GH#4 v1 — Twilio Stage 1 tech SMS reminders** — Session 53 completed account setup, number purchase (+19404882313), A2P Brand approval, Campaign submission. **PENDING TCR CAMPAIGN VETTING (1-5 day wait).** Roland: grab Auth Token from Console → Account → API keys & tokens → save to password manager. Then ~30-min Cowork session deploys edge functions + schedules 4:45 PM M-F pg_cron. ⏳ Blocked on A2P approval

### 🟠 High Priority
- **GH#36 — Realtime sync + auto-refresh** (Session 56) — **Phase 1 (cheap, ~30 min):** add `setInterval(loadDataFromSupabase, 90_000)` to all dashboard pages (index.html, worklist-report, closed-ros, analytics) so left-open tabs auto-refresh every 90 sec. **Phase 2 (~1 session):** Supabase Realtime channel subscription on `repair_orders` for instant cross-user sync — INSERT/UPDATE/DELETE patches `currentData` by `_supabaseId`, optional cross-user toast for admins. Closes the staleness symptoms behind GH#29c (multi-user race) plus the "tech created an RO and it doesn't show up" + "dashboard goes stale after hours open" symptoms Roland flagged. Phase 2 supersedes Phase 1's interval. ⏳ Open — Phase 1 first
- **GH#37 — Modal readability (translucent backdrop bleed-through)** (Session 56) — Schedule Notification modal renders with cards/stat strip visible behind the modal content; same problem on at least one Parts modal. Fix: bump `.modal-overlay` background alpha to 0.85+ with `backdrop-filter: blur(4px)`, ensure `.modal-content` is fully opaque. Sweep: Schedule Notification, Parts Status, Parts Request, Edit RO, New RO, Schedule (calendar), Recently Deleted, customer-checkin modals. ~30-45 min. ⏳ Open
- **GH#31 — Finish Work List Reporting (MAJOR umbrella)** — v1.3–v1.9 shipped (labor cost rollups, Labor Load chart, NULL-silo fix, Per-Silo Active Work List section, auto-logout regime change + regen close_reason handling). **Substantial follow-up still to build** across ~10 sub-items: aggregate dollar_value rollups, per-RO enriched chips, velocity/throughput analytics, alt sort orders in chart, inline time-edit UI on Staff Status tiles, time-window filter on chart, tile-level auto-close indicator, per-silo labor attribution, manager scoring KPI, AI manager-of-managers groundwork, export/print views, comparison/trending views. Priority within umbrella flexes. 🔄 Initiative — many sessions
- ~~**GH#33 Phase 1 — DB UNIQUE partial index + checkin.html dupe guards**~~ ✅ **COMPLETE** — Session 53. checkin.html v1.30 + migration `gh33_unique_open_time_log.sql`. A second open clock-in for same `(tech_email, ro_id)` is now physically impossible at the DB layer.
- **GH#33 Phase 2 — Systemic historical dupe sweep across all time_logs** — After Phase 1 collects ~1 week of baseline data, run full-table scan for `(tech, ro)` pairs with 2+ clock-ins within 30s. Preview → review → batch delete. Other ROs likely have Ignacio-style dupes lurking beyond Scott Kline's RO (cleaned manually in Session 53). ⏳ Open
- **GH#26 — New RO Statuses: "Not on Lot" + "On Lot"** (Session 51) — Both status values already exist in dropdown per Roland's test. Scope narrowed to: verify CHECK constraint allows both, add filter buttons + badge styles if missing, wire customer-checkin modes to set them (New Customer Entry → `Not on Lot`; drop-off arrival transitions → `On Lot`). Pairs with GH#27. ⏳ Open
- **GH#27 — Drop-Off form RO lookup + pre-populate** (Session 51) — When customer starts `customer-checkin.html` "RV Customer Drop Off" mode, look up existing `status='Not on Lot'` RO by phone OR email OR customer name. Pre-populate core fields (including RV if present, editable). Multi-match → picker. No match → blank form (walk-in). On submit: transition RO `"Not on Lot"` → `"On Lot"`, audit field edits, fire GH#28 email. ⏳ Open
- **GH#28 — Customer Arrived / Dropped Off staff email** (Session 51) — New `customer_arrived` email type on `send-quote-email`. Fires on drop-off submission when matched RO transitions to `"On Lot"` (pairs with GH#27). Recipient: repair@patriotsrvservices.com. Action banner: "Pictures and normal check-in procedures / RO updates need to take place." Shared-secret X-PRVS-Secret auth. ⏳ Open
- **GH#23 — Morning Manager Report (data quality banner fix)** — Data quality banner ($0.00 warning) not firing for sr_manager reports. Multi-silo work list lookup needs fresh investigation. Deferred from Session 44. 🔄 In Progress
- **GH#23 — Map service_silo values to each manager in staff table** — Needed for per-silo RV filtering in send-manager-report to work correctly. ⏳ Open
- **GH#20 — Slack Integration (remaining triggers)** — Test `ro_urgency_critical`, `part_received`, `warranty_ro_opened`. Audit & configure all 5 event types. Deploy final. 🔄 In Progress
- **GH#5c — Polish Work Orders UI** — Mobile layout, remaining bugs. 🔄 In Progress
- **GH#17 — Customer Check-In Page** — Front desk RO intake + RAF e-signature. Session 50: Lead Staff Notification built; mode rename; shared-secret auth. Still living form — Roland will add more fields pre-go-live. 🔄 In Progress
- **GH#6 — Employee Time Clock** — Full time clock in dashboard. ⏳ Open
- **GH#35 — Offboard nik@patriotsrvservices.com (TERMINATED)** (Session 54) — **DB + Auth + Email ✅ DONE:** 3 SQL statements ran (staff deactivated, user_roles revoked, users row deleted), Supabase Auth user deleted, Google Workspace account suspended. **Remaining:** GitHub org check/remove, Slack deactivation, shared-secret rotation. 🔄 In Progress

### 🟡 Medium Priority / Monitor
- ~~**GH#29c — MONITOR status-change bug on unique ROs**~~ ✅ **RESOLVED — Session 56.** Audit-log forensics on one example RO showed every status change attributed to a real user with a real timestamp. No code-level revert. Root cause is multi-user race + stale-tab data. Fix tracked under GH#36 (realtime sync). Optional: extend `.select()` + row-count assertions to v1.408 write sites as belt-and-suspenders.
- **Extend `.select()` + row-count assertions** to all 13 v1.408 write sites (belt-and-suspenders). Already on GH#30 soft-delete. ⏳ Open
- **GH#34 — Offline-queue clock_out race with auto-logout** (Session 52) — If tech is offline 12+ hours and queues a clock_out that replays after the pg_cron auto-closes their session, the replay overwrites `close_reason='auto_eod'` with real tech-closed timestamp. Not wrong but misleading audit. Fix: conditional `UPDATE ... WHERE clock_out IS NULL` on offline-queue replay. Low priority until observed in production. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- ✅ **GitHub Release v1.409-stable PUBLISHED** (Session 56) — Consolidated restore-point release that supersedes v1.283–v1.409 + worklist v1.3–v1.9 + checkin v1.30 + customer-checkin v1.4 backlog. Notes: `docs/releases/v1.409-stable.md`. Annotated tag at commit `b256a17`.
- **GitHub Release v1.410/v1.411/v1.411-hotfix/v1.412** (Session 56) — Optional: tag/release the four post-restore-point versions individually, OR wait and create a single rolling consolidated release later. Lower priority since each version is committed and live on GitHub Pages already. ⏳ Roland action — optional
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
- ✅ **v1.412 — Schedule Notification UI refinements + 4-stage audit trail (2026-04-25, Session 56, commit `06df15d`)** — 🔔 button moved from card-actions-secondary to top of every standard RO card as a prominent red-outlined banner with new label "SCHEDULE IMPORTANT TASKS OR UPDATE NOTIFICATIONS." Full audit trail to RO Status notes for every lifecycle event: scheduled (manual + auto), cancelled, sent, failed. Edge function v1.0 redeployed to write SENT/FAILED notes via service role. Spanish translation added.
- ✅ **v1.411 — GH#ER1 + GH#ER2 Unified Scheduled Notifications (2026-04-25, Session 56, commit `47fd547`)** — One engine powers ER#1 + ER#2. New `scheduled_notifications` table + `planned_dropoff_date` column on repair_orders. New `process-scheduled-notifications` edge function (Gmail SMTP). pg_cron job 9 every 15 min via pg_net. UI: 🔔 button on RO card → modal with date+time, subject, body, multi-recipient (silo managers pre-checked). ER#1 wired on top: customer-checkin.html auto-INSERTs reminder for 8 AM CDT morning before drop-off; Edit RO Planned Drop Off Date field cancel-and-recreates the auto-row on change. Migrations + edge function deployed; round-trip smoke test successful.
- ✅ **v1.410 — GH#ER3 "Ready to Work" RO status (2026-04-25, Session 56, commit `f2e6f2a`)** — New status between Awaiting parts and In progress. Pure manual flip. Lime `#84cc16`. 13 touchpoints in index.html. No DB migration required. Spanish "Listo para Trabajar."
- ✅ **GH#29c RESOLVED — multi-user race, not code bug (2026-04-25, Session 56)** — Audit-log forensics on one example RO showed every status change attributed to a real user. No code-level revert exists. Root cause is multi-user race + stale-tab data. Fix tracked under GH#36 (realtime sync).
- ✅ **v1.409-stable consolidated GitHub Release published (2026-04-25, Session 56)** — Restore-point release published as the latest GitHub release at commit `b256a17`. Supersedes v1.283–v1.409 + worklist v1.3–v1.9 + checkin v1.30 + customer-checkin v1.4 release backlog. 14 individual TODOs collapsed into 1 ✅. Notes: `docs/releases/v1.409-stable.md`.

- ✅ **Staff Offboarding — Nik Polizzo EXECUTED (2026-04-22, Session 54)** — Roland ran all 3 SQL statements (staff deactivated + SMS cleared, user_roles revoked, users row deleted), deleted Supabase Auth user, suspended Google Workspace email. Access revoked at DB + Auth + SSO layers. GitHub org / Slack / shared-secret rotation remain as GH#35 follow-up. Preserves `time_logs`, `audit_log`, `repair_orders.technician_assigned` for audit/payroll/historical integrity. Reusable "Staff Offboarding Pattern" gotcha added to CLAUDE_CONTEXT.md for future terminations.
- ✅ **Twilio A2P 10DLC Registration — Stage 1 setup (2026-04-21, Session 53)** — Account created + upgraded. Number `+19404882313` purchased ($1.15/mo, 940 North TX). A2P Customer Profile submitted + approved. A2P Brand approved in ~1 minute (Low Volume Standard, $4.50). A2P Campaign submitted — PENDING TCR VETTING (1-5 day wait). Number attached to `Low Volume Mixed A2P Messaging Service` Sender Pool. 17 of 18 staff phone_numbers populated with sms_opt_in_at. Kevin (tester) excluded. SMS-compliant Privacy Policy + Terms of Service confirmed live on patriotsrvservices.com. All SIDs saved to CLAUDE_CONTEXT.md File Inventory. Remaining Roland: grab Auth Token from Console → save to password manager; wait for Campaign approval email.
- ✅ **GH#33 Phase 1 — DB UNIQUE partial index + checkin.html v1.30 guards (2026-04-21, Session 53, commit `6aabce0`)** — Migration `gh33_unique_open_time_log.sql` — `CREATE UNIQUE INDEX idx_time_logs_one_open_per_tech_ro ON time_logs (tech_email, ro_id) WHERE clock_out IS NULL`. A second open clock-in for same `(tech_email, ro_id)` is now physically impossible (23505 unique_violation). checkin.html: `_clockInPending` re-entry guard, instant button lock + spinner, pre-INSERT SELECT guard, 23505 race-window backstop, drainQueue() offline-replay dedupe, Spanish toast translation. Kills both root-cause patterns (Mauricio 3-sec double-tap + Ignacio 8-sec offline-replay storm).
- ✅ **worklist-report.html v1.9 — Auto-logout regime change (2026-04-21, Session 53, commit `346512b`)** — 12h cap cron killed. Replaced with M-F 5 PM CDT hard EOD close (pg_cron `close-open-time-logs-eod` job ID 8, `close_open_time_logs_eod()` SECURITY DEFINER function respects `extended_at`). Retroactive 9 past `auto_eod` rows rewritten to 8h with new `close_reason='auto_eod_8h_recalc'`. Scott Kline's RO: 7 duplicate clock-ins deleted (labor 28.25h → 19.02h). Report audit query switched to `close_reason LIKE 'auto_%'`; orange flag for `auto_eod_5pm`/legacy, gray "8h recalc" for corrected. Dormant Twilio Stage 1 skeleton: migrations for `staff.phone_number`/`sms_opt_in_at`/`sms_log`/`time_logs.reminded_at`/`extended_at`, + `twilio-sms` and `twilio-webhook` edge function sources committed.
- ✅ **worklist-report.html v1.8 — NULL-silo fallback + Per-Silo Active Work List section (2026-04-21, Session 53, commit `f7fcd14`)** — Regular managers now show in Labor Load chart (NULL-silo fallback via `staff.service_silo`). New collapsible Per-Silo Active Work List section pivots work list data by silo (not manager), dedupes by `ro_id`, shows owner pills. 25/25 smoke-test assertions pass.
- ✅ **GH#32 Auto-logout stale time_logs (2026-04-19, Session 52)** — ⚠ SUPERSEDED Session 53 when 12h cap was replaced with M-F 5 PM EOD.
- ✅ **worklist-report.html v1.7 — Auto-logout audit on Staff Status tiles (2026-04-19, Session 52, commit `2410494`)** — Orange `.auto-eod` class + `⚠ auto Xh` badge for today's auto-closed rows. Prior-day auto-closes in dedicated "Recent auto-logouts · last 14 days" subsection. Per-session highlight only; tile color unchanged.
- ✅ **worklist-report.html v1.3-v1.6 (2026-04-19, Session 52)** — Monetary analytics (labor cost chip per RO), Labor Load chart (pure-CSS stacked bars by silo), tester+training exclusion (`isTester()` + `applyReportExclusions()`), customer name in chart bar footer.

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

*Last updated: 2026-04-25 — Session 56 (END) — index v1.412 · worklist-report v1.9 · checkin.html v1.30 · customer-checkin.html v1.5. Session delivered: (1) v1.409-stable GitHub release published as restore point (supersedes v1.283–v1.409 + worklist v1.3–v1.9 backlog). (2) v1.410 GH#ER3 "Ready to Work" RO status. (3) GH#29c resolved via audit-log forensics — multi-user race, not code bug. (4) GH#36 added — realtime sync + auto-refresh (Phase 1 = setInterval, Phase 2 = Supabase Realtime). (5) v1.411 GH#ER1+ER2 Unified Scheduled Notifications — full backend (table + edge function + pg_cron job 9) + UI (🔔 button + modal) + ER#1 auto-wiring (customer-checkin + Edit RO planned drop-off field). (6) v1.411 hotfix for same-day scheduling. (7) v1.412 — red banner button at top of card + 4-stage audit trail to RO Status notes (scheduled/cancelled/sent/failed). (8) GH#37 added — modal readability fix. Edge function `process-scheduled-notifications` deployed twice. pg_cron job 9 live every 15 min. Round-trip smoke test successful. 5 commits + 1 GitHub release published.*
