# PRVS Assistant — AI-driven entry page (`home.html`) — Gen 1 spec

**Session:** 191 (2026-09-26) · **Owner:** Roland · **Status:** BUILDING S191
**Files:** `home.html` (NEW) · `supabase/functions/assistant-router/` (NEW) · `supabase/migrations/assistant_log_s191.sql` (NEW) · `index.html` v1.508 + `js/qr.js` + `js/planner.js` · `messages.html` · `tasks.html`

---

## 1. Why (Roland, S191)

> "There are now many pages tied to the overall RO DB and it's hard to navigate all of the data. The AI interface we put onto the Work Planner was inspirational — I want a brand new entry page that is AI driven. A simple search interface, like a web search page, where everyone can dictate where they want to go or what they want to do, keeping a history of every command issued by each individual."

Examples he gave:
- Service manager: *"Show me all of my active ROs, sorted by your interpretation of priority"* → all RV-service ROs, ranked by the KPIs the Work Planner already carries (reminders, parts status, tech time, delivery dates).
- Parts manager: *"Show me all of the parts on my manager email that need attention"*.
- Lynn: *"All ROs that need our managerial attention"*.
- Anyone: *"Create a reminder for the Shepard RO to set a pickup date"* → brings up that RO in edit mode.

First generation of a shop assistant that will evolve (the "JARVIS for Patriots RV" roadmap row).

## 2. Decisions locked S191 (Roland picked every recommended option)

