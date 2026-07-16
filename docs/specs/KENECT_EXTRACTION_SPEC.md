# Kenect Data Extraction Spec (Kenect → Supabase)

**Status:** PHASE 0 COMPLETE — Session 140, 2026-07-15. Live counts + auth model validated against the real API.
See §0b for Phase 0 RESULTS and the four corrections to the S139 recon. Build (Phases 1–4) still pending.
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

## 0b. PHASE 0 RESULTS + spec corrections (Session 140, 2026-07-15) — VALIDATED LIVE

### Verified scope (real numbers, paged to exhaustion)

| Metric | Value | How |
|---|---|---|
| Locations | **ONE** — `10631` only | `location.kenect.com/api/v1/user/130333/locations?excludeInactive=true` → single entry. Resolves S139 open item. |
| Contacts | **3,093** (all unique) | Body-offset paged to a short page; 3,093 distinct `contactId`s. |
| Conversations — open | **2,073** | `v2/conversations` `archived=false`, offset-paged to empty. |
| Conversations — archived | **1,127** | same, `archived=true`. |
| **Conversations — TOTAL** | **3,200** | |
| Messages (sampled) | 12 threads → **433 msgs**, avg **36.1**, median ~5 | Per-thread: `[2,34,3,327,5,3,3,16,2,5,9,24]` — heavy right skew, one 327-msg thread. |
| **Est. total messages** | **~30k–115k** | Mean-based ≈115k; median-based ≈30k. Size the run for ~5k–8k API calls. |
| Attachments (sampled) | 51 across 12 threads | Extrapolates to **~13,600 attachments**. Sample file was 576 KB → **plausibly 2–7 GB** of media. ⚠️ Storage budget item — confirm before Phase 3. |

### 🔴 FOUR corrections to the S139 recon (S139 assumptions were wrong)

1. **`X-Kenect-Calling-Service` value is `Web:1.2710.0`**, NOT `web`. (Version-stamped.)
2. **Contacts pagination is `offset`/`limit` in the POST BODY**, NOT `page`/`pageSize` query params.
   Query params are **silently ignored** — `?page=0`, `?page=5`, `?page=199`, `?page=250` all return the
   *identical* first 100 rows (Heather Abbott `137586049`), HTTP 200. A naive `page` loop produces
   **garbage counts** (it "counted" 20,000 contacts = the same 100 rows × 200 pages). Correct call:
   `POST contact-search.kenect.com/api/v1/contact-search/names` body `{locationIds:[10631], offset:N, limit:100}`.
3. **There is no `totalRecords`.** The `names` endpoint returns a **plain JSON array**. Page until a short page.
4. **`attachments[]` carries NO URL.** Real shape:
   `{id, name, md5, contentType, size, createdAt, updatedAt}` — e.g.
   `{"id":44263837,"name":"RO-1_ESTOLL.pdf","md5":"…","contentType":"application/pdf","size":576042,…}`.
   The S139 assumption of "a hosted URL + content-type" is **wrong**. 🔴 **OPEN: find the attachment
   download endpoint** (likely `…/attachments/{id}` or a signed-URL mint) before Phase 3 can run.

### Auth model — CORRECTED + SOLVED

- `credentials:'include'` **breaks every call** (CORS: wildcard ACAO + credentials → browser blocks →
  `TypeError: Failed to fetch`). **Send NO credentials.** This was the single blocker that made S139's
  "naive replay fails" conclusion look like a header problem. Headers needed are just:
  `accept`, `authorization: Bearer <jwt>`, `x-kenect-calling-service: Web:1.2710.0`.
- The token **cannot be lifted by in-page JS interception**: the app fires authenticated HTTP only during
  initial page load (before any injectable hook), then serves the UI from cache/websocket, so no live
  main-thread `fetch`/XHR ever carries the token again. Patching `fetch`/XHR/`Headers`/`Request`
  post-load captures **nothing**. Do not retry this path.
