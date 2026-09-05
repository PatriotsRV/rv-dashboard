# Work Planner — Spec (S188, 2026-09-05, Roland directive)

> Manager-facing dynamic RO report + daily/weekly work-list builder ON index.html.
> v1.504 (S188) shipped the first draft: filters / sort / manual drag / buckets / saved views
> (`js/planner.js`, `planner_views_s188.sql`). This spec captures Roland's guidance for the
> real product and the session-by-session plan. **Target: usable by managers Monday 2026-09-07.**

## Roland's guidance (verbatim intent, S188)

- **A1 — Plans are per manager, but cross-silo VISIBLE.** Each manager's work list is their own,
  but any RO that appears in more than one manager's plan (multi-silo RO: e.g. Roof + Solar + Vroom)
  must expose every silo's plan (dates, inputs) to the other silo managers, with drill-down.
  The #1 problem today: one silo not knowing what another silo is doing with the same RO.
  - Example: Solar plans panel install Wed; Roof already has the RV in an active spray state Wed →
    Solar gets a notification to **request an update** from Roof for an install day.
  - Roof answers "not until Friday"; pickup is the following Monday → BOTH teams get a
    **dependency alert** that needs attention. Promise dates must be part of the check.
  - Managers coordinate **through the report** (back-and-forth request/reply thread).
  - **Admins can put an RO onto ANY manager's plan** as an FYI so it lands in that manager's
    daily/weekly list.
- **A2 — Visibility:** all managers see each other's shared views for now; may be restricted later.
  Multi-silo ROs must always be mutually visible. Single-silo ROs may be hideable later.
- **A3 — Reports/email:** this will likely replace the current daily manager report structure.
  End state: ONE master morning "work load" email per manager = guide for today + upcoming days,
  including messaging + scheduled reminders. Retire overlapping emails.
- **A4 — KPIs per RO:** tech hours worked to date, expected hours remaining, techs checked in on the
  RO, parts statuses, anything that helps finish the RO sooner. Per-manager **"What else do you need
  to see"** column picker so each manager crafts their own KPI view.
- **A5 — Audit trail for everything:** every manager interaction, every cross-silo
  notification/request/reply.

## Data model (target)

| Table | Purpose |
|---|---|
| `planner_entries` | **The shared plan.** One row per (ro_uuid, service_silo). owner_email, bucket (today/week/later/hold), planned_start, planned_end, est_hours_remaining (override), note, sort_order, source (manual / admin_fyi), status (planned/active/done/dropped), created_by, updated_by. Visible to every manager+. Written by owner, silo managers of that silo, Sr Manager, Admin. |
| `planner_messages` | **The RO channel (Slack-style thread per RO).** from_email, from_silo, to_silo (nullable = whole channel), kind (message / request / reply / conflict / fyi / system), body, proposed_date, parent_id, resolved_at/by. Every cross-silo request, reply and system conflict notice lives HERE — never email. |
| `planner_events` | **Audit trail.** Every insert/update/delete on entries + requests: actor, ro_uuid, silo, field diffs (jsonb), kind. Also every notification fired. |
| `planner_views` | Personal saved report config (filters, columns, sort, manual order) — already live (S188). `rows` jsonb order kept ONLY for manual sort; buckets/notes move to `planner_entries`. |
| SMS (Phase 2) | Important requests/reminders ALSO go as a direct staff SMS through the Messages-board infrastructure (same path the Task Manager notify uses). **Roland S188: NO email for planner traffic** — email buries things. |

## Conflict / dependency rules (v1)

1. **Overlap:** two silos' entries on the same RO with overlapping planned_start..planned_end → both get `⚠ overlap` and a notification (dedupe per RO+silo pair per day).
2. **Promise squeeze:** any entry whose planned_end > (promised_date or pickup_date) → `🔴 promise at risk` to that silo + admins.
3. **Sequence gap:** RO has silo A active/immediate and silo B planned within the same window with no reply on an open request → surfaced in the "Needs coordination" tab.
4. **Unplanned multi-silo:** RO has a WO in silo X but no planner entry for X while another silo has one → `📭 X has no plan` chip (visible to both).

## UI (index.html overlay, extends v1.504)

- Row gains **"Plans" column**: one chip per silo entry (owner initials, bucket, dates); click → drill-down drawer with every silo's entry, the request thread, and the audit log for that RO.
- **Needs coordination** tab (alongside Today / This Week / Later / Hold): rows with open requests or conflicts.
- Bucket select + planned start/end date pickers + note write to `planner_entries` (not the view).
- "📣 Request update from <silo>" and "Reply" inside the drawer.
- Admin: "➕ Add to <manager>'s plan (FYI)".
- Column picker gains KPI columns: Hours worked (time_logs), Est remaining (Σ task est_hours − worked), Techs on RO (distinct clocked-in), Parts detail, Open requests.
- Notification bell count on the Planner button (open requests / conflicts for my silos).

## Session plan

| Session | Deliverable | Gate |
|---|---|---|
| **S188 (Sat 9/5)** | v1.504 draft ✅ committed. **Phase 1 — shared plan model + RO channel:** `planner_entries` + `planner_messages` + `planner_events` (trigger-written audit) migration; buckets/dates/notes write to entries; Plans column + drill-down drawer (all silos' entries, RO channel thread with request/reply/resolve, audit log); admin FYI add; Needs-coordination tab (open requests + overlap + promise-squeeze computed client-side); bell badge on the Planner button. Ship to main so managers have it Monday. | Roland runs 2 migrations; Case B promote; field test Mon. |
| **S189 (Sun 9/6 or Mon)** | **Phase 2 — SMS + KPIs:** direct staff SMS for requests/conflicts/FYIs via the Messages-board path (Task Manager notify pattern), KPI columns (hours worked / remaining / techs / parts detail), per-manager column picker persisted in `board_prefs`-style row, bell badge. | Migration run; promote. |
| **S190+** | **Phase 3 — master morning email:** new `send-planner-digest` edge fn (per manager: today + week + coordination items + reminders + messages), then retire overlapping reports per Roland. | Roland picks which existing emails die. |

## Decisions (Roland, S188)

1. Planned dates: **start + end** per entry, both optional.
2. Notifications: **NOT email.** (a) Slack-style **RO channel tiles** in the Planner (planner_messages) capture every
   request/reply/conflict/adjustment; (b) important requests/reminders ALSO go as **direct SMS to the manager's phone**
   via the Messages board. Roland: email is "the worst way" — huge buckets, things get buried.
3. Sr Managers / Admins pick the silo explicitly; silo Managers default to their own silo.
4. Existing Manager Work List side panel stays for now; Planner can push into it.
