# Project Blue — PoC Requirements & Vendor Questions (GH#39)

> Created 2026-07-02 (Session 130). Project Blue (tryprojectblue.com) is being evaluated as a
> Sendblue alternative for the PRVS messaging layer. Companion docs: `research/sendblue_test.md`
> (Phase 1 template this mirrors), `docs/specs/MESSAGING_AUTOMATION_SPEC.md` (provider-swappable
> design — §11 "Provider portability").
>
> **Good news up front:** Project Blue's API docs are public (https://docs.tryprojectblue.com),
> so most of what we had to ask Sendblue is already answered. Section C below is the short list
> of questions they still need to answer — send those ASAP.

---

> **STATUS 2026-07-03:** Portal live. Dedicated line **+1 (940) 407-4145** ("Device 1") Active
> (new line, local area code — NOT the ported office number yet). Call Forwarding: Inactive.
> API key created ("PRVS RO DB Project Blue", proj_f1317a3...5850) and stored in password manager.
> Send + list endpoints verified working with the key.
>
> **✅ RESOLVED same day (2026-07-03 PM) — outbound delivery issue.** Morning: every outbound
> reported `status:"delivered"` but nothing reached two separate iPhones for ~4+ hours
> (content-search-proven absent); inbound worked throughout. Ticket filed. Afternoon: delivery
> working, and the morning's stuck messages BACKFILLED into the threads — so it was severely
> DELAYED delivery on the fresh line, not a permanent drop. PB has not yet explained root cause.
> **Standing caution for automation:** (1) PB `delivered` status fires while messages can still
> be hours from the handset — it is NOT a real-time handset receipt (Q4 below still matters);
> (2) fresh lines may need a settling/warm-up period — factor into the office-number port plan.
>
> **✅ VALIDATION MATRIX (2026-07-03 PM, all via API with the PRVS key):**
> - API send → iPhone iMessage: PASS (blue bubble, correct line, `messageType:"iMessage"` at send time)
> - API send → Android: SMS auto-detected at send time (`messageType:"SMS"`); receipt pending Rusty's confirmation
> - MMS → iPhone (`mediaAttachmentUrl`, logo.png from GitHub Pages): PASS — rendered as a real image + caption (thread had prior replies per the reply-first rule)
> - Inbound phone → PB: PASS both accounts (portal + `/get-messages-api`)
> - `/get-messages-api` + `message_handle` lookups: PASS
> - Still untested: webhook capture (needs an endpoint — build phase), delivery-status semantics (Q4), read receipts.

## A. What Roland grabs from the Project Blue portal (day 1)

| # | Item | Where | Why |
|---|---|---|---|
| 1 | **API key** (single Bearer token) | Settings → API Keys | Becomes the `PROJECTBLUE_API_KEY` Supabase secret. Store in password manager, never in chat/screenshots (Sendblue lesson). |
| 2 | **Line info** — sandbox/dedicated line phone number + `lineId` | Settings, or `GET /get-lines` with the key | Our equivalent of `SENDBLUE_FROM_NUMBER`; `lineId` is how sends pin to a specific line. |
| 3 | **Plan/tier confirmation** — is the account "API-based"? | Account/billing page | Their docs gate some features on "API or Zapier based accounts". Confirm API + webhooks are enabled on the PoC tier. |
| 4 | **Webhook config screen** — note it exists + has a "send test payload" button | Settings (alongside API keys) | We'll point it at a Supabase edge fn when the inbound half is built; the test button replaces the webhook.site capture we never got with Sendblue. |
| 5 | Screenshot of any **rate limits / new-destination caps** shown in onboarding | Onboarding/docs in portal | Marketing says "up to 50 new iMessage & SMS destinations per day" per line — get the real numbers for our tier. |

## B. Already answered by their public docs (no need to ask)

