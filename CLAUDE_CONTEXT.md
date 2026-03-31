# PRVS Dashboard — Claude Context Document

> **This is Claude's memory across sessions.** Claude has no memory between sessions.
> Every session MUST start by reading this file. Every session MUST update this file before ending.

---

## ⚡ SESSION PROTOCOL — READ THIS FIRST

### 🟢 START OF SESSION CHECKLIST
Claude must complete all of these before doing any work:

- [ ] 1. Read this entire file top to bottom
- [ ] 2. Confirm the current `index.html` version matches the File Inventory table below
- [ ] 3. Read and acknowledge the **Active TODO List** section aloud to Roland
- [ ] 4. Ask Roland: *"Is there anything new to add or change from the TODO list before we start?"*
- [ ] 5. Only then begin work — starting with the highest-priority TODO item unless Roland redirects

### 🔴 END OF SESSION CHECKLIST
Claude must complete ALL of these before the session ends (context limit, user stops, etc.):

- [ ] 1. Update the **Active TODO List** — mark completed items ✅, add any new items discovered
- [ ] 2. Update the **File Inventory** table with new version numbers
- [ ] 3. Add a row to the **Session Log** table
- [ ] 4. Add new items to **Completed Work**
- [ ] 5. Update the **Version History** table if version was bumped
- [ ] 5a. If version was bumped: add a **GitHub Release TODO** to the Active TODO List for Roland to publish at github.com/PatriotsRV/rv-dashboard/releases/new
- [ ] 6. Add any new bugs, gotchas, or design decisions to the **Known Issues & Gotchas** section
- [ ] 7. **Update `PRVS_PROJECT_CONTEXT.md`** — sync the TODO list and "Recently Completed" section so Roland's Claude Project (iPhone) stays current
- [ ] 8. **Run `bash scripts/backup.sh`** before pushing — creates timestamped snapshot in `.backups/`, keeps last 6
- [ ] 9. Commit and push CLAUDE_CONTEXT.md and PRVS_PROJECT_CONTEXT.md to GitHub

