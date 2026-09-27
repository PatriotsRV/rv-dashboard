# PRVS RO Dashboard — Security-First AI Roadmap

**Status:** APPROVED by Roland, Session 192 (2026-09-27). Supersedes the scattered Cloudflare-migration, reader-mode and "Jarvis" TODO rows in CLAUDE_CONTEXT.md; those rows now point here.
**Owner:** Roland Shepard. **Author:** Claude (Session 192).
**Goal (Roland's words, S192):** a fully secure application and codebase, locked away and private, available only through role-based access control — while continuing to use AI more and more in the day-to-day, up to and including replacing or redoing every RO DB page with an AI-assisted surface.

---

## 0. Why this document exists

Session 191 shipped the PRVS Assistant (`home.html`) as a Gen-1 **router**: the AI picks a page and a view from a fixed catalogue, the client validates, the AI never sees RO data and never writes. Roland likes it, but the router's defining limitation is now the thing he dislikes most: it *bounces* people to the old pages, which themselves need reworking.

Moving past that means the AI must eventually **read RO data** (to answer "what should I do first and why") and **draft changes** (that a human confirms). Both raise the security bar. This roadmap fixes the order: **lock the front door first, then let the AI in.**

## 1. Facts established in Session 192 (the baseline)

**Data flows today**

| Pipe | What leaves Supabase | Terms | Retention |
|---|---|---|---|
| `planner-ai`, `assistant-router` edge fns → `api.anthropic.com` | Typed prompt + system prompt (silo/status/flag/column vocabulary, caller first name, silo, role, date). **No RO rows.** | Anthropic commercial API terms (Roland's `ANTHROPIC_API_KEY`) | No training by default; backend deletion within 30 days; T&S-flagged content up to 2 years |
| `claude-vision-proxy` (insurance scanner) | The **whole uploaded estimate image** (customer name, VIN, carrier). The most sensitive AI call in the app. | same | same |
| Cowork sessions (this development work) | Context files, code, and every read-only MCP query result | Roland's **personal Max** account | "Help improve our AI models" was ON through S191 → **turned OFF 2026-09-27**. Now: no training use, 30-day deletion. Roland is staying on Max (Team move declined for now). |

**Database posture (DB-verified S192, read-only MCP)**
- Every `public` table has RLS **enabled** (query on `pg_class.relrowsecurity` returned zero rows without it).
- The only anon/public SELECT policy is `short_links.shortlinks_anon_select` — required by the `v.html?c=` customer short links, by design.
- `repair_orders` is **not** anon-readable (the S133 lockdown closed it). The older note "anon key can READ repair_orders" is stale — do not rely on it; `design/board-live.html` must sign in.
- Nine edge functions are deployed `--no-verify-jwt` (webhooks + cron senders: `process-review-requests`, `projectblue-webhook`, `review-feedback`, `send-checkin-reminder`, `send-scheduled-messages`, `send-task-reminders`, `send-unreplied-reminder`, `textly-webhook`, `woosender-intake`). Each must carry its own auth (shared secret / signature / service-role-only) — Phase 1 reviews them.

**Hosting posture**
- `rv-dashboard` is a **public** GitHub repo served from **public** GitHub Pages. Code, table names, RLS assumptions and the anon key are world-readable. Data is protected only by Supabase RLS + Google sign-in.
- The pattern that fixes this is already proven twice (S179–S181): Cloudflare Pages + Cloudflare Access on `prvstools.com`, `_middleware.js` 403-ing the `*.pages.dev` hostname, staff-email Access policy with the leading `@`. Live at `trainer.prvstools.com` and `calculator.prvstools.com`.

## 2. The invariants (apply to every phase)

1. **Access gates pages, RLS gates data.** The anon key is in the JS and is permanently public. Cloudflare Access is hardening, never a substitute for RLS.
2. **The AI never writes to the database.** Ever. Under any phase. Changes go through the existing audited client write functions after a human confirms.
3. **The AI only ever sees data the caller could already see** — reader calls run as the caller (their JWT, their RLS), never with the service role.
4. **Minimize what leaves Supabase.** Structured summaries, never free text authored by customers or staff (notes, messages, descriptions) — this is also the prompt-injection defence.
5. **Log the exact payload.** Every AI call records what was sent, by whom, and what came back, in an own-rows-RLS log table. "What did the AI see?" must always have an answer.
6. **Old pages stay live until the new surface is trusted.** Hot standby, not big bang.
7. **Every rollout still runs the S-rules:** Chrome regression, backup.sh, Sync Gate, rollback anchor.

## 3. Phases

### Phase 1 — Lock the front door (est. 2–3 sessions)

Deliverable: the dashboard served only at `dashboard.prvstools.com` behind Cloudflare Access; `PatriotsRV/rv-dashboard` private; the two S181 loose ends closed.

1. **Cheap holes first (same session, before the migration):**
   - Revoke the `Claude MCP` classic PAT (scope `repo`, no expiration, account-wide). Replace with a fine-grained token if anything still needs it.
   - Gate `solar.html` behind the same login as every other page (S133 finding, still open).
2. **Cloudflare Pages project** ← `PatriotsRV/rv-dashboard`, production branch `main`, custom domain `dashboard.prvstools.com`.
3. **Cloudflare Access application** on that hostname; reuse the corrected policy (`Emails ending in @patriotsrvservices.com` — S180 fix). Add the kiosk account (`customerservice@…`) and any non-domain testers explicitly (Rusty's address for Android testing, if still needed).
4. **Port `functions/_middleware.js`** from `prvs-internal-tools`: 403 unless `Host` is the custom domain. This is what closes the `*.pages.dev` bypass.
5. **Google OAuth origins:** add `https://dashboard.prvstools.com` to the Authorized JavaScript origins of client `971946834908-…` **before** cutover. All 11 sign-in pages fail with `Error 400: invalid_request` otherwise. Keep `patriotsrv.github.io` until GitHub Pages is retired.
6. **Edge-function CORS / allow-lists:** `claude-vision-proxy` allows only `https://patriotsrv.github.io` — add the new origin. Grep every edge fn for the old origin.
7. **Cutover:** repoint the links staff actually use — `home.html` tiles, `guide.html`, every report-email deep link (`send-manager-report`, `send-parts-report`, `send-dropoff-report`, task/checkin reminders), `v.html` short links (customer-facing — those keep working on either host, but new ones should mint the new host). Run the Chrome regression against the new host.
8. **`--no-verify-jwt` review:** for each of the nine functions, confirm the auth it *does* have (webhook signature, shared secret header, cron-only invocation). Document each in Known Issues. Any that has none gets one.
9. **Flip the repo PRIVATE.** Cloudflare Pages serves private repos on the Free plan. This also buries the AeroArmor blobs in git history. Verify the nightly `backup.yml` still pushes (the `GH_BACKUP_PAT` is fine-grained; confirm its repo scope covers a private repo).
10. **GitHub Pages stays up for one release as rollback**, then is disabled. Record the rollback path in ROLLBACK.md.

Exit criteria: unauthenticated request to `dashboard.prvstools.com` returns the Access login; `*.pages.dev` returns 403; `patriotsrv.github.io` disabled; repo private; `backup.yml` green; regression green.

### Phase 2 — Reader mode, narrowly (est. 2 sessions)

Deliverable: a new edge function `assistant-reader` that answers questions about the caller's ROs, on a minimized payload, fully logged.

- **Runs as the caller.** Verifies the JWT, then queries `repair_orders` (+ the planner view) **with the caller's token**, so RLS scopes the rows exactly as the board would.
- **Payload = one compact line per RO:** RO number, status, silo(s), urgency, days on lot, promised date, flags (parts_open, receivable, no_wo, wo_open, vip), WO %, customer **first name only**. **Never:** notes, descriptions, messages, phone, email, VIN, dollar amounts unless the question is explicitly about money (then rounded). Hard cap on row count (planner-sized, ~150).
- **One question, one answer.** The model returns prose + an ordered list of RO numbers. The client re-validates every RO number against the rows it already holds before rendering (same allow-list discipline as `_applyAiView`).
- **`assistant_reader_log`:** user_email, prompt, the exact serialized payload, model, response, ms, error. Own-rows RLS + Admin. Rate-limited from the log like the router.
- **Kill switch:** an `app_config` flag the client checks; Admin can turn reader mode off shop-wide without a release.
- **Not in scope:** the insurance-scanner image path (already exists; unchanged), customer-authored text, anything cross-tenant.

Exit criteria: Roland + Lynn get correct "what first and why" answers on their own ROs; the log shows exactly what was sent; a tech's call returns only what a tech can see.

### Phase 3 — The hot-standby board (several sessions; the big one)

Deliverable: `board.html` — a new page built beside `index.html`, sharing its modules, auth, RLS and **write functions**, with the assistant bar as the primary control.

- **Same foundations, new surface.** Imports the existing `js/` modules via the S190 import map; uses `updateROInSupabase`, `writeAuditLog`, the parts/notes/reminder handlers as-is. No new write paths.
- **The assistant bar does three jobs, in trust order:**
  1. **Arrange the view** — filter, sort, group, columns, silo, bucket. Allow-listed exactly like the planner (`_applyAiView` pattern). Safe from day one; router-only.
  2. **Answer about what's on screen** — Phase 2 reader, scoped to the visible/filtered set.
  3. **Draft a change** — status, parts request, note, reminder, schedule. The AI produces a *proposal card* ("Set PRVS-7CFE-2397 to Awaiting Parts? [Confirm] [Cancel]"); Confirm calls the **existing** handler so every S-rule guard and audit entry fires. No confirm, no write. Multi-RO proposals list every RO and require one confirm per RO in v1.
- **Chrome goes away because the bar replaces it:** no filter rail, no search box, no button rack. Cards keep their click-to-open behaviour; the modal stack is reused unchanged.
- **Messages, Tasks, Planner become views** the assistant opens *inside* `board.html` (side panel / overlay), not destinations. Their pages stay live for direct use until Phase 4.
- **Roll-out:** Roland + Lynn run a real week on `board.html` with `index.html` untouched. Managers next. Techs last (their view is the simplest).

Exit criteria: one full week where Roland and Lynn do not open `index.html`; zero write-path regressions in `audit_log`; the proposal card has never written without a confirm (log-verified).

### Phase 4 — Retire and expand

- `home.html` lands on `board.html` instead of routing; the router's catalogue shrinks to the pages that still exist.
- Retire old pages one at a time as their in-board view proves out: index → messages → tasks → planner → closed-ros. Each retirement is its own release with its own rollback.
- Extend the same bar to `customer-checkin.html` and the reports.
- **Proactive** (the assistant telling a manager something unprompted — digest, alerts) is a separate decision after Phase 4, not part of it.

## 4. Deliberately NOT doing

- Rebuilding every page at once.
- Adding reader mode to the old pages.
- Letting the AI write to the database, under any phase.
- Sending customer- or staff-authored free text to the model.
- Treating Cloudflare Access as data security.
- Zero Data Retention: nice-to-have (requires Anthropic sales; the newest model tier needs 30-day retention anyway). Revisit only if the business requires it.

## 5. Open decisions (Roland)

- Whether `design/` prototype tokens (S121 workstream) are the visual base for `board.html`, or the current dashboard CSS. Recommendation: build `board.html` on the S121 tokens so the redesign and the AI surface ship as one thing.
- Whether Rusty / any non-domain tester needs an Access allow-list entry after Phase 1.
- Team-account move for Cowork sessions: declined for now; re-raise only if Roland asks.

## 6. Change log

- 2026-09-27 S192 — created; approved by Roland.
