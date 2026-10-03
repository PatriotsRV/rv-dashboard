# V2 Research 03 — AI lead response & customer-communication automation (WooSender replacement)

> Session 194 (2026-10-03). Subagent research feeding `docs/specs/V2_DMS_DESIGN.md`.
> Pricing/features from vendor pages + third-party blogs ("vendor claim" where relevant). WooSender "Woo" flow internals are not publicly documented. (inferred) = synthesis, not sourced. Not legal advice — counsel review before launch.

## 1. Product by product

### WooSender (PRVS's current tool)
- **Channels:** SMS, email, voice, ringless voicemail, live chat, Facebook Messenger. No confirmed Instagram DM / Google chat. (https://dataconomy.com/tools/woosender-ai-platform/ · https://offer.woosender.com/)
- **AI does:** replies/qualifies/books 24/7; database reactivation; AI phone system + live call transfer; mini-CRM with lead round-robin; no-code "AI Builder".
- **Usage pricing (2026)** (https://help.woosender.com/en/articles/12692791-usage-pricing-updated-2026): SMS $0.02, email $0.008, voice $0.05/min, AI intent detection $0.02/intent, transcription $0.02/min, A2P 10DLC campaign $15/mo, brand reg $6, vetting $60, extra user $200/mo.
- **Plan pricing:** inconsistent — $200/mo entry vs $1,000 Gold / $2,000 Platinum + $3,000 setup / $4,995 "Startup". Unverified.
- **Complaints** (Trustpilot 4.5/5, 80 reviews, 14% 1-star): $9K 90-day trial over-promised, cancel trouble (Aug 2025); missed sales call (Feb 2026). Praise: support, "90% response rates".
- **Handoff/guardrails:** not documented; visible mechanism = live call transfer.

### Podium (Jerry / AI Employee)
- SMS, web chat, social DMs, Google/Facebook reviews, unified inbox. AI roles: Salesperson, Scheduler, Marketer, Concierge, Reputation Specialist. Replies <1 min, qualifies, books, no-show follow-up, review requests + replies. Configured with policies/pricing/hours/wording; **edge cases to staff; human approval for refunds/policy exceptions.**
- Pricing: Core $399 (250 msgs), Pro $599, Signature custom; annual contract; AI add-on → ~$800–1,200/mo.
- Complaints: 7–14 day support waits, failed bulk campaigns, no contact export (lock-in), price.

### Kenect
- Text-enabled business line, webchat, review requests, text-to-pay, scheduling, file sharing. AI unverified. Quote-based (~$4k/yr reported). Complaints: auto-renewal lock-in (Feb 2026), texting outages, failing review requests, contact dupes, poor onboarding. (https://www.capterra.com/p/212906/Kenect/)

### Birdeye
- Reviews across 200+ sites, two-way messaging, unified inbox, AI copilot, sentiment, listings. Per-location quote. Complaints: poor results, confusing reports, listing-verification gaps (2025).

### GoHighLevel (Conversation AI + workflows)
- SMS, FB Messenger, Instagram DM, web chat, email, voice AI, missed-call text-back. AI qualifies with preset questions, books on calendar, FAQs from KB. **Escalates on: explicit human request, low confidence, complaints/billing, high-value contacts, max turns.** Triggers: form submit, inbound msg, appointment completed, scheduled campaigns. ~$0.01–0.03/AI message (+$50–200/mo). (https://ecosire.com/blog/ghl-ai-automation-guide)

### Textline / Textable
- Team texting: auto-replies, after-hours, scheduled sends, auto-assign/label, timer automations, Announcements, variables, Zapier/API/webhooks. No AI. **TCPA: patented consent feature, auto STOP/END, registration help.** (https://www.textline.com/platform-solutions/automated-text-message-service)

### Numa (AI phone agent, auto dealers) — the one tied to the DMS
- Voice appointment agent (books service appts, transparency on every call); call-intelligence (transcribe, score advisors); Smart Inbox + service workflows (scheduling, write-up, dispatch, MPI via SocketTime). Hands off to advisors/BDC. **DMS integrations ~90% of dealer market — reads and writes the system of record.** (https://www.numa.com/news/numa-unveils-the-first-ai-agent-platform-for-auto-dealerships)

## 2. Converged lifecycle and cadences
**Pipeline:** New → Contacted (first AI touch) → Engaged (replied) → Qualified (RV, issue, intent) → Booked → Showed / No-show → Quoted → Won / Lost → Post-service (review, retention). Side states: Needs Human, Nurture/Dormant, Opted-out.

**Cadences:**
- Speed-to-lead <1 min; human handoff <15 min once intent shows.
- Early nudges Day 0, 1, 3, 7 (GHL default: 3-day wait before personalized follow-up).
- Reactivation: Day 0 email, Day 3 SMS (if email opened), Day 10 email; then Day 30/60/90. Best yield = leads 60–180 days old; 12-month cap. Targets 25% open / 5% reply.
- Stop conditions: reply, booking, STOP, max touches.

## 3. Compliance mechanics (https://www.infobip.com/blog/tcpa-compliance-sms)
- **Consent:** marketing texts need prior express written consent (affirmative opt-in, no pre-checked box, stored record tied to the event). Replies to customer-initiated inquiry = lower bar; keep proof regardless.
- **One-to-one consent** (from Jan 2026): consent cannot be shared across brands or bought from lead gens.
- **Revocation:** honor by any reasonable means within 10 business days, ideally instantly; auto-process STOP/END; DNC lookup ($0.01 at WooSender).
- **Quiet hours:** 8am–9pm recipient local. **Texas has a state mini-TCPA — stricter.**
- **A2P 10DLC:** brand + campaign registration mandatory; unregistered traffic blocked since Feb 2025.
- Penalties $500–1,500/message, no cap.

## 4. Reviews and reputation (https://kukui.com/google-changed-the-rules-on-reviews — secondary; verify vs Google policy)
- Request same/next day after pickup; direct Place-ID review link.
- **Review gating prohibited** (no sentiment filter before sending link; no incentives). Compliant pattern: everyone gets the same neutral request; independently route complaints / low scores to a human for service recovery — but never withhold the link.
- No on-premises kiosk requests, no staff quotas/leaderboards, steady flow not bulk.
- AI-drafted replies OK; human approves negative-review replies.

## 5. After-service marketing (inferred pattern)
Service reminders by date/interval · seasonal (de-winterization, winterization, pre-trip, awning/roof inspection) · upsell triggers from service history (roof reseal → solar/battery; tires → inspection) · segmentation by make/year/type/last service · frequency caps (≤2 promos/mo), marketing opt-in separate from service messaging, STOP = stop-all.

## 6. Architecture on Supabase + LLM API
**Ingestion**
- **Meta Lead Ads:** subscribe Page to `leadgen` webhook; payload has only IDs (`leadgen_id`, `page_id`, `form_id`, `ad_id`, `adgroup_id`, `created_time`); fetch fields via Graph API with Page token; perms `pages_read_engagement`, `pages_manage_metadata`, `pages_show_list`, `ads_management`, `lead_retrieval`; reply 200 fast, store raw, dedupe on `leadgen_id`; app review for prod. (https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/quickstart/webhooks-integration)
- **Google Ads lead forms:** webhook POST with configured validation key. (https://developers.google.com/google-ads/webhook/docs/overview)
- **Google Business Messages is dead** (removed 2024-07-31). Use GBP phone + missed-call text-back.
- SMS/voice: provider inbound webhook → edge fn. Web forms: edge fn insert.

**Core**
- **Conversation state machine:** explicit `conversation.state` + `next_action_at`; pg_cron picks due follow-ups. **LLM never decides WHETHER to contact — only what to say and which tool to call.**
- **Tool calling:** `lookup_customer`, `get_open_ro`, `check_availability`, `book_appointment`, `create_handoff`, `update_lead_stage` — thin wrappers over RPCs, validate every arg.
- **Human-in-the-loop:** `handoff_queue` + realtime + SLA timer. Shadow/suggest mode first (AI drafts, human approves), autonomous later.
- **Guards in one `send_message` fn:** opt-out, quiet hours (recipient tz), per-contact frequency cap, global rate limit, consent record.
- **Audit:** every in/out message, prompt version, model, tool calls + results, append-only.
- **Idempotency:** dedupe on provider message ID; per-conversation lock.
- Open-source: no mature equivalent; patterns in Chatwoot (inbox/handoff) and n8n.

## (a) Feature matrix (Y / P partial-unverified / N)

| Feature | WooSender | Podium | Kenect | Birdeye | GHL | Textline | Numa |
|---|---|---|---|---|---|---|---|
| SMS | Y | Y | Y | Y | Y | Y | Y |
| FB Messenger | Y | Y | P | Y | Y | Y | N |
| Instagram DM | N | Y | P | Y | Y | Y | N |
| Web chat | Y | Y | Y | Y | Y | P | P |
| Email | Y | P | P | Y | Y | N | P |
| Voice AI | Y | P | N | P | Y | N | Y |
| AI qualifies + books | Y | Y | P | P | Y | N | Y |
| Reactivation | Y | P | N | N | Y | N | P |
| Review requests | P | Y | Y | Y | Y | N | P |
| Human handoff | P (call xfer) | Y | Y | Y | Y | Y | Y |
| **Tied to shop DMS/RO** | N | N | P | N | N | N | **Y** |
| Pricing | usage+plan | $399–1,200 | quote | quote | platform+usage | per seat | quote |

## (b) Minimal viable in-house design
**Entities:** `contact` (phone, name, consent_status/source/at, opted_out_at, tz) · `lead` (contact_id, source meta/google/web/call/text, campaign+ad ids, stage, raw) · `conversation` (contact_id, lead_id, channel, state, assigned_to, next_action_at) · `message` (direction, body, sender ai/staff/customer, provider_id, status, prompt_version, tool_calls) · `campaign` (type lead-followup/review/promo, audience query, window, caps) · `sequence` + `sequence_step` (delay, channel, template, stop conditions) · `appointment` (contact_id, lead_id, ro_id, slot, status booked/confirmed/showed/no-show) · `handoff` (reason, priority, SLA, resolved_by).

**State machine:** new → ai_engaged → qualified → booked → showed → post_service → review_requested → nurture. Any → needs_human; any → opted_out (terminal).

**AI MAY autonomously:** reply to customer-initiated texts; FAQs from approved content; collect RV + issue; offer open slots; book/reschedule within rules; reminders; approved follow-up sequences; create handoff.

**AI MAY NOT:** quote final prices or diagnose as certain; promise parts availability or completion dates; refunds/credits; warranty/insurance disputes; discuss a complaint beyond acknowledge+escalate; market without consent; contact opted-out or outside quiet hours; edit/close ROs or financial records; reply to negative reviews without human approval.

## (c) Five WooSender features to match
1. Instant first reply (seconds) on every source, incl. after hours.
2. Conversational qualify-and-book in one thread, no forms.
3. Persistent follow-up until reply / book / opt-out.
4. Dead-lead reactivation across the old database.
5. Live handoff the moment intent shows + visible support responsiveness.

## (d) Five ways an RO-aware system beats every vendor
1. **Knows the customer's RV** — skips qualification, replies specifically.
2. **Knows open RO status** — "Is my RV ready?" answered from RO + parts; promised-date change → proactive update. No vendor reads the RO table.
3. **Uses past services** for targeted upsells + interval reminders.
4. **Closes the revenue loop** — lead source → appointment → RO → invoice = true cost per booked job per ad creative.
5. **Triggers reviews/promos from RO completion** at the right time, excluding customers with open complaints.

## Gaps for follow-up
Kenect/Birdeye AI details; Goodcall/Smith.ai; real WooSender plan pricing + handoff behavior; Google Ads webhook payload/retry; dated complaints for GHL/Textline/Numa; primary-source check of Google review policy.
