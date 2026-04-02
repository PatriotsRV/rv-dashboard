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
| **Current Version** | v1.300 |
| **Supabase Project** | axfejhudchdejoiwaetq |
| **Cowork Workspace** | rv-dashboard folder on Roland's laptop |

---

## 📋 ACTIVE TODO LIST
> Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium
> Use this list from your iPhone to log updates between laptop sessions.

### 🔴 Blocking
- **GH#1 — Start Twilio number port** — Port existing number — blocks all SMS. **Fast-tracking after Kenect denied API access (2026-03-30).** ⏳ Open — Top Priority
- **GH#4 — Twilio SMS** — Customer + tech notifications via SMS. Elevated to 🔴 after Kenect pivot. ⏳ Open

### ⚠️ On Hold
- **GH#10 — Kenect messaging** — Kenect will NOT give direct API keys (Zapier only, no inbound trigger). v1.290 code in repo but NOT deployed. Pivoting to Twilio. ⏳ On Hold

### 🟠 High Priority
- **GH#5 Phase 2 — Work Assignment System** — Phase 1 shipped v1.295 (staff table, 5-silo WO builder, task CRUD, access control, dollar rollup). Phase 2 remaining: lock urgency to Manager+Admin, Tech "My Tasks" view across all ROs, task dependency system (V1.5). ⏳ Open
- **GH#5c — Polish Work Orders UI** — General UX polish pass after initial rollout: visual refinements, edge cases, mobile layout, status badges, remaining bugs. ⏳ Open
- **GH#6 — Employee Time Clock** — Full time clock feature in dashboard ⏳ Open
- **GH#15 Phase 3 — Interactive Virtual Lot Map** — Dashboard view mirroring physical whiteboard ⏳ Open

### 🟠 High Priority (continued)
- **Fix checkin.html Supabase auth for time_logs** — checkin.html inserts as anon role on iPhone (no Supabase session before insert fires). Currently using anon INSERT/UPDATE policy as workaround. Proper fix: gate insert on session confirmation in checkin.html. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.300** — Create releases at github.com/PatriotsRV/rv-dashboard/releases/new (all tags exist) ⏳ Roland action
- **Supabase: Maximize log retention** — Settings → Logs in Supabase dashboard ⏳ Roland action
- **Confirm Kevin McHenry login + Sr. Manager access** — Kevin added to SR_MANAGER_EMAILS (v1.300) and has sr_manager role in Supabase; verify he can log in ⏳ Roland action
- **Provide Roof + Paint & Body manager** — Ryan covers both silos until dedicated hires. Add name/email when ready. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts request notifications (may already be done) ⏳ Roland action
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah in Quote section ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest part names/suppliers from history ⏳ Open
- **GH#2 — Layout customization** — Drag/resize tiles ⏳ Open
- **GH#3 — Parts field layout review** — UX improvements ⏳ Open
- **GH#8 — Switchblade tile view** — Compact tile layout mode ⏳ Open

---

## ✅ Recently Completed (last 5 sessions)
- ✅ **v1.296 (2026-03-30)** — Work Orders bug-fix pass: 5 fixes — `_supabaseId` mismatch (modal "RO not found"), silent save guard, dark-theme form inputs unreadable, silo badge on task rows, wrong RO opened when board filtered. Roland added to `staff` table as sr_manager (SQL) to fix RLS on WO inserts.
- ✅ **Manager Role Training Guide PDF (2026-04-02)** — 16 responsibilities across 5 phases, navy/red/gold branding, Quick Reference Checklist final page.
- ✅ **v1.297 (2026-04-02)** — Fix photo library crash on null entries — `url.includes is not a function` when photo_library array contained null/corrupt entries. Fixed by filtering after parseLibrary().
- ✅ **v1.298 (2026-04-02)** — Fix video upload size error messaging — pre-flight 500 MB check + user-friendly Supabase error catch.
- ✅ **v1.299 (2026-04-02)** — Fix editField apostrophe/quote crash — removed currentValue from function signature; reads directly from currentFilteredData.
- ✅ **v1.300 (2026-04-02)** — Add Kevin McHenry (kevin@) to SR_MANAGER_EMAILS.
- ✅ **Supabase Pro security pass (2026-04-02)** — Security Advisor 60→31 warnings; removed anon write policies (except time_logs workaround); fixed function search_path; enabled password strength + length requirements.

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
- **Edge Functions:** `kenect-proxy` (Kenect API), `roof-lookup` (AI), `send-quote-email` (email)
- **SMS:** Twilio (planned — number port pending)
- **Roles:** Admin (roland@, ryan@), Manager (mauricio@, andrew@, bobby@, solar@, brandon@), Tech, Service Advisor

---

## 🔑 Key Rules (for Claude when working in this project)
- The authoritative technical memory is **CLAUDE_CONTEXT.md** in the GitHub repo — always read it at laptop session start
- Never use `accessToken` as an auth guard for Supabase — use `getSB() && supabaseSession`
- Always run `bash scripts/backup.sh` before every `git push`
- Always bump the version number in both the HTML comment block AND the visible `<span>` badge in the header
- Parts request notes use `type:'ro_status'` with body prefix `🔩 PARTS REQUESTED:` — never `type:'parts_request'`
- Commit and push after every meaningful change — never let work sit uncommitted

---

*Last updated: 2026-04-02 — Session 28 — v1.300*
