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
- [ ] 6. Add any new bugs, gotchas, or design decisions to the **Known Issues & Gotchas** section
- [ ] 7. Commit and push CLAUDE_CONTEXT.md to GitHub

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
| 🟡 | GH#2 | **Regular view layout customization** | Drag/resize tiles | ⏳ Open |
| 🟡 | GH#3 | **Parts field layout review** | UX improvements to parts section | ⏳ Open |
| 🟡 | GH#8 | **Switchblade tile view** | Compact tile layout mode | ⏳ Open |
| 🟠 | — | **Deploy roof-lookup Edge Function** | `supabase functions deploy roof-lookup` — solar.html AI lookup returns 404 until done | ⏳ Pending CLI access |
| 🟡 | — | **Test calendar re-auth on iPhone** | Full mobile OAuth round-trip flow — confirm Schedule modal reopens after auth | ⏳ Needs field test |
| 🟡 | — | **GitHub Release v1.265** | Tag exists on main; Roland creates manually at github.com/PatriotsRV/rv-dashboard/releases/new | ⏳ Roland action |
| 🟡 | — | **GitHub Release v1.266** | Create release notes page on GitHub | ⏳ Roland action |
| 🔴 | — | **Run SQL migration for Parts Request** | `ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS has_open_parts_request BOOLEAN DEFAULT false;` — run in Supabase SQL Editor before using the feature | ⏳ Roland action |
| 🟠 | — | **Redeploy send-quote-email Edge Function** | v1.2 adds parts_request email type; run `supabase functions deploy send-quote-email` | ⏳ Needs CLI deploy |
| 🟡 | — | **Create parts@patriotsrvservices.com** | Management email group for parts request notifications | ⏳ Roland action |

---

## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.267** | Main dashboard — ROs, time tracking, parts, calendar, audit log, parts request system |
| `checkin.html` | **v1.26** | Technician clock-in/out, offline-first IndexedDB queue |
| `analytics.html` | **v1.0** | Analytics/reporting view |
| `solar.html` | **v2.0** | Solar installation tracking — React 18, roof planner, AI lookup, PDF quotes |
| `supabase/functions/roof-lookup/index.ts` | **v1.0** | Edge Function — Anthropic API proxy for AI roof lookup (⚠️ needs CLI deploy) |
| `supabase/functions/send-quote-email/index.ts` | **v1.2** | Edge Function — solar quote email + parts request email (type: 'parts_request') |
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

### Parts Request System (v1.267)
- `has_open_parts_request` boolean column on `repair_orders` — **requires SQL migration** (see TODO list)
- Parts request notes stored in `notes` table as BOTH `type: 'parts_request'` (for history modal) AND `type: 'ro_status'` (so they appear in the RO Status section on the card)
- Email uses `send-quote-email` Edge Function with `type: 'parts_request'` param — **requires redeploy** of the Edge Function after v1.2 code is pushed
- Management email hardcoded as `parts@patriotsrvservices.com` — placeholder until email group is created
- `SUPABASE_ANON_KEY` and `SUPABASE_URL` constants (defined at top of init block) are used directly in the fetch call — no auth header upgrade needed since Edge Function is public
- `markPartsOrdered()` is available to ALL roles (no role restriction) — business rule is that it's a manual acknowledgement only, tracked in audit log

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
