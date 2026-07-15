# Kenect Data Extraction Spec (Kenect → Supabase)

**Status:** DRAFT — game plan locked Session 139, 2026-07-15. Recon complete against the live logged-in app. Build is a separate session.
**Branch plan:** build on `feature/kenect-extract` off `pre-prod` (new tables + edge/import tooling; no index.html risk).
**Supersedes nothing.** Data-rescue only. Kenect UI/code was torn out v1.445 (S92) — this is NOT a re-integration.

---

## 0. 🔴 HARD DEADLINE — 2026-07-24

Kenect access ends **July 24, 2026** (~9 days from the recon). After that the session dies, the JWT
stops refreshing, and every Kenect-hosted MMS media URL goes dead. Extraction must complete before then.
Kenect **refused to issue an API key** (the reason Roland is leaving), so the official
Integrations API (`integrations-api.kenect.com`, Bearer key) is **not available**. Extraction runs
through Roland's **logged-in browser session** instead.

---

## 1. Locked decisions (Roland, Session 139)

| Decision | Choice |
|---|---|
| Kenect status | Active but **cancelling soon** — time-critical |
| Destination | **Merge into live inbox** — `conversations` / `conversation_events`, `source='kenect_import'`, imported threads `status='closed'` (hidden by the messages.html v1.4 default "Open" filter, visible under "All" + per-customer history) |
| Media | **Text + media** — download MMS attachments to Supabase Storage during the pull (Kenect URLs die at closure) |
| Dedupe | By `phone_key` against existing customers/conversations |
| Primary path | **A** — app.kenect.com internal API via the logged-in session |
| Cross-checks | **B** Lightspeed (see §6), **C** contacts CSV, **D** written offboarding export request |

---

## 2. Recon findings (validated live, Session 139)

**Org / location:** organizationId `6892`, primary locationId `10631` ("Patriots RV Services").
There may be more than one location — confirm the full `locationIds` set at build start
(`location.kenect.com/api/v1/user/130333/locations?excludeInactive=true`).

**Auth model:** the SPA attaches, on every data call to `contact-search.kenect.com` / `inbox.kenect.com`:
- `Authorization: Bearer <JWT>` — ~981-char token, session-bound, refreshes while logged in.
- `X-Kenect-Calling-Service` (value `web`), plus `Accept` / `Content-Type: application/json`, `withCredentials`.

A naive replay **without** these two headers fails (`neterr` / CORS). The extraction script must read
the live token **in-page** and attach both headers — the token never leaves the browser. The simplest
robust capture: monkey-patch `XMLHttpRequest.prototype.setRequestHeader` to grab the app's own
`Authorization` value off its next real call, then reuse it for our paged pulls. Re-grab periodically
(token may rotate) across a long run.

**Endpoint map (all GET unless noted):**

| Purpose | Endpoint | Notes |
|---|---|---|
| List all contacts (bulk) | `POST contact-search.kenect.com/api/v1/contact-search/names?page&pageSize` body `{locationIds:[10631]}` | **100/page**. Returns `contactId, locationId, firstName, lastName, displayName, doNotText, doNotEmail`. Primary enumerator. Read `totalRecords` for the count. |
| Contact detail (enriched) | `contact-search.kenect.com/api/v1/contacts/{contactId}?enrichContact=true` | `phones[]` (number, primary, smsCapable, optIn[]), `email/primaryEmail`, `company`, `groups[]`, `source` (e.g. `LIGHTSPEED`), `externalId`, `createdAt`, `lastContactedAt`, `firstActiveAt` |
| Conversation list | `inbox.kenect.com/api/v2/conversations?locationIds=10631&limit&offset&timeZone&archived=false` | Paginated. **Run twice: `archived=false` AND `archived=true`** to capture open + closed. |
| Conversations by contact | `inbox.kenect.com/api/v1/conversations?contactIds={id}&limit` | Maps a contact → their conversation id(s) |
| Messages in a thread | `inbox.kenect.com/api/v1/conversations/{conversationId}/messages?limit&offset` | **25/page**. Fields: `id, conversationId, messageKind (INCOMING/…), outbound (bool), messageType (SMS/MMS), body, sentAt, externalStatus (RECEIVED/DELIVERED/…), attachments[], createdAt` |
| External IDs (Lightspeed link) | `hub.kenect.com/api/v1/integrations/operations/fetch-external-id-list?contactId` | `contactExternalId, integration, firstName, lastName, email, phoneNumber, createdAt` — ties each contact to its Lightspeed record |

