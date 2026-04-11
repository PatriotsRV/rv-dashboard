# PRVS Dashboard — Claude Context Document

> **This is Claude's memory across sessions.** Claude has no memory between sessions.
> Every session MUST start by reading this file. Every session MUST update this file before ending.

---

## ⚡ SESSION PROTOCOL — READ THIS FIRST

> **Storage strategy:** CLAUDE_CONTEXT.md lives **locally** in the `PRVS RO Dashboard` Cowork workspace folder (primary). GitHub is a **backup only**, pushed at end of session. Always read from local. Always write to local first.

### 🟢 START OF SESSION — Roland's command:
> *"Read CLAUDE_CONTEXT.md from the workspace folder before doing anything else. Confirm the current index.html version, read the Active TODO List out loud to me grouped by priority, and flag any blocking issues or Roland-action items still pending. Follow the Start of Session Checklist in that file. Then ask me: 'Any updates from your iPhone since last session? Paste them here and I'll merge them into CLAUDE_CONTEXT.md before we start.' If I provide mobile updates, merge them into the TODO list immediately — mark completed items ✅, add new items with the correct priority — and confirm what changed before continuing. Then ask: 'Is there anything else to add or change before we start?' and wait for my answer before beginning any work."*

Claude must complete all of these before doing any work:

- [ ] 1. Read this file from the local workspace folder (not GitHub)
- [ ] 2. Confirm the current `index.html` version matches the File Inventory table below
- [ ] 3. Read and acknowledge the **Active TODO List** section aloud to Roland, grouped by priority
- [ ] 4. Flag any 🔴 blocking items and any pending Roland-action items
- [ ] 5. Ask Roland for iPhone updates — merge any provided before starting work
- [ ] 6. Ask: *"Is there anything else to add or change before we start?"* and wait
- [ ] 7. Only then begin work — starting with highest-priority TODO item unless Roland redirects

### ⏸ PAUSE / CHECKPOINT — Roland's command:
> *"Pause what you're doing and save progress now. Run bash scripts/backup.sh, then update CLAUDE_CONTEXT.md with everything completed so far this session — TODO list, session log, any new gotchas — and save it to the workspace folder. Then push to GitHub as a backup. Confirm the push with the commit hash. Then tell me exactly where we are and what's next before continuing."*

Claude must:

- [ ] 1. Run `bash scripts/backup.sh` from the repo root
- [ ] 2. Update CLAUDE_CONTEXT.md with all progress so far (TODO list, session log, gotchas)
- [ ] 3. Save CLAUDE_CONTEXT.md to the local workspace folder
- [ ] 4. Push CLAUDE_CONTEXT.md to GitHub as a backup — confirm with commit hash
- [ ] 5. Report: exactly where we are and what's next

### 🔴 END OF SESSION — Roland's command:
> *"Before we stop: run bash scripts/backup.sh, then run the End of Session Checklist from CLAUDE_CONTEXT.md. Update the TODO list, File Inventory, Session Log, and Known Issues in CLAUDE_CONTEXT.md. Update Completed Work and Version History in CLAUDE_CONTEXT_HISTORY.md. Save both files to the workspace folder, then push both to GitHub as a backup. Do not end the session until the push is confirmed with a commit hash."*

Claude must complete ALL of these before the session ends (context limit, user stops, etc.):

- [ ] 1. Run `bash scripts/backup.sh` from the repo root
- [ ] 2. Update the **Active TODO List** — mark completed items ✅, add any new items discovered
- [ ] 3. Update the **File Inventory** table with new version numbers
- [ ] 4. Add a row to the **Session Log** table
- [ ] 5. Add new items to **Completed Work** in `CLAUDE_CONTEXT_HISTORY.md`
- [ ] 6. Update the **Version History** table in `CLAUDE_CONTEXT_HISTORY.md` if version was bumped
- [ ] 6a. If version was bumped: add a **GitHub Release TODO** to the Active TODO List for Roland to publish at github.com/PatriotsRV/rv-dashboard/releases/new
- [ ] 7. Add any new bugs, gotchas, or design decisions to the **Known Issues & Gotchas** section
- [ ] 8. **Update `PRVS_PROJECT_CONTEXT.md`** — sync the TODO list and "Recently Completed" section so Roland's Claude Project (iPhone) stays current
- [ ] 9. **Save CLAUDE_CONTEXT.md to the local workspace folder** (primary)
- [ ] 10. **Push CLAUDE_CONTEXT.md to GitHub** (backup) — confirm with commit hash

> ⚠️ If the session is about to end due to context limits, Claude should say:
> *"Context is getting full — let me update CLAUDE_CONTEXT.md before we lose this session."*
> Then complete the End of Session Checklist immediately without waiting for Roland to ask.

---

## 🗂 Project Identity

| Field | Value |
|---|---|
| **Project** | Patriots RV Services (PRVS) Dashboard |
| **Owner** | Roland Shepard — roland@patriotsrvservices.com |
| **GitHub Org** | PatriotsRV |
| **Repo** | rv-dashboard |
| **Branch** | main |
| **Deployment** | GitHub Pages — https://patriotsrv.github.io/rv-dashboard/ |
| **Supabase Project Ref** | axfejhudchdejoiwaetq |

---

## 📐 Implementation Specs (2026-04-10 — Perplexity)

> **Five detailed specs live in `docs/specs/`.** These were researched and written by Perplexity Computer, reviewed by Roland, and merged via PR #15 on 2026-04-10. Claude Cowork executes from these specs — one session per phase/section.
>
> **Read the full spec before starting any session.** Each spec contains exact line numbers, before/after code blocks, SQL migrations, test plans, and rollback instructions.

| Spec File | Description | Sessions | Priority | Status |
|---|---|---|---|---|
| `docs/specs/SECURITY_REMEDIATION.md` | 10 security issues: XSS, hardcoded RBAC emails, analytics auth gap, Anthropic key in localStorage, console.log cleanup, inline onclick migration, CORS wildcards, anon key duplication, calendar ID hardcoding, search_path fix | S1–S7 (7 sessions) | 🔴 **ASAP — First weekend priority** | ✅ **ALL COMPLETE** — 2026-04-11 (10 commits + S1/S4 hotfixes, 5 Edge Functions redeployed, 2 SQL migrations run) |
| `docs/specs/TWILIO_SMS_SPEC.md` | Full Twilio SMS integration: number port guide, `sms_log` + `sms_templates` tables, `twilio-sms` Edge Function, SMS compose modal (repurposes Kenect modal), 6 message templates, A2P 10DLC registration, inbound webhook | Phase 1–3 (3 phases) | 🔴 Blocks after number port | ⏳ Not started |
| `docs/specs/TOAST_SYSTEM_SPEC.md` | Replace all `alert()` calls with non-blocking toast notifications: success/warning/danger/info types, auto-dismiss, stack management | 1 session | 🟠 High | ✅ **COMPLETE** — 2026-04-11 (commit 609201d: 116 alert→showToast, 4 confirm→toast-action, CSS+JS IIFE) |
| `docs/specs/UNIFIED_SEARCH_SPEC.md` | Global search bar: search across customer name, RO ID, VIN, RV, phone, parking spot with debounced input and highlight | 1 session | 🟠 High | ⏳ Not started |
| `docs/specs/MODULARIZATION_ROADMAP.md` | Split 13,631-line `index.html` into 18 ES modules (no bundler, GitHub Pages compatible): config, state, utils, auth, i18n, render, ro-crud, parts, work-orders, photos, time-tracking, scheduling, qr, work-list, insurance, kenect, duplicates, enhancement + CSS extraction | Phase 0–19 (~10-14 sessions) | 🟡 Long-term | ⏳ Not started |

