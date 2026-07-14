# PB Inbox + Conversation Assignment Spec (GH#39)

**Status:** LOCKED pending Roland review — Session 137, 2026-07-14
**Branch plan:** build on `feature/pb-inbox` off `pre-prod` (high-risk: new page + migration + edge-fn changes)
**Supersedes nothing.** Additive layer on top of the S131/S132 messaging stack
(`messages` table, `projectblue-send`, `projectblue-webhook`, `projectblue-reconcile`, `js/messaging.js`).

---

## 1. Why

Project Blue has **no native conversation assignment** (confirmed by PB account manager
Jordan Langston, email 2026-07-10): *"Our API is really meant to be the message sending
layer, not the contact management layer... that behavior is typically handled on the CRM side."*
Kenect had per-conversation assignment (owner + team) and PRVS staff rely on it.
We are the CRM side — so the assignment/inbox layer lives in the RO DB.

## 2. Locked decisions (Roland, 2026-07-14)

| Decision | Choice |
|---|---|
| Inbox GUI | **Standalone page** `messages.html`, login-gated (pattern: closed-ros.html) |
| Assignment granularity | **Per conversation** (one owner per customer phone thread — matches locked spec §3 customer-inbox threading) |
| Assignee notification | **PB SMS + dashboard notification** (scheduled_notifications) |
| Approach | **Spec first** (this doc), build next session on `feature/pb-inbox` |
| Assign rights | Managers / Sr Managers / Admins only |
| Assignees | Any active staff (techs, managers, etc.) |

## 3. Data model (additive migration `pb_inbox_conversations.sql`)

### 3a. NEW table `conversations`
One row per customer phone thread. `phone_key` = digits-only E.164 without leading `+1`
(same normalization as `phoneKey()` in projectblue-webhook — reuse, do not fork).

```sql
create table conversations (
  id               uuid primary key default gen_random_uuid(),
  phone_key        text not null unique,      -- normalized; join key to messages
  display_phone    text,                      -- last seen E.164 form for display
  customer_name    text,                      -- best-known; refreshed on RO routing
  assigned_to      text,                      -- staff.email of owner; NULL = unassigned
  assigned_by      text,                      -- staff.email who assigned
  assigned_at      timestamptz,
  status           text not null default 'open' check (status in ('open','closed')),
  last_message_at  timestamptz,               -- maintained by webhook/send/reconcile
  last_direction   text,                      -- 'inbound' | 'outbound' (drives Unresponded filter)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```
- Add `trg_set_updated_at` (S115 shared `set_updated_at()` fn — table must be added to it).
- **Backfill:** one-time insert from distinct inbound/outbound phones in `messages`
  (`phone_from`/`phone_to` excluding the PB line +1 940 407-4145), with
  `last_message_at`/`last_direction` from the newest message per phone.

### 3b. NEW table `conversation_events` (assignment audit)
`audit_log` is RO-scoped; conversations may have no RO. Small dedicated history table:

```sql
create table conversation_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  event           text not null check (event in ('assigned','unassigned','closed','reopened')),
  actor_email     text not null,
  old_value       text,
  new_value       text,
  created_at      timestamptz not null default now()
);
```

### 3c. `staff.mobile_phone` (NEW column) — required for SMS notify
`staff` currently has NO phone column anywhere in the codebase. Additive:
```sql
alter table staff add column mobile_phone text;  -- E.164; NULL = no SMS notify
```
Roland action at build time: populate for staff who should get SMS notifies.
SMS notify silently skips staff with NULL `mobile_phone` (dashboard notify still fires).

### 3d. `scheduled_notifications.source` CHECK
Per S127 gotcha, the CHECK must be extended (migration) to allow two new values:
`conversation_assigned`, `assigned_inbound_notify`.

### 3e. RLS
Post-S134 lockdown posture: **authenticated-only** on both new tables (no anon).
- SELECT: all authenticated staff.
- INSERT/UPDATE on `conversations.assigned_*`/`status`: enforce Manager/Sr Manager/Admin
  via the same role-check pattern used elsewhere; webhook/send edge fns use service role (bypass).
- `conversation_events`: INSERT authenticated (role-checked in UI), no UPDATE/DELETE.

## 4. Edge-fn changes

### 4a. `projectblue-webhook` (inbound)
After the existing `messages` insert:
1. **Upsert `conversations`** on `phone_key` — update `last_message_at`, `last_direction='inbound'`,
   `display_phone`, `customer_name` (from routed RO if present). Non-fatal on error (same
   philosophy as RO routing — never 500 to PB).
