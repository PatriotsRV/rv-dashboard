# PRVS Task Manager — Design Spec (v1 draft, Session 186, 2026-08-27)

> Roland directive S186: a Todoist-style task manager Lynn can use to assign, track, and
> validate TODO items — integrated with RO scheduled events and the Messages board.
> Decisions locked S186: **standalone `tasks.html`** · **managers + admins assign** ·
> **SMS + email reminders** · **per-task validation toggle**.

---

## 1. Problem & Goals

Many shop obligations are dynamic and fleeting — get a check in the mail, order/pick up a
customer part, schedule a drop-off, return a sales call. They are easy to forget, must be
timed, and must be *followed up until actually done*. Lynn needs one board that answers
two questions at a glance: **what has not been done** (rattle the cage) and **what claims
to be done but I haven't verified** (validate).

Goals, in order:

1. Manual task create/assign with due dates and a nag loop that does not stop until done.
2. Lynn's board (all tasks) + a My Tasks view per staff member. Mobile-first — techs are on phones.
3. Two-stage completion: assignee marks done → assigner validates (when the task requires it).
4. **RO Activity feed (added S186, Lynn):** surface all RO-embedded updates/reminders —
   parts requests, pickup/drop-off dates, callbacks, receivables, status changes — for all
   active/on-lot ROs on this same board, WITHOUT re-entry, with a per-user selector for
   which RO functions show. Solves "the update gets buried inside the RO." See §6a.
5. Auto-generated tasks from RO lifecycle events (drop-off, pickup, close-out, sales-call follow-up).
6. Tie-ins to the Messages board (a task can point at a conversation, and vice versa).

Non-goal for v1: recurrence, projects/labels hierarchy, comments threads. Todoist is the
UX model, not the feature checklist.

## 2. What we reuse (build nothing twice)

| Need | Existing rail |
|---|---|
| Timed nag until resolved | S185 `enqueue-receivable-reminders` cron pattern + reminder counter |
| Delivery | `scheduled_notifications` → Textly SMS + email edge functions |
| Complete-from-phone | `v.html?c=` short-link machinery (messages v1.22) |
| Event → template spawning | WO task templates pattern (S30) |
| Change history | `audit_log` via `writeAuditLog()` |
| Role gating | `user_roles` + `is_sr_manager_or_admin()` pattern (S59) |

⚠️ **`scheduled_notifications.source` CHECK constraint**: widened by seven migrations; no
file is trustworthy. Read the live definition from `pg_constraint` (S185 lesson) before
adding a `'task_reminder'` source value, and re-list the FULL array in the new migration.

## 3. Data model

### 3.1 `tasks`

```sql
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  notes           text,
  ro_id           uuid references repair_orders(id),      -- nullable: many tasks are RO-tied, some aren't
  conversation_id uuid references conversations(id),      -- nullable: Messages board tie-in
  assigned_to     uuid not null references staff(id),
  assigned_by     uuid not null references staff(id),
  due_at          timestamptz not null,
  remind_lead     interval not null default '0 minutes',  -- how far BEFORE due the nagging starts
  remind_every    interval not null default '4 hours',    -- nag cadence once nagging is active
  requires_validation boolean not null default true,      -- per-task toggle (assigner sets at creation)
  priority        text not null default 'normal'
                  check (priority in ('low','normal','high','urgent')),
  status          text not null default 'open'
                  check (status in ('open','done','validated','cancelled')),
  source          text not null default 'manual'
                  check (source in ('manual','ro_event','sales')),
  source_event    text,                                   -- e.g. status value that spawned it
  reminder_count  int not null default 0,
  last_reminded_at timestamptz,
  completed_at    timestamptz,
  completed_by    uuid references staff(id),
  validated_at    timestamptz,
  validated_by    uuid references staff(id),
  complete_token  text unique,                            -- for the SMS tap-to-complete link
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

### 3.2 `task_rules` (Phase 2 — RO event auto-spawn)

```sql
create table task_rules (
  id             uuid primary key default gen_random_uuid(),
  trigger_status text not null,        -- repair_orders.status value that fires the rule
  title_template text not null,        -- e.g. 'Call {customer} — RV ready for pickup'
  default_assignee_role text,          -- or explicit staff id
  default_assignee uuid references staff(id),
  due_offset     interval not null default '1 day',
  remind_lead    interval not null default '2 hours',
  requires_validation boolean not null default true,
  active         boolean not null default true
);
```

One rule per (status → task) mapping; the RO status-change path (already a single code
path with audit logging) checks `task_rules` and inserts a task with `source='ro_event'`.
Dedup guard: don't spawn if an open task with same `ro_id` + `source_event` exists.

## 4. Lifecycle (the part Todoist doesn't have)

```
open ──(assignee marks done)──► done ──(assigner validates)──► validated   [terminal]
  │                               │
  │                               └─(assigner rejects → back to open, reminder_count reset)
  └─(assigner cancels)──► cancelled  [terminal]