| # | Decision | Choice |
|---|---|---|
| 1 | What the AI sees | **Router only.** The AI never sees RO data. It turns the request into a destination + view config + action from a fixed catalogue; the destination page does the data work under the user's own RLS. "Your interpretation of priority" = the existing `calculatePriority()` score (days on lot ×10, urgency, overdue/soon promised, VIP) — the planner's `score` column — plus parts / WO / receivable flags. Gen 2 (AI reads a KPI summary of the caller's own ROs and explains in prose) is a separate build with its own security design. |
| 2 | Where it lives | **New standalone `home.html`**, same auth pattern as `tasks.html`. A `🤖 Assistant` button in the header of the board (covers the planner), Messages and Tasks. Nothing existing moves; bookmarks, QR key-tag links, `?ro=` deep links and the version poller are untouched. |
| 3 | Where results show | **Jump to the page with the view applied.** RO lists go to the Work Planner (managers) or the board search (everyone) — no second RO table to maintain. The assistant shows a one-line summary and hands off in the SAME tab; Back (or the 🤖 button) returns to the hub. |
| 4 | Actions | **Navigate + open the RO in the right modal; a human finishes.** The AI extracts a customer / RO reference and an action; the board resolves the reference client-side (asks the user to pick when it matches more than one), scrolls to the card and opens Edit RO / Schedule Notification (reminder) / Parts / Work Orders / etc. The AI never writes. |

Who can use it: **every active staff account** (techs included). Destinations are gated per role exactly like the board's header buttons; the router is told which destinations the caller may use and the client re-checks.

## 3. The page (`home.html`, `HOME_VERSION = 'home-v1.0'`)

1. **Auth** — Supabase UMD + Google One Tap (`signInWithIdToken`), identical to `tasks.html`. After sign-in: `staff` row by email (name, role, service_silo, active) + `user_roles` names. Not an active staff row → "This account is not active PRVS staff" and stop.
2. **Greeting** — `Hello <first name>, how can I assist you today?`
3. **Prompt bar** — one input (Enter or **Ask**), `🎤 Speak` (browser SpeechRecognition, auto-submits, same code shape as the planner), example chips under it.
4. **Result line** — `<summary>` + "Opening the Work Planner…" then the hand-off; `understood=false` → a kind "here is what I can do" list; unmapped parts are shown before the hand-off.
5. **Shortcut grid** — one tile per page the user may open (see §5). Same-tab links.
6. **Your recent requests** — last 15 rows of `assistant_log` for this user (RLS: own rows), click to run again.
7. **Hand-off contract** (same tab):
   - `board` → `index.html` (+ `?q=<search>`)
   - `planner` → `index.html?planner=ai` with the view config in `sessionStorage['prvs_ai_view']` (sessionStorage survives a same-tab navigation on the same origin; no URL length issue; consumed once by `js/planner.js`). `planner=open` = plain open.
   - RO action → `index.html?find=<ref>&open=<action>` (or `?ro=<RO id>&open=` when the user typed an RO number).
   - `new_ro` → the existing `index.html?newro=1&name=&phone=&email=&rv=&service_type=` prefill (v1.484).
   - `messages` → `messages.html` · `tasks` → `tasks.html` · other pages plain.

## 4. The router (`assistant-router` edge fn, Deno, `--no-verify-jwt`, does its own auth)

Same shape as `planner-ai` (S190): verify the JWT, look the caller up **server-side** (`staff.active` + role names via `users → user_roles → roles`), compute the allowed destinations, forced tool call `route_request`, re-check the model's destination against the allow-list, log every request to `assistant_log`, rate limit 60 / user / hour. Model `claude-haiku-4-5` (override `ASSISTANT_AI_MODEL`). Secrets: the existing `ANTHROPIC_API_KEY`.

`route_request` output:
```
understood      boolean
summary         one friendly sentence
unmapped        string[]   (parts of the request nothing can express)
destination     board | planner | messages | tasks | closed_ros | time_off | guide | clock_in |
                customer_checkin | worklist_report | analytics | leads | solar | new_ro | none
ro              { ref: <customer / RO number / RV as said>, action: view|edit|reminder|schedule|parts|
                  request_parts|work_orders|photos|message|time_logs|receivable|checkin }
board           { search }
planner_view    { name, filters, sort, add_columns, bucket_tab }   ← the planner-ai schema, verbatim
new_ro          { name, phone, email, rv, service_type }
```
The planner vocabulary (silos, statuses, presets, flags, columns) is COPIED from `planner-ai/index.ts` — keep the two in sync (follow-up: move both to `supabase/functions/_shared/`).

## 5. Destination catalogue + gates (mirrors `updateViewModeDropdown()` in index.html)

| key | page | who |
|---|---|---|
| board | index.html | all staff |
| planner | index.html?planner=… | Admin / Manager / Sr Manager (`_canUse()` in planner.js) |
| messages | messages.html | all staff |
| tasks | tasks.html | all staff |
| closed_ros | closed-ros.html | all staff |
| time_off | time-off.html | all staff |
| guide | guide.html | all staff |
| clock_in | checkin.html | all staff (techs) |
| customer_checkin | customer-checkin.html | Admin / Manager / Sr Manager |
| worklist_report | worklist-report.html | Admin |
| analytics | analytics.html | Admin |
| leads | leads.html | Admin |
| solar | solar.html | Admin, role Solar, silo solar, staff.role sr_manager |
| new_ro | index.html?newro=1… | Admin / Manager / Sr Manager |

## 6. `assistant_log` (migration `assistant_log_s191.sql`)

`id, created_at, user_email, prompt, via (text|voice), result jsonb, destination text, understood bool, unmapped jsonb, error, model, ms, input_tokens, output_tokens`. RLS: `select` own rows (`lower(user_email) = lower(auth.jwt()->>'email')`) or Admin; writes = service role only (no insert policy). Explicit grants (S124 rule).

## 7. index.html v1.508 changes

- Header: `🤖 Assistant` button (all authenticated) → `home.html` (same tab).
- `js/qr.js handleDeepLink()`: `?find=<text>` resolves against `currentData` (customer, RO id, RV, VIN, phone; case-insensitive substring). 1 match → behaves like `?ro=`; several → search box set to the text + toast "N ROs match — pick one"; none → toast. `?open=<action>` runs the matching card action once the card is highlighted (same handlers as the board's click delegation). `?q=<text>` prefills the board search.
- `js/planner.js _initPlannerBtn()`: `?planner=ai` opens the planner and applies `sessionStorage.prvs_ai_view` through the existing `_applyAiView()` (all allow-list validation reused); `?planner=open` just opens it.
- Two-site version bump (`window.APP_VERSION` + `version.json`) + changelog header line.

## 8. Testing (S191)

1. Headless (no login): `home.html` renders the gate; with a stubbed session the greeting, grid gating (tech vs manager vs admin) and recent-requests list render; node syntax check on `js/qr.js` + `js/planner.js`; `check_version_sync.py` + `check_html_structure.py` pass.
2. Prod (Roland's signed-in tab, Chrome MCP): 401 with no login; 4 prompts (RO list → planner opens with the view; parts request → planner parts_open; reminder for a named RO → card opens the 🔔 modal; an unmappable one → nothing changes); tech account sees only tech tiles.

## 9. Follow-ups (TODO rows)

- Gen 2 reader mode (AI reads a KPI summary of the caller's own ROs) — needs a security design.
- Share the planner vocabulary between `planner-ai` and `assistant-router` (`_shared/`).
- Spanish toggle on `home.html`; per-page Assistant buttons beyond board/Messages/Tasks; cache-busting for the new page (same class as the S190 "other pages" row).
- Read `assistant_log.unmapped` after a week — that is the backlog of destinations/filters worth adding.