> ⚠️ If the session is about to end due to context limits, Claude should say:
> *"Context is getting full — let me update CLAUDE_CONTEXT.md before we lose this session."*
> and complete the End of Session Checklist before anything else.

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
| ✅ | GH#14 | **Parts chip states — Sourcing / Outstanding / Received / Estimate** | Four-state system: 🔍 Part Sourcing (neon orange), ⚠️ Parts Outstanding (yellow), ✅ Parts Received (green), 📋 Parts Estimate (blue, pulsing). `parts_status` column on `repair_orders`. Auto-flip to Received when all parts marked received. Manager/Admin set status modal. For Estimate Only toggle in Request Parts modal. Filter buttons for all four states. bobby@, solar@, brandon@ added to MANAGER_EMAILS + Supabase. | ✅ Done v1.284–v1.285 |
| 🟠 | GH#5 | **Work Assignment System — Phase 1 ✅ v1.295** | **DONE (Phase 1):** `staff` table (14 personnel seeded), `service_work_orders` + `service_tasks` tables, `is_silo_manager()` RLS function, `dollar_value` on `repair_orders`. 🔧 Work Orders button on every RO card → modal showing all 5 silos. Silo access control (canManageSilo / isSrManagerOrAdmin). Build/Edit WO form: status, dollar value, notes, full task list. Techs update own task status; managers update any in their silo. Dollar rollup → card refresh. **Pending (Phase 2):** (1) Lock urgency selector to Manager+Admin only. (2) GH#5 open questions: confirm multi-silo per RO ✅, task templates deferred to V1.5, Roof+PaintBody manager TBD (Ryan covers). (3) Tech "My Tasks" filtered view — techs currently see all tasks; a dedicated view showing only their assigned tasks across all ROs. (4) Task dependency system (V1.5 — Solar before Roof). | 🔄 Phase 1 done v1.295 — Phase 2 pending |
| 🟠 | GH#5c | **Polish Work Orders UI** | General UX polish pass: visual refinements, edge cases, mobile layout, status badge improvements, any bugs from initial rollout | ⏳ Open |
| 🟡 | GH#5b | **Task Templates (V1.5)** | Pre-built task lists per service silo — manager clicks "Apply Template" to populate tasks for standard jobs | ⏳ Deferred |
| 🟠 | GH#6 | **Employee Time Clock** | Full time clock feature in dashboard | ⏳ Open |
| 🟠 | GH#15 | **Virtual Lot Map + Parking Spot + QR Print** | Three-phase build: **(1) ✅ Parking Spot field — DONE v1.291/v1.292** — `parking_spot` dropdown on New/Edit RO + RO card yellow chip; lot positions R1–R20, B1–B14, Wash Bay 17/18, W1–W4, F1–F12; SQL migration: `ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS parking_spot TEXT`. **(2) ✅ QR Code print sheet — DONE v1.293** — `printQRLabel()` rebuilt: dual-sticker print window with 3"×3" windshield sticker (customer name, RV, RO#, parking spot chip) + 1"×1" key tag; QRCode.js generated fresh in print window; proper `@media print` CSS with dashed cut borders and physical inch sizing. **(3) Interactive Virtual Lot Map** — new dashboard view mirroring the physical whiteboard layout (upper bays, lower bays, outdoor spots); each cell shows customer name + repair type when occupied; Manager clicks to assign/move RV; color-coded by urgency; replaces the physical whiteboard. | 🔄 Phase 1+2 done — Phase 3 pending |
| ✅ | GH#13 | **Pre-deploy backup system** | `scripts/backup.sh` — 6-version rolling snapshots to `.backups/` before every push | ✅ Done |
| ✅ | GH#12 | **Spanish language toggle** | Full UI translation of presentation layer only — labels, buttons, modals, status text. DB stays English. `t()` function approach. Self-selectable toggle per user (localStorage). Globe icon in header. Both index.html (v1.277) and checkin.html (v1.27) done. | ✅ Done |
| 🟡 | GH#11 | **Solar Battery Bank tile — add Watt Hours** | Show Wh alongside Ah in Quote section (Wh = Ah × system voltage); update PDF output too | ⏳ Open |
| 🟡 | GH#9 | **Parts form autocomplete** | Suggest part names, suppliers, part numbers from existing `parts` table history — both Manage Parts and Parts Request modal | ⏳ Open |
| 🟡 | GH#2 | **Regular view layout customization** | Drag/resize tiles | ⏳ Open |
| 🟡 | GH#3 | **Parts field layout review** | UX improvements to parts section | ⏳ Open |
| 🟡 | GH#8 | **Switchblade tile view** | Compact tile layout mode | ⏳ Open |
| ✅ | — | **Deploy roof-lookup Edge Function** | Confirmed deployed — 5 deployments, updated 2 days ago | ✅ Done |
| ✅ | — | **Test calendar re-auth on iPhone** | Full mobile OAuth round-trip flow — confirm Schedule modal reopens after auth | ✅ Done |
| ✅ | — | **GitHub Release v1.277** | Published by Roland | ✅ Done |
| ✅ | — | **GitHub Release v1.278** | Published | ✅ Done |
| ✅ | — | **GitHub Release v1.279** | Published | ✅ Done |
| 🟡 | — | **GitHub Release v1.283** | Create release at github.com/PatriotsRV/rv-dashboard/releases/new — tag v1.283 | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.284** | Create formal release at github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.284` already exists | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.285** | Create formal release at github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.285` already exists, release notes in `.github/releases/v1.285-notes.md` | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.286–v1.289** | Create formal releases at github.com/PatriotsRV/rv-dashboard/releases/new — tags v1.286, v1.287, v1.288, v1.289 all exist | ⏳ Roland action |
| 🟡 | — | **GitHub Releases v1.290–v1.294** | Create formal releases at github.com/PatriotsRV/rv-dashboard/releases/new for tags v1.290 (Kenect), v1.291–v1.292 (Parking Spot), v1.293 (QR Print Sheet), v1.294 (QR deep link) | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.295** | Create formal release at github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.295` exists — GH#5 Work Assignment System Phase 1 | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.296** | Create formal release at github.com/PatriotsRV/rv-dashboard/releases/new — tag `v1.296` — Work Orders bug-fix pass (5 fixes: _supabaseId, save guard, dark inputs, silo badge, wrong RO index) | ⏳ Roland action |
| ✅ | — | **Confirm Merge Dupes button visible** | Confirmed working — button appears and merge flow executes correctly | ✅ Done |
| ✅ | — | **Fix Supabase rv-media bucket MIME types** | Roland confirmed bucket MIME list updated to include docx, xlsx, pptx, pdf, text, octet-stream | ✅ Done |
| ✅ | — | **Redeploy send-quote-email Edge Function v1.4** | photo_share type + CC repair@ on all emails — confirmed deployed | ✅ Done |
| ✅ | — | **Run SQL migration for Parts Request** | `has_open_parts_request BOOLEAN` column confirmed present in `repair_orders` table | ✅ Done |
| ✅ | — | **Redeploy send-quote-email Edge Function** | Confirmed deployed — 13 deployments, updated a day ago | ✅ Done |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |

---

## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.296** | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system with photo attachments, photo lightbox viewer, email photos to customer, Spanish language toggle, video upload support, duplicate RO manager (Admin), Date RV Arrived on Lot save fix, four-state RO-level parts chip system (Sourcing/Outstanding/Received/Estimate), For Estimate Only toggle, Manager role expanded, Wholesale/Retail price columns in Manage Parts table, Freight Charge label (was Core Charge), Sourcing added to individual part row status dropdown, Supplier Contact section moved to top of Add/Edit Part form, Kenect messaging integration (💬 button on RO cards, conversation modal, send/review), 📍 Parking Spot field (R/B/W/F lot positions), 🖨️ Dual-sticker QR Print Sheet (3"×3" windshield + 1"×1" key tag), QR codes link to main dashboard RO tile with deep-link highlight, **🔧 Work Orders system (GH#5 Phase 1+fixes) — 5-silo work order builder, task management, silo-level access control, dollar value rollup (v1.295–v1.296)** |
| `supabase/migrations/staff_table.sql` | — | Staff table migration — 14 PRVS personnel seeded (sr_manager, manager, parts_manager, tech roles) |
| `supabase/migrations/work_assignment.sql` | — | GH#5 DB migration — service_work_orders + service_tasks tables, is_silo_manager() RLS function, dollar_value column on repair_orders |
| `supabase/functions/kenect-proxy/index.ts` | **v1.0** | Edge Function — Kenect API proxy (actions: test_credentials, get_locations, get_conversation, get_conversations, get_messages_by_phone, send_message, send_review_request). Requires `KENECT_API_KEY` Supabase secret. |
| `checkin.html` | **v1.27** | Technician clock-in/out, offline-first IndexedDB queue, Spanish language toggle |
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

> Things Claude MUST know going into any session. Add new discoveries here.

### Auth Architecture — CRITICAL to understand
- **`accessToken`** = Google OAuth token. Expires ~1 hour. ONLY needed for Google Drive / Google Calendar API calls. **Never use `!accessToken` as a guard for Supabase operations.**
- **`getSB()`** = Supabase client. Always available if user is logged in. Use `!getSB()` as the guard for all database/storage operations.
- **`supabaseSession`** = global holding the active Supabase session. Source of truth for auth state. Kept in sync via `onAuthStateChange` listener (`initSupabaseAuthListener()`).
- **Persistent sessions** — `persistSession: true`, `autoRefreshToken: true`, `storageKey: 'prvs_supabase_auth'`. Sessions last 30 days. Users must re-login once after v1.265 due to storageKey change.

### Nonce Flow (Google Sign-In → Supabase)
- Raw nonce = 16 random bytes as **hex string**
- Hashed nonce = SHA-256 of raw nonce, also **hex string** (NOT base64 — base64 was the v1.263 bug)
- `hashedNonce` goes as top-level `nonce:` in `google.accounts.id.initialize()` AND as `params: { nonce: hashedNonce }` (Chrome 145 compat)
- Both nonces stored in localStorage to survive async gaps

### Supabase `.single()` vs `.maybeSingle()`
- `.single()` throws a 406 error when zero rows are found
- Always use `.maybeSingle()` when 0 rows is a valid result (e.g., `getUserRole()`, any optional lookup)

### Audit Log — `writeAuditLog(roId, changes)`
- Signature: `writeAuditLog(roId, [{ field, oldValue, newValue }])`
- `roId` = PRVS string ID (e.g. "CUS-RV-2025-01-15"), NOT the Supabase UUID
- Function internally looks up the Supabase UUID via `currentData.find(d => d.roId === roId)`
- Include `user_id: supabaseSession?.user?.id` — this is already in the function, do NOT add it in callers
- **oldValue timing trap:** callers must pass oldValue BEFORE mutating `currentData`. If `currentData[i].field = newValue` is done before calling `writeAuditLog`, the old value is lost.

### Photo Migration (Drive → Supabase Storage)
- `photoJobs.push({ roId: ro.id, ... })` — `ro.id` IS the Supabase UUID (primary key)
- `ro.ro_id` is the PRVS string ID — do NOT confuse these
- The `.eq('id', job.roId)` calls are correct

### Calendar Scheduling Re-Auth
- `_pendingScheduleIndex` global stores the filtered-data index across the OAuth round-trip
- `reauthorizeCalendar(filteredIndex)` uses `prompt:'consent'` to force interactive popup
- After successful OAuth, `initSupabaseAuthListener()` in tokenClient callback re-opens the modal

### Parts Request System (v1.267–v1.269)
- `has_open_parts_request` boolean column on `repair_orders` — **requires SQL migration** (see TODO list)
- Parts request notes stored in `notes` table as `type: 'ro_status'` ONLY with body prefixed `🔩 PARTS REQUESTED: ...` — do NOT use `type: 'parts_request'` (violates `notes_type_check` constraint which only allows `ro_status` and `customer_comm`)
- History modal (`openPartsRequestDetails`) queries: `.eq('type', 'ro_status').ilike('body', '%PARTS REQUESTED%')` — not `.eq('type', 'parts_request')`
- Email uses `send-quote-email` Edge Function with `type: 'parts_request'` param — ✅ deployed (v1.3 with photo thumbnails confirmed live)
- Management email hardcoded as `parts@patriotsrvservices.com` — placeholder until email group is created
- `SUPABASE_ANON_KEY` and `SUPABASE_URL` constants (defined at top of init block) are used directly in the fetch call — no auth header upgrade needed since Edge Function is public
- `markPartsOrdered()` is available to ALL roles (no role restriction) — business rule is that it's a manual acknowledgement only, tracked in audit log
- **Photo attachments (v1.269):** `_partsRequestFiles[]` is module-level (not inside any function) — FileList objects are immutable, so files are copied into this mutable array; cleared to `[]` on modal open. `URL.createObjectURL(file)` used for instant local previews. Photos uploaded via existing `uploadToSupabaseStorage(file, roId)` helper and added to `photo_library` via `parseLibrary`/`serializeLibrary`/`updatePhotoLibraryInSheet`.

### Upload Auth Pattern (v1.271)
- All upload functions (`uploadPhoto`, `uploadDocument`) must guard with `!getSB() || !supabaseSession` — NOT just `!getSB()`. `getSB()` always returns a truthy client object even when the session has expired; only `supabaseSession === null` reliably indicates "not authenticated"
- The session re-check must also be repeated INSIDE async `onchange` callbacks because the session can expire between when the file picker opens and when the user selects a file
- `uploadDocument` no longer uses Google Drive at all — it uses `uploadToSupabaseStorage(file, roId + '/docs')` → `addDocToLibrary`. Do NOT revert to Google Drive; `accessToken` is a short-lived Google OAuth token (~1 hour) and will always expire
- Document storage path in `rv-media` bucket: `{roId}/docs/{timestamp}_{filename}`

### editField — Two Distinct Behaviors
- `repairDescription` → **full replace**: modal pre-fills with current text, save writes the entire new value to `repair_orders.description`, audit log records old + new
- `roStatusNotes` / `customerCommunicationNotes` → **append-only**: blank modal, new text gets `[timestamp - user]` prefix appended with `\n---\n` separator, written as new row in `notes` table
- `showVoiceNotesModal(title, prefillValue = '')` — second param pre-fills textarea; leave empty for append-style fields

### RO ID Generation — Optimistic Insert Pattern (v1.280+)
- `generateROId(name, rv, date)` is a **deterministic 32-bit hash** — same inputs always produce the same ID. Safe for lookups/display; NOT safe as a direct insert key.
- **`generateROIdCandidates(name, rv, date)`** returns `[base, base-2, ..., base-9, base-XXXX]` — all possible IDs to try in order.
- **`appendToSupabase` uses an optimistic insert loop**: tries each candidate, on `error.code === '23505'` advances to next, any other error is thrown. No pre-SELECT needed — eliminates the check-then-insert race window entirely.
- Never revert to pre-checking with `generateUniqueROId` (deleted in v1.280) — concurrent submits could both pass the check and both fail on insert.

### Spanish Language Toggle (v1.277)
- **`t(str)`** — takes an English string as key, returns Spanish from `TRANSLATIONS_ES` or falls back to the English string. English IS the key — no abstract key names.
- **`getLang()` / `setLang(lang)`** — reads/writes `prvs_lang` in localStorage. `setLang` also calls `translateStaticUI()` and `renderBoard()`.
- **`setupI18n()`** — called once at `init()` time via `setTimeout(setupI18n, 50)`. Programmatically adds `data-i18n` attributes to static DOM elements (header h1, filter labels, filter buttons) using their English text as the key. Idempotent.
- **`translateStaticUI()`** — queries all `[data-i18n]` elements, updates text content. For elements with child ELEMENT_NODEs (e.g. filter labels with chevron spans), updates only the first TEXT_NODE. Also updates `[data-i18n-ph]` placeholder attributes and syncs the globe button label.
- **Emoji keys** — dict keys for some buttons include the emoji (e.g. `'🖨️ Print Label'`, `'🚪 Tech Check In'`, `'✏️ Edit RO'`). The emoji MUST be inside the `t()` call: `${t('🖨️ Print Label')}` NOT `🖨️ ${t('Print Label')}`.
- **DB values stay English** — status dropdown `value=""` attributes must remain English; only the displayed option text is wrapped with `t()`.
- **checkin.html** — Spanish toggle NOT yet applied to checkin.html (still open).

### `isAdmin()` Timing Bug (v1.282b)
- **Root cause:** `getUserInfo()` is called during `init()` even when no Google access token exists. With no token, it sets `currentUser = { email: 'unknown@user.com' }`. The session restore path has `if (!currentUser)` guard — which is `false` (currentUser is truthy) — so it never overwrites `currentUser` with the real email from the Supabase session. Result: `isAdmin()` checks `currentUser.email === 'unknown@user.com'` and returns `false`, even for real admins.
- **Fix pattern:** Any code that needs to check admin status after page load should do BOTH: `isAdmin() || ADMIN_EMAILS.includes((supabaseSession?.user?.email || '').toLowerCase())`. Do NOT rely on `isAdmin()` alone in post-load callbacks.
- **Affected areas:** Duplicate RO Manager post-load check. Any future feature that gates Admin UI based on role should use the same pattern.

### Inline `</script>` Tag Inside Template Literal — Parser Bomb
- If `modal.innerHTML = \`...\`` contains a literal `</script>` tag (e.g. an inline `<script>...</script>` block), the HTML parser treats it as closing the **outer** `<script>` block. Everything after that point is not parsed as JS.
- Symptom: `Uncaught SyntaxError: Unexpected end of input` at the line where the outer script block would normally close + all global functions defined below that point become "not defined".
- **Fix:** Never put inline `<script>` blocks inside template literals assigned to `.innerHTML`. Move any JS logic to a globally-scoped named function and wire it via `onchange="myFunction()"` or `onclick="myFunction()"` attributes instead.
- Real example: `syncEstimateToggle()` was originally an inline `<script>` inside `openPartsStatusModal`'s `modal.innerHTML` — caused `gapiLoaded is not defined` and broke the entire page (v1.285 first attempt).