**Key structural fact:** contacts carry `source: "LIGHTSPEED"` + `externalId` — Lightspeed is the upstream
system of record for the *contact roster*. Kenect holds the *conversation content* Lightspeed likely does
not. So the clean split is: roster can be cross-checked/backfilled from Lightspeed (Path B), but the
**message history is Kenect-only and must be pulled here.** Attachments were empty in the sampled threads;
confirm real `attachments[]` shape on an MMS thread at build start (expect a hosted URL + content-type).

---

## 3. Extraction method (Path A — the build)

Runs in the Kenect browser tab via the Chrome tooling, page-context XHR with live-read auth headers.

1. **Phase 0 — scope.** Grab `totalRecords` from the names endpoint (contact count) and page through
   `v2/conversations` (both archived states) counting threads + newest/oldest `sentAt`. Report volume so
   we know the run length and can budget the media download.
2. **Phase 1 — contacts.** Page `contact-search/names` (100/page) → for each, fetch enriched detail →
   write raw JSON to a staging table. Also pull `fetch-external-id-list` to keep the Lightspeed externalId.
3. **Phase 2 — conversations + messages.** Page `v2/conversations` (archived=false, then true) → for each
   conversation page `.../messages` (25/page) to the end → write raw JSON to staging.
4. **Phase 3 — media.** For every message with `attachments[]`, download each attachment **while the session
   is alive** and re-host in Supabase Storage (bucket `kenect-media/{conversationId}/{messageId}-{n}`);
   rewrite the URL in staging to the Supabase path.
5. Persist staging as newline-delimited JSON checkpoints so a mid-run failure resumes without re-pulling.

**Safety:** read-only against Kenect — GET/enumerate only, no sends, no edits, no deletes. Everything lands
in NEW staging tables first; nothing touches the live `conversations`/`conversation_events` until Phase 4
transform is verified.

---

## 4. Load into Supabase (per locked decisions)

- **Staging tables (raw):** `kenect_contacts_raw(contact_id pk, payload jsonb, pulled_at)`,
  `kenect_conversations_raw(conversation_id pk, payload jsonb, archived bool, pulled_at)`,
  `kenect_messages_raw(message_id pk, conversation_id, payload jsonb, pulled_at)`. Raw JSON = zero data loss,
  re-transformable.
- **Transform → live inbox:** for each Kenect conversation, upsert a `conversations` row keyed by
  `phone_key` (normalize the contact's primary phone the same way the PB webhook does), `source='kenect_import'`,
  `status='closed'`, `customer_name` from `displayName`. Insert each message as a `conversation_events` row
  (direction from `outbound`, body, `sentAt` as the event timestamp, media pointing at the re-hosted Supabase URL).
- **Dedupe:** if a `phone_key` already exists (PB-era conversation), attach the Kenect events to that thread
  rather than creating a duplicate — Kenect history slots in *before* the PB history chronologically.
- Verify counts against the Kenect UI on a handful of known customers before declaring done.

---

## 5. Verification

- Row counts: staging contacts == Kenect `totalRecords`; staging messages == sum of per-thread counts.
- Spot-check 5–10 known customers (e.g. William Wixon, Rick McClung) — message count + newest message body
  match the Kenect UI.
- Confirm every `attachments[]` URL now resolves to Supabase Storage, not a `*.kenect.com` host.
- Confirm imported threads are hidden by the messages.html default "Open" filter and appear under "All".

---

## 6. Parallel / fallback paths (do regardless of Path A success)

- **C — Contacts CSV:** if the Contacts page exposes an export, grab it now as a plain roster backup.
- **D — Written offboarding export request:** email Kenect support citing the 7/24 end date and ask for a
  full account data export (conversations + contacts + media). Different ask than the refused API key; costs
  nothing and is belt-and-suspenders if Path A is interrupted.
- **B — Lightspeed cross-check:** Kenect contacts are `source=LIGHTSPEED` with `externalId`, so Lightspeed
  can supply/verify the *roster*. Treat as a roster cross-check, not the message source (Lightspeed likely
  lacks full two-way SMS history). Roland plans to replace Lightspeed within ~a year — do not build anything
  durable against it here.

---

## 7. Open items for build-session start

- Confirm the complete `locationIds` set (single vs. multi-location).
- Confirm real `attachments[]` shape on an actual MMS thread.
- Get the true contact + conversation + message counts (Phase 0) to size the run and the Storage budget.
- Decide checkpoint cadence + whether to run the whole pull in one browser sitting (JWT longevity) or in
  resumable chunks.
