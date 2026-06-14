# PRVS Messaging Automation Spec (GH#39 Phase 3+)

> **Status:** v0.1 — DRAFT / design locked, not yet built. Authored Session 108 (2026-06-14) from a Roland + Claude design session, on top of the Session 98 outbound POC + Session 108 live validation.
> **Companion docs:** `research/sendblue_test.md` (Phase 1), the `sendblue-send` edge fn + `messages` table (Phase 2 POC).
> **Provider:** Sendblue (shared sandbox line for build/test; hosted office number 940-488-5047 for production). Provider is swappable behind the edge-fn layer if needed.

---

## 1. Vision — what the messaging layer is for

A two-way messaging layer wired into the RO dashboard so that:

1. **Staff → customer (manual):** staff text a customer from inside an RO — questions, status, approvals, pickup. *(Outbound half PROVEN in the Session 108 POC.)*
2. **System → customer (automated):** the dashboard texts customers automatically on key RO events — approval requests, ready-for-pickup, parts arrived, work started, and an **end-of-day progress recap** (the day's tech-entered status, photos, documents).
3. **Customer → dashboard (inbound):** customer replies route back into the dashboard against the right RO and notify the right person. *(Deferred — gated on Sendblue webhook answers Q6–Q8.)*
4. **System/manager → tech:** task reminders, clock-in / end-of-day nudges. *(Reuses the existing 5 PM EOD close fn + `time_logs.reminded_at`/`extended_at` scaffolding.)*

**This spec covers item 2 (automated customer texts) as the next build**, with the framework designed so items 3 and 4 slot in without rework.

---

## 2. Current state (done)

- `messages` table live in prod (Session 108): RO-linked, outbound + inbound shaped, RLS authenticated-read / service-role-write, `message_handle` indexed for status correlation.
- `sendblue-send` edge fn deployed: shared-secret gate, dormant-safe (503 without `SENDBLUE_*` secrets), sends `{number, from_number, content}`, logs every attempt (success + failure) to `messages`.
- Validated live: outbound iMessage (verified iPhone), SMS fallback (verified Android), thread persistence (loadMessages reloads from DB), per-RO linkage via `ro_id`/`ro_code`.
- **Known finding:** `is_imessage` is null at send time — Sendblue only reports iMessage-vs-SMS once the message resolves, which arrives via the delivery-status **webhook** (not the send response). The flag stays null until the webhook (item 3) is built.

---

## 3. Architecture — four pillars

1. **Transport** — `sendblue-send` (done) + future `sendblue-webhook` (inbound + status) + the `messages` table.
2. **Threading & identity** — DECISION: **customer-inbox, RO-tagged.** One conversation per customer phone (mirrors what the customer sees — all texts come from one shop number), with each message carrying a re-assignable RO tag. The current schema supports this already (`messages.ro_id` nullable, `ON DELETE SET NULL`); it is purely a UI grouping choice + a phone index, not a migration. Decision does not bite until inbound replies are built.
3. **Automation & templates** — the notification queue + dispatcher + editable templates (this spec, §4–6).
4. **Compliance & delivery** — quiet hours, kill switch, idempotency, and consent/opt-out (consent DEFERRED for testing, HARD GATE before production — §8).

---

## 4. Data model (new)

### 4.1 `notification_queue`
Every automated message intent is enqueued here; the dispatcher consumes it.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ro_id | uuid FK → repair_orders(id) ON DELETE SET NULL | |
| ro_code | text | denormalized |
| customer_phone | text | E.164 |
| customer_name | text | |
| trigger_type | text | `approval_needed` \| `ready_pickup` \| `parts_arrived` \| `work_started` \| `eod_recap` |
| lane | text | `immediate` \| `digest` |
| template_key | text | → `message_templates.key` |
| vars | jsonb | template substitution values |
| dedupe_key | text UNIQUE | idempotency (see §6) |
| status | text | `pending` \| `sent` \| `suppressed` \| `failed` |
| scheduled_for | timestamptz | when the dispatcher may send (immediate = now or next quiet-hours window; digest = the EOD time) |
| message_id | uuid FK → messages(id) | set on send |
| created_at / sent_at | timestamptz | |

### 4.2 `message_templates`
Editable copy so managers tweak wording without a redeploy (same spirit as `app_config`).

| Column | Type | Notes |
|---|---|---|
| key | text PK | e.g. `approval_needed` |
| body | text | with `{customer_name}`, `{ro_code}`, `{rv}`, `{eta}`, `{link}` tokens |
| lane_default | text | default lane for the trigger |
| active | boolean | per-template on/off |

### 4.3 Future (item 3 / item 4)
- Consent / suppression list (`sms_opt_out`, opt-in timestamp on the customer/RO).
- Inbound resolution helpers (phone → customer → RO).

---

## 5. The two-lane dispatcher

One queue, one dispatcher, two cadences — the immediate-vs-batched split is a per-row `lane` flag, **not** two systems.

**Enqueue (DB triggers):**
- `AFTER UPDATE` on `repair_orders` (status transition) → enqueue `approval_needed` / `ready_pickup` / `work_started`.
- `AFTER UPDATE` on `parts` (`parts_status` → `received`) → enqueue `parts_arrived`.
- `AFTER INSERT` on notes / photos / documents → mark the RO as having same-day tech activity (drives `eod_recap`).

**Dispatch:**
- **Immediate lane** — a frequent cron (every ~5 min) or `pg_net` on insert. Sends now if inside quiet hours; otherwise sets `scheduled_for` to the next window.
- **Digest lane** — a daily cron at the configured EOD time gathers all `pending` digest rows + same-day tech activity, composes **one combined message per customer** (all their ROs), sends, marks consumed.

**Lane mapping (LOCKED):**

| Trigger | Lane |
|---|---|
| Approval needed | **Immediate** |
| Ready for pickup | Digest |
| Parts arrived | Digest |
| Work started | Digest |
| EOD tech recap (status + photos + docs) | Digest |

*(Ready-for-pickup is batched per Roland's call; trivially promotable to immediate later.)*

**Guards (all live in the dispatcher, one place):**
- **Quiet hours** — hold sends outside business hours to the next window.
- **Kill switch** — global on/off in `app_config` (e.g. `messaging_automation_enabled`).
- **Idempotency** — `dedupe_key` UNIQUE (see §6).
- **Opt-out** — suppression check (stubbed now, enforced before production — §8).

---

## 6. EOD digest spec (the flagship batched send)

- **When:** a configured time, default ~5:30 PM, editable in Admin (`app_config`).
- **Who:** each active RO with **today's** tech activity — a status change, new note, new photo, or new document recorded today.
- **Grouping:** DECISION — **one combined text per customer** covering all their active ROs ("Updates on your 2 units...").
- **Photos/docs:** DECISION — **a link to a viewer page** (cleaner, no MMS cost/size limits). *Requires building a customer-viewable, tokenized read-only viewer page for that RO/day's media — new work item.*
- **Empty-day rule:** an RO (or customer) with no activity today gets **no** message — never send empty digests.
- **Idempotency:** the digest runs once per customer per day; re-running the cron the same day must not re-send (dedupe_key = `customer_phone:eod:<date>`).

---

## 7. Number strategy

- **Build/test:** shared Sendblue sandbox line (+1 646 620 8124, free tier, verified contacts only — Roland / Lynn / Rusty). Fine for outbound automation testing.
- **Production:** hosted office number **940-488-5047** (verbally confirmed hostable; written confirmation + Q6–Q8 still pending). Required for real inbound-from-anyone and to text customers who haven't pre-registered. Override `SENDBLUE_FROM_NUMBER` secret when it goes live.

---

## 8. Compliance gate (DO NOT SKIP before production)

Automated/recurring texts to customers are TCPA-sensitive. Deferred for **testing on verified, consented contacts only**. Before automation points at real customers, the following are a **hard gate**:
- Opt-in capture (natural home: the customer check-in page).
- Automatic STOP / HELP / START keyword handling (built with the inbound webhook).
- A suppression list checked in the dispatcher send path.
- `staff.sms_opt_in_at` + the preserved `docs/sms` consent material are reusable scaffolding.

---

## 9. Phased build plan

- **P1 — Queue + templates + dispatcher skeleton.** `notification_queue` + `message_templates` migrations; dispatcher edge fn (kill switch + quiet hours + dedupe + opt-out stub); manual enqueue for testing.
- **P2 — Immediate lane: Approval needed.** DB trigger on status → `awaiting approval`; immediate dispatch; template; test the full path on a verified contact.
- **P3 — Digest lane: ready-pickup / parts-arrived / work-started.** Triggers + daily cron + per-customer combined compose.
- **P4 — EOD tech recap + media viewer page.** Same-day activity detection; tokenized read-only viewer; link in the digest.
- **P5 — Inbound webhook (item 3).** `sendblue-webhook`: inbound routing (phone→customer→RO), delivery/read status (`is_imessage` resolution), STOP/HELP. Gated on Sendblue Q6–Q8.
- **P6 — Consent + production cutover.** Opt-in/opt-out enforced; hosted office number; rebase onto current pre-prod + version bump; kill switch on.

---

## 10. Testing matrix (factor in NOW)

**Outbound / send (POC — DONE):** iMessage to iPhone ✅ · SMS fallback to Android ✅ · thread persistence ✅ · RO linkage ✅ · failure row logged ✅ · from_number ✅.

**Automation — to test as built:**
- A status transition fires **exactly one** text; re-saving the RO does **not** re-send (dedupe).
- Non-customer-facing statuses stay **silent**.
- Correct template + variable substitution (`{customer_name}`, `{ro_code}`, `{rv}`, `{eta}`, `{link}`).
- Immediate event inside quiet hours → sends now; outside quiet hours → **holds** to next window.
- EOD digest bundles a day's **multiple** inputs into one message; RO/customer with **no** activity → **nothing** sent.
- Multi-RO customer → **one combined** digest text (grouping rule).
- Re-running the digest cron same day → **no** double-send.
- Media link in the digest opens the correct read-only RO/day viewer.
- Kill switch halts **both** lanes.
- Bad/invalid number → `failed` row, dispatcher does not crash, batch continues.
- Opt-out (once built) **suppresses** an automated send.

**Inbound — to test when item 3 is built:**
- Multi-RO customer reply (routing ambiguity → tag to active RO).
- Unknown inbound number (no customer match → unassigned inbox).
- STOP / HELP / START keyword handling.
- Async delivered/read receipt updates the row + resolves `is_imessage`.
- Two staff replying to one thread (ownership/unread).
- MMS inbound (customer sends a damage photo).

---

## 11. Open questions / future
- Sendblue Q6 (webhook auth/signature), Q7 (delivery+read status mechanism), Q8 (MMS/media) — gate the inbound half.
- Quiet-hours window values + per-trigger overrides.
- Additional use cases raised but not scoped: payment/deposit links, post-pickup review requests, lead follow-up.
- Provider portability — keep all vendor specifics inside the edge-fn layer so a future provider swap (or hybrid iMessage+SMS) doesn't touch the queue/dispatcher.
