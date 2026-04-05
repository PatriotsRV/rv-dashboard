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
> *"Before we stop: run bash scripts/backup.sh, then run the End of Session Checklist from CLAUDE_CONTEXT.md. Update the TODO list, File Inventory, Session Log, Completed Work, Known Issues, and Version History as needed. Save CLAUDE_CONTEXT.md to the workspace folder, then push to GitHub as a backup. Do not end the session until the push is confirmed with a commit hash."*

Claude must complete ALL of these before the session ends (context limit, user stops, etc.):

- [ ] 1. Run `bash scripts/backup.sh` from the repo root
- [ ] 2. Update the **Active TODO List** — mark completed items ✅, add any new items discovered
- [ ] 3. Update the **File Inventory** table with new version numbers
- [ ] 4. Add a row to the **Session Log** table
- [ ] 5. Add new items to **Completed Work** in CLAUDE_CONTEXT_HISTORY.md
- [ ] 6. Update the **Version History** table in CLAUDE_CONTEXT_HISTORY.md if version was bumped
- [ ] 6a. If version was bumped: add a **GitHub Release TODO** to the Active TODO List
- [ ] 7. Add any new bugs, gotchas, or design decisions to the **Known Issues & Gotchas** section
- [ ] 8. **Update `PRVS_PROJECT_CONTEXT.md`** — sync TODO list and "Recently Completed" for Roland's iPhone
- [ ] 9. **Save CLAUDE_CONTEXT.md and CLAUDE_CONTEXT_HISTORY.md to the local workspace folder** (primary)
- [ ] 10. **Push both files to GitHub** (backup) — confirm with commit hash

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

## 📋 ACTIVE TODO LIST

> This is the canonical task list. Update it every session. Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium · 🔵 Low

