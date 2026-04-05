
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
> *"Pause here. I need to check the current TODO list and make updates from my iPhone before we continue."*

If Roland pauses mid-session:
- [ ] 1. Stop working immediately
- [ ] 2. Display the current Active TODO List (full table with all rows)
- [ ] 3. Ask: *"What updates from your iPhone? Paste them here and I'll merge them in."*
- [ ] 4. Merge any iPhone updates into the TODO list (mark ✅ completed, add new items with priority)
- [ ] 5. Ask: *"Ready to continue? Anything else to change?"* and wait
- [ ] 6. Continue work from where we left off

### 🔴 END OF SESSION — CRITICAL CHECKLIST
Claude must complete ALL of these before the session ends (context limit, user stops, etc.):

- [ ] 1. **Update the Active TODO List** — mark completed items ✅, add any new items discovered, update priorities
- [ ] 2. **Update the File Inventory table** with new version numbers
- [ ] 3. **Add a row to Session Log** (date, session #, summary)
- [ ] 4. **Add new items to Completed Work** section
- [ ] 5. **Update Version History table** if a version was bumped (which file, new version #, summary)
- [ ] 5a. **If version was bumped**: add a GitHub Release TODO to Active TODO List for Roland to publish at github.com/PatriotsRV/rv-dashboard/releases/new
- [ ] 6. **Update Known Issues & Gotchas** — add any bugs, quirks, or design decisions discovered this session
- [ ] 7. **Update PRVS_PROJECT_CONTEXT.md** — sync the Active TODO List and "Recently Completed" section so Roland's iPhone Claude Project stays current
- [ ] 8. **Run `bash scripts/backup.sh`** — creates timestamped snapshot in `.backups/`, keeps last 6
- [ ] 9. **Commit and push CLAUDE_CONTEXT.md + PRVS_PROJECT_CONTEXT.md** to GitHub — use the message: "docs: end of session [#N] — [summary]"

> ⚠️ If context is getting long:
> *"Context is getting long — I need to wrap up. Let me complete the End of Session checklist now."*
> Then complete checklist immediately without waiting for Roland to ask.

---

## 🔑 ENVIRONMENT & SECRETS

```
Supabase URL:      https://fmkiahyqdnkijahaabha.supabase.co
Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZta2lhaHlxZG5raWphaGFhYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc2NTk5NTQsImV4cCI6MjA1MzIzNTk1NH0.MmmFMkxvxJMxPE1Jk4_Kb3JJ_wd7oj-lMkAHLMHEsxo
Google Client ID:  591742920934-s1u7ks1g7p8ajekqk5p0trvjn5vkn4kb.apps.googleusercontent.com
GitHub Repo:       https://github.com/PatriotsRV/rv-dashboard
Live URL:          https://patriotsrv.github.io/rv-dashboard/
Check-in URL:      https://patriotsrv.github.io/rv-dashboard/checkin.html
```

---

## 📋 ACTIVE TODO LIST

> This is the canonical task list. Update it every session. Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium · 🔵 Low

| Status | GH# | Item | Notes | Priority |
|--------|-----|------|-------|----------|
| ⏳ | GH#1 | **Start Twilio number port** | Port 207-900-9974 from Comcast. Go to twilio.com → Phone Numbers → Port Number. Need: Comcast account #, PIN, service address. 2–4 week process. | 🔴 Blocking |
| ⏳ | GH#4 | **Twilio SMS plan + build** | Plan out Twilio SMS flow with Roland before building. Topics: triggers (status changes?), message content, opt-out handling, cost per message (~$0.0079). Blocked on GH#1. | 🔴 Blocking |
| ⏳ | GH#5 | **Phase 2: Work Assignment System** | Urgency lock (🔴🟡🟢) on RO cards. "My Tasks" filtered view per tech. Assignment modal from manager view. | 🟠 High |
| ⏳ | GH#16 | **Manager RO Work List** | Dedicated manager view: list of all open ROs, sortable/filterable by tech, status, urgency. Separate from the main board. | 🟠 High |
| ⏳ | GH#17 | **Customer Check-In Page** | Redesign checkin.html: customer-facing, digital RAF with e-signature. Replace current tech check-in flow or run parallel. | 🟠 High |
| ⏳ | GH#18 | **Parts Ordered Email Notification** | Auto-send email to customer when RO status changes to "Parts Ordered". Use existing email infrastructure. | 🟡 Medium |
| ⏳ | GH#19 | **Enhancement Request Button** | Button on RO card for techs to flag enhancement requests (upsell opportunities). Notify manager. | 🟡 Medium |
| ⏳ | Roland | **Publish GitHub Releases v1.283–v1.300** | Backlog of unpublished releases. Go to github.com/PatriotsRV/rv-dashboard/releases/new for each. | 🔵 Low |
| ⏳ | Roland | **Publish GitHub Release v1.301** | Covers: GH#16-19 added to TODO, checkin.html v1.28 Supabase auth fix. Go to github.com/PatriotsRV/rv-dashboard/releases/new | 🔵 Low |
| ✅ | — | **Fix checkin.html Supabase auth for time_logs** | Fixed in v1.28/v1.301. `signInWithIdToken()` now called on sign-in; `getSession()` restores session on reload; `onAuthStateChange` keeps session in sync; `clockIn()` guards online insert. ✅ Anon INSERT/UPDATE policies removed 2026-04-05. | ✅ Done v1.28 |
| ✅ | — | **Remove anon policies on time_logs in Supabase** | Now that checkin.html v1.28 properly establishes an authenticated session, the temporary anon INSERT/UPDATE policies on `time_logs` can be safely deleted. Go to Supabase dashboard → Table Editor → time_logs → RLS Policies → delete "Anon can insert time_logs" and "Anon can update time_logs". | ✅ Done 2026-04-05 |
| ✅ | GH#15 | **Supabase Pro security cleanup** | Removed anon write policies on 9 tables. Fixed mutable search_path on `has_role` + `is_silo_manager`. Enabled leaked password protection + secure password change. Disabled new user signups. Temp restored anon INSERT/UPDATE on time_logs for checkin.html (now fixed in v1.28). | ✅ Done v1.300 |
| ✅ | GH#14 | **Supabase performance optimization** | Added 12 indexes on high-query columns. Wrapped RPC functions in SECURITY DEFINER. Analyzed slow query patterns. | ✅ Done v1.300 |
| ✅ | GH#13 | **Maximize Supabase log retention** | Roland action: Settings → Logs in Supabase dashboard. | ✅ Done |
| ✅ | GH#11 | **RO Notes (internal)** | Notes field on each RO, visible only to staff, not on customer PDF. | ✅ Done v1.291 |
| ✅ | GH#12 | **Spanish toggle** | Full ES translation for index.html + checkin.html. Toggle button saves to localStorage. | ✅ Done v1.277 |
| ✅ | GH#10 | **Kenect messaging integration** | Messages button on RO cards. Chat modal. Send message + review request. Admin Settings section. | ✅ Done v1.290 |
| ✅ | GH#9 | **Multi-location / silo support** | Locations table, silo_id on ROs/users, manager role, filtered views. | ✅ Done v1.285 |
| ✅ | GH#8 | **Kenect phone number import** | Import customer phone numbers from Kenect into Supabase. | ✅ Done |
| ✅ | GH#7 | **Customer PDF — RO detail export** | PDF generation from RO data, customer-facing format. | ✅ Done v1.282 |
| ✅ | GH#6 | **Admin panel** | Role management, user list, location config. | ✅ Done v1.281 |
| ✅ | GH#3 | **Phase 1: Basic work assignment** | Assign tech to RO. Tech sees assigned ROs. | ✅ Done v1.270 |
| ✅ | GH#2 | **Email notifications** | Status-change emails via Supabase Edge Function. | ✅ Done v1.265 |

---

## 📁 FILE INVENTORY

| File | Version | Purpose |
|------|---------|---------|
| `index.html` | v1.300 | Main RO dashboard — board view, RO management, admin panel, Kenect integration, Spanish toggle, multi-location |
| `checkin.html` | v1.28 | Tech clock-in/out — Google Sign-In with Supabase auth (`signInWithIdToken`), session persistence (`getSession` + `onAuthStateChange`), offline IndexedDB queue |
| `CLAUDE_CONTEXT.md` | Session 29 | This file — Claude's memory across sessions |
| `PRVS_PROJECT_CONTEXT.md` | Session 29 | Roland's iPhone Claude Project context — synced each session |
| `scripts/backup.sh` | v1.0 | Backup script — timestamped snapshots in `.backups/`, keeps last 6 |
| `supabase/functions/email-notifications/` | v1.5 | Edge Function — status change emails, parts ordered notification |
| `supabase/functions/kenect-proxy/` | v1.0 | Edge Function — Kenect API proxy (test_credentials, get_messages, send_message, send_review_request) |

---

## 🔧 KNOWN ISSUES & GOTCHAS

### Auth & Sessions
- **checkin.html required `signInWithIdToken()`** — Google Sign-In alone does NOT create a Supabase session. You must call `supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: rawNonce })` after receiving the Google credential. Without this, all DB operations fire as anon role. Fixed in v1.28.
- **Nonce must be hex SHA-256** — Use `crypto.subtle.digest('SHA-256', ...)` with hex encoding (not base64). Raw nonce stored in localStorage, hashed nonce passed to Google GIS `initialize()` + `params` (Chrome 145 compat). Raw nonce passed to `signInWithIdToken()`.
- **`persistSession: true` + `autoRefreshToken: true`** — Required on `createClient()` for 30-day session persistence. Without these, sessions don't survive page reloads.
- **Session restore on reload** — Call `getSB().auth.getSession()` on DOMContentLoaded. If session exists, skip sign-in entirely. Also set up `onAuthStateChange` listener to keep `supabaseSession` in sync.
- ✅ **Anon INSERT/UPDATE policies on `time_logs` removed** — deleted "Anon can insert time_logs" + "Anon can update time_logs" on 2026-04-05. Only anon SELECT and authenticated_full_access remain.

### RLS & Supabase Security
- **`has_role` and `is_silo_manager` functions** — Must use `SET search_path = public, pg_catalog` (SECURITY DEFINER) to prevent search_path injection attacks. If you recreate these functions, include the search_path setting.
- **Anon key is public** — The Supabase anon key is intentionally in client-side code. RLS policies are the security layer. Never put the service role key in client code.
- **New user signups disabled** — Supabase Auth → Settings → "Enable new user signups" is OFF. New users must be added manually by an admin.

### GitHub & Deployment
- **GitHub Pages deploys automatically** — Any push to `main` deploys within ~60 seconds. No build step needed.
- **Large file pushes (CLAUDE_CONTEXT.md ~78KB)** — Use `mcp__github__create_or_update_file` directly with full content as string. Do NOT use a subagent for this — agents replace content with placeholder text. Always read the file locally first, pass full string content directly in the tool call.
- **SHA required for file updates** — Get current SHA from `mcp__github__get_file_contents` response before updating. If SHA is wrong, GitHub API returns 409 conflict.

### Kenect Integration
- **Kenect Edge Function not yet deployed** — `kenect-proxy` function code is in the repo but Roland must deploy it via Supabase CLI and set `KENECT_API_KEY` secret.
- **Kenect messages button** — Only appears on RO cards when `customerPhone` exists in the RO record.

### Multi-location / Silos
- **`silo_id` is required on new ROs** — If creating ROs programmatically, always include `silo_id`. RLS policies filter by silo.
- **Manager role** — Users with `is_silo_manager = true` see all ROs in their silo. Regular techs see only assigned ROs.

### Email Notifications
- **Edge Function v1.5** — Handles status-change emails. Parts Ordered email (GH#18) not yet built — that's a future TODO.
- **`parts@patriotsrvservices.com`** — Roland needs to create this email group for parts notifications.

---

## 📊 VERSION HISTORY

| Version | Date | Summary |
|---------|------|---------|
| index v1.300 / checkin v1.27 | 2026-03-29 | Supabase Pro security + performance cleanup (GH#14, GH#15). 12 indexes, RPC SECURITY DEFINER, anon write policy removal (9 tables), leaked password protection, signups disabled. Temp restored anon INSERT/UPDATE on time_logs. |
| checkin v1.28 / v1.301 | 2026-04-05 | Fix Supabase auth in checkin.html: `signInWithIdToken()` was never called — all clock-in/out DB ops hit anon role. Added `generateNonce()`, `getSession()` restore, `onAuthStateChange`, `clockIn()` session guard, `persistSession: true`, proper `signOut()`. |
| index v1.291 | 2026-03-15 | RO Notes (GH#11) — internal staff notes on RO cards, not on customer PDF. |
| index v1.290 | 2026-03-10 | Kenect messaging integration (GH#10) — Messages button, chat modal, send/review request. |
| index v1.285 | 2026-03-01 | Multi-location silo support (GH#9) — Locations table, silo_id, manager role, filtered views. |
| index v1.282 | 2026-02-20 | Customer PDF export (GH#7). |
| index v1.281 | 2026-02-15 | Admin panel (GH#6) — role management, user list, location config. |
| index v1.277 | 2026-03-22 | Spanish toggle (GH#12) — full ES translation for index.html + checkin.html. |
| index v1.270 | 2026-01-20 | Phase 1 work assignment (GH#3). |
| index v1.265 | 2026-01-10 | Email notifications (GH#2). |

---

## 📅 SESSION LOG

| Date | Session # | Summary |
|------|-----------|---------|
| 2026-04-05 | 29 | Added GH#16-19 to TODO list (Cowork/iPhone session): Manager RO Work List, Customer Check-In Page, Parts Ordered Email Notification, Enhancement Request Button. Fixed checkin.html Supabase auth (v1.28/v1.301): `signInWithIdToken()` was never called — all DB ops were hitting anon role. Added `generateNonce()`, `getSession()` restore, `onAuthStateChange`, `clockIn()` session guard, `persistSession: true`, proper `signOut()`. Roland action: remove anon INSERT/UPDATE policies on `time_logs` in Supabase now that proper auth is in place. |
| 2026-03-29 | 28 | Supabase Pro security + performance cleanup. 12 indexes on high-query columns. Removed anon write policies from 9 tables. Fixed `has_role` + `is_silo_manager` mutable search_path. Enabled leaked password protection + secure password change. Disabled new user signups. Had to restore anon INSERT/UPDATE on time_logs after checkin.html clock-in broke (root cause: missing signInWithIdToken — fixed Session 29). |
| 2026-03-22 | 27 | Spanish toggle complete (GH#12). Full ES translation for index.html + checkin.html. `TRANSLATIONS_ES` dict, `t()`, `translateStaticUI()`, `setupI18n()`. checkin.html v1.27. |
| 2026-03-15 | 26 | RO Notes (GH#11). Internal notes field on RO cards. Not on customer PDF. |
| 2026-03-10 | 25 | Kenect messaging integration (GH#10). Messages button, chat modal, Edge Function `kenect-proxy`. |
| 2026-03-01 | 24 | Multi-location silo support (GH#9). Locations table, silo_id on ROs/users, manager role, filtered board views. |
| 2026-02-20 | 23 | Customer PDF export (GH#7). PDF generation, customer-facing format. |
| 2026-02-15 | 22 | Admin panel (GH#6). Role management, user list, location config. |
| 2026-01-20 | 21 | Phase 1 work assignment (GH#3). Assign tech to RO, tech filtered view. |
| 2026-01-10 | 20 | Email notifications (GH#2). Status-change emails via Supabase Edge Function. |

---

## ✅ COMPLETED WORK

### Session 29 — 2026-04-05
- ✅ **Added GH#16–19 to Active TODO list** — Manager RO Work List, Customer Check-In Page, Parts Ordered Email Notification, Enhancement Request Button
- ✅ **Fixed checkin.html Supabase auth (checkin v1.28 / v1.301)** — Root cause: `handleSignIn()` decoded Google JWT locally but never called `signInWithIdToken()` — every DB operation hit anon role. Fix: `generateNonce()` helper (hex SHA-256, same as index.html); nonce passed to GIS `initialize()` + `params` (Chrome 145 compat); `signInWithIdToken()` called with `rawNonce` in `handleSignIn()`; `supabaseSession` state var added; `getSB()` upgraded to `persistSession: true, autoRefreshToken: true`; `getSession()` called on `DOMContentLoaded` to restore 30-day session; offline identity fallback gated by `!isOnline`; `onAuthStateChange` listener; `clockIn()` guards online insert with `!supabaseSession`; `signOut()` calls `auth.signOut()`. Anon INSERT/UPDATE policies on `time_logs` removed 2026-04-05.

### Session 28 — 2026-03-29
- ✅ **Supabase Pro security cleanup (GH#15)** — Removed all anon write policies from 9 tables. Fixed `has_role` + `is_silo_manager` mutable search_path. Enabled leaked password protection + secure password change. Disabled new user signups. Restored anon INSERT/UPDATE on `time_logs` after checkin.html clock-in broke.
- ✅ **Supabase performance optimization (GH#14)** — Added 12 indexes on high-query columns. Wrapped RPC functions in SECURITY DEFINER. Analyzed slow query patterns.

### Session 27 — 2026-03-22
- ✅ **Spanish toggle (GH#12)** — `TRANSLATIONS_ES` dict, `t()`, `translateStaticUI()`, `setupI18n()`, full `renderBoard()` + `updateStats()` translation for index.html. checkin.html v1.27 — full check-in/out flow translated.

### Session 26 — 2026-03-15
- ✅ **RO Notes (GH#11)** — Internal notes field on RO cards, not on customer PDF.

### Session 25 — 2026-03-10
- ✅ **Kenect messaging integration (v1.290, GH#10)** — `kenect-proxy` Supabase Edge Function committed (actions: test_credentials, get_locations, get_conversation, get_messages_by_phone, send_message, send_review_request). 💬 Messages button on RO cards (only when customerPhone exists). Chat-style conversation modal with inbound (left) / outbound (right) bubbles. Send message + Send Review Request buttons. Admin Settings Kenect section: Location ID input, Test Connection, Load Locations. `kenectCall(action, params, payload)` helper POSTs to Edge Function with anon key auth. Pending: Roland must deploy Edge Function + set KENECT_API_KEY secret.

### Session 24 — 2026-03-01
- ✅ **Multi-location silo support (GH#9)** — Locations table, silo_id on ROs/users, manager role, filtered board views.

### Session 23 — 2026-02-20
- ✅ **Customer PDF export (GH#7)** — PDF generation, customer-facing format.

### Session 22 — 2026-02-15
- ✅ **Admin panel (GH#6)** — Role management, user list, location config.

### Session 21 — 2026-01-20
- ✅ **Phase 1 work assignment (GH#3)** — Assign tech to RO, tech filtered view.

### Session 20 — 2026-01-10
- ✅ **Email notifications (GH#2)** — Status-change emails via Supabase Edge Function v1.5.

---

## 🧠 DESIGN DECISIONS & ARCHITECTURE NOTES

### Auth Architecture
- **Google Sign-In → Supabase session** — The flow is: generate nonce → show Google button → receive credential → call `signInWithIdToken()` → get Supabase session → use session for all DB ops. The Google credential alone is NOT a Supabase session.
- **Session persistence** — `persistSession: true` + `autoRefreshToken: true` on `createClient()`. Sessions last 30 days. `getSession()` on page load restores without re-auth.
- **Offline support** — IndexedDB queue for clock-in/out when offline. `drainQueue()` fires on reconnect. Queue entries use whatever session was active when they were created (now properly authenticated).

### Database Architecture
- **RLS is the security layer** — All tables have RLS enabled. Policies control what each role (anon, authenticated, service_role) can read/write.
- **Silo isolation** — `silo_id` on ROs and users. RLS policies filter by silo. Managers see all in their silo, techs see assigned only.
- **`has_role(user_id, role_name)`** — SECURITY DEFINER function, `search_path = public, pg_catalog`. Used in RLS policies to check user roles without exposing the roles table directly.

### Email Architecture
- **Supabase Edge Function** — `email-notifications` function handles status-change emails. Triggered by client after status update (not a DB trigger).
- **Parts email (GH#18)** — Not yet built. Will hook into existing Edge Function when status changes to "Parts Ordered".

### Kenect Integration
- **Proxy pattern** — Client calls `kenect-proxy` Edge Function (avoids CORS + keeps API key server-side). Function forwards to Kenect API.
- **Phone number required** — Messages button only shows when RO has `customerPhone`. No phone = no Kenect.
