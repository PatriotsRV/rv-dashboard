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
| **Current Version** | v1.405 |
| **Supabase Project** | axfejhudchdejoiwaetq |
| **Cowork Workspace** | rv-dashboard folder on Roland's laptop |

---

## 📐 Implementation Specs (2026-04-10 — Perplexity)

> **Five implementation specs in `docs/specs/`.** Written by Perplexity Computer, reviewed by Roland, merged via PR #15. Claude Cowork executes one session/phase at a time.

| Spec | Sessions | Priority | Status |
|---|---|---|---|
| `SECURITY_REMEDIATION.md` — 10 security issues (XSS, RBAC, auth gaps, API key exposure, etc.) | S1–S7 | 🔴 **ASAP** | ✅ **ALL COMPLETE** — 2026-04-11 |
| `TWILIO_SMS_SPEC.md` — Full SMS integration replacing Kenect | Phase 1–3 | 🔴 After port | ⏳ Not started |
| `TOAST_SYSTEM_SPEC.md` — Replace alert() with toast notifications | 1 session | 🟠 High | ✅ **COMPLETE** — 2026-04-11 |
| `UNIFIED_SEARCH_SPEC.md` — Global search bar | 1 session | 🟠 High | ✅ **COMPLETE** — 2026-04-12 |
| `MODULARIZATION_ROADMAP.md` — Split index.html into 18 ES modules | Phase 0–19 | 🟡 Long-term | ⏳ Not started |

**Next up:** Twilio SMS after number port, then Modularization long-term

**Workflow:** Perplexity researches/writes specs → pushes to `docs/specs/` → Claude Cowork reads and executes

---

## 📋 ACTIVE TODO LIST
> Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium
> Use this list from your iPhone to log updates between laptop sessions.

### 🔴 Blocking / Top Priority
- ~~**Security Remediation**~~ ✅ **ALL 10 ISSUES COMPLETE** — 2026-04-11. S1 (XSS × 44), S2 (RBAC), S3 (analytics auth), S4 (Anthropic key proxy), S5 (console.log cleanup), S6 (onclick migration), S7 (CORS + session tokens + calendar config + search_path). 10 commits + 2 hotfixes. 5 Edge Functions redeployed. 2 SQL migrations run.
- **GH#1 — Twilio number port** — Roland must gather carrier info + create Twilio account. Full guide in `docs/specs/TWILIO_SMS_SPEC.md` Section 2. Blocks all SMS features. ⏳ Roland action
- **GH#4 — Twilio SMS build** — Full spec in `docs/specs/TWILIO_SMS_SPEC.md`. Replaces Kenect. ⏳ Waiting on number port

### 🟠 High Priority
- **GH#23 — Morning Manager Report (data quality banner fix)** — Data quality banner ($0.00 warning) not firing for sr_manager reports. Multi-silo work list lookup needs fresh investigation. Deferred from Session 44. 🔄 In Progress
- **GH#23 — Map service_silo values to each manager in staff table** — Needed for per-silo RV filtering in send-manager-report to work correctly. ⏳ Open
- **GH#20 — Slack Integration (remaining triggers)** — Test `ro_urgency_critical`, `part_received`, `warranty_ro_opened`. Audit & configure all 5 event types. Deploy final. 🔄 In Progress
- **GH#5c — Polish Work Orders UI** — Mobile layout, remaining bugs. 🔄 In Progress
- **GH#17/GH#19 — Customer Check-In Page** — Front desk RO intake + RAF e-signature. Next session build target. ⏳ Open
- **GH#6 — Employee Time Clock** — Full time clock in dashboard. ⏳ Open

### 🟡 Medium Priority / Roland Actions
- **GitHub Releases v1.283–v1.308** — Backlog of unpublished releases. ⏳ Roland action
- **GitHub Release v1.402/v1.403/v1.404/v1.405** — Warranty RO + Slack integration + Morning Manager Report + Shop Operations RO. ⏳ Roland action
- **Supabase: Maximize log retention** — Settings → Logs. ⏳ Roland action
- **Create parts@patriotsrvservices.com** — Email group for parts notifications. ⏳ Roland action
- **GH#11 — Solar Battery Bank Wh** — Show Wh alongside Ah. ⏳ Open
- **GH#9 — Parts form autocomplete** — Suggest from history. ⏳ Open
- **GH#21 — checkin.html Auth Persistence Fix** — Spec covered in Security Remediation Issue 3 pattern. ⏳ Open
- **Modularization** — Long-term. Spec ready in `docs/specs/MODULARIZATION_ROADMAP.md`. Start after security + SMS stable. ⏳ Not started

