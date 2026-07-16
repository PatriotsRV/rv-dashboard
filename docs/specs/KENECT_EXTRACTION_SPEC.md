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
   The S139 assumption of "a hosted URL + content-type" is **wrong**. ✅ **RESOLVED S141 — attachment
   download endpoint found:** `GET inbox.kenect.com/api/v1/messages/{messageId}/attachments/{attachmentId}`
   returns the **raw file bytes** (not JSON, not a signed URL) with the correct `Content-Type` and
   `Content-Length`. Verified S141: msg `379000675` / att `44263837` → 200, `application/pdf`, 576042 bytes,
   magic `%PDF-`. Same Bearer + `x-kenect-calling-service: Web:1.2710.0` headers, `accept: */*`, NO credentials.
   Note the id in the path is the **messageId**, not the conversationId. Phase 3 is UNBLOCKED.

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

## 0c. SESSION 141 — BUILD RESULTS + corrections to Phase 0

**Status:** Phases 1 + 2 RUN LIVE. Auth, endpoints, and write path all validated against production.

### Write-path architecture (NEW S141 — the load-bearing design decision)

The extractor runs **in the app.kenect.com tab** and writes **directly to Supabase** with the public
anon key, so tens of GB of media + ~127k messages never route through Claude's context.
This required TEMPORARY anon ingest grants (`supabase/migrations/kenect_staging_s141.sql`;
revoked by `kenect_staging_teardown_s141.sql`). Supabase MCP is **read-only** — Roland runs migrations.

🔴 **PostgREST upsert is UNUSABLE for anon here — use plain INSERT.** `Prefer: resolution=merge-duplicates`
**and** `ignore-duplicates` BOTH fail with `42501 new row violates row-level security policy`, because
PostgREST's upsert path issues `ON CONFLICT DO UPDATE`, which requires **SELECT** on the target table to
read the conflicting row. We deliberately grant anon **no SELECT** (staging holds message bodies + phone
numbers — granting anon read would recreate the exact leak S134 closed). Same trap in Storage:
**`x-upsert: true` fails**; a plain POST succeeds. Verified: anon SELECT returns `200 []` (RLS filters all
rows) — the security invariant holds while ingest works.
**Idempotency/checkpointing therefore comes from the Supabase MCP read side** (count/diff loaded ids and
skip them), NOT from upsert. Anon UPDATE *does* work (204) — used for Phase 3 `downloaded`/`storage_path`.

### Corrections to the Phase 0 (S140) estimates

| Metric | S140 estimate | S141 ACTUAL |
|---|---|---|
| Contacts | 3,093 | ✅ **3,093 confirmed** (all 3,093 have a phone → phone_key dedupe viable; 1,319 carry a Lightspeed `externalId`) |
| Conversations | 3,200 | ✅ **3,200 confirmed** (2,073 open + 1,127 archived) |
| Messages | ~30k–115k | **~127k projected** (~40/convo measured over the first 472 threads) |
| Deepest thread | 327 msgs | **426 msgs** — page to exhaustion, never assume a cap |
| Attachments | ~13,600 | **~21,800 projected** |
| Attachment avg size | 576 KB (single sample) | **~3 MB** — the single-PDF sample was badly unrepresentative |
| **Total media** | **2–7 GB** | 🔴 **~50–100 GB** — an order of magnitude over the estimate |

**Media breakdown (measured, projected to 3,200 threads):** video ~78 files @ ~27 MB avg → **~50 GB**;
images ~1,318 @ ~1.5 MB → **~48 GB**; PDFs ~48 @ ~536 KB → **~0.6 GB**.
⇒ **~78 video files are ~half of all media volume.** Roland's revised S141 decision: **PDFs + images, SKIP VIDEO.**
(Supabase Pro includes 100 GB; full media would sit at/over the limit and likely not finish before 7/24.)

### Endpoint additions confirmed S141

- **Attachment bytes:** `GET inbox.kenect.com/api/v1/messages/{messageId}/attachments/{attachmentId}`
  → raw bytes + correct `Content-Type`/`Content-Length`. Path id is the **messageId**, not conversationId.
- **Batch contact detail:** `GET location.kenect.com/api/v1/contact/list/{ids}` (25/call) already returns
  `phoneNumbers`, `externalId`, `source`, `optInStatus`, `groups`, `primaryEmail` — so the separate
  per-contact `?enrichContact=true` call and the `hub.kenect.com/fetch-external-id-list` call are
  **both unnecessary**. Phase 1 = names paging + this batch endpoint only.
- **Batch conversation detail:** `GET inbox.kenect.com/api/v1/conversations/{ids}` → object **keyed by
  conversationId** (not an array).