### Spec Execution Order (Recommended)
1. ~~**Security Remediation S1** (XSS) — escapeHtml × 44 + S1 hotfix (4 gaps)~~ ✅ Done 2026-04-11
2. ~~**Security Remediation S2** (RBAC) — removes hardcoded emails, uses staff table~~ ✅ Done 2026-04-11
3. ~~**Security Remediation S3** (analytics auth) — depends on S2~~ ✅ Done 2026-04-11
4. ~~**Toast System** — replace 116 alert() with showToast, 4 confirm→toast-action~~ ✅ Done 2026-04-11
5. **Unified Search** — can run anytime, independent
6. ~~**Security Remediation S4** (Anthropic key to server-side proxy)~~ ✅ Done 2026-04-11
7. ~~**Security Remediation S5–S7** — console.log, onclick, CORS, session tokens, calendar config, search_path~~ ✅ All 10 issues complete 2026-04-11. Edge Functions redeployed. SQL migrations run.
8. **Twilio SMS Phase 1** — after number port completes (Roland action)
9. **Modularization Phase 0–19** — long-term, start after security + SMS are stable

### Perplexity + Claude Cowork Workflow
- **Perplexity Computer** researches, plans, and writes implementation specs → pushes to `docs/specs/` via GitHub
- **Claude Cowork** reads specs from `docs/specs/` and executes them — one session per phase/section
- Specs contain exact line numbers, before/after code, SQL migrations, and test plans
- Roland reviews each spec before execution and tests after each Cowork session

### Safe Fixes Already Merged (PR #14, 2026-04-10)
- `backup.yml` — added 4 missing tables: `enhancement_requests`, `manager_work_lists`, `wo_task_templates`, `wo_template_tasks`
- `backup.sh` — added 3 missing Edge Functions: `send-er-report`, `send-parts-report`, `kenect-proxy` + 2 new doc files
- `ROLLBACK.md` — updated through v1.308 with Sessions 34–37

---

## 📋 ACTIVE TODO LIST

> This is the canonical task list. Update it every session. Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium · 🔵 Low

