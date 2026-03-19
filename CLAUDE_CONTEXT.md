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
| `index.html` | **v1.262** | Main dashboard — repair orders, time tracking, parts, etc. |
| `checkin.html` | **v1.26** | Technician clock-in/out, offline-first IndexedDB queue |
| `analytics.html` | — | Analytics/reporting view |
| `solar.html` | — | Solar installation tracking |
| `README.md` | — | Basic repo readme |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity doc |

---

## Tech Stack

- **Frontend:** Vanilla JS, HTML/CSS — no framework
- **Auth:** Google Identity Services (GIS) — `signInWithIdToken` via Supabase
- **Database:** Supabase (PostgreSQL + RLS)
- **Storage:** Supabase Storage (`rv-media` bucket)
- **SMS:** Twilio (planned — port in progress)
- **Offline:** IndexedDB queue in checkin.html
- **Hosting:** GitHub Pages

---

## Key Architecture Decisions

### Google OAuth + Supabase Nonce Flow
Supabase `signInWithIdToken` requires a nonce in the Google credential to prevent replay attacks. The nonce must be:
1. Generated as a random string → SHA-256 hashed → base64url encoded
2. Passed as **top-level** `nonce` in `google.accounts.id.initialize()` (NOT nested under `params`)
3. The raw (unhashed) nonce passed to `supabase.auth.signInWithIdToken()`

**v1.262 fix:** `nonce` was incorrectly nested inside `params: { nonce: hashedNonce }` — Google silently ignores unknown top-level keys like `params`, so the id_token was issued without a nonce, causing Supabase to throw "Nonces mismatch" on every sign-in.

### Supabase RBAC
- RLS enabled on all 11 tables: `repair_orders`, `notes`, `parts`, `time_logs`, `cashiered`, `users`, `user_roles`, `roles`, `audit_log`, `config`, `insurance_scans`
- Storage bucket `rv-media` also protected
- Helper function `has_role(role_name text)` — SECURITY DEFINER, checks `user_roles` + `roles` tables
- Pattern: `TO authenticated USING (true)` for reads; `WITH CHECK (has_role('Admin'))` for restricted writes
- **Status: ✅ Complete** — SQL run in Supabase SQL editor

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
| [#7](https://github.com/PatriotsRV/rv-dashboard/issues/7) | Rotate GitHub PAT | 🔴 Security | Old PAT may be expired/exposed |
| [#8](https://github.com/PatriotsRV/rv-dashboard/issues/8) | Switchblade tile view | Medium | Compact tile layout mode |

---

## Version History

| Version | Date | Change |
|---|---|---|
| v1.0 | Early 2025 | Initial dashboard (Google Sheets backend) |
| v1.1 | — | Supabase migration begins |
| v1.26 | 2026-03 | checkin.html — Supabase backend, IndexedDB offline queue, auto clock-out |
| v1.261 | 2026-03 | index.html — various fixes (pre-nonce-fix) |
| **v1.262** | **2026-03-19** | **index.html — Fix nonce mismatch: moved `nonce` to top-level in `google.accounts.id.initialize`** |

---

## Completed Work

- ✅ **Supabase RBAC** — RLS policies on all tables + storage, `has_role()` helper
- ✅ **checkin.html v1.26** — Pushed to repo (offline-first, Supabase backend)
- ✅ **Nonce mismatch fix (v1.262)** — Google sign-in now works without "Nonces mismatch" error
- ✅ **CLAUDE_CONTEXT.md** — This context document established for cross-session continuity
- ✅ **GitHub Issues** — TODOs tracked as Issues #1–#8

---

## Session Log

| Date | Summary |
|---|---|
| 2026-03-19 | Full session: GitHub MCP confirmed, RBAC SQL written + executed, checkin.html v1.26 pushed, nonce mismatch root-caused and fixed (v1.262 force-pushed), this context doc created |

---

## How to Start a New Session

1. Read this file via GitHub MCP: `get_file_contents PatriotsRV/rv-dashboard CLAUDE_CONTEXT.md`
2. Check open issues: `list_issues PatriotsRV/rv-dashboard state=open`
3. Pick up from the TODO list above
4. At end of session: update this file + close/update any relevant issues
