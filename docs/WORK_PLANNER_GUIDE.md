# 🗓 Work Planner — Setup & Usage Guide (v1.505)

*Written S188, 2026-09-05. For managers, Sr Managers and Admins. Ten minutes, start to finish.*

The Work Planner is one screen where you decide **what your service works on today and this week**, and where you can **see what every other service is planning for the same RV** — so Solar never shows up to install panels on the day Roof is spraying.

---

## Before you start

- You must be signed in to the dashboard as a **Manager, Sr Manager or Admin** (the button hides otherwise).
- Nothing you do here changes the RO itself — no statuses, no dates on the customer's RO. The Planner is a layer *on top of* the board.
- Everything you type in the Planner is saved instantly and **every change is logged** (who, what, when). There is no Undo, but there is nothing you can break.

---

## Step 1 — Open it

Left sidebar → **Quick Links → 🗓 Work Planner**. (Classic view: the same button sits in the header row of buttons.)

A full-screen table opens over the board. Press **Esc** or the **×** top-right to close it any time — your work is already saved.

> If you are a **silo manager**, the table opens already filtered to **your service**. If you are a **Sr Manager / Admin**, it opens showing everything.

---

## Step 2 — Narrow it down to what matters

The strip under the title is your filter bar. Click a chip to turn it on; click again to turn it off. Chips glow when on.

| Row | What it does | Example |
|---|---|---|
| **Services** | Which service(s) an RO must have. | Click **☀️ Solar** → only ROs that have Solar work. |
| *has ANY / ALL / ONLY* | How the service chips match. | *ONLY selected* = ROs that are Solar and **nothing else**. |
| **🔀 Spans 2+ services** | Just the multi-service RVs — the ones that need coordination. | |
| **Status** | Preset list: *Active* (default), *Workable*, *Waiting on someone*, *On lot*, *Finishing*, *All*. Or *pick statuses* to hand-pick. | *Workable* = Ready to Work / In progress / Approved. |
| **Promised** | Promised-date window. | *Overdue*, *Due within 7 days*, *No promised date*… |
| **Urgency / Type / Flags** | Critical…Low; standard / insurance / warranty; and quick flags like **🔩 Parts pending**, **🚨 Urgent update**, **📭 No WO**, **👀 Planned by another silo**. | |
| **Days on lot ≥ / $ ≥ / Search** | Numbers and free text (RO, customer, RV, VIN, tech, plan note). | Days ≥ 30 = the long-timers. |

**Reset filters** puts everything back. **Sr Managers/Admins:** to edit rows inline, pick **exactly one** service chip — that is the service you are "planning as". (You can always plan any service from the drawer in Step 5.)

---

## Step 3 — Sort, or drag

Click any column header to sort by it (click again to flip). The default sort is **Coordination** — RVs that need attention float to the top.

Want your own order? Click the **#** header, then **drag rows by the ⋮⋮ grip** (works with a finger on a phone or iPad too). That order is yours alone and saves with your view (Step 7).

---

## Step 4 — Build your plan: bucket, dates, note

Three columns on the right are **yours** — they write your service's plan for that RV:

1. **My bucket** — pick **🔥 Today**, **📅 This Week**, **⏳ Later** or **⏸ Hold**. The row's left edge colors to match.
2. **My start → end** — the days you expect to be on the unit. Both optional. *(This is what the coordination checks use, so fill it in when you know it.)*
3. **My plan note** — one line for your crew: "need lift bay 2", "waiting on inverter", "Bobby + Luis".

The tabs above the table (**All / Today / This Week / Later / Hold / Unplanned**) show counts and filter to one bucket. Need to bucket a lot at once? Filter first, then use **Set all shown → 🔥 Today** on the tab strip.

> On a multi-service RV the bucket cell may say **pick service…** for Sr Managers/Admins — that means "tell me which service you are planning". Click it; it opens the drawer (Step 5).

---

## Step 5 — See what the *other* services are doing (the important part)

Click **🔎 Plan** on any row. A drawer slides in from the right with:

- **🤝 Needs coordination** — anything the system spotted on this RV:
  - ⚠️ **overlap** — two services planned the same days
  - 🔴 **promise** — a plan runs past the promised/pickup date
  - 📭 **unplanned** — a service has work on the unit but no plan yet
  - 📣 **request** — someone asked a service a question that isn't resolved