- Direct top-level navigation to an API URL → **401** (no cookie auth).
- ✅ **SOLVED — self-refreshing tokens.** Kenect auth is **Firebase** (`securetoken.google.com/kenect-ui`);
  the JWT lives **1 hour** (`iat`→`exp` = 3600s). The refresh token + apiKey sit in **IndexedDB**:
  db `firebaseLocalStorageDb` → store `firebaseLocalStorage` → key
  `firebase:authUser:<apiKey>:[DEFAULT]` → `value.stsTokenManager.{refreshToken, expirationTime}`
  (apiKey `AIzaSyBg_fQbY56_USy3VpGWOWDGrY5qhTPFJ_k`, userId `130333`). Mint a fresh token with:
  `POST https://securetoken.googleapis.com/v1/token?key=<apiKey>`
  body `grant_type=refresh_token&refresh_token=<refreshToken>` → `{id_token, refresh_token, expires_in:3600}`.
  **Verified working S140.** So the extractor can self-renew and run unattended — no hourly DevTools ask.
  Bootstrap only: token must be seeded once (DevTools → Network → any api row → Copy as cURL), OR
  read the refresh token straight from IndexedDB at run start (preferred — fully self-service).
- 🔒 The token/refresh token are **credentials — never commit them to the repo.** Keep in page memory only.

### Endpoint corrections / additions

| Purpose | Reality |
|---|---|
| Conversation list | `v2/conversations` returns `{conversations:[{group:"0:YYYY-MM-DD", conversations:[{id,updatedAt}]}], contacts:{contactId:ts}}` — **grouped by date, id+updatedAt only**, no bodies, no totals. `offset`/`limit` query params **do** work here (unlike contacts). |
| Conversation ids by contact | `GET inbox.kenect.com/api/v1/conversations?contactIds={id}&limit=25` → `[{id, updatedAt}]` |
| Batch detail (NEW) | `GET inbox.kenect.com/api/v1/conversations/{comma,separated,ids}` — the app batches ~25 ids/call. Use this instead of N single calls. |
| Batch contacts (NEW) | `GET location.kenect.com/api/v1/contact/list/{comma,separated,ids}` — app batches ~25 ids/call. |
| Messages | `GET inbox.kenect.com/api/v1/conversations/{id}/messages?limit=25&offset=N` — confirmed working, 25/page. |

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

**CLOSED by Phase 0 (S140) — see §0b:**
- ~~Confirm the complete `locationIds` set~~ → **ONE location, `10631`.**
- ~~Confirm real `attachments[]` shape~~ → **`{id,name,md5,contentType,size,createdAt,updatedAt}` — NO URL.**
- ~~Get the true counts~~ → **3,093 contacts · 3,200 conversations (2,073 open + 1,127 archived) · ~30k–115k messages.**
- ~~JWT longevity / one sitting vs. chunks~~ → **Self-refresh via Firebase refresh token works; run unattended.**

**STILL OPEN — resolve at Phase 1/3 start:**
- 🔴 **Attachment download endpoint** — `attachments[]` has no URL, only an `id`. Must discover how the
  app fetches attachment bytes (watch DevTools Network while opening an MMS/PDF thread; look for
  `…/attachments/{id}` or a signed-URL mint). **Phase 3 is blocked until this is known.**
- ⚠️ **Media storage budget** — ~13,600 attachments extrapolated; sample was 576 KB → possibly **2–7 GB**
  into Supabase Storage. Roland to confirm appetite, or scope media to text-only + high-value threads.
- Concurrency/rate limits unknown — no 429s seen at ~31 sequential contact pages, but ramp carefully.
- The one 327-message thread proves deep threads exist — messages pagination must page to exhaustion.

---

## 8. Delta pull before cutover (Roland directive, S140)

New Kenect leads/messages will keep landing until the PB cutover. The S140 pull is a **point-in-time
snapshot**; a **second delta pull is required within a few days of cutover** (and before the 🔴 2026-07-24
access end). Roland already has a **contacts CSV current to 3:00 PM 2026-07-15** as the roster baseline.
Delta strategy: re-run the extractor and reconcile on `conversations.updatedAt` / message `sentAt` newer
than the last run, or diff a fresh contacts CSV for new leads.