- No rate limiting observed at ~2 conversations/sec sustained; 0 errors across contacts + conversations.

### Runtime gotchas that cost real time (S141)

1. **CDP `Runtime.evaluate` times out at 45s — but the page keeps running.** A long `await`ed loop
   returns a timeout ERROR while the work actually completes. Do **not** retry on that error (it
   double-processes). Correct pattern: **fire-and-forget a background loop** that writes progress to a
   global (`window.__K.p2b` / `.p3`), then poll it with tiny, fast calls.
2. **Storage reports duplicates as HTTP 400 with `{"statusCode":"409","error":"Duplicate"}` in the BODY**,
   *not* an HTTP 409. A `r.status === 409` check silently never fires, so already-uploaded files error
   forever and never get marked `downloaded` ⇒ infinite worklist. Parse the **body**, treat as success.
   (Occurs whenever a run is interrupted between the upload and the `downloaded=true` PATCH.)
3. **Media concurrency matters enormously.** 4 workers = **0.26 MB/s** (~50 hrs for 48 GB — would have
   missed the 7/24 deadline). 16 workers = **~8 MB/s** (~2 hrs). Each file costs 3 sequential round trips
   (Kenect GET → Storage POST → PATCH), so it is latency-bound, not bandwidth-bound. No 429s at 16.
4. **Phase 2 and Phase 3 run concurrently and safely** — different hosts; Phase 3 polls the worklist view
   and idles 4s when it is empty but Phase 2 is still adding rows.
5. 🔴🔴 **THE BIG ONE — `UPDATE ... WHERE` silently affects ZERO rows for anon, and returns HTTP 204.**
   PostgreSQL needs SELECT to *locate* rows for an UPDATE with a WHERE clause, so the **SELECT policies
   apply** — and anon has none. PostgREST reports this as a cheerful `204 No Content`. **A 204 does NOT
   mean rows changed.** Symptom: uploads succeeded, `filesDone` climbed to 1,486, throughput looked like
   a healthy 7–8 MB/s… while Storage held only **200 objects**. Because nothing was ever marked
   `downloaded`, the worklist returned **the same 200 rows on every fetch** and the pool re-downloaded
   them forever. The in-memory counter was measuring its own treadmill.
   - **Tell:** `Object.keys(attempts).length` pinned at exactly the worklist page size (200).
   - **Diagnosis:** re-issue the PATCH with `Prefer: count=exact` and read `Content-Range` → `*/0`.
   - **Fix:** `public.kenect_mark_downloaded(items jsonb)` — SECURITY DEFINER RPC, runs as owner,
     bypasses base-table RLS, can only set `downloaded`/`storage_path`. It **returns the row count**, and
     the extractor throws if it isn't 1. Never trust a bare 204 again.
   - **Generalisation:** with no SELECT for anon, *anything that must read a row first* (upsert,
     `UPDATE ... WHERE`, Storage `x-upsert`) is a silent no-op or an error. Writes are blind: they must be
     plain INSERTs, or go through a SECURITY DEFINER RPC.
6. **Always verify progress against the DB, not in-memory counters.** Every real bug in this build was
   invisible in the extractor's own numbers and obvious in one `count(*)`. The invariant that matters:
   `count(*) where downloaded=true` == `count(*) from storage.objects`.