2. **Notify routing fork:**
   - Conversation **assigned** → notify the OWNER instead of the silo-manager blast:
     (a) `scheduled_notifications` row, `source='assigned_inbound_notify'`, recipient = owner email,
     same 60-min-per-RO/conversation dedupe window as today;
     (b) PB SMS to owner's `staff.mobile_phone` via `projectblue-send` internal call
     (secret-authed), body: `💬 <customer> replied: "<preview>" — open Messages to respond.`
     Same 60-min dedupe as (a). Skip if `mobile_phone` NULL.
   - Conversation **unassigned** → EXISTING silo-manager/admin blast unchanged (fallback).

### 4b. `projectblue-send` (outbound)
After successful send: upsert `conversations` (`last_message_at`, `last_direction='outbound'`).
No other changes. (STOP/HELP suppression gate remains its own GH#39 TODO — checked here when built.)

### 4c. Assignment notify (on assign action, not message)
UI writes the assignment, inserts `conversation_events` row, inserts
`scheduled_notifications` (`source='conversation_assigned'`, recipient = new owner), and
fires one PB SMS to the new owner: `📥 <assigner> assigned you the conversation with <customer>.`
Implemented client-side + a small secret-authed send call — no new edge fn needed.

## 5. Inbox GUI — `messages.html` v1.0 (standalone)

Auth: Google id-token sign-in mirroring closed-ros.html; `storageKey: 'prvs_messages_auth'`;
hard login gate (no anon rendering — S134 posture, unlike solar.html).

Layout (Kenect-style three-pane, responsive to two-pane on mobile):
1. **Left — conversation list.** Sorted `last_message_at` desc. Filters:
   **All / Unresponded** (`last_direction='inbound'`) **/ Unassigned / Mine**. Search by
   name/phone. Row: avatar initials, name (or phone), snippet, time, owner chip, unread dot.
2. **Center — thread.** Reuse `js/messaging.js` bubble renderer + send path (module import;
   the window-bridge surface already exists). RO-code chips on routed messages link back to
   the dashboard card. Composer = existing send flow (PB line +1 940 407-4145).
3. **Right — details.** Customer name/phone (edit name), linked ROs for that phone
   (same `phoneKey` match as webhook routing), **Assignment control**
   (searchable staff dropdown; visible to all, enabled for Manager/Sr Manager/Admin),
   assignment history (from `conversation_events`), Close/Reopen conversation.

Role visibility v1: **all authenticated staff see all conversations** (matches Kenect);
techs simply can't assign. (Tightening to techs-see-only-Mine is a v2 flag if abuse shows.)

Refresh: poll every 60s + on window focus (no realtime dependency — GH#36 still open).

## 6. Explicitly OUT of scope (v1)

- STOP/HELP hard gate (own GH#39 TODO — build order note: land it before or with this, both touch send path)
- MMS/media in the inbox composer (spec P3-P6 deferral stands)
- Office-number port (940-488-5047) — separate Roland action with PB
- Multi-owner / "Team +" assignment (Kenect had it; v1 is single owner — revisit if asked)
- index.html header badge/button for the inbox ("Both" option declined 2026-07-14; standalone only)

## 7. Build phases (next session, `feature/pb-inbox`)

| Phase | Deliverable | Risk |
|---|---|---|
| P1 | Migration: `conversations` + `conversation_events` + backfill + `staff.mobile_phone` + source CHECK + RLS | Med (additive only) |
| P2 | Webhook/send upserts + assignee-notify fork | Med (touches live inbound path — non-fatal wrapping mandatory) |
| P3 | `messages.html` v1 (list/thread/assign, login gate) | Low (new page, nothing existing touched) |
| P4 | Assignment SMS/dashboard notify wiring + `conversation_events` UI | Low |

Test plan at build time: webhook replay against a test phone, assign/unassign round-trip with
notify verification (cron + SMS), unassigned-fallback regression (silo blast still fires),
RLS matrix (tech vs manager vs admin), backfill row-count vs distinct phones in `messages`.

## 8. Open items for Roland (pre-build)

1. Populate `staff.mobile_phone` list — who gets SMS notifies?
2. Confirm v1 role visibility (all staff see all conversations) is acceptable.
3. Build-order call: STOP/HELP gate before, with, or after this build?