| Priority | # | Task | Notes | Status |
|---|---|---|---|---|
| 🔴 | GH#1 | **Start Twilio number port** | Port existing number — blocks all SMS features. **Fast-tracking as of 2026-03-30 after Kenect API access denied.** | ⏳ Open — Top Priority |
| 🔴 | GH#4 | **Twilio SMS — plan + build** | Customer + tech notifications via SMS. Elevated to 🔴 after Kenect pivot. Scope TBD this session. | ⏳ Open |
| 🟠 | GH#5c | **Polish Work Orders UI** | **Session 30:** (1) WO modal filters to active services only. (2) `+ Add Service` button. (3) Form label polish. (4) Chevron collapse/expand per silo. 8 silos. **Session 30 (cont):** (5) ⏱️ Est. Hours field on each task (est_hours NUMERIC(5,2) on service_tasks — `ALTER TABLE` run). Rolls up to silo header as `⏱️ ~Xh`. (6) WO Task Templates (GH#5b folded in) — managers Save as Template / Load Template per silo with Replace or Merge choice. Two new Supabase tables: `wo_task_templates` + `wo_template_tasks`. (7) Template overlay z-index fixed (raised to 100000). (8) Outside-click dismissal disabled on New RO modal + WO modal — prevents tech data loss. Remaining: mobile layout polish, any rollout bugs. | 🔄 In Progress |
| ✅ | GH#5b | **Task Templates (V1.5)** | Folded into GH#5c Session 30 — Save as Template / Load Template / Overwrite per silo, Replace or Merge. Complete. | ✅ Done — Session 30 |
| ✅ | GH#16 | **Manager RO Work List** | **Session 31:** Base feature complete. **Session 34:** v1.305 — Sr Manager silo-specific work lists: silo tabs in sidebar, silo picker popup on add, `service_silo` column on `manager_work_lists`, same RO can be in multiple silo lists. Regular managers unchanged. | ✅ Enhanced — Session 34 |
| 🟠 | GH#17 | **Customer Check-In Page** | Front desk workstation page for customers dropping off their RV. Captures customer contact info + RO work description. Output creates a new RO that managers then enrich with photos, service selections, WO tasks, etc. Branded with PRVS logo + mission statement. Includes digital **Repair Authorization Form (RAF)** with e-signature. Living form — Roland will add fields before go-live. Runs on a dedicated front desk workstation. | ⏳ Open |
| 🟠 | GH#6 | **Employee Time Clock** | Full time clock feature in dashboard | ⏳ Open |
| 🟡 | GH#11 | **Solar Battery Bank tile — add Watt Hours** | Show Wh alongside Ah in Quote section (Wh = Ah × system voltage); update PDF output too | ⏳ Open |
| 🟡 | GH#9 | **Parts form autocomplete** | Suggest part names, suppliers, part numbers from existing `parts` table history — both Manage Parts and Parts Request modal | ⏳ Open |
| 🟡 | GH#2 | **Regular view layout customization** | Drag/resize tiles | ⏳ Open |
| 🟡 | GH#3 | **Parts field layout review** | UX improvements to parts section | ⏳ Open |
| 🟡 | GH#18 | **Parts Ordered Email Notification** | **Session 32:** Dashboard v1.304 — `requested_by_email` captured on `submitPartsRequest`, stored to DB + local data. `notifyPartsRequester()` manual trigger button in Parts Status modal. `notifyPartsEtaUpdate()` auto-fires on ETA set/change in `savePartForm`. `send-quote-email` v1.5 adds `parts_ordered` + `parts_eta_update` email types. `send-parts-report` Edge Function deployed (4-section HTML email: open requests, ordered/in-transit, overdue, received 24h). `parts-report.yml` cron live (Mon–Fri 8 AM + 3 PM CDT). Migration ran ✅. CLI deploy ✅. First report delivered ✅. **Session 37: `ro_id` FK bug fixed in sections 2/3/4 (ordered, overdue, received) — same `repair_order_id` typo from Session 32, missed in 3 of 4 queries. Redeployed ✅.** Pending: test Notify Requester button + ETA email. | 🔄 Testing notifications |
| ✅ | GH#19 | **Enhancement Request Button** | **Session 37:** Built end-to-end. Floating genie lamp button on all pages (index, checkin, worklist-report, analytics, solar, closed-ros). Modal with 10-category dropdown + voice dictation + textarea. `enhancement_requests` Supabase table with RLS. Admin "🪔 Wishes" header button with unreviewed count badge. Admin view modal with status/category filters, status update, admin notes. `send-er-report` Edge Function for daily email digest. pg_cron job (Mon-Fri 3:30 PM CDT). | ✅ Done — Session 37 |
| 🟡 | GH#20 | **Key Chain RO Identifier — QR print layout update** | Update `printQRLabel()` (v1.293) print sheet layout. The existing 1"×1" key-tag QR code stays as-is; add **RV Owner Name + RV Info (year, make, model)** alongside it so the combined key chain section fits within a **4.3" × 6.3" laminating pouch**. The 3"×3" windshield sticker also still prints on the same sheet. End result: receptionist prints → laminates the key chain section → attaches to key ring with the small QR + customer/RV info visible. | ⏳ Open |
| 🟡 | GH#8 | **Switchblade tile view** | Compact tile layout mode | ⏳ Open |
| 🟡 | — | **Update solar parts pricing** | Update all solar component pricing in solar.html using current Epoch and Victron catalog pricing | ⏳ Open |
| 🟡 | — | **GitHub Releases v1.283–v1.300** | Backlog of unpublished releases. Go to github.com/PatriotsRV/rv-dashboard/releases/new for each tag. v1.285 has notes in `.github/releases/v1.285-notes.md`. | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.301** | checkin.html v1.28 Supabase auth fix. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.301` | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.303** | GH#16 Manager RO Work List complete. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.303` | ⏳ Roland action |
| 🟡 | — | **Supabase: Maximize log retention** | Settings → Logs — set retention to maximum available on Pro plan (7 days for all log types) | ⏳ Roland action |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |
| 🟡 | — | **Test out Claude dispatch** | Test Claude dispatch workflow | ⏳ Open |
| 🟡 | GH#21 | **checkin.html Auth Persistence Fix** | Supabase client created with no auth options — no `persistSession`, `autoRefreshToken`, or `storageKey`. Authenticated session lost on every page reload (falls back to anon key). Fix: add `SB_AUTH_OPTIONS` matching index.html + `getSession()` restore on load. | ⏳ Open |
| ✅ | — | **Run SQL migration: service_silo column** | `service_silo TEXT` column confirmed on `manager_work_lists`. Migration ran by Roland. | ✅ Done — Session 37 |
| ✅ | — | **Security Remediation S2 — RBAC migration** | **2026-04-11:** Phase 1 (DB migration: users, user_roles, roles tables + 15 role entries). Phase 2 (index.html: Steps 2.1-2.13, solar access fix). Phases 3-6 (worklist-report, closed-ros, analytics, checkin: loadUserRoles + isAdmin rewrite + constant deletion). All hardcoded ADMIN_EMAILS/MANAGER_EMAILS/SR_MANAGER_EMAILS removed from all 5 HTML files. Commits: 0c04416, ee1c91e, 28c52f8, c920277. QA verified by Perplexity. | ✅ Done — 2026-04-11 |
| ✅ | — | **Security Remediation S3 — analytics + solar auth patch** | **2026-04-11:** analytics.html: supabaseSession guard on submitEnhancementRequest (replaces currentUser check). solar.html: Supabase client configured with persistSession + storageKey (prvs_solar_auth), session restore via getSession(), submitEnhancementRequest rewritten with session guard + real user identity from supabaseSession. GH#17 created for full solar.html sign-in flow. Commit: 350bf35. QA verified by Perplexity. | ✅ Done — 2026-04-11 |
| ✅ | — | **Security Remediation S4 — Anthropic API key to server-side proxy** | **2026-04-11:** Created `claude-vision-proxy` Edge Function (JWT-verified proxy to Anthropic API). Rewrote `callClaudeVision()` to use proxy (removed apiKey param, added supabaseSession guard + apikey header). Removed API key input fields from New/Edit RO forms. Removed all `prvs_anthropic_key` localStorage operations. Added one-time localStorage cleanup in `init()`. Updated `backup.sh`. S4 hotfix: added server-side JWT verification via `auth.getUser()` + client-side `apikey` header. **CLI deployed by Roland 2026-04-11 ✅.** | ✅ Done — 2026-04-11 |
| 🟡 | — | **GitHub Release v1.305** | GH#16 Sr Manager silo work lists + Work List Report page. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.305` | ⏳ Roland action |
| ✅ | — | **Batch-invite remaining techs in Supabase Auth** | All techs invited. Zak Wombles fixed Session 36; remaining techs (ignacio@, tipton@, rod@, travis@, cooper@, rudy@, tommy@) batch-invited by Roland. | ✅ Done — Session 37 |
| ✅ | GH#22 | **Closed/Cashiered RO View** | **Session 37:** `closed-ros.html` v1.0 built — card grid with photos, search/filter (customer, RO ID, RV, VIN, technician), sort options, detail modal, reactivation (Managers+Admins insert back to `repair_orders`, delete from `cashiered`). Bright yellow "🗃 Closed ROs" header button on main dashboard (all users). Genie lamp ER button included. RLS auth fix — requires real Supabase session, no localStorage fallback. | ✅ Done — Session 37 |
| 🟡 | — | **GitHub Release v1.308** | GH#22 Closed RO Archive + GH#19 ER system + parts badge fixes + Work List fix. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.308` | ⏳ Roland action |
| ✅ | — | **Deploy claude-vision-proxy Edge Function** | `supabase functions deploy claude-vision-proxy` — deployed by Roland 2026-04-11. Estimate scanner operational. Deployed twice (initial + JWT hotfix). | ✅ Done — 2026-04-11 |
| ✅ | — | **Security Remediation S5 — DEBUG-gated logging + PDF guard** | **2026-04-11:** `const DEBUG = false` + `log()`/`warn()` wrappers in index/checkin/closed-ros/worklist-report. 136 console.log → log, 40 console.warn → warn. 3 sensitive logs deleted. PDF size guard (4.5 MB) in handleEstimateFile. Commit: f12d775. | ✅ Done — 2026-04-11 |
| ✅ | — | **Security Remediation S6 — Event delegation (Phase 1)** | **2026-04-11:** Delegated click + change listeners on #boardGrid. 23 onclick= and 3 onchange= in card template replaced with data-action/data-idx attributes. 21 action cases in switch. Commit: 9c81cf7. | ✅ Done — 2026-04-11 |
| ✅ | — | **Security Remediation S7 — CORS, session tokens, calendar config, search_path** | **2026-04-11:** Dynamic getCorsHeaders(req) in 5 Edge Functions. 5 Authorization headers prefer session token. CALENDAR_IDS → CALENDAR_IDS_FALLBACK + getCalendarId() + loadAppConfig(). app_config table migration. SET search_path on is_silo_manager. Commit: 385ddd5. | ✅ Done — 2026-04-11 |
| ✅ | — | **S1 hotfix — escapeHtml on 4 XSS gaps (GH#18 QA)** | **2026-04-11:** escapeHtml on customerEmail (card mailto + photo email input), parts table fields (partName/partNumber/supplier/status), statusBadge ro.status. Commit: d5acc07. | ✅ Done — 2026-04-11 |
| ✅ | — | **Deploy 5 Edge Functions (S7 CORS changes)** | kenect-proxy, roof-lookup, send-er-report, send-parts-report, send-quote-email — all redeployed by Roland 2026-04-11 with getCorsHeaders(req). | ✅ Done — 2026-04-11 |
| ✅ | — | **Run 2 SQL migrations (S7)** | `app_config_table.sql` (8 calendar IDs seeded) + `fix_is_silo_manager_search_path.sql` (search_path fix). Run by Roland 2026-04-11 in Supabase SQL Editor. | ✅ Done — 2026-04-11 |
| ✅ | — | **Toast System (TOAST_SYSTEM_SPEC.md)** | **2026-04-11:** 116 alert()→showToast, 4 confirm()→toast-with-action, CSS toast stack + IIFE. 3 confirm() calls preserved (archive RO, delete field, delete part). Commit: 609201d. QA verified: 0 alert(), 3 confirm(), 124 showToast(). | ✅ Done — 2026-04-11 |
| ✅ | — | **slideIn keyframe fix** | **2026-04-11:** scanMilestoneBanner referenced non-existent `slideIn` keyframe (silent no-op). Rewired to `toast-slide-in` with matching 280ms cubic-bezier easing. Commit: 5d321ae. | ✅ Done — 2026-04-11 |
| ✅ | — | **Dead Code Cleanup (DEAD_CODE_CLEANUP_SPEC.md)** | **2026-04-11:** 3 phases + cross-file audit. Phase 1: 285 lines dead CSS (7 class blocks) from index.html (ac105ed). Phase 2: 584 lines dead JS (22 functions) from index.html (cc8314a). Phase 3: 60 lines from analytics/solar/worklist-report (52686f4). Cross-file: 39 lines (WireConn+DiagNode) from solar.html (c1a8ccf). Total: **968 lines removed**. index.html 13,997→13,128. solar.html 6,393→6,354. | ✅ Done — 2026-04-11 |
| 🔵 | — | **Supabase PITR** | Enable Point-in-Time Recovery — requires Small compute upgrade (~$25/mo) + PITR add-on ($100/mo for 7 days). Deferred — existing GitHub Actions daily backup is sufficient for now. Revisit if data volume or compliance needs grow. | ⏳ Down the road |

> Completed items moved to CLAUDE_CONTEXT_HISTORY.md

---
## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.308** (13,128 lines) | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system (photo attachments, email to customer), Spanish toggle, video upload, duplicate RO manager, four-state parts chip (Sourcing/Outstanding/Received/Estimate), For Estimate Only toggle, Kenect messaging (💬, dormant), 📍 Parking Spot, 🖨️ QR Print Sheet, **🔧 Work Orders (GH#5c) — 8-silo WO builder, RO-service filtering, chevron collapse, ⏱️ Est. Hours per task + rollup, Task Templates (save/load/overwrite/merge), form modal outside-click lock**, **📋 Manager Work List (GH#16) — slide-in sidebar panel, Add to My List on RO cards, drag-to-reorder, Supabase storage, Sr Manager silo-specific lists (v1.305), silo tabs + picker popup, DOM-constructed rows (v1.308)**, **📦 Parts Notifications (GH#18) — requestedByEmail captured, Notify Requester button, ETA auto-notification**, **📋 Work List Report link (Admin only, v1.305)**, **🗃 Closed ROs link (all users, v1.308)**, **🪔 Enhancement Requests (GH#19) — genie lamp, admin view, v1.307)**, **Parts request auto-creates Sourcing row in parts table (v1.307)**, **S4: Insurance estimate scanner now uses claude-vision-proxy Edge Function — API key input removed, localStorage key cleaned up** |
| `closed-ros.html` | **v1.1** | GH#22 Closed RO Archive — card grid with photos, search/filter/sort, detail modal, reactivation (Managers+Admins), genie lamp ER button. Google SSO auth gate (requires real Supabase session). **S2 Phase 4: RBAC migration — loadUserRoles, role-based isAdmin/isManagerOrAdmin/hasRole, _allStaff lookups, hardcoded email arrays removed.** |
| `worklist-report.html` | **v1.2** | Admin-only Active Work List Report — all managers' work lists + time logs per RO. Manager accordion sections (Sr Managers grouped by silo). Condensed RO rows with KPI chips (Days on Lot color-coded, Dollar Value). Expandable time log detail per RO. Staff Status tiles (red/green clock-in grid). Auto-refresh every 3 min. Google SSO auth gate. **S2 Phase 3: RBAC migration — loadUserRoles, role-based isAdmin, _allStaff lookups, hardcoded email arrays removed.** |
| `supabase/migrations/staff_table.sql` | — | Staff table migration — 14 PRVS personnel seeded (sr_manager, manager, parts_manager, tech roles) |
| `supabase/migrations/work_assignment.sql` | — | GH#5 DB migration — service_work_orders + service_tasks tables, is_silo_manager() RLS function, dollar_value column on repair_orders |
| `supabase/functions/claude-vision-proxy/index.ts` | **v1.0** | Edge Function — S4: Proxies Claude Vision API calls to Anthropic with server-side ANTHROPIC_API_KEY. JWT-verified (auth.getUser). CORS for patriotsrv.github.io. Accepts full Anthropic request body (system, messages, model, max_tokens). **⚠️ Requires CLI deploy: `supabase functions deploy claude-vision-proxy`** |
| `supabase/functions/kenect-proxy/index.ts` | **v1.1** | Edge Function — Kenect API proxy (actions: test_credentials, get_locations, get_conversation, get_conversations, get_messages_by_phone, send_message, send_review_request). Requires `KENECT_API_KEY` Supabase secret. **S7: CORS origin validation (getCorsHeaders).** |
| `checkin.html` | **v1.29** | Technician clock-in/out, offline-first IndexedDB queue, Spanish language toggle. **v1.28:** Proper Supabase auth — `signInWithIdToken()`, `getSession()` restore, `onAuthStateChange`, `clockIn()` session guard, `persistSession: true`. **S2 Phase 6: Dead ADMIN_EMAILS constant removed.** |
| `analytics.html` | **v1.1** | Analytics/reporting view. **S2 Phase 5: RBAC migration — loadUserRoles, async DOMContentLoaded/handleSignIn with signInWithIdToken, role-based isAdmin gate, hardcoded ADMIN_EMAILS removed.** |
| `solar.html` | **v2.1** (6,354 lines) | Solar installation tracking — React 18, roof planner, AI lookup, PDF quotes. **S3: Supabase client with persistSession + storageKey, session restore, session-guarded ER submit.** **Dead code cleanup 2026-04-11: WireConn + DiagNode removed (replaced by Wire2 + DiagNode2).** |
| `supabase/functions/roof-lookup/index.ts` | **v1.1** | Edge Function — Anthropic API proxy for AI roof lookup. **S7: CORS origin validation (getCorsHeaders). Redeployed 2026-04-11.** |
| `supabase/functions/send-quote-email/index.ts` | **v1.6** | Edge Function — solar quote email + parts request email + photo share email + parts ordered notification + ETA update notification (types: 'solar_quote', 'parts_request', 'photo_share', 'parts_ordered', 'parts_eta_update'). **S7: CORS origin validation (getCorsHeaders). Redeployed 2026-04-11.** |
| `supabase/functions/send-parts-report/index.ts` | **v1.2** | Edge Function — GH#18 scheduled parts status report: 4 sections (open requests, ordered/in-transit, overdue, received 24h). Queries DB via service role, emails all sr_managers + managers + parts_managers. **v1.1 (Session 37): Fixed `ro_id` FK bug in sections 2/3/4. S7: CORS origin validation (getCorsHeaders). Redeployed 2026-04-11.** |
| `supabase/functions/send-er-report/index.ts` | **v1.1** | Edge Function — GH#19 daily Enhancement Request email report. Queries unreviewed + today's requests + total open count. Styled HTML email to roland@. pg_cron: Mon–Fri 3:30 PM CDT (20:30 UTC). **S7: CORS origin validation (getCorsHeaders). Redeployed 2026-04-11.** |
| `supabase/migrations/app_config_table.sql` | — | S7 NEW: Creates `app_config` table with RLS, seeds 8 calendar IDs. Run by Roland 2026-04-11. |
| `supabase/migrations/fix_is_silo_manager_search_path.sql` | — | S7 NEW: Adds `SET search_path = public` to `is_silo_manager()`. Run by Roland 2026-04-11. |
| `.github/workflows/parts-report.yml` | — | GH#18 cron workflow — schedule commented out (migrated to Supabase pg_cron Session 37). Manual trigger preserved. |
| `scripts/backup.sh` | — | Pre-deploy backup script — 6-version rolling snapshots of all key files. **Updated 2026-04-10:** +3 Edge Functions (send-er-report, send-parts-report, kenect-proxy) + 2 doc files. |
| `docs/specs/DEAD_CODE_CLEANUP_SPEC.md` | **v1.0** | Dead code cleanup spec — 3 phases: dead CSS (285 lines), dead JS functions (584 lines), secondary HTML files (60+39 lines). Total ~968 lines removed. |
| `docs/specs/SECURITY_REMEDIATION.md` | **v1.0** | 10 security issues, 7 Claude Cowork sessions — XSS, RBAC, analytics auth, Anthropic key, console.log, onclick migration, CORS, anon key, calendar IDs, search_path |
| `docs/specs/TWILIO_SMS_SPEC.md` | **v1.0** | Full Twilio SMS integration spec — number port, Edge Function, templates, UI, A2P 10DLC, webhook |
| `docs/specs/TOAST_SYSTEM_SPEC.md` | **v1.0** | Replace alert() with toast notifications — success/warning/danger/info types |
| `docs/specs/UNIFIED_SEARCH_SPEC.md` | **v1.0** | Global search bar — debounced, multi-field, highlight matches |
| `docs/specs/MODULARIZATION_ROADMAP.md` | **v1.0** | 19-phase plan to split index.html into ES modules — no bundler, GitHub Pages compatible |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity |
| `ROLLBACK.md` | — | Emergency rollback guide — step-by-step restore instructions, version table, rollback commands |
| `SESSION_STARTER.md` | — | Copyable session kickoff prompt for Roland to paste into Claude |
| `RELEASE_NOTES_v1.265.md` | — | Release notes for v1.265 |
| `RELEASE_NOTES_v1.266.md` | — | Release notes for v1.266 |
| `.github/workflows/backup.yml` | — | Daily Supabase backup → private backup repo. **Updated 2026-04-10:** +4 tables (enhancement_requests, manager_work_lists, wo_task_templates, wo_template_tasks) |
| `docs/PRVS_Manager_Training_Guide.pdf` | **Session 33** | Manager Role Training Guide — 13 pages, 21 sections covering all manager abilities: check-in, planning, Work Orders (inc. Est. Hours + Task Templates), Parts Workflow (inc. Notify Requester + ETA auto-notification), Manager Work List, delivery, ongoing. Updated April 2026. Also saved as .docx for easy editing. |
| `docs/PRVS_Manager_Training_Guide.docx` | **Session 33** | Word version of Manager Training Guide — same content as .pdf, fully editable in Word. |

---

## ⚠️ Known Issues & Gotchas

> Key gotchas Claude must know. Full detail in CLAUDE_CONTEXT_HISTORY.md if needed.

### Auth — CRITICAL
- **`accessToken`** = Google OAuth token (~1hr). Only for Drive/Calendar API. NEVER guard Supabase ops with `!accessToken`.
- **`getSB()`** = Supabase client. Always truthy even when session expired. Use `!getSB() || !supabaseSession` as upload guard.
- **`supabaseSession`** = global, source of truth for auth state. Kept in sync via `onAuthStateChange` (`initSupabaseAuthListener()`).
- **Nonce flow:** raw nonce = 16 random bytes as **hex** string. hashed = SHA-256 of raw, also **hex** (NOT base64 — base64 was v1.263 bug). Pass `hashedNonce` to `google.accounts.id.initialize()` AND `params: { nonce: hashedNonce }` (Chrome 145). Pass `rawNonce` to `signInWithIdToken()`.
- **checkin.html v1.28:** uses default Supabase storage key (not `prvs_supabase_auth` like index.html) — separate session, intentional.

### Supabase Patterns
- Use `.maybeSingle()` (not `.single()`) when 0 rows is valid — `.single()` throws 406 on empty result.
- `writeAuditLog(roId, [{ field, oldValue, newValue }])` — pass `oldValue` BEFORE mutating `currentData`. `roId` = PRVS string ID, not UUID.
- RO ID generation: `appendToSupabase` uses optimistic insert loop with `generateROIdCandidates()` — on `23505` (duplicate key) advances to next candidate. Never revert to pre-SELECT pattern.

### Parts Request System
- `has_open_parts_request` boolean on `repair_orders` — requires SQL migration.
- Notes stored as `type: 'ro_status'` with body prefixed `🔩 PARTS REQUESTED:` — NOT `type: 'parts_request'` (violates constraint).
- `markPartsOrdered()` available to ALL roles.
- `submitPartsRequest` auto-creates a "Sourcing" row in the `parts` table (Session 37). DB constraint `parts_status_check` updated to include 'Sourcing'.
- Parts badge chip on RO card shows "Requested" (not "Sourcing") for user clarity.

### Work List — DOM Construction
- Work List rows use `document.createElement` + `addEventListener` instead of inline onclick in template literals (Session 37 fix). UUIDs and special characters in inline onclick attributes caused persistent SyntaxErrors.

### Template Literal Parser Bomb
- Never put `</script>` inside a template literal assigned to `.innerHTML` — HTML parser closes the outer script block. Move JS to named functions and wire via `onclick`/`onchange` attributes.

### Spanish Toggle
- `t(str)` — English string IS the key. Emoji must be INSIDE the `t()` call: `${t('🖨️ Print Label')}` not `🖨️ ${t('Print Label')}`. DB values stay English.

### `isAdmin()` — Now Role-Based (S2 complete 2026-04-11)
- **All 5 HTML files migrated:** `isAdmin()` now checks `userRoles.includes('Admin')` via Supabase `user_roles` table — no hardcoded email arrays anywhere.
- **`loadUserRoles()`** must be awaited before any `isAdmin()` / `isManagerOrAdmin()` / `hasRole()` call. All auth flows (DOMContentLoaded, handleSignIn/handleGoogleSignIn) already do this.
- **`_allStaff`** (from `staff` table) used for operational role lookups (sr_manager badge, silo grouping, admin exclusion from reports). Separate from `userRoles` (which is RBAC permissions).
- **Old fallback pattern `isAdmin() || ADMIN_EMAILS.includes(...)` is dead** — do not reintroduce.

### claude-vision-proxy Edge Function (S4)
- **Must be deployed via CLI** before the estimate scanner works: `supabase functions deploy claude-vision-proxy`
- Uses same `ANTHROPIC_API_KEY` secret as `roof-lookup` — already set in Supabase.
- Client sends `apikey: SUPABASE_ANON_KEY` header so Supabase gateway validates JWT before the function runs. Function also verifies JWT server-side via `auth.getUser()`.
- The 120-line system prompt stays client-side in `callClaudeVision()` — update it in index.html, no redeploy needed.
- `scan-api-key-bar` CSS class is dead but intentionally left in the stylesheet.

### DEBUG-Gated Logging (S5)
- `const DEBUG = false;` + `log()`/`warn()` wrappers defined near top of each HTML file. All `console.log`/`console.warn` routed through these (except `console.error` which stays direct).
- The helper bodies MUST use `console.log`/`console.warn` directly — never `log()`/`warn()` (infinite recursion bug hit during S5, fixed).
- 3 sensitive log lines permanently deleted (token preview, extracted data, id_token).

### Event Delegation on Card Template (S6)
- `#boardGrid` has delegated click + change listeners. Card template uses `data-action` + `data-idx`/`data-sid`/`data-field` attributes instead of inline onclick/onchange.
- 170+ onclick attributes remain outside the card template (modal buttons, header buttons, etc.) — Phase 2 scope if needed.
- The delegated change listener handles `parts-status-change` action from the `<select>` in the parts chip.

### CORS Origin Validation (S7)
- All 5 Edge Functions use `ALLOWED_ORIGIN = 'https://patriotsrv.github.io'` + `getCorsHeaders(req)` that checks `req.headers.get('origin')`.
- Non-matching origins get `Access-Control-Allow-Origin: ''` (empty string) — browser blocks the response.
- **Edge Functions must be redeployed** for CORS changes to take effect. Code is committed but runtime still has old `*` CORS.

### Toast System (2026-04-11)
- `showToast(message, type, options)` — types: `success` (green), `warning` (amber), `danger` (red), `info` (blue). Default auto-dismiss 4s. Options: `duration`, `action` (label+handler for confirm-style toasts), `persistent: true`.
- Toast CSS + JS wrapped in IIFE at top of index.html. Toast container `#toast-container` is fixed top-right, stacks vertically.
- 3 `confirm()` calls intentionally preserved: archive RO (line ~4327), delete field (~4529), delete part (~6445). These are destructive actions that need blocking confirmation.
- `showToast()` count after dead code cleanup: 116 (8 calls were inside dead functions that got removed).
- `toast-slide-in` keyframe (280ms cubic-bezier) shared with scanMilestoneBanner animation.

### Dead Code Cleanup (2026-04-11)
- **968 lines removed** across 4 commits. index.html went from 13,997 → 13,128 lines (-869). solar.html went from 6,393 → 6,354 lines (-39).
- Spec: `docs/specs/DEAD_CODE_CLEANUP_SPEC.md` — 3 phases with verification scripts.
- Dynamic CSS classes preserved (never remove): `status-*`, `urgency-*`, `toast-*`, `ro-card-status-*`.
- `_doMarkPartsOrdered` was orphaned by the removal of `markPartsOrdered` in a prior session — caught and removed in Phase 2.

### Calendar Config Table (S7)
- `app_config` table stores calendar IDs (key/value). `getCalendarId(serviceType)` checks `_appConfig` cache first, falls back to `CALENDAR_IDS_FALLBACK` constant.
- `loadAppConfig()` called in both auth paths (SSO success + session restore). Must complete before calendar features work.
- **Migration `app_config_table.sql` must be run in Supabase SQL Editor** before the config table exists.

### solar.html Auth — Partial (S3, GH#17 pending)
- solar.html has NO login gate and NO Google sign-in flow. It creates a Supabase client with `storageKey: 'prvs_solar_auth'` and attempts to restore an existing session via `getSession()`, but there is no way to CREATE a session on this page.
- The ER genie lamp submit is guarded with `!supabaseSession` and shows a clear error message directing the user to sign in on the main dashboard first.
- GH#17 tracks adding full Google sign-in to solar.html. Until then, solar's core features (quoting, PDF, projects) work without auth via permissive anon RLS on `solar_project_store` and `solar_settings`.

### Kenect — ON HOLD
- Zapier has no inbound message trigger → can't support conversation thread view. Direct partner API access still possible. `kenect-proxy` Edge Function committed but not deployed.

### Git & Deployment
- `gh` CLI not available in sandbox — use `git` directly.
- Workspace folder IS the git repo — `git push origin main` works.
- Never push directly to GitHub during an active Claude session (causes branch divergence requiring `git reset --hard`).
- Always run `bash scripts/backup.sh` before `git push`.

### Work Order System
- Roland Shepard must be in `staff` table as `sr_manager` (NULL silo) for WO RLS to work. Future admins needing WO access also need a `staff` row.
- `_staffCache` loads async after initial render — `canManageSilo()` falls back to hardcoded email lists until cache loads (<1s in practice).
- **SERVICE_SILOS** array has 8 entries: repair, vroom, solar, roof, paint_body, chassis, detailing, truetopper.
- **REPAIR_TYPE_TO_SILO** maps repairType string → silo key (case-insensitive). **SILO_TO_REPAIR_TYPE** maps silo key → canonical label. Both defined immediately after SERVICE_SILOS const.
- `renderWorkOrderView` filters silos to RO's active services only. `addServiceToRO(roIndex, siloKey)` updates `repair_type` on the RO then opens Build WO form — keeps tile + modal in sync.
- **Chevron toggle:** `toggleWOTasks(tasksId, chevId)` — task divs hidden by default (`display:none`). Chevron only rendered when `siloTasks.length > 0`. `event.stopPropagation()` on Edit/Build button prevents chevron click bleed.
- **osascript file editing pattern:** Write Python to `/tmp/patch_xxx.py` using AppleScript `write s to fp` then `do shell script "python3 /tmp/patch_xxx.py"`. Never use inline `-c` with JS template literals (backticks/quotes/dollar signs cause parse failures).

### Supabase Pro Security (Session 28)
- Removed all anon write policies from 9 tables. Fixed `has_role`/`is_silo_manager` mutable search_path. Disabled new user signups.
- ✅ Anon INSERT/UPDATE on `time_logs` removed 2026-04-05 (checkin.html v1.28 now uses authenticated sessions).

### WO Task Templates (Session 30)
- `window._pendingTemplateTasks` — global used to pass task array from `saveWOTemplate()` to `commitSaveTemplate()`. Avoids embedding complex JSON in onclick attributes.
- Template overlays must use `z-index:100000` — WO modal is z-index:11000; anything lower renders behind it.
- `saveWOTemplate()` wraps body in `try { ... } catch(err) { ... }` — if the catch block is ever removed (e.g. debug cleanup), JS fails with "Missing catch or finally after try" and breaks the entire page.

### Modal Outside-Click Lock (Session 30)
- **New RO modal (`modalOverlay`)** and **Work Order modal (`workOrderOverlay`)** no longer close on outside click — the backdrop click handlers were removed to prevent data loss when techs accidentally click outside.
- View-only modals (photo lightbox, QR, dupe manager) still close on outside click — intentional, no data at risk.
- Close via ✕ button only on form modals.

### osascript / Python Patch Pattern (Session 30)
- For any file edit involving JS template literals, emoji, backticks, `${}`, or `\n`: write the Python patch to sandbox via `Write` tool → base64-encode with `Bash` → `osascript: do shell script "echo '...' | base64 -d > /tmp/patch.py && python3 /tmp/patch.py"`. Never use AppleScript inline string concatenation for complex JS content.

### GH#16 Manager Work List (Session 31)
- `manager_work_lists` table was created in a prior session with wrong schema (had `ro_supabase_id` NOT NULL instead of `ro_id`). Fixed by DROP + CREATE TABLE with correct columns.
- Supabase JS client name in this codebase is **`getSB()`** — NOT `supabaseClient`. All Supabase calls in worklist functions use `getSB().from(...)`.
- `addToWorkList` receives **`ro._supabaseId`** (UUID) as argument and uses `currentData.find()` to look up the RO — never pass array index from a sorted display list to a function that reads `currentData[]` (arrays differ after sort).
- Python Unicode escape `\u0001f4cb` is wrong for 📋 emoji (U+1F4CB). Use HTML entity `&#128203;` or Python `\U0001F4CB` (capital U, 8 hex digits). All emoji in patches should use HTML entities.
- `_initWorkListBtn()` must be both **defined** (function body) and **called** after staff cache loads. Check both when debugging button visibility.

### Training Guide PDFs (Session 33)
- **ReportLab Helvetica font does NOT support emoji** — any emoji character (🔧 🚗 📋 ✉️ etc.) renders as a solid black square. Always use plain text for PDF generation with ReportLab's built-in fonts.
- Both PDF and DOCX versions of training guides are maintained in `docs/`. PDF for distribution, DOCX for editing.
- Build scripts: `build_guide.py` (ReportLab PDF) and `build_guide_docx.py` (python-docx DOCX) in sandbox at `/sessions/sweet-relaxed-babbage/`. These are session-local only — not committed to the repo.

### Supabase Auth — New User Onboarding
- **New signups are disabled** (Session 28 security cleanup). Any new PRVS employee must be **invited** via Supabase → Authentication → Users → Invite User before they can use checkin.html or index.html.
- Symptom if missing: Google sign-in succeeds (name shows at bottom of page) but `signInWithIdToken()` fails silently → `supabaseSession` stays null → "Your session is not ready yet. Please sign out and sign back in."
- Hit by: Nik Polizzo (Session 33, fixed Session 34), Zak Wombles (Session 36, fixed). Remaining techs may still need invites.
- Riley Scott's work email is `solar@patriotsrvservices.com` (not `riley@`). Updated in MANAGER_EMAILS Session 35.

### GH#16 Sr Manager Silo Work Lists (Session 34)
- `service_silo TEXT` column on `manager_work_lists` — nullable. NULL for regular managers, silo key string for Sr Managers. **Migration must be run manually in Supabase SQL Editor.**
- `_workListActiveSilo` state var tracks which silo tab is selected in the sidebar panel.
- `_showSiloPickerForAdd()` creates a modal overlay (z-index:12500) for Sr Managers to pick a silo. Shows already-added silos as disabled green buttons.
- Same RO can be added to multiple silo lists — duplicate check is per-silo, not per-RO.
- `_renderWorkListSiloTabs()` called from `loadWorkList()` after data loads. Tabs always shown for Sr Manager lists, hidden for regular managers.
- `_workListActiveSilo` resets to null when switching managers via the picker dropdown.

### worklist-report.html (Session 34)
- Standalone admin-only report page at `/worklist-report.html`.
- Uses its own Supabase auth with `storageKey: 'prvs_report_auth'` (separate from index.html's `prvs_supabase_auth`).
- `repair_orders` column for date is `date_received` (NOT `date_in`). Days on lot uses `date_arrived || date_received` matching dashboard logic.
- `time_logs` column for tech email is `user_id` (NOT `tech_email`). Tech display name in `tech_name` column.
- Staff tiles show all active staff from `_allStaff`. Work list sections exclude users not in the `staff` table (i.e., admin-only users with no operational role).

### CLAUDE_CONTEXT.md Storage (Session 29)
- **Local-primary strategy:** Read/write from `PRVS RO Dashboard` workspace folder. Push to GitHub at end of session as backup only.
- GitHub MCP tool has ~21KB content parameter limit — CLAUDE_CONTEXT.md is kept under this limit. CLAUDE_CONTEXT_HISTORY.md is local-primary; GitHub backup is best-effort.

---
## 🏗 Tech Stack

- **Frontend:** Vanilla JS (index/checkin/analytics); React 18.2.0 via CDN (solar.html)
- **Auth:** Google Identity Services (GIS) → Supabase `signInWithIdToken`
- **Database:** Supabase (PostgreSQL + RLS)
- **Storage:** Supabase Storage (`rv-media` bucket)
- **Backups:** GitHub Actions → `prvshepard/rv-dashboard-backups` (private), daily 4 AM EST
- **SMS:** Twilio (planned — full spec in `docs/specs/TWILIO_SMS_SPEC.md`, number port pending)
- **Offline:** IndexedDB queue in checkin.html
- **Hosting:** GitHub Pages

---

## 🗄 Supabase Tables

| Table | Purpose |
|---|---|
| `repair_orders` | Core RO data |
| `notes` | Append-only RO notes (type: `ro_status`, `customer_comm`) |
| `parts` | Parts per RO |
| `time_logs` | Technician time entries |
| `cashiered` | Cashiered/closed RO archive |
| `users` | User profiles |
| `user_roles` | User ↔ role join table |
| `roles` | Role definitions (Admin, Tech, Service Advisor, etc.) |
| `audit_log` | Field-level change audit trail |
| `config` | App configuration key/value store |
| `insurance_scans` | Insurance document scan data |
| `staff` | All PRVS personnel (name, email, role, service_silo). Migration: `supabase/migrations/staff_table.sql` |
| `service_work_orders` | One WO record per RO-silo combination |
| `service_tasks` | Individual task/step rows per WO. Includes `est_hours NUMERIC(5,2)` (added Session 30 via ALTER TABLE) |
| `wo_task_templates` | Saved WO task list templates per service silo (id, service_silo, template_name, created_by, updated_at) |
| `wo_template_tasks` | Individual task rows belonging to a template (template_id FK, task_title, description, est_hours, sort_order) |
| `manager_work_lists` | Manager personal RO work lists (id, manager_email, ro_id [UUID], ro_name, priority, created_at). RLS: each user manages own rows; Sr Managers/Admins can SELECT all rows. |
| `app_config` | App configuration key/value store (S7). Seeded with 8 calendar IDs. RLS: authenticated read, Admin write. `getCalendarId()` reads from here first, falls back to `CALENDAR_IDS_FALLBACK`. |

---

## 👥 PRVS Staff Roster

> Source of truth for personnel. Loaded into `staff` table via `supabase/migrations/staff_table.sql`.
> Admin role (Roland) auto-grants Sr. Manager access — no staff row needed.

| Name | Email | Role | Silo |
|---|---|---|---|
| Roland Shepard | roland@patriotsrvservices.com | Sr. Manager | — (Owner/Admin; added to staff table Session 27 to satisfy WO RLS) |
| Ryan Dillon | ryan@patriotsrvservices.com | Sr. Manager | — (cross-silo; acting manager for Roof + Paint & Body until dedicated hires) |
| Kevin McHenry | kevin@patriotsrvservices.com | Sr. Manager | — (added manually to Supabase + SR_MANAGER_EMAILS v1.300) |
| Mauricio Tellez | mauricio@patriotsrvservices.com | Manager | Repair |
| Jason Rubin | jason@patriotsrvservices.com | Manager | Repair |
| Andrew Page | andrew@patriotsrvservices.com | Manager | Vroom |
| Riley Scott | solar@patriotsrvservices.com | Manager | Solar |
| Bobby Thatcher | bobby@patriotsrvservices.com | Parts Manager | Parts & Insurance (office — NOT assigned to service WOs) |
| Brandon Dillon | brandon@patriotsrvservices.com | Parts Manager | Parts & Insurance (office — NOT assigned to service WOs) |
| Nik Polizzo | nik@patriotsrvservices.com | Tech | — |
| Ignacio Ochoa | ignacio@patriotsrvservices.com | Tech | — |
| Tipton Scott | tipton@patriotsrvservices.com | Tech | — |
| Rod Wimbles | rod@patriotsrvservices.com | Tech | — |
| Zak Wimbles | zak@patriotsrvservices.com | Tech | — |
| Travis Wimbles | travis@patriotsrvservices.com | Tech | — |
| Cooper Cihak | cooper@patriotsrvservices.com | Tech | — |
| Rudy Juarez | rudy@patriotsrvservices.com | Tech | — |
| Tommy Belew | tommy@patriotsrvservices.com | Tech | — |

**Service Silos:** `repair` · `vroom` · `solar` · `roof` · `paint_body`
**Dept Silos (non-service):** `parts_insurance` — Bobby + Brandon; excluded from WO assignment dropdowns.
**Multi-silo per RO:** ✅ Confirmed — one RO can have multiple silos active simultaneously (e.g., Roof + Solar).
**Task Templates:** ✅ Completed Session 30 — Save as Template / Load Template / Overwrite per silo, Replace or Merge choice on load.
**Techs:** No silo assignment for now — assignable to any service task across any silo.

---

## 🏛 Key Architecture Decisions

### Supabase RBAC
- RLS enabled on all 11 tables + storage bucket `rv-media`
- Helper function `has_role(role_name text)` — SECURITY DEFINER
- Pattern: `TO authenticated USING (true)` for reads; `WITH CHECK (has_role('Admin'))` for restricted writes
- **Status: ✅ Complete**

### Supabase Edge Function — roof-lookup
solar.html v2.0 calls `https://axfejhudchdejoiwaetq.supabase.co/functions/v1/roof-lookup` for AI roof dimension lookup. Code is committed but **must be deployed via CLI**:

```bash
npm install -g supabase
supabase login
supabase link --project-ref axfejhudchdejoiwaetq
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy roof-lookup
```

### Supabase Edge Function — kenect-proxy (v1.290)
Proxies all Kenect API calls from the dashboard. Code is committed to `supabase/functions/kenect-proxy/index.ts`. **Must be deployed via CLI:**

```bash
supabase link --project-ref axfejhudchdejoiwaetq   # if not already linked
supabase secrets set KENECT_API_KEY=your_kenect_api_key_here
# Optional (can also be set per-user in Admin Settings):
supabase secrets set KENECT_LOCATION_ID=your_location_id
supabase functions deploy kenect-proxy
```

After deploy, open Admin Settings in the dashboard → Kenect section → click **Test Connection**.

**Kenect phone number format**: The dashboard normalizes `customerPhone` to E.164 (+1XXXXXXXXXX). If customers are stored as `555-1234` (7-digit), Kenect lookups will fail — full 10-digit numbers are required.

### GH#18 Parts Notifications (Session 32)
- `requested_by_email` column on `repair_orders` — tracks who submitted the parts request. Set every time `submitPartsRequest()` is called (most recent requester).
- `updated_at` column on `parts` — auto-stamp trigger `_prvs_set_updated_at()`. Both columns added via `gh18_migration.sql` (Roland must run in Supabase SQL Editor — NOT yet run as of session 32).
- `notifyPartsRequester(filteredIndex)` — manual trigger from Parts Status modal. Shows confirm dialog with parts list preview. Only shown when `ro.requestedByEmail` is set. POSTs to `send-quote-email` with type `'parts_ordered'`.
- `notifyPartsEtaUpdate(ro, partName, eta)` — non-blocking auto-fire from `savePartForm` when ETA is set/changed on edit, or when ETA is set on a newly-added part. Only fires if `requestedByEmail` is set on the RO.
- `send-parts-report` Edge Function needs Supabase CLI deploy: `supabase functions deploy send-parts-report`. Uses SUPABASE_SERVICE_ROLE_KEY (built-in env var) + GMAIL_USER + GMAIL_APP_PASSWORD secrets.
- `parts-report.yml` cron uses `SUPABASE_SERVICE_ROLE_KEY` GitHub secret (different name from backup.yml which uses `SUPABASE_SERVICE_KEY`). Check existing secrets in GitHub → Settings → Secrets before adding.
- ⚠️ The `parts` table FK to `repair_orders` is the **`ro_id`** column (UUID) — NOT `repair_order_id`. Confirmed from `appendPartToSupabase()` in index.html. Any Supabase query filtering parts by RO must use `.in("ro_id", ...)` or `.eq("ro_id", ...)`. The Supabase join syntax is `.select("..., repair_orders(ro_id, customer_name, rv)")`. The `send-parts-report` openROPartsMap query had this wrong (used `repair_order_id`) — fixed Session 32. **Session 37: same bug found in sections 2/3/4 (ordered, overdue, received queries) — all three still used `repair_order_id`. Fixed + redeployed.**

### Daily Backup
- `.github/workflows/backup.yml` — 8 AM UTC (4 AM EST) daily + manual trigger
- Exports all 11 tables via Supabase REST API (service role key)
- Pushes to private repo `prvshepard/rv-dashboard-backups`, rolling 30-day retention
- Required secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GH_BACKUP_PAT`
- **Status: ✅ Live and tested**

---

