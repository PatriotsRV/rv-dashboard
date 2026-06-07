# Sendblue Sandbox Validation — Phase 1 Test Results

> **GH#39 Phase 1** — Sandbox validation document. Populated 2026-06-07 (Session 96).
>
> **Decision gate:** Phase 2 (Dashboard Integration) only proceeds if Phase 1 results meet our needs. If they don't, revisit options.
>
> **Verdict: PASS** — all core mechanics work. See §5 for open questions to resolve before the dedicated-line upgrade.

---

## 1. Account Setup

| Field | Value |
|---|---|
| Sendblue account email | Roland's (account label: patriots-rv-services) |
| Sendblue dashboard URL | https://dashboard.sendblue.com |
| Sandbox API key | Stored in password manager ("Sendblue PRVS sandbox") — NOT committed. ⚠️ See key-rotation note below |
| Sandbox sending number | +1 (646) 620-8124 (SHARED line — serves multiple sandbox tenants) |
| Date account created | 2026-06-07 (signup confirmed Session 95; validated Session 96) |
| Plan | Free API Mode — 10 verified-contact cap, shared number |
| API endpoint | `POST https://api.sendblue.co/api/send-message` — headers `sb-api-key-id` + `sb-api-secret-key` |
| Docs | https://docs.sendblue.com |

⚠️ **KEY ROTATION REQUIRED:** the API key + secret were exposed in plaintext in a screenshot during testing (the playground cURL sample embeds them). Regenerate both keys in the Sendblue dashboard and re-save to the password manager BEFORE Phase 2 ships anything. Crop the code panel from future screenshots.

### Rate limits (free tier, from onboarding guide)

| Limit | Value |
|---|---|
| Throughput | 1 msg/sec per line (auto-queued) |
| Inbound | 1,000/day/line |
| Follow-ups (24h+ since contact's last reply) | 200/day/line |
| Replies within 24h of contact's last message | Unlimited |

The 200/day follow-up cap is the one that constrains PRVS-initiated sends (tech reminders, updates to quiet customer threads). Adding lines raises limits proportionally.

### Contact verification flow (free tier) — ORDER MATTERS

1. Add the contact's number in the console FIRST (+ button on Conversations → Verify Phone Number modal).
2. THEN the contact texts anything to the shared line.
3. Sendblue matches the inbound text, completes verification, auto-sends two confirmation messages.

**Gotcha proven by accident:** texting the shared line from an UNREGISTERED number is silently dropped — sender's iPhone shows "Delivered" (the line is a live iMessage endpoint) but nothing reaches the dashboard. The shared number serves many tenants; Sendblue only routes inbound from numbers registered to your account.

---

## 2. Test Recipients

> Roland's call (Session 96): initial round scoped to Roland + Lynn + one Android friend — full 5-recipient tech matrix deferred. Consent given verbally by all three.

| # | Role | Device | Name | Phone (E.164) | Consent confirmed? | Notes |
|---|---|---|---|---|---|---|
| 1 | Owner | iPhone | Roland Shepard | +12142882887 | ☑ | Sendblue shows blue dot = iMessage |
| 2 | Owner | iPhone | Lynn Shepard | +18173208773 | ☑ | Blue dot = iMessage |
| 3 | Friend (customer stand-in) | Android | Rusty Sasiain | +18179058213 | ☑ | Green dot = SMS fallback |
| 4 | Office line | Landline | PRVS office | +19404885047 | ☑ | Added at signup as "Lead (Placeholder)"; green dot |
| — | Techs | — | deferred | — | — | Add when production pilot starts |

**Dashboard tell:** blue dot on the contact avatar = iMessage-capable; green dot = SMS.

---

## 3. Test Messages

| # | Recipient | Direction | Type | Body / asset | Sent at | Sendblue msg ID | Delivered? | Read receipt? | Reply received? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Roland iPhone | OUT | text (dashboard) | "Testing Sendblue" | 3:34 PM | not captured | ✅ | ✅ ✓✓ shown | ✅ |
| 2 | Roland iPhone | OUT | text (API playground) | "API test 1" | ~3:50 PM | not captured | ✅ same 646 thread | ✅ | n/a |
| 3 | Roland iPhone | OUT | MMS image | test image via paperclip | ~3:55 PM | not captured | ✅ rendered as real image | ✅ | ✅ photo reply |
| 4 | Roland iPhone | IN | photo reply | photo from iPhone | ~3:57 PM | n/a | shown in dashboard | n/a | n/a |
| 5 | Lynn iPhone | OUT | verification msgs | auto-sent on verify | 3:40 PM | n/a | ✅ ✓✓ | ✅ | ✅ ("Test") |
| 6 | Rusty Android | OUT | text | "Hello from Sendblue!" | 4:03 PM | not captured | ✅ green SMS | n/a (SMS) | ✅ "Try BlendSue instead" |
| 7 | Rusty Android | OUT | MMS image | food photo | 4:04 PM | not captured | ✅ good quality | n/a (SMS) | ✅ |

---

## 4. Verification Questions (per GH#39 Phase 1 plan)

### (a) What number does the recipient see? iPhone vs Android — same or different?

| Recipient device | Sender display | Notes |
|---|---|---|
| iPhone | +1 (646) 620-8124 | iMessage thread, "Encrypted" label |
| Android | +1 (646) 620-8124 | Standard SMS thread |

**Same on both?** ☑ Yes — the shared sandbox line. **Sandbox limitation:** production identity requires the dedicated-line upgrade; see §5 question 1 about hosting the office number.

---

### (b) Are read receipts working for iPhone recipients?

☑ **Yes** — confirmed via dashboard checkmarks: single ✓ = delivered, double ✓✓ = read (flipped after Roland opened the thread). Requires recipient's "Send Read Receipts" enabled (it was, on Roland's phone).

