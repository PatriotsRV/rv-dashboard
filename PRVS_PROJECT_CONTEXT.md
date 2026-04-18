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
| **Current Version** | v1.409 |
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

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.308** — Backlog of unpublished releases. ⏳ Roland action
- **GitHub Release v1.402/v1.403/v1.404/v1.405/v1.406** — Warranty RO + Slack integration + Morning Manager Report + Shop Operations RO + Lead Staff Notification & X-PRVS-Secret auth. ⏳ Roland action
- **GitHub Release v1.407/v1.408/v1.409** (Session 51) — Tile bar wrap fix + GH#29 status-change bug fix + GH#30 Admin Delete RO. ⏳ Roland action
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
- ✅ **GH#30 Admin Delete RO — soft-delete + 1-week auto-scrub (2026-04-18, Session 51, v1.409)** — New `deleted_at`/`deleted_by` columns on `repair_orders`. 🗑 Delete RO admin wrap in Edit RO modal footer (FK-count confirm). 🗑 Recently Deleted admin header button + modal with ↩ Restore / 🗑 Delete Now (type-name-to-confirm). pg_cron `scrub-soft-deleted-ros` job ID 6, daily 02:00 CDT. Feature tested end-to-end on Roman placeholder. Commit: c6eecda.
- ✅ **GH#29b DB dupe/test cleanup (2026-04-18, Session 51)** — Scan found 1 dupe (Roman / today's check-in test). Kept `1293920d` (active), hard-deleted placeholder `bc206e95` via GH#30 feature. 7 detection queries saved in `docs/dupe_detection_queries.sql`.
- ✅ **GH#29 Status-change bug fix (2026-04-18, Session 51, v1.408)** — 13 write-path lookups switched from `(customerName + dateReceived)` to UUID-first `ro._supabaseId` with fallback. Fixes wrong-row writes when dupes exist. Functions affected: updateROStatus, updateROUrgency, updateROProgress, editField, uploadPhoto, uploadDocument, setMainPhoto, archiveRO, openScheduleModal, confirmSchedule, proceedWithSchedule, openPartsModal, openEditRO. Roland confirmed fix on both dupe scenario and unique-RO status changes. Commit: 0a486e4.
- ✅ **v1.407 Tile bar wrap fix (2026-04-18, Session 51)** — Header tile bar now `flex-wrap: wrap` with `row-gap: 12px`; stripped `margin-left: 12px` from 8 buttons. Customer Check-In button (already shipped) now visible at all widths. Discovered GH#25 was already live — marked done. Commit: 1164a18.
- ✅ **GH#19 Lead Staff Notification (2026-04-16, Session 50)** — Staff notification email built for `customer-checkin.html`. Fires on New Customer Entry (any work type) + RV Customer Drop Off when warranty/hybrid. `send-quote-email` v1.8 adds `lead_staff_notify` type with mode-aware subject + branded HTML. Recipient: repair@patriotsrvservices.com. Live-tested with real + warranty customer.
- ✅ **Shared-Secret X-PRVS-Secret Pattern (2026-04-16, Session 50)** — `PRVS_FUNCTION_SECRET` Supabase secret + `X-PRVS-Secret` header on 4 index.html edge fetches (photo_share, parts_ordered, parts_eta_update, parts_request) + customer-checkin.html lead_staff_notify. Deployed send-quote-email with `--no-verify-jwt`. index.html v1.405→v1.406.
- ✅ **Mode Rename — RV Customer Drop Off / New Customer Entry (2026-04-16, Session 50)** — "RV Drop-Off" → "RV Customer Drop Off", "Lead Conversion" → "New Customer Entry". UI labels + email strings + internal comments updated; mode payload values (`'dropoff'`/`'lead'`) preserved. customer-checkin.html v1.2→v1.4. Commits: ef505bc, d4f0acb.
- ✅ **customer-checkin.html backdrop redesign (2026-04-16, Session 49)** — Replaced marble CSS backdrop with fixed full-bleed RV park mountain photo. Vibrance boost (saturate 1.25, contrast 1.05) + light cream overlay (~20% opacity). Commits: 71489b5, 6ac5c07.
- ✅ **Sr Manager Parts + Schedule Fix (2026-04-14)** — Added `hasRole('Sr Manager')` to 5 UI role gates. Fixes Kevin McHenry Sr Manager access. Commit: d5ddc36.
- ✅ **GH#24 Shop Operations RO Phase 1 v1.405 (2026-04-14)** — 5th RO type (`shop`) for non-customer parts ordering/returns. Purple badge, compact chip, filter button, Slack skip. Commits: 66a5fe8, ca07ba9, 13981a0.
- ✅ **send-manager-report v1.8 (2026-04-14)** — v1.7: ≥30 days filter. v1.8: red PARTS HOLD badge on individual RO line items + named ROs in Key Flags. Deployed as Supabase version 13.
- ✅ **Worklist Report v1.2 — clickable tech tile expand (2026-04-14)** — Tech tiles in Staff Status section now clickable, expands to show daily time log per tech.
- ✅ **Slack Integration GH#20 — v1.403 (2026-04-12)** — `slack-notify` Edge Function v1.2 + 5 trigger points. ro_created + ro_ready_pickup confirmed working. 3 triggers remaining.

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

*Last updated: 2026-04-18 — Session 51 — v1.409 — Tile bar wrap fix (v1.407) + GH#29 status-change bug 13-site UUID-first lookup fix (v1.408) + GH#30 Admin Delete RO soft-delete with 1-week auto-scrub (v1.409) + GH#29b DB dupe cleanup (Roman removed) + GH#25-28 intake pipeline TODOs logged*
