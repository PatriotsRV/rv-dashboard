# PRVS Dashboard — Claude Project Context
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
| **Current Version** | v1.294 |
| **Supabase Project** | axfejhudchdejoiwaetq |
| **Cowork Workspace** | rv-dashboard folder on Roland's laptop |

---

## 📋 ACTIVE TODO LIST
> Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium
> Use this list from your iPhone to log updates between laptop sessions.

### 🔴 Blocking
- **Resolve Kenect integration approach** — Kenect told us to use Zapier, but Zapier has NO inbound message trigger (can't show customer replies in dashboard). Options: (A) Push back and request direct API access — recommended; (B) Accept Zapier for send/review only; (C) Zapier outbound + store messages in Supabase. ⏳ Decision needed — Roland

- **GH#1 — Start Twilio number port** — Port existing number — blocks all SMS features ⏳ Open

### 🟠 High Priority
- **GH#4 — Twilio SMS** — Customer + tech notifications via SMS (blocked on port) ⏳ Open
- **GH#5 — Work Assignment System** — Service Tasks per RO, per-task dollar value, Manager sets urgency, `service_tasks` DB table ⏳ Open
- **GH#6 — Employee Time Clock** — Full time clock feature in dashboard ⏳ Open
- **GH#15 Phase 3 — Interactive Virtual Lot Map** — Dashboard view mirroring physical whiteboard; cells show customer + repair type; Manager assigns/moves RVs; color-coded by urgency ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.294** — Create releases at github.com/PatriotsRV/rv-dashboard/releases/new (tags already exist) ⏳ Roland action
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah in Quote section ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest part names/suppliers from history ⏳ Open
- **GH#2 — Layout customization** — Drag/resize tiles ⏳ Open
- **GH#3 — Parts field layout review** — UX improvements ⏳ Open
- **GH#8 — Switchblade tile view** — Compact tile layout mode ⏳ Open
- **Create parts@patriotsrvservices.com** — Email group for parts request notifications ⏳ Roland action

---

## ✅ Recently Completed (last 5 sessions)
- ✅ **v1.290** — Kenect messaging integration (💬 button, conversation modal, send/review, kenect-proxy Edge Function)
- ✅ **v1.291/v1.292** — Parking Spot field (📍 chip on RO card, R/B/W/F lot positions, SQL migration)
- ✅ **v1.293** — Dual-sticker QR Print Sheet (3"×3" windshield + 1"×1" key tag)
- ✅ **v1.294** — QR scan opens main dashboard RO tile with deep-link blue highlight
- ✅ **SESSION_STARTER.md** — Updated with iPhone/mobile TODO sync workflow

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

*Last updated: 2026-03-27 — Session 25 — v1.294*
