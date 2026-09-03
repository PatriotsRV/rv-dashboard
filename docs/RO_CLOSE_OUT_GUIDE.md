# Closing Out an RO

**For: Patriots RV Services service managers**
Updated 2026-09-03 · Dashboard v1.503 · Read time: 4 minutes

There are three ways to close a repair order. Picking the right one takes about
five seconds, and it decides whether the customer gets asked for a Google review.

---

## Start here — one question tells you which to pick

> ### Did we charge this customer for the work?

| Answer | Use this |
|---|---|
| **Yes** — we billed them and the job went fine | `Delivered/Cashed Out` — this is almost every RO |
| **Yes, but** — we billed them, and you do *not* want this customer asked for a review | `Delivered - No Review` |
| **No** — we billed nothing for the repair work | `Closed - No Charge` |

---

## The three close-outs

### `Delivered/Cashed Out`

- **Use it when:** The normal ending. We did the work, we billed it, the RV went home.
- **Review ask:** **YES** — a text goes out the next day.
- **Money:** The dashboard asks if you collected everything. If a check is still
  coming, say so and it gets tracked.

> **Example:** Mr. Alvarez picks up his fifth-wheel, pays the $2,400 invoice at
> the counter, and drives off happy.

### `Delivered - No Review`

- **Use it when:** Everything above is true, **but you do not want us asking this
  customer for a review.**
- **Review ask:** **NO** — nothing is ever sent.
- **Money:** Exactly the same as a normal cash-out. It still asks if you
  collected in full.

> **Example:** The job ran two weeks late and the customer let you hear about it.
> They paid, they are leaving, and a "How did we do?" text would only make it worse.

### `Closed - No Charge`

- **Use it when:** We billed **nothing** for the repair work. The RV may never
  have been fixed at all.
- **Review ask:** **NO** — we did no billable work, so we do not ask.
- **Money:** It still asks if anything is owed — because **"no charge" does not
  mean "no money."**

> **Example:** The insurance company totals the unit. We never repair it, but they
> still owe us storage and a fee for working the claim.

---

## ⚠️ The two that get mixed up

`Closed - No Charge` and `Delivered - No Review` sit next to each other in the
dropdown and both skip the review text, so it is easy to grab the wrong one.

**The difference is money, not the review.** If the customer paid us for repairs,
it is **never** `Closed - No Charge` — even if you do not want a review sent.
Using the wrong one makes our sales numbers wrong.

---

## What the dashboard asks you

### 1. "💵 Collected in full?"

You get this on any cash-out where we billed money.

| Button | What it means |
|---|---|
| **✅ Paid in full** | You got all of it. Click this, or just press **Enter**. Done. |
| **📮 Balance still coming** | A check is in the mail. Fill in who owes it, how much, and when you expect it. The RO stays on the board until it clears, and reminders go out. |
| **Cancel** | Wrong RO. Nothing changes. |

### 2. "⚠️ No dollar value on this RO"

You get this when you cash out an RO that has no total on it. It is a warning,
not a wall — but stop and read it.

| Button | What it means |
|---|---|
| **💵 Enter dollar value** | **Usually the right answer.** Takes you to the total so you can fill it in. |
| **📋 Switch to Closed - No Charge** | Correct when we truly billed nothing. |
| **Cash out anyway** | Closes it with no total. Every use of this is recorded. Use it only when you have a real reason. |

---

## Quick comparison

| Status | We billed? | Review sent? | Leaves the board |
|---|---|---|---|
| `Delivered/Cashed Out` | Yes | **Yes**, next day | Sunday 5 PM |
| `Delivered - No Review` | Yes | No | Sunday 5 PM |
| `Closed - No Charge` | No | No | Sunday 5 PM |

### Closed ROs do not disappear right away

All three stay on the board until the sweep runs **Sunday at 5 PM**. An RO you
closed on Monday sitting there on Wednesday is normal — nothing is broken.

The one exception: if you recorded a balance still coming, the RO is **held on the
board on purpose** until that money is marked received.

---

## Four things to avoid

1. **Using `Closed - No Charge` to stop a review.**
   If they paid us, use `Delivered - No Review` instead. No Charge tells the
   system we earned nothing.

2. **Clicking "Paid in full" when a check is still coming.**
   Then nobody chases it. Say the balance is coming — it takes fifteen seconds
   and the system does the chasing.

3. **Cashing out with no dollar value to save time.**
   The total is how we know what the shop earned. Put the number in.

4. **Re-closing an RO because it is still showing.**
   It is waiting for Sunday. Closing it again does nothing.

---

Questions, or something here does not match what you see on screen? Tell Roland.

Longer guide to balances and payments: [`CASH_OUT_OUTSTANDING_PAYMENTS.md`](./CASH_OUT_OUTSTANDING_PAYMENTS.md)

<!--
  MAINTAINER NOTES (not for the manager-facing copy)

  Deliberately OMITTED, pending field test (S187 TODO): the un-ring-the-bell
  recovery path. Switching an RO from 'Delivered/Cashed Out' to
  'Delivered - No Review' inside the 24h delay window SHOULD cancel a pending
  review_requests row, via trg_cancel_pending_review_request, which fires on any
  transition OFF 'Delivered/Cashed Out'. That behavior was reasoned from the
  trigger definition (S187) and has NEVER been fired on this transition. Add a
  "changed your mind?" section here once it is proven live -- not before.

  This guide is the WHICH-STATUS layer. CASH_OUT_OUTSTANDING_PAYMENTS.md (S185)
  is the money layer and goes deeper on receivables, the 💵 banner, clearing a
  balance, and write-offs. Keep them pointing at each other; do not merge.

  Source of truth for behavior: index.html changelog v1.501 (S183) + v1.503
  (S187), and the live enqueue_review_request() / archive_cashiered_ros()
  definitions in pg_proc -- not the migration files, which are snapshots.
-->
