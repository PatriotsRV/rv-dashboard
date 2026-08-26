# Cashing Out When Money Is Still Coming

**For:** service managers who cash out customers and change RO statuses
**Applies to:** PRVS Dashboard v1.502 and later
**Last updated:** 2026-08-26

---

## What changed and why

Some RVs go home before all the money is in. An insurance or extended-warranty
check is still in the mail, or a totaled claim still owes us storage and admin
fees. Until now nothing recorded that, so collecting depended on somebody
remembering.

Starting with v1.502, the dashboard asks you one question when you close out an
RO, and remembers the answer.

**The RO status does not change.** You still use `Delivered/Cashed Out` and
`Closed - No Charge` exactly as you always have. The money is tracked separately.

---

## Cashing out a normal (billed) RO

### Step 1 — Set the status to `Delivered/Cashed Out` as usual

Change the status on the RO card the same way you always have.

### Step 2 — Answer the question

A box appears: **"💵 Collected in full?"**

| If… | Do this |
|---|---|
| You collected everything | Click **✅ Paid in full — cash out**, or just press **Enter**. Done. |
| A check is still coming | Click **📮 Balance still coming →** and go to Step 3. |
| You picked the wrong RO | Click **Cancel**. Nothing changes. |

For most cash-outs this is one click and you are finished.

### Step 3 — Only if a balance is still coming

Fill in the short form:

- **Owed by** — Insurance, Extended warranty, Customer, or Other
- **Company name** — Progressive, Good Sam, etc. Helps whoever chases it.
- **Amount due** — how much is still outstanding (pre-filled with the RO total;
  change it if you collected part of it)
- **Expected by** — when you expect it. **Required.** Defaults to two weeks out.
  This is the date the reminders key off, so give it your best guess rather than
  leaving it wrong.
- **How it is coming** — mailed check, ACH, etc.
- **Notes** — claim number, adjuster, what was promised

Click **Record & cash out**. The status changes and the balance is now tracked.

---

## Closing out a totaled or no-charge RO

### Step 1 — Set the status to `Closed - No Charge`

Either pick it straight off the status dropdown, or land there through the
"no dollar value" warning — both work the same.

### Step 2 — Answer the question

A box appears: **"💵 Anything still owed?"**

| If… | Do this |
|---|---|
| Truly nothing owed | Click **✅ Nothing owed — close it**, or press **Enter**. |
| Storage or admin fees still coming | Click **📮 Fees still coming →** and fill in the same form as Step 3 above. |

**This is the totaled-RV case.** The unit is a write-off so we billed nothing for
repairs, but the carrier still owes us storage and admin fees for working the
claim. Record it here so it gets chased.

---

## What happens after you record a balance

1. **A 💵 banner appears on the RO card** showing the amount, who owes it, and
   how overdue it is. It turns red once it is past the expected date.
2. **The RO stays on the books.** It will **not** file into the weekly archive on
   Sunday until the balance is cleared. This is on purpose — an RO in the archive
   is much harder to work.
3. **info@ gets an email reminder every 7 days** once the payment is due, and
   keeps getting one until it is cleared.
4. **It shows up in the 7 AM manager report** under "Outstanding payments,"
   sorted oldest first, with anything 30+ days overdue flagged red.

---

## When the money arrives

1. Find the RO and click the **💵 banner** on the card.
   (In compact view, click the small 💵 next to the customer name.)
2. Click **✅ Payment received**.

That is it. The reminders stop, and the RO files into the archive on the next
Sunday sweep like any other closed RO.

### If the money is never coming

Click **Write off** instead. You will be asked to confirm. The RO is released to
archive and nobody will chase it again — so only use this when it is a genuine
write-off, not to clear the list.

---

## Questions you might get

**"Do I have to answer this on every single cash-out?"**
Yes, on billed ROs. It is one click — "Paid in full" is the highlighted button
and the Enter key does it. That one click is what makes the whole thing reliable;
a box you only tick sometimes is a box that gets forgotten.

**"What if I click 'Paid in full' by mistake?"**
Nothing breaks. Nothing is recorded and the RO cashes out normally. To add the
balance afterwards, change the status off `Delivered/Cashed Out` and back again.

**"Can one RO have two outstanding balances?"**
Yes — for example insurance and extended warranty on the same claim. Record the
first one, then flip the status off and on again to add the second. The card
banner shows the combined total and says how many.

**"Does the customer still get the review request text?"**
Yes, on a normal cash-out — they were billed and they picked up their RV, so the
review ask is unchanged. No-charge closes still never ask for a review.

**"The RO didn't archive on Sunday."**
That is the feature working. Check the 💵 banner — it has an open balance. Clear
it and it will file on the next sweep.

---

## Who to tell

If a balance on your RO is showing overdue in the morning report and you know
something the report does not — the check arrived, the adjuster pushed the date —
clear it or update it on the RO rather than letting it age. The list is only
useful if it reflects reality.