- **Auth:** `Authorization: Bearer <key>` (single key — simpler than Sendblue's id+secret pair).
- **Send:** `POST https://api.tryprojectblue.com/send-api-message` — `{message, phone, lineId?, mediaAttachmentUrl?, audioAttachmentUrl?}`. Phone format flexible, normalized to E.164.
- **iMessage vs SMS:** send response returns `messageType` ("iMessage"/"SMS") at queue time, AND there's a dedicated `POST /api-check-imessage-availability` pre-check — this potentially solves the Sendblue `is_imessage`-null-until-webhook gotcha.
- **History:** `GET /get-messages-api` (inbound+outbound merged, filterable, paginated) + `GET /get-message-api/:message_handle`. They even use the same `message_handle` concept our `messages` table already has.
- **Webhooks:** dashboard-configured URL, separate inbound/outbound toggles, test payloads. Payload: `{message, destination, receivedAt, direction, messageId, guid, linePhoneNumber}`.
- **Media:** outbound images/video/vCard via `mediaAttachmentUrl`; voice memos via `audioAttachmentUrl` (+ optional AI TTS voice memos).
- **SMS fallback:** automatic, no extra charge. RCS supported (inbound-only per API filters).
- **MCP server:** `https://api.tryprojectblue.com/api/mcp` (OAuth) — I can drive send/list/lookup tests directly from this desktop during the PoC.
- **Bring your own number:** FAQ says yes — port to their carrier partner, or a new line in the desired area code. (But see C1 — port vs host matters.)
- **Voice:** NOT in their API — they hand you a Twilio key. Irrelevant to GH#39; office voice stays where it is.

> **Rule from PB onboarding training (2026-07-03):** MMS/rich media cannot be sent to a contact
> until that contact has REPLIED to a first plain-text message. Matches Sendblue's inbound-first
> pattern. Impact on our spec: fine for the EOD digest (media ships as a viewer-page LINK, which
> is text), but any first-touch automated message must be text-only.

## C. QUESTIONS TO SEND PROJECT BLUE (copy-paste ready)

> **2026-07-03:** Submitted — PB account rep forwarded these to their support team. Delivery
> ticket (outbound-not-landing) also filed the same day. Awaiting answers on both.

1. ~~**Office number — hosting vs porting (BLOCKER).**~~ **✅ ANSWERED 2026-07-02 — Project Blue confirmed they can port 940-488-5047 over.** Residual details to nail down during setup: what happens to VOICE on that number after the port (their model = calls via Twilio + call forwarding — confirm office calls keep working), LOA/paperwork, port timeline, and that the ported number gets full iMessage registration (blue bubble + read receipts).
2. **Send-response correlation.** The `/send-api-message` response contains no message id/handle — only `success` + `messageType`. How do we correlate a specific send with its later webhook events (`guid`/`messageId`) and with `/get-messages-api` records? Race-free method for automated sends?
3. **Webhook authentication (Sendblue Q6).** How are webhook calls authenticated — HMAC signature, secret header, or nothing? What are the retry policy and timeout?
4. **Delivery + read status (Sendblue Q7).** Do you emit per-message delivery/failed/read status events (webhook or API)? The documented webhook payload only covers message content in/out. How do we detect a failed send after queueing?
5. **Inbound MMS/media (Sendblue Q8).** When a customer texts us a photo, how does the media arrive — the webhook payload shows no media field. URL in `/get-messages-api` only?
6. **Rate limits by tier.** Exact numbers for: msgs/sec throughput, NEW destinations per day per line, inbound caps, and what happens when a cap is hit (queued vs rejected). Our automation sends status updates + an end-of-day digest to active customers (~10-100/day), mostly repeat destinations.
7. **Sandbox/trial specifics.** Is the sandbox a shared line? Verified/pre-registered contacts only, and how many? Can it receive inbound from unregistered numbers? (Sendblue's shared line silently dropped unregistered inbound — we want to know up front.)
8. **Dedicated-line inbound.** Confirm a dedicated line accepts inbound from ANY number with no pre-registration (required for customer replies in production).
9. **Pricing — written.** Setup fee, per-line monthly, per-message or per-contact fees, contact caps, contract term. (Third-party pages claim $500 setup + ~$300/mo/line — please confirm actuals for our volume.)
10. **Compliance / opt-out.** Do you provide automatic STOP/HELP/START keyword handling and a suppression list, or do we implement that ourselves? What is your TCPA guidance for automated (non-marketing) transactional service updates?

## C2. PB SUPPORT ANSWERS (received 2026-07-04) + build implications

| Q | Answer | Implication for our build |
|---|---|---|
| Q2 correlation | `/send-api-message` returns NO message id. Correlate via phone + body + timestamp; webhooks carry `guid`/`messageId`, list API carries `message_handle` — different id spaces. Identical payloads deduped ~1 hr. | After send, poll `/get-messages-api` (`to_number` + `created_at_gte`) to capture `message_handle` into our `messages` row. The ~1-hr payload dedupe also gives us free idempotency on retries BUT will swallow legit identical texts sent twice within an hour — vary body (e.g. include RO code/time) in automation. |
| Q3 webhooks | Plain HTTPS JSON POST. NO HMAC/signature, NO retries (single attempt), ~10s timeout. Secret-in-URL is their suggested auth. | Our webhook edge fn: secret as URL query param (+ keep X-PRVS-Secret unavailable since PB can't send headers), respond 200 fast (enqueue, don't process inline). Because single-attempt = missed events are LOST, we need a reconciliation poll (cron sweeping `/get-messages-api`) as the source of truth; webhook is just the low-latency hint. |
| Q4 status | `status` = `pending` (queued) or `delivered` (= `sent_at` set, i.e. LEFT THEIR QUEUE — not handset receipt). No failure or read events; stuck sends stay `pending` forever. Immediate errors are 4xx/5xx on send. | Matches our S130 finding. Automation treats `delivered` as "sent". Add a stale-`pending` alarm (row older than N min still pending = raise to admin). No read receipts available programmatically. |
| Q5 inbound MMS | Webhooks are TEXT-ONLY today; media URLs appear in `/get-messages-api` (`media_attachment_url`), sometimes delayed. Webhook media "near future". | On inbound webhook, poll the list API by `from_number` + time to pick up media. Reconciliation cron covers late-arriving media too. |
| Q6 rate limits | API 60 req/min/key (429). Sends ~15 per 10 min per line (excess queued). New destinations 50/day/line (excess queued to next day; repeat destinations + contact-initiated replies don't count). | Fine for our 10-100/day repeat-customer volume. EOD digest pacing: 15/10min = ~90/hr/line — start the digest run early enough (e.g. 40 customers ≈ 30-45 min). New-destination cap only bites on first-touch to brand-new customers. |
| Q7 trial | Shared line, 5 verified contacts, outbound to verified only, unregistered inbound silently dropped (same as Sendblue). | Moot — we already have a dedicated line. |
| Q8 dedicated inbound | Any number, no pre-registration. ✅ | Production customer replies work. |
| Q10 compliance | NO built-in STOP/HELP/START, no suppression-list API — implement ourselves off inbound webhooks. Transactional guidance: existing relationship, informational, honor STOP, include business name. | Spec §8 hard gate stands and is fully OUR build: STOP keyword handling in the webhook fn + suppression check in the dispatcher. No vendor help, but no vendor lock-in either. |

**STILL OPEN with PB:** Q9 written pricing (the reason we're here — chase this), office-number
port residuals (voice continuity, LOA, timeline, iMessage registration on the ported number),
and root cause of the S130 delayed-delivery incident.

## D2. BUILD STATUS (Session 131, 2026-07-04) — PB transport layer LIVE + VALIDATED

Both edge fns built, deployed to live Supabase, and live-tested end-to-end:

- **`projectblue-send`** (deployed, JWT on): contract-identical to `sendblue-send` (drop-in for
  `js/messaging.js` on the POC branch). Validated: X-PRVS-Secret gate → PB → Roland's handset
  (arrived within ~1 min), `message_handle` capture poll works (pbm_ handle stored),
  `is_imessage:true` at send time, `messages` row logged w/ line number + sender; a failed
  (401) attempt logged as an `error` row. Secrets: `PROJECTBLUE_API_KEY` (first set was a bad
  paste → PB 401; re-set after verifying the key via `/get-lines`).
- **`projectblue-webhook`** (deployed `--no-verify-jwt`): secret-in-URL gate
  (`PROJECTBLUE_WEBHOOK_SECRET`). Validated: PB portal test payload captured; REAL inbound
  ("Webhook test live" from Roland's iPhone) logged in seconds with real guid; outbound-echo
  dedupe confirmed (a send via the fn produced exactly ONE `messages` row — the webhook echo
  was skipped). PB webhook registered Active, Inbound + Outbound.

NOT YET BUILT (deliberately): reconciliation poll cron (source of truth for missed webhooks /
late media / stale-pending alarm), RO routing for inbound, STOP/HELP handling, `js/messaging.js`
endpoint swap (POC branch). All queued behind the provider decision (pricing).

## D. Integration mapping (ours — for the swap build, no vendor input needed)

| Sendblue (current POC) | Project Blue equivalent |
|---|---|
| `POST api.sendblue.co/api/send-message` | `POST api.tryprojectblue.com/send-api-message` |
| Headers `sb-api-key-id` + `sb-api-secret-key` | `Authorization: Bearer <key>` |
| `{number, from_number, content}` | `{phone, lineId?, message}` |
| `SENDBLUE_API_KEY_ID` / `SENDBLUE_API_SECRET_KEY` secrets | `PROJECTBLUE_API_KEY` (+ optional `PROJECTBLUE_LINE_ID`) |
| `is_imessage` null until status webhook | `messageType` in send response + availability pre-check endpoint |

Build plan: clone `sendblue-send` → `projectblue-send` (same shared-secret gate, dormant-safe 503,
`messages`-table logging — table + `js/messaging.js` need at most a provider column). Per spec §11
all vendor specifics stay in the edge-fn layer, so the queue/dispatcher design is unaffected.

**⚠️ Note for Roland (not for the vendor):** Project Blue's marketing leans hard on "skip A2P
registration" — that works because iMessage isn't carrier SMS, but automated texts to customers
are still TCPA-territory regardless of transport. Our spec §8 compliance gate (opt-in, STOP
handling, suppression list) stays a hard gate before production no matter which vendor wins.
Their primary market is HighLevel/HubSpot sales teams; we're a plain-API customer — Q3/Q4/Q6
answers will show how solid the API side is.