### Kenect Integration — Zapier vs Direct API
- Kenect's support team recommends Zapier rather than direct API access.
- **Zapier Actions (Zapier → Kenect):** Send Text Message, Send Review Request, Push Lead — these all work fine via Zapier
- **Zapier Triggers (Kenect → Zapier):** Only one trigger exists: **Lead Push** (fires when a new lead comes in). There is **NO trigger for inbound customer reply messages**.
- This means Zapier cannot support the conversation thread view we built in the 💬 Messages modal — you can't query or receive inbound messages via Zapier.
- The `kenect-proxy` Edge Function (v1.290) was built against the direct partner API which the Zapier integration itself uses internally. Pushing for direct API access is the right move.
- Credentials format for Zapier (from their docs): API Key + API Secret + Location ID — same three fields we use in the Edge Function.

### Direct Pushes to main During Active Session — Causes Branch Divergence
- When Claude is in an active session editing `index.html`, our local git state is "ahead" of GitHub by our uncommitted/unpushed changes.
- If Roland pushes directly to GitHub during that window (e.g. backup restore, hotfix from GitHub web UI), the remote branch gets new commits that our local branch doesn't have. Claude's next `git push` is then rejected.
- **Recovery cost is high** — requires `git reset --hard origin/main` which discards all local session work, then full re-application of all changes from scratch.
- **Rule:** Never push directly to GitHub while a Claude session is active. If a restore is needed urgently, tell Claude at the **start of the next session** before any files are touched — Claude will `git pull` first.
- **Better alternative to direct pushes:** Use `ROLLBACK.md` commands or just start a new Claude session and say "roll back to vX.XXX".

### Pre-Deploy Backup System
- **Always run `bash scripts/backup.sh` before `git push origin main`** — this is step 7 of the End of Session Checklist
- Snapshots saved to `.backups/YYYY-MM-DD_HH-MM-SS/` — 6 rotating versions kept automatically
- Files backed up: `index.html`, `checkin.html`, `solar.html`, `analytics.html`, `supabase/functions/send-quote-email/index.ts`, `supabase/functions/roof-lookup/index.ts`
- To restore a file: `cp .backups/YYYY-MM-DD_HH-MM-SS/index.html ./index.html`
- `.backups/` is committed to the repo — visible and restorable without any git knowledge

### GitHub Push
- `gh` CLI is NOT available in the sandbox; use `git` directly from `/sessions/.../mnt/rv-dashboard/`
- The workspace folder IS the git repo — `git push origin main` works directly

### Work Order System — Roland in Staff Table (v1.296)
- Roland Shepard (`roland@patriotsrvservices.com`) was added to the `staff` table as `sr_manager` (NULL silo) via SQL in Session 27. This was required because `is_silo_manager()` RLS checks the `staff` table EXISTS clause; Roland was not in the table initially, causing every `service_work_orders` INSERT to fail with an RLS violation.
- The `staff` table is now the canonical source of truth for WO access. All future Admins who need to create/edit work orders must have a row in `staff` with `role = 'sr_manager'` or `role = 'manager'`.

