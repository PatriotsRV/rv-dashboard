# PRVS Key Dates — Unified Date Model

> **Goal:** every RO has up to three "key dates," and each flows to **all three channels** — the RO Dashboard, the relevant per-service Google Calendar, and email reminders. Cover all bases for important date-related reminders.
>
> Session 117 (2026-06-18). Status: **design locked, phased build.** Folds in ERs `468aa376`, `b2aa4bea`, `d2561e11`, `1aeb3f58`, `2b814250`.

## The three key dates

| # | Key date | Column | Meaning |
|---|---|---|---|
| 1 | **Scheduled Drop-off** | `repair_orders.planned_dropoff_date` (EXISTS) | When the customer is scheduled to bring the unit in. |
| 2 | **Promised / Completion** | `repair_orders.promised_date` (EXISTS) | When we have promised the work done. |
| 3 | **Pickup / Completed** | `repair_orders.pickup_date` (**NEW**, additive nullable date) | When the unit is ready / actually picked up — records when it left the lot (ER d2561e11). |

## Already built (v1.411 + scheduling.js) — do NOT duplicate

- `planned_dropoff_date` is set in the New RO form, the Edit RO modal, and customer-checkin.
- A morning-before **auto email reminder** for the drop-off via `scheduled_notifications` + the `process-scheduled-notifications` cron (every 15 min, Gmail SMTP). `source='auto_dropoff_reminder'`; Edit RO cascades cancel+recreate on date change.
- 🔔 **Schedule Notification** manual reminder UI on every card (date+time, subject, body, multi-recipient, silo managers pre-checked).
- 📅 **Schedule** modal (`scheduling.js`) creates real Google Calendar events on the **per-service silo calendars** (`CALENDAR_IDS`) — drop-off only today.
- `promised_date` is in the forms and feeds urgency scoring.

## Decisions (locked S117)

- **Calendar target:** reuse the existing per-service silo calendars (`CALENDAR_IDS`) — not a separate calendar.
- Cover **all three** dates across **all three** channels.
- **Phased** build; ship each phase.

## Channel matrix (target state)

| Date | Dashboard | Silo calendar | Email reminder |
|---|---|---|---|
| Drop-off | form ✓ + card chip (P1) | event (P2; manual today) | morning-before ✓ |
| Promised | form ✓ + prominent tile + sort (P1) | event (P2) | day-before + morning-of (P3) |
| Pickup | new field + form + card chip (P1) | event (P2) | day-before + morning-of (P3) |

## Phases

### Phase 1 — Dashboard (no external deps)
- **Migration:** `add column pickup_date date` (additive nullable). [Roland runs SQL]
- New RO + Edit RO forms: add **Pickup Date** input; confirm Planned Drop Off present in both.
- `normalizeRO` mapping: `pickupDate <- pickup_date` (js/utils.js + the index.html inline copy).
- ro-crud create/update: persist `pickup_date`.
- Card render: a **Key Dates colored chip row** — Drop-off (blue), Promised (amber, prominent; red if overdue), Pickup (green). Show only set dates.
- Sort: add a **"Promised date"** sort option (promised asc, then days-on-lot) — ER 1aeb3f58.

### Phase 2 — Silo calendar events
- On setting/changing any key date, create/update a Google Calendar event on the RO's silo calendar(s) (reuse `scheduling.js` `getCalendarId` logic). Title: `[Type] Customer — RV`.
- Idempotency: store event IDs per date type (new `cal_event_ids` jsonb column or side table); update on change, delete on clear.
- **OPEN:** calendar writes need a Google access token (manager auth), same constraint as the Schedule modal. Decide auto-on-save vs queued vs service-account.

### Phase 3 — Email reminders
- For **promised** + **pickup**, enqueue `scheduled_notifications` (proposed: day-before + morning-of) to the silo manager(s) + admins — mirror the drop-off auto-reminder pattern.
- Supersede pending rows on date change/clear (mirror the Edit RO cascade).
- Reuse the `process-scheduled-notifications` cron.
- **OPEN:** confirm exact timing + recipients before building.

## Open decisions
- P2: how to write calendar events without an interactive Google token (manager-token-only vs server-side service account).
- P3: reminder timing (day-before + morning-of?) + recipients (silo manager + admins?).
- Pickup semantics: "ready for pickup" vs "actually left" — d2561e11 = actual departure; may tie to status `Delivered/Cashed Out`.