7. **`DELETE FROM storage.objects` is BLOCKED** — Supabase's `storage.protect_delete()` trigger raises
   *"Direct deletion from storage tables is not allowed. Use the Storage API instead."* Because the SQL
   editor runs a script as **one transaction**, a single such line **rolls back the entire migration** (this
   silently no-op'd the whole teardown on the first attempt). Never put a storage-row delete in a migration;
   delete objects via the Storage API/UI. Corollary: the all-or-nothing behaviour is also a safety net —
   verify with a follow-up query whether a failed script applied *anything*.
8. **Storage eTags are NOT md5 for multipart uploads.** Files above the multipart threshold (~17 MB here)
   get an eTag of the form `<md5-of-md5s>-<partcount>` (note the `-2` suffix). An md5 integrity check will
   report these as false mismatches — fall back to comparing byte size.

---

## 1. Locked decisions (Roland, Session 139)

| Decision | Choice |
|---|---|
| Kenect status | Active but **cancelling soon** — time-critical |
| Destination | **Merge into live inbox** — `conversations` / `conversation_events`, `source='kenect_import'`, imported threads `status='closed'` (hidden by the messages.html v1.4 default "Open" filter, visible under "All" + per-customer history) |
| Media | **Text + PDFs + images; SKIP VIDEO** (REVISED S141 on real data — see §0c). Originally "text + media" when media was thought to be 2–7 GB; the true volume is ~50–100 GB, with ~78 video files alone accounting for ~50 GB. Roland's S141 call: keep photos + paperwork, drop video. |
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
- 🔴 **TRANSFORM TARGET CORRECTED (S141) — the plan below was written against a schema that does not exist.**
  Verified against the live DB:
  - **`conversation_events` is an AUDIT table, NOT a message store.** Columns: `conversation_id, event,
    actor_email, old_value, new_value, created_at`. It has **no body / direction / media columns**, so
    "insert each message as a conversation_events row" is impossible. Use it only for import provenance
    events if desired.
  - **Messages belong in `public.messages`**: `direction ('inbound'|'outbound'), phone_to, phone_from, body,
    media_url (text[]), context, sent_by, created_at, ro_id/ro_code, message_handle, status`.
  - **`conversations` has NO `source` column** — so the locked `source='kenect_import'` decision needs either
    a new column (`alter table conversations add column source text default 'projectblue'`) or a different
    marker. `messages.context` (text, already present) is the natural per-message marker: `context='kenect_import'`.
  - **Messages are linked to a thread BY PHONE, not by FK.** `js/messaging.js` matches
    `phone_to.eq.<phone>` / `phone_from.eq.<phone>`; `messages.html` derives `phone_key` from
    `direction==='inbound' ? phone_from : phone_to`. `phone_key` = **digits-only last-10**.
    So the transform must write correct `phone_to`/`phone_from` — nothing else wires a message to a thread.
  - ⚠️ **`messages` has no external-id unique constraint**, so a re-run (or the 7/21 delta) would create
    DUPLICATES. Before Phase 4: add a nullable `kenect_message_id bigint unique` (or reuse `message_handle`
    with a `kenect:` prefix + unique index) and insert with conflict-do-nothing.
- **Transform → live inbox (revised):** for each Kenect conversation, resolve the contact's primary phone →
  `phone_key`; upsert the `conversations` row (`status='closed'`, `customer_name` from `displayName`,
  `last_message_at`/`last_direction` from the newest message); insert each Kenect message into `messages`
  with `direction` from `outbound`, `body`, `created_at = sentAt`, `context='kenect_import'`, and
  `media_url` = the re-hosted `kenect-media` paths for that message.
- **Dedupe:** if a `phone_key` already exists (PB-era conversation), attach the Kenect events to that thread
  rather than creating a duplicate — Kenect history slots in *before* the PB history chronologically.
- Verify counts against the Kenect UI on a handful of known customers before declaring done.

---

## 5b. ✅ VERIFICATION RESULTS — Session 141 (the rescue is COMPLETE and verified)

| Check | Kenect (live) | Staged | Result |
|---|---|---|---|
| Contacts | 3,093 | 3,093 | ✅ |
| Conversations | 3,200 (2,073 open + 1,127 archived) | 3,200 (2,073 + 1,127) | ✅ |
| Messages | — | **56,279** across all 3,200 threads (every thread has ≥1) | ✅ |
| Media in scope (PDF+image) | 7,756 | 7,756 downloaded · **0 pending · 0 failed** | ✅ |
| Storage objects / bytes | — | 7,756 · **9,827 MB** — byte-for-byte equal to the sum of Kenect-reported sizes | ✅ |
| Video (deliberately skipped) | 608 files / 8,033 MB | not pulled | per S141 decision |

- **md5 integrity: 7,754 / 7,756 exact matches** (Kenect `attachments[].md5` vs the md5 Storage computed on the
  stored bytes). The **2 "mismatches" are NOT corruption** — the stored eTag ends `-2`, the S3 **multipart**
  eTag format (md5-of-md5s + part count), which is not a content md5. Both are the same 17.4 MB image sent to
  two conversations; sizes match exactly (17,429,703 B). ⇒ **zero corrupt files.**
- **Live message-count spot-check: 12/12 MATCH** — re-queried straight from Kenect and compared to staging,
  covering the six deepest threads (2087, 619, 475, 426, 426, 413) and six random threads (12, 5, 5, 5, 3, 1).
- **Real totals vs S140 projections:** messages came in at **56,279**, well under the ~127k extrapolated from
  the first (busiest) threads — the early sample skewed high. In-scope media was **9.8 GB**, far below the
  ~48 GB feared, because excluding video removed the bulk of the volume.

⚠️ **Still exposed until Phase 4:** the raw pull is safe in staging, but the **7/21 delta pull is still required**
(new leads/messages keep landing until PB cutover; access dies **2026-07-24**).

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