### Work Order System — `_staffCache` Timing (v1.295)
- `loadStaff()` is called after `loadDataFromSupabase()` + `loadTimeLogsFromSupabase()` in the auth listener — it runs async and does NOT block the initial render.
- `canManageSilo()` and `isSrManagerOrAdmin()` both fall back gracefully if `_staffCache` is empty (only SR_MANAGER_EMAILS and ADMIN_EMAILS hardcoded lists apply until the cache loads). In practice the staff table loads in <1s so this is never visible.
- `buildWOTaskRowHtml()` uses `Date.now()` in the row element ID to ensure uniqueness — this prevents duplicate IDs when multiple tasks are added rapidly. Safe for the current use case.
- The `depends_on` column exists in `service_tasks` but is not surfaced in the UI yet — reserved for V1.5 task dependency system (Solar before Roof use case).
- `MANAGER_EMAILS` now uses `riley@patriotsrvservices.com` (Solar Manager). The old `solar@patriotsrvservices.com` generic email was removed from this array — confirm that address is no longer in use before deprovisioning it in Supabase `user_roles`.

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

## ✅ Completed Work

- ✅ **Supabase RBAC** — RLS on all 11 tables + storage, `has_role()` helper
- ✅ **checkin.html v1.26** — Supabase backend, offline-first IndexedDB queue
- ✅ **Nonce fixes (v1.262, v1.263)** — placement + hex encoding; Supabase auth working
- ✅ **Analytics button (v1.264)** — Admin-only, dark green, tile view header
- ✅ **Version tags** — Visible version badge on all 4 HTML files
- ✅ **Daily backup** — GitHub Actions, private repo, 30-day rolling, tested
- ✅ **GitHub PAT rotated** — `repo` + `workflow` scopes
- ✅ **solar.html v2.0** — React 18, roof planner, AI lookup via Edge Function proxy, PDF quote
- ✅ **PDF quote generation (solar.html)** — 2-page branded PDF via jsPDF + jspdf-autotable
- ✅ **Email PDF attachment** — send-quote-email Edge Function; PDF via nodemailer
- ✅ **RO Description fixes (v1.265, ×4)** — inline edit guard, fieldMap, NULL fallback, Edit modal textarea
- ✅ **Mobile filter cutoff fix** — `.filter-collapsible.open` max-height 300→600px
- ✅ **Calendar re-auth flow** — `reauthorizeCalendar()`, `prompt:'consent'`, `_pendingScheduleIndex` round-trip
- ✅ **Persistent Supabase auth** — `persistSession`, `autoRefreshToken`, `storageKey`, `onAuthStateChange`; 30-day sessions
- ✅ **`!accessToken` guard fixes** — 5 functions corrected to use `!getSB()`
- ✅ **Audit log user_id fix** — duplicate function removed; `user_id: supabaseSession?.user?.id` added
- ✅ **Chrome 145 nonce fix** — `params: { nonce: sbHashedNonce }` added
- ✅ **Supabase users 406 fix** — `getUserRole()` `.single()` → `.maybeSingle()`
- ✅ **Write function hardening (v1.266)** — Error handling + audit log: `updateFieldInSupabase`, `updateROStatus`, `updateROUrgency`, `updateROProgress`, `updatePhotoInSupabase`
- ✅ **Parts Request System (v1.267)** — `openPartsRequestModal()` with voice dictation; `submitPartsRequest()` writes notes (type `parts_request` + `ro_status`), sets `has_open_parts_request=true`, emails `parts@patriotsrvservices.com`; neon-pink pulsing chip + card border on RO card; `openPartsRequestDetails()` shows history; `markPartsOrdered()` clears flag + logs resolution; `send-quote-email` v1.2 handles `type:'parts_request'` branch
- ✅ **notes_type_check fix (v1.268)** — Changed parts request note insert from `type:'parts_request'` to `type:'ro_status'` with `🔩 PARTS REQUESTED:` body prefix; history query uses `.ilike('body', '%PARTS REQUESTED%')`
- ✅ **Parts Request photo attachments (v1.269)** — `_partsRequestFiles[]` global array + `previewPartsPhotos/removePartsPhoto/renderPartsPhotoPreview` helpers; orange "📷 Attach / Take Photo(s)" button in modal; thumbnails with × remove; on submit uploads via `uploadToSupabaseStorage`, adds to RO `photo_library`, passes `photoUrls[]` to Edge Function; `send-quote-email` v1.3 embeds photos as inline clickable thumbnails in email HTML
- ✅ **RO Description inline edit fix (v1.270)** — `showVoiceNotesModal` now accepts optional `prefillValue` param; modal pre-fills textarea with existing description, cursor placed at end; `editField` branches on `repairDescription`: full replace on save (not append), old value captured from `currentFilteredData` before mutation, `writeAuditLog` called with before/after; `roStatusNotes` and `customerCommunicationNotes` keep existing append + timestamp behavior
- ✅ **Document upload MIME fix (v1.272)** — `uploadToSupabaseStorage` accepts `skipContentType` option; `uploadDocument` passes `skipContentType:true` to bypass bucket MIME policy for non-image files; improved error message with fix instructions; Roland confirmed bucket MIME list updated in Supabase dashboard
- ✅ **Document modal refresh fix (v1.273)** — After document upload, `currentFilteredData[index].photoLibrary` explicitly synced from `currentData[originalIndex].photoLibrary`; `openPhotoLibrary` accepts `initialTab = 'photos'|'docs'` param; modal closes and reopens on Documents tab after upload so new doc is immediately visible
- ✅ **60-second visibility note (v1.274)** — Document upload success alert now tells user documents may take up to 60 seconds to appear due to Supabase Storage propagation delay
- ✅ **Photo lightbox viewer (v1.275)** — Photo thumbnails tap to open full-screen lightbox; `openPhotoLightbox(photoIdx, libIndex)` renders full-size photo with prev/next nav, photo counter, "💾 Open / Save" link (opens in new tab/prompts save), "⭐ Set as Main" button (non-main) or "Main Photo" label (main); `navigateLightbox(dir)` cycles photos; `closePhotoLightbox()` removes overlay; `window._libPhotos`, `_libMainUrl`, `_libRoIndex` set at modal open for lightbox navigation; "Set as Main" moved from grid thumbnails to lightbox view
- ✅ **Email photos to customer (v1.275)** — "📧 Email Photos to Customer" button appears below photo grid if `ro.customerEmail` exists and photos are present; `openPhotoEmailModal(index)` shows overlay with checkboxes per photo (all pre-checked), pre-filled recipient email, optional message textarea; `sendPhotosToCustomer(index)` calls Edge Function with `type:'photo_share'`; `send-quote-email` Edge Function v1.4 adds `photo_share` branch — branded customer email with inline photo grid, each photo as clickable full-size link; **Roland must redeploy Edge Function** for this to work
- ✅ **Pre-deploy backup system** — `scripts/backup.sh` creates timestamped snapshots of all 6 key files in `.backups/`, keeps last 6 versions, runs before every push per End of Session Checklist
- ✅ **Photo & document upload fix (v1.271)** — `uploadDocument` fully migrated from Google Drive (was using expired `accessToken` → 401) to Supabase Storage (`uploadToSupabaseStorage` → `addDocToLibrary`); `uploadPhoto` and `uploadDocument` guards changed from `!getSB()` to `!getSB() || !supabaseSession`; session re-check added inside async `onchange` callback; error message updated to "Session expired — please refresh"
- ✅ **Email photos auth fix (v1.276)** — `sendPhotosToCustomer` switched from `session?.access_token` to `SUPABASE_ANON_KEY` as Bearer token (consistent with `submitPartsRequest`); improved error handler checks `result.message` and HTTP status
- ✅ **CC on photo emails (Edge Function v1.4b)** — `send-quote-email` always CCs `repair@patriotsrvservices.com` on every photo_share email send
- ✅ **Spanish language toggle (v1.277, GH#12 — index.html)** — Globe toggle button (🌐 ES / 🌐 EN) in header; `TRANSLATIONS_ES` dictionary (~70 key/value pairs); `t(str)` helper (English key → Spanish or fallback); `getLang()`/`setLang()` reading/writing `prvs_lang` in localStorage; `translateStaticUI()` updates all `[data-i18n]` DOM elements and `[data-i18n-ph]` placeholders; `setupI18n()` tags static header/filter DOM elements at init() time; all RO card strings wrapped with `t()`: urgency options, status dropdown, info labels (Type/RV/VIN/Tech/Phone/Email/Address), section titles, placeholder texts, button labels, parts badges, insurance badges, QR section, time logs; `updateStats()` "RVs on Lot" translated; `setupI18n()` called via `setTimeout` at end of `init()`
- ✅ **Spanish language toggle (v1.27, GH#12 — checkin.html)** — Same `prvs_lang` localStorage key (shared with index.html); globe button in logo area; `TRANSLATIONS_ES` dict covering all check-in/out UI: RO info labels, clocked-in/out badges, timer header, service type section, work notes/dictation, action buttons, clock-out summary, auto clock-out modal, offline banner; `translateStaticUI()` called at DOMContentLoaded; `setLang()` triggers `render()` if already loaded
- ✅ **Duplicate ro_id 409 fix (v1.278)** — `generateROId()` is a deterministic 32-bit hash; same customer+RV+date (or any hash collision) produced identical IDs causing a Supabase 409 Conflict on insert. Added `async generateUniqueROId(name, rv, date)` which calls `generateROId()` then checks Supabase with `.maybeSingle()` before committing — if collision detected, appends `-2` through `-9`, then falls back to a base-36 timestamp suffix. Updated `appendToSupabase` to `await generateUniqueROId()`. Added try/catch at the New RO form submit handler so errors produce a user-visible alert instead of a silent uncaught promise rejection.
- ✅ **Video upload support (v1.279)** — Added `isVideoUrl(url)` helper (checks .mp4/.mov/.avi/.mkv/.webm/.m4v/.3gp extensions). `uploadPhoto` now accepts `image/*,video/*` and the image-only `continue` filter was widened to allow `video/` MIME types. Thumbnail grid renders a dark `🎬 VIDEO` tile for video URLs instead of a broken `<img>`. Lightbox renders `<video controls autoplay>` for videos and suppresses "Set as Main" (videos can't be an RO's main photo). Email modal shows videos as disabled/non-checkable with a `🎬 Video (not emailable)` label. "Add New Photo" button renamed "Add Photo / Video".
- ✅ **Fix RO insert race condition (v1.280)** — Replaced check-then-insert pattern (`generateUniqueROId` with pre-SELECT) with optimistic insert loop (`generateROIdCandidates` returns base + -2..-9 + timestamp fallback). `appendToSupabase` now tries each candidate in sequence; on `error.code === '23505'` it advances to the next; any other error is re-thrown. Eliminates the TOCTOU race where concurrent submits could both pass the pre-check and both fail on insert. Also added submit button disable/re-enable around the save call to prevent double-submissions.
- ✅ **Fix roId scope bug (v1.281)** — `appendToSupabase` optimistic insert loop used `for (const roId of candidates)`; the `console.log` after the loop referenced `roId` which is block-scoped to the loop body, causing `ReferenceError: roId is not defined`. Fixed by changing `console.log('✅ New RO saved:', roId)` to `console.log('✅ New RO saved:', data.ro_id)`.
- ✅ **Duplicate RO Manager (v1.282)** — `getBaseROId(roId)` strips `-2`/`-3`/`-XXXX` suffixes via regex to find the base PRVS hash. `findDuplicateGroups()` groups `currentData` by base ID and returns groups with 2+ members. Admin-only `🔗 Merge Dupes` button in header (hidden until dupes detected) with red badge count. `openDuplicateManager()` modal shows each group with radio buttons to pick the master RO. `executeDupeMerge()` reassigns foreign keys on `notes`, `parts`, `time_logs`, `insurance_scans`, `audit_log` tables; merges `photo_library` arrays; copies `rvPhotoUrl` from duplicate to master if master has none; DELETEs duplicate `repair_orders` rows; reloads data.
- ✅ **Fix isAdmin() timing bug for Merge Dupes button (v1.282b)** — `getUserInfo()` called with no Google token sets `currentUser = { email: 'unknown@user.com' }`. The `if (!currentUser)` guard in session restore then skips overwriting it with the real email. `isAdmin()` checks `currentUser.email` which is wrong. Fix: post-load dupe check now also checks `supabaseSession?.user?.email` directly against `ADMIN_EMAILS` (`const _sessionEmail = (supabaseSession?.user?.email || '').toLowerCase(); const _isAdminNow = isAdmin() || ADMIN_EMAILS.includes(_sessionEmail)`). Added `console.log('🔗 Dupe check: X duplicate(s) found, button shown/hidden')` for debugging.
- ✅ **Fix "Date RV Arrived on Lot" not saving (v1.283)** — `updateROInSupabase()` had `date_arrived` missing from its Supabase `.update()` payload. Value was correctly read from the Edit RO form into `formData.dateArrived` but silently dropped before the DB write. Fix: added `date_arrived: formData.dateArrived || null` to the payload. Explains why it appeared to work on some ROs (those whose date was auto-set via the status-change path) but failed on others (manually entered via Edit RO).
- ✅ **Parts chip states — three-state system (v1.284, GH#14)** — `parts_status` column added to `repair_orders` (CHECK constraint: 'sourcing', 'outstanding', 'received'). Three chips: 🔍 Part Sourcing (neon orange, pulsing), ⚠️ Parts Outstanding (yellow, pulsing), ✅ Parts Received (green). `openPartsStatusModal()` for Manager/Admin — click any chip to change state. `setPartsStatus()` writes to Supabase, logs note + audit entry. Auto-flip: `markPartReceived()` checks if all parts received/installed and calls `setPartsStatus(..., 'received')` automatically. Filter buttons: `ps-sourcing`, `ps-outstanding`, `ps-received`. `submitPartsRequest` sets `parts_status='outstanding'`. Backward compat with legacy `has_open_parts_request` boolean.
- ✅ **Parts Estimate chip + For Estimate Only toggle (v1.285, GH#14 cont.)** — Fourth state: 📋 Parts Estimate (blue, pulsing). Added to `parts_status` CHECK constraint. `For Estimate Only` toggle in Request Parts modal — sets `parts_status='estimate'` instead of `'outstanding'` when enabled. `syncEstimateToggle()` global function updates toggle visual (avoids inline `</script>` parser bug). Estimate button in `openPartsStatusModal`. `ps-estimate` filter button. Spanish: `ESTIMACIÓN DE PARTES`. bobby@, solar@, brandon@ added to `MANAGER_EMAILS` and Supabase `user_roles`.
- ✅ **ROLLBACK.md** — Emergency rollback guide committed to repo root. Step-by-step terminal instructions, version table with commands, hard-refresh note, GitHub Releases link, and direct Claude fallback option.
- ✅ **Rename Core Charge → Freight Charge (v1.286)** — UI label only in Add/Edit Part form Pricing section. DB column `core_charge` and JS variable `coreCharge` unchanged — no migration needed.
- ✅ **Wholesale + Retail Price columns in Manage Parts table (v1.287)** — Two new columns added between Qty and Quick: Wholesale (dark, right-aligned) and Retail (green, right-aligned). Formatted as `$X.XX` or `—` if not set. Empty-state colspan updated 7→9. git tag v1.287 created.
- ✅ **Sourcing added to individual part row status dropdown (v1.288)** — Added `'Sourcing'` to `PART_STATUSES` array (between In Transit and Received) and `PART_STATUS_COLORS` (neon orange #ff6a00, matching RO-level chip). Clarified that RO-level chips (Sourcing/Outstanding/Received/Estimate) are separate from per-part-row statuses.
- ✅ **Supplier Contact section moved to top of Add/Edit Part form (v1.289)** — New section order: 🏢 Supplier Contact → 🔩 Core Info → 📦 Order Info → 💰 Pricing → ✅ Receipt. Applies to both Add New Part and Edit Part (shared form).
- ✅ **Kenect messaging integration (v1.290, GH#10)** — `kenect-proxy` Supabase Edge Function committed (actions: test_credentials, get_locations, get_conversation, get_messages_by_phone, send_message, send_review_request). 💬 Messages button on RO cards (only when customerPhone exists). Chat-style conversation modal with inbound (left) / outbound (right) bubbles. Send message + Send Review Request buttons. Admin Settings Kenect section: Location ID input, Test Connection, Load Locations. `kenectCall(action, params, payload)` helper POSTs to Edge Function with anon key auth. Pending: Roland must deploy Edge Function + set KENECT_API_KEY secret.
- ✅ **Parking Spot field Phase 1 (v1.291, GH#15)** — `parking_spot` TEXT column added to `repair_orders`. Dropdown in New RO + Edit RO with grouped optgroups: Rear Lot (R1–R20), Interior Bays (B1–B14), Wash (Wash Bay 17/18, W1–W4), Front Lot (F1–F12). Yellow 📍 chip on RO card when spot assigned. SQL: `ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS parking_spot TEXT`.
- ✅ **Parking Spot lot remap (v1.292)** — All positions renamed from original whiteboard names to Roland's handwritten R/B/W/F system: R1–R20 (Rear Lot), B1–B14 (Interior Bays), Wash Bay 17, Wash Bay 18, W1–W4 (Wash), F1–F12 (Front Lot).
- ✅ **QR Print Sheet Phase 2 (v1.293, GH#15)** — `printQRLabel()` rebuilt as dual-sticker print window. 3"×3" windshield sticker: full QR code at 2.28", customer name, RV make, RO#, yellow parking spot chip. 1"×1" key tag: compact QR + RO#. Both generated fresh via QRCode.js in print window (no canvas-copy). `@media print` CSS with physical `in` units and dashed cut borders. Print button hidden on print.
- ✅ **QR scan → main RO tile deep link (v1.294, GH#15)** — QR codes now link to `/?ro={roId}` (main dashboard) instead of `checkin.html`. `handleDeepLink()` reads `?ro=` URL param, finds matching RO in `currentFilteredData`, scrolls to tile and pulses 3× blue highlight ring. `_deepLinkRoId` one-shot flag prevents re-triggering on subsequent `renderBoard()` calls. `openCheckIn()` (🚪 Tech Check In button) still goes to `checkin.html`.
- ✅ **Work Assignment System Phase 1 (v1.295, GH#5)** — `staff` table seeded (14 personnel: Ryan sr_manager, Mauricio+Jason repair managers, Andrew vroom, Riley solar, Bobby+Brandon parts_manager, 9 techs). `service_work_orders` + `service_tasks` tables + `is_silo_manager()` Supabase RLS function. `dollar_value` column added to `repair_orders`. `SERVICE_SILOS`, `WO_STATUS_LABELS`, `TASK_STATUS_LABELS`, `TASK_STATUS_COLORS`, `SR_MANAGER_EMAILS` constants. `MANAGER_EMAILS` updated (added jason@, riley@; removed solar@). `_staffCache`, `_workOrderCache` globals. `loadStaff()`, `isSrManagerOrAdmin()`, `canManageSilo()`, `getStaffTechs()`, `getStaffName()`, `loadWorkOrdersForRO()`, `openWorkOrderModal()`, `renderWorkOrderView()`, `openBuildWOForm()`, `buildWOTaskRowHtml()`, `addWOTaskRow()`, `submitWOForm()`, `updateTaskStatusWO()`, `computeAndSaveWORollup()` functions. 🔧 Work Orders button on every RO card. 5-silo Work Order modal. DB-level + JS-level silo access control. Dollar rollup triggers `renderBoard()`. `PRVS_WorkOrders_TrainingGuide.pdf` created.
- ✅ **Work Orders bug-fix pass (v1.296, Session 27)** — 5 fixes: (1) `ro.supabaseId` → `ro._supabaseId` in 7 places — modal always showed "RO not found in database"; (2) `submitWOForm` guard `ro?.supabaseId` → `ro?._supabaseId` — save was silently no-op on every click; (3) All WO form inputs (status, dollar, notes, task title/desc/tech/status) removed dark `form-input`/`form-select` classes, switched to explicit white bg + dark text; (4) Silo emoji+label badge added to each task row header via `buildWOTaskRowHtml(index, task, opts, silo)`; (5) `openWorkOrderModal` now resolves filtered-list index to `currentData` index via `_supabaseId` lookup — was opening wrong RO when board was filtered/sorted. Roland added himself (`roland@patriotsrvservices.com`) to `staff` table as `sr_manager` via SQL to satisfy `is_silo_manager()` RLS check.

---

## 📜 Version History

| Version | Date | Summary |
|---|---|---|
| v1.0 | Early 2025 | Initial dashboard (Google Sheets backend) |
| v1.1 | — | Supabase migration begins |
| v1.26 | 2026-03 | checkin.html — Supabase backend, IndexedDB offline queue |
| v1.262 | 2026-03-19 | Fix nonce placement in `google.accounts.id.initialize` |
| v1.263 | 2026-03-19 | Fix nonce encoding (hex not base64); localStorage persistence |
| v1.264 | 2026-03-19 | Analytics button (Admin only); version badges on all files |
| solar v2.0 | 2026-03-19 | solar.html rebuilt — React 18, roof planner, AI lookup, PDF quote |
| v1.265 | 2026-03-20 | 4× RO description fixes; mobile filter fix; calendar re-auth; persistent auth; 406 fix; audit log fix |
| v1.266 | 2026-03-20 | Write function hardening — error handling + audit log on 5 functions |
| v1.267 | 2026-03-20 | Parts Request System — modal, voice dictation, neon-pink pulsing chip, auto-note, management email, Mark Ordered flow |
| v1.268 | 2026-03-20 | Fix notes_type_check constraint — use ro_status type + body prefix for parts request notes |
| v1.269 | 2026-03-20 | Parts Request photo attachments — upload to Storage, add to photo_library, inline email thumbnails |
| v1.270 | 2026-03-20 | RO Description inline edit — pre-fill modal with current content, full replace, before/after audit log |
| v1.271 | 2026-03-20 | Fix photo & document uploads — uploadDocument migrated to Supabase Storage; supabaseSession guard on both upload paths |
| v1.272 | 2026-03-22 | Fix document upload MIME rejection — skipContentType option on uploadToSupabaseStorage; document uploads bypass bucket MIME policy; improved error message |
| v1.273 | 2026-03-22 | Fix document modal refresh — sync currentFilteredData photoLibrary after addDocToLibrary; openPhotoLibrary initialTab param; reopens on docs tab after upload |
| v1.274 | 2026-03-22 | Add 60-second visibility note to document upload success alert |
| v1.275 | 2026-03-22 | Photo lightbox viewer (tap to view/save, prev/next nav, Set as Main from viewer); Email photos to customer (send selected photos to RO customer email via Edge Function); Edge Function v1.4 adds photo_share type |
| v1.276 | 2026-03-22 | Fix email photos auth — sendPhotosToCustomer uses SUPABASE_ANON_KEY (not session JWT); improved error handler |
| v1.277 | 2026-03-22 | Spanish language toggle (GH#12) — globe button, TRANSLATIONS_ES dict, t() helper, translateStaticUI(), setupI18n(); full RO card + stats translation |
| v1.278 | 2026-03-23 | Fix duplicate ro_id 409 crash — generateUniqueROId() checks for collision before insert, appends -2/-3 suffix; try/catch at submit handler for user-visible errors |
| v1.279 | 2026-03-23 | Video upload support — isVideoUrl() helper; Photos tab accepts video/*; 🎬 tile in grid; <video controls> in lightbox; email modal disables videos |
| v1.280 | 2026-03-23 | Fix RO insert race condition — optimistic insert loop replaces check-then-insert; 23505 → auto-retry next suffix; submit button disabled during save |
| v1.281 | 2026-03-23 | Fix roId scope bug — console.log after insert loop used block-scoped loop var; changed to data.ro_id |
| v1.282 | 2026-03-23 | Duplicate RO Manager — Admin-only 🔗 Merge Dupes button with badge count; modal groups dupes by base PRVS hash; pick master per group; merge notes/parts/time_logs/insurance_scans/audit_log FKs + photo_library; delete duplicates |
| v1.282b | 2026-03-23 | Fix isAdmin() timing bug — Merge Dupes button wasn't showing because getUserInfo() pollutes currentUser.email; post-load dupe check now also checks supabaseSession?.user?.email against ADMIN_EMAILS directly |
| v1.283 | 2026-03-23 | Fix "Date RV Arrived on Lot" not saving — date_arrived was missing from updateROInSupabase() payload; silently dropped on every Edit RO save |
| v1.284 | 2026-03-24 | Parts chip states (GH#14) — three-state system: 🔍 Part Sourcing (neon orange), ⚠️ Parts Outstanding (yellow), ✅ Parts Received (green); parts_status column; openPartsStatusModal; auto-flip on all parts received; filter buttons ps-sourcing/ps-outstanding/ps-received; submitPartsRequest sets parts_status='outstanding' |
| v1.285 | 2026-03-24 | Four-state parts system + Estimate (GH#14) — 📋 Parts Estimate chip (blue, pulsing); For Estimate Only toggle in Request Parts modal; syncEstimateToggle() global; ps-estimate filter; Spanish ESTIMACIÓN DE PARTES; bobby@/solar@/brandon@ added to Manager role; ROLLBACK.md created; git tag v1.285 |
| v1.286 | 2026-03-25 | Rename "Core Charge" label to "Freight Charge" in Add/Edit Part form — UI label only, DB column unchanged |
| v1.287 | 2026-03-25 | Add Wholesale and Retail Price columns to Manage Parts table — between Qty and Quick, formatted $X.XX or —; colspan 7→9; git tag v1.287 |
| v1.288 | 2026-03-25 | Add Sourcing to individual part row status dropdown — between In Transit and Received; neon orange color matching RO-level chip |
| v1.289 | 2026-03-25 | Move Supplier Contact section to top of Add/Edit Part form — new order: Supplier Contact → Core Info → Order Info → Pricing → Receipt |
| v1.290 | 2026-03-26 | Kenect messaging integration (GH#10) — kenect-proxy Edge Function; 💬 Messages button on RO cards; chat-style conversation modal; send message + review request; Admin Settings Kenect section |
| v1.291 | 2026-03-27 | Parking Spot field Phase 1 (GH#15) — parking_spot dropdown on New/Edit RO; yellow 📍 chip on RO card; all R/B/W/F lot positions; SQL migration |
| v1.292 | 2026-03-27 | Parking Spot lot remap — positions renamed per handwritten photo: R1–R20, B1–B14, Wash Bay 17/18, W1–W4, F1–F12 |
| v1.293 | 2026-03-27 | QR Print Sheet Phase 2 (GH#15) — dual-sticker print window: 3"×3" windshield sticker + 1"×1" key tag; QRCode.js fresh-generated; @media print CSS with physical inch sizing |
| v1.294 | 2026-03-27 | QR scan → main RO tile deep link — QR codes link to /?ro= instead of checkin.html; handleDeepLink() scrolls to tile + 3× blue highlight pulse; openCheckIn() (Tech Check In) unchanged |
| v1.295 | 2026-03-30 | GH#5 Work Assignment System Phase 1 — staff table (14 personnel), service_work_orders + service_tasks DB tables, is_silo_manager() RLS, dollar_value on repair_orders; SERVICE_SILOS / WO_STATUS_LABELS / TASK_STATUS_LABELS constants; SR_MANAGER_EMAILS; updated MANAGER_EMAILS (added jason@, riley@); 🔧 Work Orders button on every RO card; modal with all 5 silos; Build/Edit WO form; task CRUD; silo access control; dollar value rollup → card refresh |
| v1.296 | 2026-03-30 | Work Orders bug-fix pass (Session 27) — 5 fixes: (1) ro.supabaseId → ro._supabaseId in 7 places (modal showed "RO not found"); (2) submitWOForm guard fix (save was silent no-op); (3) all WO form inputs dark-theme fix (status/dollar/notes/task fields switched to white bg + dark text); (4) silo badge on each task row header; (5) openWorkOrderModal resolves filteredIndex → currentData index via _supabaseId (wrong RO was opening when board was filtered/sorted) |
| checkin v1.27 | 2026-03-22 | Spanish language toggle for checkin.html — same prvs_lang key, full check-in/out flow, auto clock-out modal, clock-out summary, offline banner translated |

---

## 📅 Session Log

| Date | Session | Summary |
|---|---|---|
| 2026-03-19 | 1 | GitHub MCP, RBAC SQL, checkin.html v1.26, nonce fixes v1.262+v1.263, CLAUDE_CONTEXT.md created |
| 2026-03-19 | 2 | Nonce encoding fixed (hex), Analytics button (v1.264), version badges, daily backup live, PAT rotated |
| 2026-03-19 | 3 | solar.html v2.0 deployed, roof-lookup Edge Function committed (needs CLI deploy) |
| 2026-03-20 | 4 | v1.265 — PDF quote (jsPDF), email attachment, 4× description fixes, mobile filter, calendar re-auth |
| 2026-03-20 | 5 | v1.265 cont. — persistent auth, 5× guard fixes, audit log fix, Chrome 145, 406 fix. v1.266 — write hardening |
| 2026-03-20 | 6 | CLAUDE_CONTEXT.md restructured with TODO list, Session Protocol, Known Issues, SESSION_STARTER.md created |
| 2026-03-20 | 7 | v1.267 — Parts Request System built end-to-end: modal, dictation, chip, email, resolution flow |
| 2026-03-20 | 8 | v1.268 — Fix notes_type_check constraint (parts_request → ro_status + body prefix). v1.269 — Photo attachments in Parts Request modal: _partsRequestFiles[], preview strip, upload to Storage, add to photo_library, inline thumbnails in email (Edge Function v1.3). Edge Function deploy instruction clarified. CLAUDE_CONTEXT Known Issues updated. |
| 2026-03-20 | 9 | v1.270 — RO Description inline edit fix: showVoiceNotesModal prefillValue param, full replace on save, writeAuditLog before/after. Start-of-session checklist followed. |
| 2026-03-20 | 10 | v1.271 — Fixed photo upload auth guard (!getSB() → !getSB()\|\|!supabaseSession, re-check in onchange). Migrated uploadDocument from Google Drive to Supabase Storage (eliminates 401). |
| 2026-03-21 | 11 | No code changes. Verified + marked ✅ Done: SQL migration, roof-lookup deploy, send-quote-email deploy, calendar re-auth iPhone test. Added GH#9 (parts autocomplete), GH#10 (Kenect API integration), GH#11 (solar battery Wh). Added GitHub Release step to End of Session Checklist. Dropped v1.265/v1.266 backfill release items. |
| 2026-03-22 | 12 | Added GH#12 (Spanish toggle), GH#13 (pre-deploy backup). Built scripts/backup.sh (6-version rotating snapshots). SESSION_STARTER.md overhauled (hardened rules, GitHub fallback path, RESET/PAUSE/STOP commands, Key Reference table). PRVS_Technician_Guide.docx created. v1.272 MIME fix. v1.273 document modal refresh fix. v1.274 60-second note. v1.275 photo lightbox viewer + email photos to customer + Edge Function v1.4 photo_share type. Context limit hit — session ended mid-work. |
| 2026-03-22 | 13 | v1.276 email auth fix (SUPABASE_ANON_KEY). Edge Function v1.4 CC on photo emails deployed. v1.277 Spanish toggle (GH#12) complete for index.html — TRANSLATIONS_ES dict, t(), translateStaticUI(), setupI18n(), full renderBoard() + updateStats() translation. v1.27 Spanish toggle for checkin.html — full check-in/out flow translated, same prvs_lang localStorage key. |
| 2026-03-23 | 14 | v1.278 — Fixed duplicate ro_id 409 crash: generateUniqueROId() collision check + -2/-3 suffix fallback; try/catch at New RO submit handler. GitHub Release v1.277 confirmed published by Roland. |
| 2026-03-23 | 15 | v1.279 — Video upload support restored: isVideoUrl() helper, uploadPhoto accepts video/*, 🎬 tile in thumbnail grid, <video controls> in lightbox, email modal disables video entries. |
| 2026-03-23 | 16 | v1.280 — Fix RO insert race condition: optimistic insert loop replaces generateUniqueROId check-then-insert; 23505 → retry next candidate; submit button disabled during save. v1.281 — Fix roId scope bug: console.log after loop used out-of-scope loop var; changed to data.ro_id. v1.282 — Duplicate RO Manager: getBaseROId/findDuplicateGroups, 🔗 Merge Dupes header button, master picker modal, executeDupeMerge reassigns all FK tables + merges photo_library + deletes dupes. |
| 2026-03-23 | 17 | v1.282b — Fix isAdmin() timing bug: getUserInfo() with no Google token pollutes currentUser.email to 'unknown@user.com'; Merge Dupes post-load check now also checks supabaseSession?.user?.email against ADMIN_EMAILS directly; added 🔗 Dupe check console.log for debugging. Merge Dupes confirmed working by Roland. End of Session Checklist run; backup.sh executed; CLAUDE_CONTEXT.md updated and pushed. |
| 2026-03-23 | 18 | v1.283 — Fix "Date RV Arrived on Lot" not saving: date_arrived was missing from updateROInSupabase() Supabase update payload; silently dropped on every Edit RO save. One-line fix. End of Session Checklist run. |
| 2026-03-24 | 19 | v1.284 — Three-state parts chip system (GH#14): parts_status column, openPartsStatusModal, setPartsStatus, auto-flip on all parts received, filter buttons. Added bobby@/solar@ to MANAGER_EMAILS + Supabase. v1.285 attempt — Parts Estimate chip + For Estimate Only toggle built, but inline `</script>` inside modal.innerHTML template literal broke the page (SyntaxError: Unexpected end of input). Roland restored v1.284 backup via direct GitHub push, causing branch divergence. Session ended at context limit mid-recovery. |
| 2026-03-24 | 20 | Recovered from git divergence (reset --hard origin/main). Re-applied all v1.285 changes: MANAGER_EMAILS (all 6 managers), syncEstimateToggle() global, submitPartsRequest estimate logic, estimate chip CSS, RO tile chip estimate case, openPartsStatusModal estimate button, ps-estimate filter + logic, Spanish translation. Committed and pushed v1.285. Created git tag v1.285 + release notes. Created ROLLBACK.md (emergency recovery guide). Discussed token usage / session pause causes. End of Session Checklist run. |
| 2026-03-25 | 21 | Start-of-session checklist followed. v1.286 — Renamed Core Charge → Freight Charge (UI label only). v1.287 — Added Wholesale + Retail Price columns to Manage Parts table; git tag v1.287 created. v1.288 — Added Sourcing to individual part row status dropdown (neon orange). v1.289 — Moved Supplier Contact section to top of Add/Edit Part form. Clarified RO-level chip vs per-part-row status distinction. End of Session Checklist run. |
| 2026-03-26 | 22 | Kenect API Swagger reviewed (pasted by Roland — Chrome MCP & WebFetch both blocked). GH#10 implemented: v1.290 — kenect-proxy Edge Function (test_credentials, get_locations, get_conversation, get_messages_by_phone, send_message, send_review_request); 💬 Messages button on each RO card with phone; chat-style conversation modal; send message + review request from dashboard; Admin Settings Kenect section (Location ID, Test Connection, Load Locations). Pending: Roland must deploy Edge Function + set KENECT_API_KEY secret. |
| 2026-03-27 | 23 | GH#15 Phase 1 — v1.291: 📍 Parking Spot field. Dropdown of all named lot positions (Interior Bays #1–#14, MR, Wash Bay #15, #17, Breeze Way N/S, Office, Front Parking, RV Temp, Gates). Shows as yellow chip on RO card below customer name. New RO + Edit RO forms both include it. Stored as parking_spot TEXT column — SQL migration required (ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS parking_spot TEXT). |
| 2026-03-27 | 24 | (Session resumed after context compaction) GH#15 Phase 1 lot remap — v1.292: Parking spot positions renamed per Roland's handwritten photo: R1–R20 (Rear Lot), B1–B14 (Interior Bays), Wash Bay 17, Wash Bay 18, W1–W4 (Wash), F1–F12 (Front Lot). SQL migration confirmed with no errors. GH#15 Phase 2 — v1.293: `printQRLabel()` rebuilt as dual-sticker QR print sheet; 3"×3" windshield sticker (customer name, RV make, RO#, parking spot chip) + 1"×1" key tag; QRCode.js generated fresh in print window with proper @media print CSS, dashed cut borders, physical inch sizing. |
| 2026-03-27 | 25 | v1.294 — QR scan destination changed from checkin.html to main dashboard RO tile. Kenect Zapier discussion: reviewed Kenect-provided PDF — Zapier integration is outbound-only for messaging (Send Message, Send Review Request, Push Lead as Actions; only Lead Push as Trigger — no inbound message trigger). Advised Roland to push for direct API access since conversation thread view requires inbound message querying. End of Session Checklist run; backup.sh executed; pushed. |
| 2026-03-30 | 26 | Kenect confirmed dead end — no direct API keys available. Pivoting to Twilio (fast-tracked). GH#5 Work Assignment System designed and built: staff table SQL (14 personnel), service_work_orders + service_tasks DB migration run in Supabase. v1.295 — full Work Orders UI: 🔧 button on every RO card, 5-silo modal, Build/Edit WO form with task CRUD, silo-level access control (canManageSilo / isSrManagerOrAdmin), tech task status updates, dollar value rollup. End of Session Checklist run; backup.sh; pushed. |
| 2026-03-30 | 27 | v1.296 — Work Orders bug-fix pass: 5 bugs fixed (ro._supabaseId mismatch in 7 places, silent save guard, dark-theme form inputs, silo badge on task rows, wrong RO opened when board filtered). Roland added Roland Shepard to staff table as sr_manager via SQL (RLS fix). GH#5c "Polish Work Orders UI" added to TODO. End of Session Checklist run; backup.sh; pushed. |
