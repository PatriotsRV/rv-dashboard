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
- [ ] 7. **Run `bash scripts/backup.sh`** before pushing — creates timestamped snapshot in `.backups/`, keeps last 6
- [ ] 8. Commit and push CLAUDE_CONTEXT.md to GitHub

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
| 🔴 | GH#1 | **Start Twilio number port** | Port existing number — blocks all SMS features | ⏳ Open |
| 🟠 | GH#4 | **Twilio SMS v1.27** | Customer + tech notifications via SMS | ⏳ Open |
| 🟠 | GH#5 | **Work Assignment System** | Assign ROs to specific technicians | ⏳ Open |
| 🟠 | GH#6 | **Employee Time Clock** | Full time clock feature in dashboard | ⏳ Open |
| 🔴 | GH#10 | **Kenect API integration** | Pull customer conversation threads into RO view — blocked on Roland getting API credentials from Kenect support | ⏳ Roland action |
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
| 🟡 | — | **GitHub Release v1.281** | Create release at github.com/PatriotsRV/rv-dashboard/releases/new — tag v1.281 | ⏳ Roland action |
| ✅ | — | **Fix Supabase rv-media bucket MIME types** | Roland confirmed bucket MIME list updated to include docx, xlsx, pptx, pdf, text, octet-stream | ✅ Done |
| ✅ | — | **Redeploy send-quote-email Edge Function v1.4** | photo_share type + CC repair@ on all emails — confirmed deployed | ✅ Done |
| ✅ | — | **Run SQL migration for Parts Request** | `has_open_parts_request BOOLEAN` column confirmed present in `repair_orders` table | ✅ Done |
| ✅ | — | **Redeploy send-quote-email Edge Function** | Confirmed deployed — 13 deployments, updated a day ago | ✅ Done |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |

---

## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.281** | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system with photo attachments, photo lightbox viewer, email photos to customer, Spanish language toggle, video upload support |
| `checkin.html` | **v1.27** | Technician clock-in/out, offline-first IndexedDB queue, Spanish language toggle |
| `analytics.html` | **v1.0** | Analytics/reporting view |
| `solar.html` | **v2.0** | Solar installation tracking — React 18, roof planner, AI lookup, PDF quotes |
| `supabase/functions/roof-lookup/index.ts` | **v1.0** | Edge Function — Anthropic API proxy for AI roof lookup (⚠️ needs CLI deploy) |
| `supabase/functions/send-quote-email/index.ts` | **v1.4** | Edge Function — solar quote email + parts request email + photo share email (types: 'solar_quote', 'parts_request', 'photo_share') |
| `scripts/backup.sh` | — | Pre-deploy backup script — 6-version rolling snapshots of all key files |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity |
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

### Pre-Deploy Backup System
- **Always run `bash scripts/backup.sh` before `git push origin main`** — this is step 7 of the End of Session Checklist
- Snapshots saved to `.backups/YYYY-MM-DD_HH-MM-SS/` — 6 rotating versions kept automatically
- Files backed up: `index.html`, `checkin.html`, `solar.html`, `analytics.html`, `supabase/functions/send-quote-email/index.ts`, `supabase/functions/roof-lookup/index.ts`
- To restore a file: `cp .backups/YYYY-MM-DD_HH-MM-SS/index.html ./index.html`
- `.backups/` is committed to the repo — visible and restorable without any git knowledge

### GitHub Push
- `gh` CLI is NOT available in the sandbox; use `git` directly from `/sessions/.../mnt/rv-dashboard/`
- The workspace folder IS the git repo — `git push origin main` works directly

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
| 2026-03-23 | 16 | v1.280 — Fix RO insert race condition: optimistic insert loop replaces generateUniqueROId check-then-insert; 23505 → retry next candidate; submit button disabled during save. v1.281 — Fix roId scope bug: console.log after loop used out-of-scope loop var; changed to data.ro_id. |