| Priority | # | Task | Notes | Status |
|---|---|---|---|---|
| ⚠️ | GH#10 | **Kenect messaging — ON HOLD** | v1.290 code committed but NOT deployed. Kenect will NOT provide direct API keys — only Zapier, which has no inbound message trigger. **Decision (2026-03-30): Pivoting to Twilio for SMS.** `kenect-proxy` + 💬 Messages UI remain dormant. | ⏳ On Hold |
| 🔴 | GH#1 | **Start Twilio number port** | Port existing number — blocks all SMS features. **Fast-tracking as of 2026-03-30 after Kenect API access denied.** | ⏳ Open — Top Priority |
| 🔴 | GH#4 | **Twilio SMS — plan + build** | Customer + tech notifications via SMS. Elevated to 🔴 after Kenect pivot. Scope TBD this session. | ⏳ Open |
| 🟠 | GH#5c | **Polish Work Orders UI** | **Session 30:** WO modal filters to active services only; + Add Service btn; form label polish; chevron collapse/expand; 8 silos. **Session 30 (cont):** ⏱️ Est. Hours per task (`est_hours NUMERIC(5,2)` on `service_tasks`); rolls up to silo header. WO Task Templates — Save/Load/Overwrite per silo, Replace or Merge on load. Two new tables: `wo_task_templates` + `wo_template_tasks`. Template overlay z-index fixed (100000). Outside-click lock on New RO + WO modals. Remaining: mobile polish, rollout bugs. | 🔄 In Progress |
| ✅ | GH#5b | **Task Templates (V1.5)** | Folded into GH#5c Session 30 — Save/Load/Overwrite per silo, Replace or Merge. Complete. | ✅ Done — Session 30 |
| 🟠 | GH#16 | **Manager RO Work List** | Each manager can create a personal Work List of ROs they plan to work on. Select ROs from the dashboard, add to their Current Work List, arrange in priority order. Single-line items showing core RO data points (TBD by Roland). Living list — managers can reorder/add/remove at any time. Visible to all Sr Managers and Admins. Essentially a prioritized queue per manager. | ⏳ Open |
| 🟠 | GH#17 | **Customer Check-In Page** | Front desk workstation page for customers dropping off their RV. Captures customer contact info + RO work description. Output creates a new RO that managers then enrich with photos, service selections, WO tasks, etc. Branded with PRVS logo + mission statement. Includes digital **Repair Authorization Form (RAF)** with e-signature. Living form — Roland will add fields before go-live. Runs on a dedicated front desk workstation. | ⏳ Open |
| 🟠 | GH#6 | **Employee Time Clock** | Full time clock feature in dashboard | ⏳ Open |
| 🟡 | GH#11 | **Solar Battery Bank tile — add Watt Hours** | Show Wh alongside Ah in Quote section (Wh = Ah × system voltage); update PDF output too | ⏳ Open |
| 🟡 | GH#9 | **Parts form autocomplete** | Suggest part names, suppliers, part numbers from existing `parts` table history | ⏳ Open |
| 🟡 | GH#2 | **Regular view layout customization** | Drag/resize tiles | ⏳ Open |
| 🟡 | GH#3 | **Parts field layout review** | UX improvements to parts section | ⏳ Open |
| 🟡 | GH#18 | **Parts Ordered Email Notification** | Auto-email notification sent to the person who requested/ordered parts for an RO as soon as the Parts Manager marks the parts as ordered. | ⏳ Open |
| 🟡 | GH#19 | **Enhancement Request Button** | Dashboard button allowing any PRVS worker to submit suggestions/feature requests. Includes voice dictation + text input. Stores requests for Roland to review. | ⏳ Open |
| 🟡 | GH#8 | **Switchblade tile view** | Compact tile layout mode | ⏳ Open |
| 🟡 | — | **GitHub Releases v1.283–v1.300** | Backlog of unpublished releases. Go to github.com/PatriotsRV/rv-dashboard/releases/new for each tag. v1.285 has notes in `.github/releases/v1.285-notes.md`. | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.301** | checkin.html v1.28 Supabase auth fix. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.301` | ⏳ Roland action |
| 🟡 | — | **Supabase: Maximize log retention** | Settings → Logs — set retention to maximum available on Pro plan | ⏳ Roland action |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |
| 🔵 | — | **Supabase PITR** | Point-in-Time Recovery — requires Small compute upgrade (~$25/mo) + PITR add-on ($100/mo). Deferred — existing GitHub Actions daily backup sufficient for now. | ⏳ Down the road |

> Completed items archived in CLAUDE_CONTEXT_HISTORY.md

---

## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.300** | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system (photo attachments, email to customer), Spanish toggle, video upload, duplicate RO manager, four-state parts chip (Sourcing/Outstanding/Received/Estimate), For Estimate Only toggle, Kenect messaging (💬, dormant), 📍 Parking Spot, 🖨️ QR Print Sheet, **🔧 Work Orders (GH#5c) — 8-silo WO builder, RO-service filtering, chevron collapse, ⏱️ Est. Hours per task + rollup, Task Templates (save/load/overwrite/merge), form modal outside-click lock** _(version not bumped this session — bump to v1.302 at next release)_ |
| `supabase/migrations/staff_table.sql` | — | Staff table migration — 14 PRVS personnel seeded (sr_manager, manager, parts_manager, tech roles) |
| `supabase/migrations/work_assignment.sql` | — | GH#5 DB migration — service_work_orders + service_tasks tables, is_silo_manager() RLS function, dollar_value column on repair_orders |
| `supabase/functions/kenect-proxy/index.ts` | **v1.0** | Edge Function — Kenect API proxy. Requires `KENECT_API_KEY` Supabase secret. NOT deployed. |
| `checkin.html` | **v1.28** | Tech clock-in/out, offline-first IndexedDB queue, Spanish toggle. **v1.28:** Proper Supabase auth — `signInWithIdToken()`, `getSession()` restore, `onAuthStateChange`, `clockIn()` session guard, `persistSession: true`. |
| `analytics.html` | **v1.0** | Analytics/reporting view |
| `solar.html` | **v2.0** | Solar installation tracking — React 18, roof planner, AI lookup, PDF quotes |
| `supabase/functions/roof-lookup/index.ts` | **v1.0** | Edge Function — Anthropic API proxy for AI roof lookup (⚠️ needs CLI deploy) |
| `supabase/functions/send-quote-email/index.ts` | **v1.4** | Edge Function — solar quote email + parts request email + photo share email |
| `scripts/backup.sh` | — | Pre-deploy backup script — 6-version rolling snapshots of all key files |
| `CLAUDE_CONTEXT.md` | Session 29 | This file — active session memory (local-primary) |
| `CLAUDE_CONTEXT_HISTORY.md` | Session 29 | Historical archive — completed work, version history, session log, completed TODOs |
| `ROLLBACK.md` | — | Emergency rollback guide |
| `SESSION_STARTER.md` | — | Copyable session kickoff prompt for Roland |
| `.github/workflows/backup.yml` | — | Daily Supabase backup → private backup repo |

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

### Template Literal Parser Bomb
- Never put `</script>` inside a template literal assigned to `.innerHTML` — HTML parser closes the outer script block. Move JS to named functions and wire via `onclick`/`onchange` attributes.

### Spanish Toggle
- `t(str)` — English string IS the key. Emoji must be INSIDE the `t()` call: `${t('🖨️ Print Label')}` not `🖨️ ${t('Print Label')}`. DB values stay English.

### `isAdmin()` Timing Bug (v1.282b)
- Post-load admin checks: use `isAdmin() || ADMIN_EMAILS.includes(supabaseSession?.user?.email)` — never `isAdmin()` alone. Root cause: `getUserInfo()` runs during `init()` with no token, sets `currentUser` to unknown email, blocking real session restore.

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

### WO Task Templates (Session 30)
- `window._pendingTemplateTasks` stores task array between saveWOTemplate() and commitSaveTemplate() — avoids complex JSON in onclick attributes.
- Template overlays need z-index:100000 (WO modal is 11000 — lower values render behind it).
- saveWOTemplate() must keep its try/catch — removing it causes "Missing catch or finally after try" and breaks the whole page.

### Modal Outside-Click Lock (Session 30)
- New RO modal (modalOverlay) and WO modal (workOrderOverlay) no longer close on outside click — backdrop handlers removed to prevent tech data loss.
- View-only modals (photo lightbox, QR, dupe manager) still close on outside click — intentional.

### CLAUDE_CONTEXT.md Storage (Session 29)
- Local-primary: read/write from Cowork workspace folder. GitHub push at end of session only.

### Supabase Pro Security (Session 28)
- Removed all anon write policies from 9 tables. Fixed `has_role`/`is_silo_manager` mutable search_path. Disabled new user signups.
- ✅ Anon INSERT/UPDATE on `time_logs` removed 2026-04-05 (checkin.html v1.28 now uses authenticated sessions).


- **Local-primary strategy:** Read/write from `PRVS RO Dashboard` workspace folder. Push to GitHub at end of session as backup only.
- GitHub MCP tool has ~21KB content parameter limit — CLAUDE_CONTEXT.md kept under this limit. CLAUDE_CONTEXT_HISTORY.md is local-primary; GitHub backup is best-effort.

---

## 🏗 Tech Stack

- **Frontend:** Vanilla JS (index/checkin/analytics); React 18.2.0 via CDN (solar.html)
- **Auth:** Google Identity Services (GIS) → Supabase `signInWithIdToken`
- **Database:** Supabase (PostgreSQL) with RLS
- **Storage:** Supabase Storage (`rv-media` bucket)
- **Email:** Supabase Edge Functions → Resend API
- **Deployment:** GitHub Pages (auto-deploy on push to main)
- **Backup:** GitHub Actions daily → private backup repo; `scripts/backup.sh` pre-deploy snapshots

---

## 🗄 Supabase Tables

`repair_orders` · `parts` · `notes` · `audit_log` · `users` · `user_roles` · `time_logs` · `cashiered` · `config` · `insurance_scans` · `locations` · `staff` · `service_work_orders` · `service_tasks`

---

## 👥 PRVS Staff Roster

> Source of truth for personnel. Loaded into `_staffCache` at session start.

| Name | Role | Silo |
|---|---|---|
| Roland Shepard | sr_manager | NULL (all silos) |
| Riley [Last] | manager | Solar |
| [Parts Manager name] | parts_manager | NULL |
| [Tech names × 10+] | tech | Various silos |

> Full roster in `supabase/migrations/staff_table.sql` — 14 personnel seeded at v1.295.

---

## 🏛 Key Architecture Decisions

- **No build step** — everything ships as vanilla HTML/JS/CSS. React only for solar.html via CDN. Keeps deployment friction zero.
- **Supabase as backend** — Auth + DB + Storage + Edge Functions. No separate API server.
- **RLS as security layer** — Row Level Security on all tables. Anon key is safe in client code because RLS enforces access.
- **Offline-first checkin** — IndexedDB queue for clock-in/out. Drains on reconnect. Now uses authenticated sessions (v1.28).
- **Optimistic RO ID insert** — No pre-SELECT. Try insert, catch `23505`, advance candidate. Eliminates race condition.
- **Edge Functions for external APIs** — Kenect proxy, email send, AI roof lookup. Keeps API keys server-side.
- **GitHub Pages = CDN** — Zero-config deployment, global CDN, custom domain optional. Free tier sufficient.
- **CLAUDE_CONTEXT.md local-primary (Session 29)** — Read/write from Cowork workspace folder. GitHub push at end of session only. Avoids 21KB MCP tool limit for mid-session updates.

---
