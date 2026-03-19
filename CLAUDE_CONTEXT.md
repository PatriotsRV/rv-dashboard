# PRVS Dashboard — Claude Context Document

> **Living document.** Update this file at the end of every session.  
> Any Claude interface can start a session by reading this file via GitHub MCP.

---

## Project Identity

| Field | Value |
|---|---|
| **Project** | Patriots RV Services (PRVS) Dashboard |
| **Owner** | Roland Shepard — roland@patriotsrvservices.com |
| **GitHub Org** | PatriotsRV |
| **Repo** | rv-dashboard |
| **Branch** | main |
| **Deployment** | GitHub Pages (https://patriotsrv.github.io/rv-dashboard/) |

---

## File Inventory

| File | Version | Description |
|---|---|---|
| `index.html` | **v1.264** | Main dashboard — repair orders, time tracking, parts, etc. |
| `checkin.html` | **v1.26** | Technician clock-in/out, offline-first IndexedDB queue |
| `analytics.html` | **v1.0** | Analytics/reporting view |
| `solar.html` | **v1.0** | Solar installation tracking |
| `README.md` | — | Basic repo readme |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity doc |
| `.github/workflows/backup.yml` | — | Daily Supabase backup → private backup repo |

---

## Tech Stack

- **Frontend:** Vanilla JS, HTML/CSS — no framework
- **Auth:** Google Identity Services (GIS) — `signInWithIdToken` via Supabase
- **Database:** Supabase (PostgreSQL + RLS)
- **Storage:** Supabase Storage (`rv-media` bucket)
- **Backups:** GitHub Actions → `prvshepard/rv-dashboard-backups` (private), daily at 4 AM EST
- **SMS:** Twilio (planned — port in progress)
- **Offline:** IndexedDB queue in checkin.html
- **Hosting:** GitHub Pages

---

## Key Architecture Decisions

### Google OAuth + Supabase Nonce Flow (v1.263 — CORRECT)
Supabase `signInWithIdToken` requires a nonce to prevent replay attacks. The correct pattern:

1. Generate a raw nonce as a **hex string** (16 random bytes, hex-encoded)
2. Compute SHA-256 of the raw nonce, also encoded as **hex string** — this is `hashedNonce`
3. Pass `hashedNonce` as top-level `nonce` in `google.accounts.id.initialize()`
4. Store both nonces in `localStorage('prvs_sb_nonce')` / `localStorage('prvs_sb_nonce_hash')` — survives async callback gaps
5. In the callback, retrieve raw nonce from localStorage and pass to `supabase.auth.signInWithIdToken()`
6. Clear nonces from localStorage after success or failure

**v1.263 fix:** `hashedNonce` was encoded with `btoa()` (base64) but Supabase expects **hex** SHA-256.  
**v1.262 fix:** `nonce` must be top-level in `google.accounts.id.initialize()`, NOT nested under `params`.

### Supabase RBAC
- RLS enabled on all 11 tables: `repair_orders`, `notes`, `parts`, `time_logs`, `cashiered`, `users`, `user_roles`, `roles`, `audit_log`, `config`, `insurance_scans`
- Storage bucket `rv-media` also protected
- Helper function `has_role(role_name text)` — SECURITY DEFINER, checks `user_roles` + `roles` tables
- Pattern: `TO authenticated USING (true)` for reads; `WITH CHECK (has_role('Admin'))` for restricted writes
- **Status: ✅ Complete**

### Daily Backup
- GitHub Actions workflow: `.github/workflows/backup.yml`
- Schedule: 8 AM UTC (4 AM EST) daily + manual trigger available
- Exports all 11 tables via Supabase REST API (service role key)
- Pushes JSON files to private repo `prvshepard/rv-dashboard-backups`
- Rolling 30-day retention — oldest auto-deleted
- Required GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GH_BACKUP_PAT`
- **Status: ✅ Live and tested**

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `repair_orders` | Core RO tracking |
| `notes` | RO notes |
| `parts` | Parts per RO |
| `time_logs` | Technician time entries |
| `cashiered` | Payment/cashier records |
| `users` | User profiles |
| `user_roles` | User ↔ role join |
| `roles` | Role definitions (Admin, Tech, Service Advisor, etc.) |
| `audit_log` | Change audit trail |
| `config` | App configuration |
| `insurance_scans` | Insurance document scans |

---

## Open TODOs (GitHub Issues)

| # | Title | Priority | Notes |
|---|---|---|---|
| [#1](https://github.com/PatriotsRV/rv-dashboard/issues/1) | Start Twilio number port | 🔴 Urgent/Blocking | Port existing number — blocks SMS feature |
| [#2](https://github.com/PatriotsRV/rv-dashboard/issues/2) | Regular view layout customization | Medium | Drag/resize tiles |
| [#3](https://github.com/PatriotsRV/rv-dashboard/issues/3) | Parts field layout review | Medium | UX improvements |
| [#4](https://github.com/PatriotsRV/rv-dashboard/issues/4) | Twilio SMS v1.27 | High | Customer/tech notifications |
| [#5](https://github.com/PatriotsRV/rv-dashboard/issues/5) | Work Assignment System | High | Assign ROs to techs |
| [#6](https://github.com/PatriotsRV/rv-dashboard/issues/6) | Employee Time Clock | High | Full time clock feature |
| [#7](https://github.com/PatriotsRV/rv-dashboard/issues/7) | Rotate GitHub PAT | ✅ Done | New PAT created with repo+workflow scopes |
| [#8](https://github.com/PatriotsRV/rv-dashboard/issues/8) | Switchblade tile view | Medium | Compact tile layout mode |

---

## Version History

| Version | Date | Change |
|---|---|---|
| v1.0 | Early 2025 | Initial dashboard (Google Sheets backend) |
| v1.1 | — | Supabase migration begins |
| v1.26 | 2026-03 | checkin.html — Supabase backend, IndexedDB offline queue, auto clock-out |
| v1.261 | 2026-03 | index.html — various fixes (pre-nonce-fix) |
| v1.262 | 2026-03-19 | index.html — Fix nonce placement: top-level in `google.accounts.id.initialize` |
| v1.263 | 2026-03-19 | index.html — Fix nonce encoding: hex not base64; localStorage persistence |
| **v1.264** | **2026-03-19** | **index.html — Add Analytics button (Admin only, dark green); version tags on all files** |

---

## Completed Work

- ✅ **Supabase RBAC** — RLS on all 11 tables + storage, `has_role()` helper
- ✅ **checkin.html v1.26** — Supabase backend, offline-first IndexedDB queue
- ✅ **Nonce fixes (v1.262, v1.263)** — placement + hex encoding, Supabase auth working
- ✅ **Analytics button (v1.264)** — Admin-only, dark green, tile view header
- ✅ **Version tags** — Visible version on all 4 HTML files
- ✅ **Daily backup** — GitHub Actions, private repo, 30-day rolling, tested ✅
- ✅ **GitHub PAT rotated** — New PAT with `repo` + `workflow` scopes
- ✅ **CLAUDE_CONTEXT.md** — Cross-session continuity established

---

## Session Log

| Date | Summary |
|---|---|
| 2026-03-19 (session 1) | GitHub MCP confirmed, RBAC SQL, checkin.html v1.26, nonce fixes v1.262+v1.263, CLAUDE_CONTEXT.md created |
| 2026-03-19 (session 2) | Nonce encoding fixed (hex), Analytics button added (v1.264), version tags on all files, daily backup workflow live, PAT rotated |

---

## How to Start a New Session

1. Read this file via GitHub MCP: `get_file_contents PatriotsRV/rv-dashboard CLAUDE_CONTEXT.md`
2. Check open issues: `list_issues PatriotsRV/rv-dashboard state=open`
3. Pick up from the TODO list above
4. At end of session: update this file + close/update any relevant issues