---

### (c) Do replies route correctly back to the API?

☑ **Yes (functionally)** — inbound text AND inbound MMS landed in the account's dashboard conversations in real time, from all three recipients.

☐ Raw webhook payload NOT captured — webhook.site unreachable from the home network (ERR_CONNECTION_REFUSED on http and https; office Firebox not in the path). **Deferred to Phase 2**, where the webhook will point at a real Supabase edge function. From the onboarding guide: webhook events = Receive, Outbound, Typing Indicator, Line Blocked; endpoint must return 2xx within 45 s; 5xx retried up to 3 times.

---

### (d) Delivery confirmation accuracy for Android (SMS fallback)

| Sample # | Send time | Delivered status reported by Sendblue | Recipient confirmed receipt? | Match? |
|---|---|---|---|---|
| 1 | 4:03 PM | ✓ shown | ✅ "landed green, like a normal text" | ✅ |
| 2 (MMS) | 4:04 PM | ✓ shown | ✅ photo good quality | ✅ |

Note on bubble color: Google Messages renders the user's OWN sent bubbles in blue regardless of transport — that is app theming, NOT iMessage (iMessage does not exist on Android). Transport confirmation comes from the Sendblue-side green dot (SMS) + the recipient's report that inbound arrived as a normal text.

---

### (e) MMS / image attachments

☑ Supported on iMessage (iPhone) — both directions (dashboard→phone, phone→dashboard)
☑ Supported on Android SMS fallback — outbound confirmed, good quality
☑ Image quality acceptable
☐ Failure modes: none observed

---

## 5. Decision Gate

> Roland's call after reviewing the above.

☑ **PASS** — proceed to Phase 2 (Dashboard Integration). Phase 3 (A2P consultant diagnosis) may run in parallel per the GH#39 plan.

**Caveats / open questions (resolve BEFORE paying for the dedicated line):**

1. **Number hosting/port — BLOCKER QUESTION:** Roland wants Sendblue tied to the office number +1 940 488 5047 long-term. Ask Sendblue support/sales whether a dedicated line can host or text-enable an EXISTING number vs only assigning a new one. (Coordinate with GH#1 — this is the same number the Twilio port plan targeted; don't port it twice.)
2. **Dedicated-line inbound:** confirm a dedicated line accepts inbound from ANY number without pre-registration (required for customer replies in production — the shared line drops unregistered senders).
3. **Contact cap:** confirm the 10-contact cap is free-tier-only and lifts on dedicated.
4. **Key rotation** (see §1) before Phase 2 ships.
5. Pricing reference from GH#39 research: ~$29/mo per dedicated line + ~$0.01/message, no A2P fees.
6. Re-run question (a) + the webhook payload capture on the dedicated line before production cutover.

**Date of decision:** 2026-06-07 (functional PASS; dedicated-line questions outstanding)
**Decided by:** Roland Shepard