- **🗓 Plans by service** — one card per service that has planned this RV: their bucket, dates, note, owner. You can read all of them; you can edit only your own service's card (Sr Managers/Admins can edit any). **Add plan for:** buttons create a card for a service that has none.
- **💬 RO channel** — a message thread just for this RV (see Step 6).
- **📜 Audit trail** — every change anyone made here, oldest at the bottom.

Same info, on the main table: the **Plans (all silos)** column shows one small chip per service plan (emoji = service, second emoji = bucket, dates, initials of the owner). Hover a chip for the full note. The **Coordination** column shows the same ⚠️ 🔴 📭 📣 tags.

**Example.** Solar filters to Solar, buckets *Roland Shepard Jr — 2017 Thor Aria* into This Week with Wed→Wed. The row immediately shows **⚠️ overlap** because Roof already planned Tue→Thu on the same unit. Solar clicks 🔎 Plan and sees Roof's card: "spray + cure, do not touch roof until Fri". Now Solar knows before Wednesday, not on Wednesday.

---

## Step 6 — Talk to the other service *inside* the RV's channel

In the drawer's **💬 RO channel**:

1. Choose **💬 Message** (a note everyone on the RV sees) or **📣 Request update from…** and pick the service you're asking.
2. Optionally set a **date** ("can we have it Fri?").
3. Type and press **Enter** (or **Send**).

A request shows up in that service's **🤝 Needs coordination** tab and adds to the red number on their **🗓 Work Planner** button until they hit **✓ Resolve**. Use **↩ Reply** under any message to answer it in place.

Keep it here, not in email or texts — this thread *is* the record, and the audit trail keeps it forever.

> Phase 2 (next session): important requests also go as a **direct text to the manager's phone** through the Messages board.

---

## Step 7 — Save your view so it's one click tomorrow

Your **plans** (buckets, dates, notes, messages) are already saved — always. What you can *also* save is the **view**: your filters, columns, sort and manual order.

- **💾 Save view** → give it a name ("Solar — this week"). It appears in **Open saved view…** next time.
- **🔒 Share** → other managers can open it from *Shared by others* in that same dropdown. **🔗 Link** copies a URL that opens straight into it.
- **Save As** makes a copy (handy for tweaking someone else's shared view). **✨ New** starts clean.

---

## Step 8 — Push today's list, print it, or export it

- **➕ Today → Work List** adds every RV in **your 🔥 Today bucket** to your existing **📋 My Work List** side panel (skips ones already there).
- **🖨 Print** opens a clean printable sheet of exactly what's on screen. **⬇ CSV** downloads it.
- **→ card** (on any row or in the drawer) closes the Planner and scrolls the board to that RV, highlighted.

---

## Step 9 — Admins: put an RV on someone's radar

In the drawer, Admins see **📌 Admin FYI to:** with a button per service. Click one, type why ("insurance approved yesterday, this needs to move"), and it creates an FYI plan card for that service *and* posts the note in the RV's channel. The service manager sees it in their table, their drawer, and their badge count.

---

## Column picker — "what else do you need to see?"

On the filter bar, open **columns — what else do you need to see?** and toggle any of: RO, Customer, RV, Services, Plans, Coordination, Status, Urgency, Promised, Drop-off, Pickup, Days, $ Value, WO %, Parts, Tech, Type, Spot, Score, My bucket, My start → end, My plan note. Your choice saves with your view. *(Next session adds: hours worked, hours remaining, techs on the RV, parts detail.)*

---

## Quick reference

| I want to… | Do this |
|---|---|
| See only my service's RVs | Click my service chip (silo managers: already done) |
| Put an RV on today's list | **My bucket → 🔥 Today** |
| See what Roof is doing with my Solar RV | **🔎 Plan** on the row → *Plans by service* |
| Ask Roof what day I can have it | Drawer → **📣 Request update from… → Roof** → Enter |
| Know when someone asks *me* | Red number on the **🗓 Work Planner** button; **🤝 Needs coordination** tab |
| Close a request | **✓ Resolve** under the message |
| Get my Monday view back | **Open saved view…** |
| Hand my list to the crew | **🖨 Print**, or **➕ Today → Work List** |

## Things to know

- Plans do **not** change RO status, promised dates, or work orders. They are intent + coordination.
- Everyone at manager level can read every plan and every channel — by design.
- You can only edit **your own service's** plan card (Sr Managers/Admins: any).
- Your last unsaved view state is remembered on *this* browser; **Save view** to keep it for real.
- The test rows on **Kevin McHenry Tester** (PRVS-625C-7CAB-2) are safe to play with.
