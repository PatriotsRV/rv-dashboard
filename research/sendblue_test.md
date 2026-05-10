# Sendblue Sandbox Validation — Phase 1 Test Results

> **GH#39 Phase 1** — Sandbox validation document. Populate as test sends are completed.
>
> **Decision gate:** Phase 2 (Dashboard Integration) only proceeds if Phase 1 results meet our needs. If they don't, revisit options.

---

## 1. Account Setup

| Field | Value |
|---|---|
| Sendblue account email | _TBD_ |
| Sendblue dashboard URL | https://sendblue.co/dashboard (confirm at signup) |
| Sandbox API key | _store in password manager — DO NOT commit_ |
| Sandbox sending number | _populated after signup_ |
| Date account created | _TBD_ |
| Plan | Free sandbox |

---

## 2. Test Recipients

> Pick 5 recipients per the GH#39 Phase 1 plan. Confirm consent before sending — these are real phones.

| # | Role | Device | Name | Phone (E.164) | Consent confirmed? | Notes |
|---|---|---|---|---|---|---|
| 1 | Tech | iPhone | _TBD_ | _TBD_ | ☐ | |
| 2 | Tech | iPhone | _TBD_ | _TBD_ | ☐ | |
| 3 | Tech | Android | _TBD_ | _TBD_ | ☐ | |
| 4 | Tech | Android | _TBD_ | _TBD_ | ☐ | |
| 5 | Customer | Android | _TBD_ | _TBD_ | ☐ | Real-world delivery validation |

---

## 3. Test Messages

For each recipient, send at least:
- (a) plain text outbound
- (b) text outbound expecting a reply
- (c) MMS / image attachment (if Sendblue supports)

Log each send below.

| # | Recipient | Direction | Type | Body / asset | Sent at | Sendblue msg ID | Delivered? | Read receipt? | Reply received? |
|---|---|---|---|---|---|---|---|---|---|
| 1 |  | OUT | text |  |  |  |  |  |  |
| 2 |  | OUT | text-reply |  |  |  |  |  |  |
| 3 |  | OUT | MMS |  |  |  |  |  |  |
| 4 |  | IN | reply |  |  |  | n/a | n/a | n/a |

---

## 4. Verification Questions (per GH#39 Phase 1 plan)

### (a) What number does the recipient see? iPhone vs Android — same or different?

| Recipient device | Sender display | Notes |
|---|---|---|
| iPhone | _TBD_ | |
| Android | _TBD_ | |

**Same on both?** ☐ Yes  ☐ No  → if different, document why and whether it's a problem for our use case.

---

### (b) Are read receipts working for iPhone recipients?

☐ Yes — confirmed via _TBD_
☐ No — _document expected vs actual_

---

### (c) Do replies route correctly back to the API?

☐ Yes — webhook captured reply at _TBD URL_, payload below:

```json
// paste actual webhook payload sample here
```

☐ No — _document failure mode_

---

### (d) Delivery confirmation accuracy for Android (SMS fallback)

| Sample # | Send time | Delivered status reported by Sendblue | Tech confirmed receipt? | Match? |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

---

### (e) MMS / image attachments

☐ Supported on iMessage (iPhone)
☐ Supported on Android SMS fallback
☐ Image quality acceptable
☐ Failure modes: _document any_

---

## 5. Decision Gate

> Roland's call after reviewing the above.

☐ **PASS** — proceed to Phase 2 (Dashboard Integration)
☐ **PARTIAL** — proceed with caveats listed below
☐ **FAIL** — revisit options (consider direct Twilio with consultant, or alternative providers)

**Caveats / open questions:**

- _TBD_

**Date of decision:** _TBD_
**Decided by:** Roland Shepard
