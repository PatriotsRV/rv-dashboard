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
| **Current Version** | v1.308 |
| **Supabase Project** | axfejhudchdejoiwaetq |
| **Cowork Workspace** | rv-dashboard folder on Roland's laptop |

---

## 📐 Implementation Specs (2026-04-10 — Perplexity)

> **Five implementation specs in `docs/specs/`.** Written by Perplexity Computer, reviewed by Roland, merged via PR #15. Claude Cowork executes one session/phase at a time.

| Spec | Sessions | Priority | Status |
|---|---|---|---|
| `SECURITY_REMEDIATION.md` — 10 security issues (XSS, RBAC, auth gaps, API key exposure, etc.) | S1–S7 | 🔴 **ASAP** | ✅ **ALL COMPLETE** — 2026-04-11 |
| `TWILIO_SMS_SPEC.md` — Full SMS integration replacing Kenect | Phase 1–3 | 🔴 After port | ⏳ Not started |
| `TOAST_SYSTEM_SPEC.md` — Replace alert() with toast notifications | 1 session | 🟠 High | ⏳ Not started |
| `UNIFIED_SEARCH_SPEC.md` — Global search bar | 1 session | 🟠 High | ⏳ Not started |
| `MODULARIZATION_ROADMAP.md` — Split index.html into 18 ES modules | Phase 0–19 | 🟡 Long-term | ⏳ Not started |

**Next up:** Toast System or Unified Search (1 session each), then Twilio SMS after number port

**Workflow:** Perplexity researches/writes specs → pushes to `docs/specs/` → Claude Cowork reads and executes

---

## 📋 ACTIVE TODO LIST
> Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium
> Use this list from your iPhone to log updates between laptop sessions.

### 🔴 Blocking / Top Priority
- ~~**Security Remediation**~~ ✅ **ALL 10 ISSUES COMPLETE** — 2026-04-11. S1 (XSS × 44), S2 (RBAC), S3 (analytics auth), S4 (Anthropic key proxy), S5 (console.log cleanup), S6 (onclick migration), S7 (CORS + session tokens + calendar config + search_path). 10 commits + 2 hotfixes. 5 Edge Functions redeployed. 2 SQL migrations run.
- **GH#1 — Twilio number port** — Roland must gather carrier info + create Twilio account. Full guide in `docs/specs/TWILIO_SMS_SPEC.md` Section 2. Blocks all SMS features. ⏳ Roland action
- **GH#4 — Twilio SMS build** — Full spec in `docs/specs/TWILIO_SMS_SPEC.md`. Replaces Kenect. ⏳ Waiting on number port

### ⚠️ On Hold
- **GH#10 — Kenect messaging** — Pivoting to Twilio. Dormant code stays in repo until Twilio SMS is live. ⏳ On Hold

### 🟠 High Priority
- **Toast System** — Spec ready in `docs/specs/TOAST_SYSTEM_SPEC.md`. 1 session. ⏳ Not started
- **Unified Search** — Spec ready in `docs/specs/UNIFIED_SEARCH_SPEC.md`. 1 session. ⏳ Not started
- **GH#5c — Polish Work Orders UI** — Mobile layout, remaining bugs. 🔄 In Progress
- **GH#17 — Customer Check-In Page** — Front desk RO intake + RAF e-signature. ⏳ Open
- **GH#6 — Employee Time Clock** — Full time clock in dashboard. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.308** — Backlog of unpublished releases. ⏳ Roland action
- **Supabase: Maximize log retention** — Settings → Logs. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts notifications. ⏳ Roland action
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah. ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest from history. ⏳ Open
- **GH#21 — checkin.html Auth Persistence Fix** — Spec covered in Security Remediation Issue 3 pattern. ⏳ Open
- **Modularization** — Long-term. Spec ready in `docs/specs/MODULARIZATION_ROADMAP.md`. Start after security + SMS stable. ⏳ Not started

---

## ✅ Recently Completed
- ✅ **Security Remediation — ALL COMPLETE (2026-04-11)** — 10 security issues across 7 sessions (S1–S7) + 2 hotfixes. Commits: 0c04416, ee1c91e, 28c52f8, c920277, 14ab339, 350bf35, f78dceb, 44a8991, a4ad2b4, f12d775, 9c81cf7, 385ddd5, d5acc07, 19deb64. claude-vision-proxy Edge Function deployed (×2). 5 Edge Functions redeployed with CORS. 2 SQL migrations run. QA verified by Perplexity.
- ✅ **Perplexity scan + specs (2026-04-10)** — Full project scan. 5 implementation specs written, reviewed, merged (PR #14 safe fixes + PR #15 specs).
- ✅ **v1.308 (2026-04-05)** — Closed RO Archive (GH#22), Enhancement Request system (GH#19), parts badge fixes, Work List DOM fix, send-parts-report ro_id FK bug fix.
- ✅ **v1.305 (2026-04-04)** — Sr Manager silo-specific work lists, Work List Report page.
- ✅ **v1.304 (2026-04-03)** — Parts Notifications (GH#18) — Notify Requester button, ETA auto-notification, parts status report cron.

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
- **Edge Functions:** `kenect-proxy` (dormant), `roof-lookup` (AI), `send-quote-email` (email), `send-parts-report` (cron), `send-er-report` (cron), `claude-vision-proxy` (estimate scanner)
- **SMS:** Twilio (planned — full spec in `docs/specs/TWILIO_SMS_SPEC.md`)
- **Roles:** Admin (roland@, lynn@), Sr Manager (ryan@, kevin@), Manager (mauricio@, jason@, andrew@, solar@, bobby@, brandon@), Tech (9 techs)

---

## 🔑 Key Rules (for Claude when working in this project)
- The authoritative technical memory is **CLAUDE_CONTEXT.md** in the GitHub repo — always read it at laptop session start
- Never use `accessToken` as an auth guard for Supabase — use `getSB() && supabaseSession`
- Always run `bash scripts/backup.sh` before every `git push`
- Always bump the version number in both the HTML comment block AND the visible `<span>` badge in the header
- Parts request notes use `type:'ro_status'` with body prefix `🔩 PARTS REQUESTED:` — never `type:'parts_request'`
- Commit and push after every meaningful change — never let work sit uncommitted

---

*Last updated: 2026-04-11 — v1.308 — Security Remediation ALL COMPLETE (S1–S7)*
