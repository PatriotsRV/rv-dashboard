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
- [ ] 5. Add new items to **Completed Work**
- [ ] 6. Update the **Version History** table if version was bumped
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

## 📋 ACTIVE TODO LIST

> This is the canonical task list. Update it every session. Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium · 🔵 Low

| Priority | # | Task | Notes | Status |
|---|---|---|---|---|
| ⚠️ | GH#10 | **Kenect messaging — ON HOLD** | v1.290 code committed but NOT deployed. Kenect will NOT provide direct API keys — only Zapier, which has no inbound message trigger (can't support conversation thread view). **Decision (2026-03-30): Pivoting away from Kenect to Twilio for SMS.** The `kenect-proxy` Edge Function and 💬 Messages UI remain in the codebase but are dormant until/unless Kenect reverses course. No deploy needed. | ⏳ On Hold — Twilio pivot |
| 🔴 | GH#1 | **Start Twilio number port** | Port existing number — blocks all SMS features. **Fast-tracking as of 2026-03-30 after Kenect API access denied.** | ⏳ Open — Top Priority |
| 🔴 | GH#4 | **Twilio SMS — plan + build** | Customer + tech notifications via SMS. Elevated to 🔴 after Kenect pivot. Scope TBD this session. | ⏳ Open |
| 🟠 | GH#5c | **Polish Work Orders UI** | **Session 30 progress (4 commits):** (1) WO modal now shows only services on the RO, not all silos. (2) `+ Add Service` button for Sr Managers (any silo) and Managers (own silo only). (3) WO form labels updated: "Create/Edit {emoji} {label} MASTER Work Order", "Work Order Master Status", "Total Dollar Value ($)", "Overall WO Notes", "+ Add Task or Step to WO". (4) Collapse/expand ▶/▼ chevron on each silo task card — tasks hidden by default, `toggleWOTasks()` shows/hides. SERVICE_SILOS expanded to 8 silos (added chassis 🔩, detailing 🧽, truetopper 🏕️). REPAIR_TYPE_TO_SILO + SILO_TO_REPAIR_TYPE bidirectional mappings added. Remaining: mobile layout, status badge improvements, any rollout bugs. | 🔄 In Progress |
| 🟡 | GH#5b | **Task Templates (V1.5)** | Pre-built task lists per service silo — manager clicks "Apply Template" to populate tasks for standard jobs | ⏳ Deferred |
| 🟠 | GH#16 | **Manager RO Work List** | Each manager can create a personal Work List of ROs they plan to work on. Select ROs from the dashboard, add to their Current Work List, arrange in priority order. Single-line items showing core RO data points (TBD by Roland). Living list — managers can reorder/add/remove at any time. Visible to all Sr Managers and Admins. Essentially a prioritized queue per manager. | ⏳ Open |
| 🟠 | GH#17 | **Customer Check-In Page** | Front desk workstation page for customers dropping off their RV. Captures customer contact info + RO work description. Output creates a new RO that managers then enrich with photos, service selections, WO tasks, etc. Branded with PRVS logo + mission statement. Includes digital **Repair Authorization Form (RAF)** with e-signature. Living form — Roland will add fields before go-live. Runs on a dedicated front desk workstation. | ⏳ Open |
| 🟠 | GH#6 | **Employee Time Clock** | Full time clock feature in dashboard | ⏳ Open |
| 🟡 | GH#11 | **Solar Battery Bank tile — add Watt Hours** | Show Wh alongside Ah in Quote section (Wh = Ah × system voltage); update PDF output too | ⏳ Open |
| 🟡 | GH#9 | **Parts form autocomplete** | Suggest part names, suppliers, part numbers from existing `parts` table history — both Manage Parts and Parts Request modal | ⏳ Open |
| 🟡 | GH#2 | **Regular view layout customization** | Drag/resize tiles | ⏳ Open |
| 🟡 | GH#3 | **Parts field layout review** | UX improvements to parts section | ⏳ Open |
| 🟡 | GH#18 | **Parts Ordered Email Notification** | Auto-email notification sent to the person who requested/ordered parts for an RO as soon as the Parts Manager marks the parts as ordered. Closes the communication loop so requestors know their parts are on the way. Triggered from the Parts Manager's "order" action. | ⏳ Open |
| 🟡 | GH#19 | **Enhancement Request Button** | Dashboard button allowing any PRVS worker to submit suggestions/feature requests for the RO Dashboard. Includes voice dictation capture (like Parts Request modal) + text input field. Stores requests for Roland to review. | ⏳ Open |
| 🟡 | GH#20 | **Key Chain RO Identifier — QR print layout update** | Update `printQRLabel()` (v1.293) print sheet layout. The existing 1"×1" key-tag QR code stays as-is; add **RV Owner Name + RV Info (year, make, model)** alongside it so the combined key chain section fits within a **4.3" × 6.3" laminating pouch**. The 3"×3" windshield sticker also still prints on the same sheet. End result: receptionist prints → laminates the key chain section → attaches to key ring with the small QR + customer/RV info visible. | ⏳ Open |
| 🟡 | GH#8 | **Switchblade tile view** | Compact tile layout mode | ⏳ Open |
| 🟡 | — | **GitHub Releases v1.283–v1.300** | Backlog of unpublished releases. Go to github.com/PatriotsRV/rv-dashboard/releases/new for each tag. v1.285 has notes in `.github/releases/v1.285-notes.md`. | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.301** | checkin.html v1.28 Supabase auth fix. github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.301` | ⏳ Roland action |
| 🟡 | — | **Supabase: Maximize log retention** | Settings → Logs — set retention to maximum available on Pro plan (7 days for all log types) | ⏳ Roland action |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |
| 🔵 | — | **Supabase PITR** | Enable Point-in-Time Recovery — requires Small compute upgrade (~$25/mo) + PITR add-on ($100/mo for 7 days). Deferred — existing GitHub Actions daily backup is sufficient for now. Revisit if data volume or compliance needs grow. | ⏳ Down the road |

> Completed items moved to CLAUDE_CONTEXT_HISTORY.md

---
## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.301** | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system (photo attachments, email to customer), Spanish toggle, video upload, duplicate RO manager, four-state parts chip (Sourcing/Outstanding/Received/Estimate), For Estimate Only toggle, Kenect messaging (💬, dormant), 📍 Parking Spot, 🖨️ QR Print Sheet, **🔧 Work Orders (GH#5c) — 8-silo WO builder (added chassis/detailing/truetopper), RO-service filtering, + Add Service, form label polish, ▶/▼ chevron task collapse** |
| `supabase/migrations/staff_table.sql` | — | Staff table migration — 14 PRVS personnel seeded (sr_manager, manager, parts_manager, tech roles) |
| `supabase/migrations/work_assignment.sql` | — | GH#5 DB migration — service_work_orders + service_tasks tables, is_silo_manager() RLS function, dollar_value column on repair_orders |
| `supabase/functions/kenect-proxy/index.ts` | **v1.0** | Edge Function — Kenect API proxy (actions: test_credentials, get_locations, get_conversation, get_conversations, get_messages_by_phone, send_message, send_review_request). Requires `KENECT_API_KEY` Supabase secret. |
| `checkin.html` | **v1.28** | Technician clock-in/out, offline-first IndexedDB queue, Spanish language toggle. **v1.28:** Proper Supabase auth — `signInWithIdToken()`, `getSession()` restore, `onAuthStateChange`, `clockIn()` session guard, `persistSession: true`. |
| `analytics.html` | **v1.0** | Analytics/reporting view |
| `solar.html` | **v2.0** | Solar installation tracking — React 18, roof planner, AI lookup, PDF quotes |
| `supabase/functions/roof-lookup/index.ts` | **v1.0** | Edge Function — Anthropic API proxy for AI roof lookup (⚠️ needs CLI deploy) |
| `supabase/functions/send-quote-email/index.ts` | **v1.4** | Edge Function — solar quote email + parts request email + photo share email (types: 'solar_quote', 'parts_request', 'photo_share') |
| `scripts/backup.sh` | — | Pre-deploy backup script — 6-version rolling snapshots of all key files |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity |
| `ROLLBACK.md` | — | Emergency rollback guide — step-by-step restore instructions, version table, rollback commands |
| `SESSION_STARTER.md` | — | Copyable session kickoff prompt for Roland to paste into Claude |
| `RELEASE_NOTES_v1.265.md` | — | Release notes for v1.265 |
| `RELEASE_NOTES_v1.266.md` | — | Release notes for v1.266 |
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
- **SERVICE_SILOS** array has 8 entries: repair, vroom, solar, roof, paint_body, chassis, detailing, truetopper.
- **REPAIR_TYPE_TO_SILO** maps repairType string → silo key (case-insensitive). **SILO_TO_REPAIR_TYPE** maps silo key → canonical label. Both defined immediately after SERVICE_SILOS const.
- `renderWorkOrderView` filters silos to RO's active services only. `addServiceToRO(roIndex, siloKey)` updates `repair_type` on the RO then opens Build WO form — keeps tile + modal in sync.
- **Chevron toggle:** `toggleWOTasks(tasksId, chevId)` — task divs hidden by default (`display:none`). Chevron only rendered when `siloTasks.length > 0`. `event.stopPropagation()` on Edit/Build button prevents chevron click bleed.
- **osascript file editing pattern:** Write Python to `/tmp/patch_xxx.py` using AppleScript `write s to fp` then `do shell script "python3 /tmp/patch_xxx.py"`. Never use inline `-c` with JS template literals (backticks/quotes/dollar signs cause parse failures).

### Supabase Pro Security (Session 28)
- Removed all anon write policies from 9 tables. Fixed `has_role`/`is_silo_manager` mutable search_path. Disabled new user signups.
- ✅ Anon INSERT/UPDATE on `time_logs` removed 2026-04-05 (checkin.html v1.28 now uses authenticated sessions).

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
- **SMS:** Twilio (planned — number port in progress)
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
| `staff` | ⏳ Pending migration — all PRVS personnel (name, email, role, service_silo). Replaces hardcoded TECH_EMAILS / MANAGER_EMAILS arrays. Migration: `supabase/migrations/staff_table.sql` |

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
| Riley Scott | riley@patriotsrvservices.com | Manager | Solar |
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
**Task Templates:** Deferred to V1.5 — keep on TODO list.
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

### Daily Backup
- `.github/workflows/backup.yml` — 8 AM UTC (4 AM EST) daily + manual trigger
- Exports all 11 tables via Supabase REST API (service role key)
- Pushes to private repo `prvshepard/rv-dashboard-backups`, rolling 30-day retention
- Required secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GH_BACKUP_PAT`
- **Status: ✅ Live and tested**

---