---

## ✅ Recently Completed
- ✅ **customer-checkin.html backdrop redesign (2026-04-16)** — Replaced marble CSS backdrop with fixed full-bleed RV park mountain photo. Vibrance boost (saturate 1.25, contrast 1.05) + light cream overlay (~20% opacity). Commits: 71489b5, 6ac5c07.
- ✅ **Sr Manager Parts + Schedule Fix (2026-04-14)** — Added `hasRole('Sr Manager')` to 5 UI role gates. Fixes Kevin McHenry Sr Manager access. Commit: d5ddc36.
- ✅ **GH#24 Shop Operations RO Phase 1 v1.405 (2026-04-14)** — 5th RO type (`shop`) for non-customer parts ordering/returns. Purple badge, compact chip, filter button, Slack skip. Commits: 66a5fe8, ca07ba9, 13981a0.
- ✅ **send-manager-report v1.8 (2026-04-14)** — v1.7: ≥30 days filter. v1.8: red PARTS HOLD badge on individual RO line items + named ROs in Key Flags. Deployed as Supabase version 13.
- ✅ **Worklist Report v1.2 — clickable tech tile expand (2026-04-14)** — Tech tiles in Staff Status section now clickable, expands to show daily time log per tech.
- ✅ **Perplexity Computer Skills (2026-04-14)** — Created `prvs-dashboard-startup` and `prvs-dashboard-endsession` as persistent Perplexity account-level skills.
- ✅ **Slack Integration GH#20 — v1.403 (2026-04-12)** — `slack-notify` Edge Function v1.2 + 5 trigger points. ro_created + ro_ready_pickup confirmed working. 3 triggers remaining.
- ✅ **send-parts-report v1.7 (2026-04-12)** — Contextual numbered action prompts, EOD checklist, Gmail clipping fix.
- ✅ **Unified Search V1 (2026-04-12)** — 10-field haystack search (name, RO ID, VIN, RV, tech, description, spot, phone, email, repair type) + post-render highlight. Works in standard + compact views. Commit: 7a355a4.
- ✅ **v1.400 Session (2026-04-11)** — Version bumped v1.308→v1.400. Toast System complete (116 alert→showToast, 4 confirm→toast-action). Visual cleanup pass (calmed animations, utility classes). Dead code cleanup (968 lines removed). Kenect removal (550 lines). Compact Manager View (dense 6-column row layout with RV photo thumbnail). slideIn keyframe fix.
- ✅ **Security Remediation — ALL COMPLETE (2026-04-11)** — 10 security issues across 7 sessions (S1–S7) + 2 hotfixes. 5 Edge Functions redeployed with CORS. 2 SQL migrations run.
- ✅ **Perplexity scan + specs (2026-04-10)** — Full project scan. 5 implementation specs written, reviewed, merged.
- ✅ **v1.308 (2026-04-05)** — Closed RO Archive (GH#22), Enhancement Request system (GH#19), parts badge fixes, Work List DOM fix.
- ✅ **v1.305 (2026-04-04)** — Sr Manager silo-specific work lists, Work List Report page.

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
- **Edge Functions:** `roof-lookup` (AI), `send-quote-email` (email), `send-parts-report` (cron), `send-er-report` (cron), `claude-vision-proxy` (estimate scanner), `slack-notify` (Slack webhooks), `send-manager-report` (cron — GH#23 morning manager report)
- **SMS:** Twilio (planned — full spec in `docs/specs/TWILIO_SMS_SPEC.md`)
- **Roles:** Supabase RBAC via `user_roles` table — Admin, Sr Manager, Manager, Parts Manager, Tech (all hardcoded email arrays removed S2)

---

## 🔑 Key Rules (for Claude when working in this project)
- The authoritative technical memory is **CLAUDE_CONTEXT.md** in the GitHub repo — always read it at laptop session start
- Never use `accessToken` as an auth guard for Supabase — use `getSB() && supabaseSession`
- Always run `bash scripts/backup.sh` before every `git push`
- Always bump the version number in both the HTML comment block AND the visible `<span>` badge in the header
- Parts request notes use `type:'ro_status'` with body prefix `🔩 PARTS REQUESTED:` — never `type:'parts_request'`
- Commit and push after every meaningful change — never let work sit uncommitted

---

*Last updated: 2026-04-16 — Session 49 — v1.405 — customer-checkin.html backdrop redesign (RV park photo replaces marble)*