```

- If `requires_validation = false`, marking done goes straight to `validated` (auto-close).
- Only `assigned_to` (or an admin) can mark done. Only `assigned_by` (or an admin) can
  validate, reject, or cancel.
- Every transition: destructure `{ error }`, throw/alert on error, and write
  `writeAuditLog`-style entries to `audit_log` (capture oldValue before mutating).

## 5. Reminder engine

New cron edge function `enqueue-task-reminders` (clone of the receivables enqueuer):

1. Select tasks where `status = 'open'` and `now() >= due_at - remind_lead` and
   (`last_reminded_at is null` or `now() >= last_reminded_at + remind_every`).
2. Enqueue `scheduled_notifications` rows (`source = 'task_reminder'`) → existing SMS +
   email delivery. Bump `reminder_count`, `last_reminded_at`.
3. **Escalation:** when `reminder_count >= 3` past due, CC `assigned_by` on each
   subsequent reminder ("3rd reminder, still open").
4. Tasks in `done` awaiting validation: one daily digest line to the assigner, not a nag
   loop — validation lag is Lynn's board's job, not SMS spam.

SMS body carries a tap-to-complete link: `t.html?k=<complete_token>` — one tap marks done
(and shows "sent for validation" or "closed" per the toggle). Same class as `v.html?c=`.
Token is single-purpose, revoked on completion.

If the enqueuer deploys with `--no-verify-jwt`, remember the S183 lesson: every redeploy
must repeat the flag or inbound dies silently.

## 6. `tasks.html` UI

Standalone page, same shell/auth pattern as `messages.html` (`!getSB() || !supabaseSession`
guard — never `accessToken` alone). Header link from the dashboard.

**Lynn / manager board** (managers + admins): columns or filter tabs —
`Overdue` · `Due today` · `Upcoming` · `Needs validation` · `Done (validated, last 7 days)`.
Sort by due; badges for priority, reminder_count ("nagged ×4" is information), RO link,
conversation link. One-tap validate / reject / cancel. Quick-add row (Todoist's best
feature): title + assignee + due, everything else defaulted.

**My Tasks** (all staff incl. techs): only their open/done tasks, big touch targets,
mark-done button. Techs get no assign UI.

**RO detail modal tie-in (index.html, small)**: a "Tasks" line on the RO showing open task
count, linking to tasks.html filtered by `ro_id`. Keep index.html's footprint minimal —
the page is large; the manager already gets cache-busting risk per the S182 open TODO.

## 6a. RO Activity feed (added S186)

**Design rule: read-through, never copy.** The feed is a queryable view over data the RO
workflows already write. Copying items into `tasks` would create a second copy of every
fact, and two copies drift with nothing checking (S183: status vs. physical location).
The board reads the same rows the RO wrote, so it is correct by construction.

### Two lanes on tasks.html

- **Lane 1 — Tasks**: obligations with assignee + lifecycle (§3–§4).
- **Lane 2 — RO Activity**: everything happening across active ROs, filterable by kind.

### `ro_activity_feed` view

One SQL view UNIONing per-kind subqueries into a common shape:
`(kind, ro_id, ro_number, customer, title, event_at, due_at, actor, ref_table, ref_id)`.

| Kind | Source |
|---|---|
| `parts` | `notes` where `type='ro_status'` and body prefix `🔩 PARTS REQUESTED:` (NEVER `type:'parts_request'`); received-state per send-parts-report logic |
| `pickup` / `dropoff` | scheduled date fields on `repair_orders` (verify live column names against schema first — audit_codebase's snapshot is stale on these, S171) |
| `callback` | notes / `conversations` flagged needs-reply where a customer asked for contact |
| `receivable` | `ro_receivables` where status open (S185) |
| `status_change` | `audit_log` field changes on `repair_orders.status`, last N days |
| `appointment` | calendar-synced schedule items (`sync-ro-calendar` source rows) |
| `quiet_ro` | ⚠️ the S183 unwatched lesson: an event feed cannot show an RO where NOTHING is happening. Active/on-lot ROs with no notes/audit activity in N days (default 7) — arguably the most rattle-the-cage list of all; query pattern proven by send-manager-report v2.5's 🚨 Unwatched section |

Scope: "active/on-lot" = the status set used by the manager report's lot-wide sweep — do
NOT invent a new definition; reuse that predicate so the two tools can never disagree.

### `board_prefs` (the selector Roland asked for)

```sql
create table board_prefs (
  staff_id  uuid primary key references staff(id),
  feed_kinds jsonb not null default '["parts","pickup","dropoff","callback","receivable","quiet_ro"]',
  quiet_days int not null default 7,
  updated_at timestamptz not null default now()
);
```

Stored in DB (not localStorage) so Lynn's selection follows her across devices. UI: one
chip per kind, tap to toggle. Ship the default set above; she tunes it.

### Promote-to-task (the bridge between lanes)

Every feed item gets a one-tap **"Make task"**: pre-fills title/RO, Lynn picks assignee +
due, and it becomes a real §3 task with the nag loop (`source='promoted'`,
`source_event = ref_table || ':' || ref_id`). Dedup guard: block if an open task already
references the same `ref_table`/`ref_id`. Feed = awareness; promotion = commitment.

### Phasing impact

Feed view + chips + promote are read-only plus one INSERT — cheap. Pulled INTO Phase 1
(see §8). The `quiet_ro` kind ships in Phase 1 too; its query already exists in the
manager report.

## 7. Permissions / RLS

- Insert/assign: managers + admins (`is_sr_manager_or_admin()` class of policy — service
  managers included per Roland S186).
- Read: staff see tasks where they are assignee or assigner; managers/admins see all.
- Update: transition rules from §4 enforced in RLS, not just UI.
- Lynn is admin-only in `staff` (S59) — full board access falls out of the role, no
  special-casing.

## 8. Phasing

| Phase | Scope | Ships |
|---|---|---|
| **1** | `tasks` table + RLS, tasks.html (board + My Tasks), manual create/assign, nag cron + SMS/email, escalation, audit, **RO Activity feed (§6a): `ro_activity_feed` view + `board_prefs` chips + promote-to-task + `quiet_ro`** | migration + tasks.html + `enqueue-task-reminders` |
| **2** | `task_rules` + RO status-change auto-spawn, `t.html` tap-to-complete, RO modal task count | migration + index.html minor + t.html |
| **3** | Sales-call reminders off leads/conversations, recurrence, digest tuning, Messages board deep-link both directions | TBD after field use |

Phase 1 is useful on day one with zero RO coupling — Lynn can pin "make sure the check
arrives" manually while Phase 2 grows the automation.

## 9. Open questions (for Roland/Lynn before Phase 1 build)

1. Nag cadence defaults: is 4h/x3-then-escalate right, or does Lynn want per-task control
   exposed in the quick-add (I'd hide it behind "advanced")?
2. Quiet hours for task SMS (parts report fires 8 AM; do task nags respect e.g. 7 AM–6 PM)?
3. Does "assigned to any of the people that work here" include techs with no
   `public.users` row (S164: seven techs)? SMS works via `staff.phone`; dashboard My Tasks
   needs a login. Phone-only staff could live on SMS + tap-link alone.
4. Should validation rejects notify the assignee immediately (SMS) or just reopen the nag loop?
5. **Feed (§6a):** confirm the callback source — is "customer wants a call back" reliably
   captured today (notes? conversations needs-reply?), or does it need a small capture
   affordance in the RO first? The feed can only surface what gets written somewhere.
6. **Feed:** default `quiet_days` = 7 — right threshold for "nothing is happening on this RO"?
