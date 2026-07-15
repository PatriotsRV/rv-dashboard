# Jordan Langston (Project Blue) — Follow-up Questions

**Context:** Roland emailed Jordan 2026-07-14 with 5 office-number port questions
(voice behavior after port, cutover downtime, timeline, warm-up limits on the
ported line, ported number as 2nd lineId on same API/webhooks). **These are the
ADDITIONAL questions to fold into our reply once Jordan responds** — accumulated
during the S138 PB Inbox build + live testing (2026-07-15).

## 1. Engagement gate on outbound delivery (S138 field finding)
Outbound messages to a number with **no inbound history on our line** sat in PB's
queue indefinitely (status stuck `pending`/queued, e.g. handle
`pbm_c0Wh0t0yBcMYER4-sejuxfAGpj5zeWCd5wCaOa3GVRJGsMO8aGwjWNLik9bNVJRZXGqPc2_xEA`).
The moment the recipient texted the line once, new outbound delivered instantly.
- Confirm this reply-first / engagement policy: intended? iMessage-specific? per-line?
- Will the 3 stuck queued messages ever release or expire? Can PB flush them?
- **Business impact question:** how are we supposed to initiate FIRST-contact texts
  to customers who have never texted us (appointment reminders, key-date notices)?

## 2. Engagement history across the port
When 940-488-5047 ports in as a (2nd) line: does inbound/engagement history carry
over per-number, or does every customer effectively start "never engaged" on the
ported line? (Interacts with #1 — could stall all customer notifications at cutover.)

## 3. Duplicate-payload dedupe window
Confirmed live: identical body + same recipient within ~1 hour is silently dropped
(no message_handle ever created). We now timestamp automated notify bodies as a
workaround. Confirm the window/semantics, and whether the drop can be surfaced in
the API response instead of silent.

## 4. PB console users / seats
If we add staff as users in the PB console: what does a seat actually get
(in-app/push/email notifications of inbound? visibility? sending)? Per-seat cost?
(Our current architecture keeps all staff in our own inbox layer; console seats
would bypass our STOP-gate/assignment/audit, so we likely want ZERO extra seats —
this is a due-diligence question, not a request.)

---
*Maintained S138 (2026-07-15). Add new items here as they come up; send as one
consolidated reply when Jordan answers the port questions.*
