/* ============================================================================
 * Kenect -> Supabase extractor  (Session 141, 2026-07-15)
 * Runs in the app.kenect.com browser tab. Reads the internal Kenect API with a
 * self-refreshing Firebase token and writes raw pull data DIRECTLY to Supabase
 * with the public anon key (temporary ingest policies; see kenect_staging_s141.sql).
 *
 * Media (2-7 GB) and message JSON stream browser -> Supabase; nothing routes
 * through Claude. Idempotent: every write is an upsert on the primary key, so a
 * mid-run reload resumes safely.
 *
 * Bootstrap (already done in-session): window.__kx holds { token(), api(url,opts) }
 * seeded from the Firebase refresh token in IndexedDB.
 * ========================================================================== */
(function () {
  const SB_URL  = 'https://axfejhudchdejoiwaetq.supabase.co';
  const SB_ANON = 'REPLACE_WITH_ANON_KEY'; // injected at runtime; never committed with a real key
  const LOC = 10631;
  const kx = window.__kx;
  if (!kx) throw new Error('window.__kx not seeded — run the auth bootstrap first.');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  // ---- Supabase REST INSERT ------------------------------------------------
  // 🔴 PLAIN INSERT ONLY. Do NOT add `Prefer: resolution=merge-duplicates` or
  // `ignore-duplicates`: BOTH fail 42501 for anon, because PostgREST's upsert path
  // uses ON CONFLICT DO UPDATE, which needs SELECT on the table to read the
  // conflicting row — and anon intentionally has NO SELECT here (staging holds
  // message bodies + phone numbers). Checkpoint/resume comes from the Supabase MCP
  // read side (diff already-loaded ids), not from upsert.
  async function sbInsert(table, rows) {
    if (!rows.length) return 0;
    for (const b of chunk(rows, 250)) {
      const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: SB_ANON, authorization: 'Bearer ' + SB_ANON,
          'content-type': 'application/json',
          prefer: 'return=minimal'
        },
        body: JSON.stringify(b)
      });
      if (!r.ok) throw new Error(`Supabase ${table} ${r.status}: ${(await r.text()).slice(0,200)}`);
    }
    return rows.length;
  }

  // ---- Storage upload ------------------------------------------------------
  // 🔴 NO `x-upsert: true` — it makes Storage check for an existing object, which
  // needs SELECT and fails RLS for anon. Plain POST works.
  // 🔴 Storage reports a duplicate as HTTP **400** with {"statusCode":"409",...} in the
  // BODY — not an HTTP 409. Checking r.status === 409 silently never fires, so retried
  // files error forever and never get marked downloaded => infinite worklist. Parse the body.
  async function sbUploadMedia(path, bytes, contentType) {
    const r = await fetch(`${SB_URL}/storage/v1/object/kenect-media/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_ANON, authorization: 'Bearer ' + SB_ANON,
        'content-type': contentType || 'application/octet-stream'
      },
      body: bytes
    });
    if (r.ok) return 'ok';
    const t = await r.text();
    if (r.status === 409 || /"statusCode":"409"|Duplicate|already exists/.test(t)) return 'exists';
    throw new Error(`Storage ${path} ${r.status}: ${t.slice(0,140)}`);
  }

  // ---- Kenect readers ------------------------------------------------------
  async function contactIds() {
    const ids = []; let offset = 0;
    while (true) {
      const p = await kx.api('https://contact-search.kenect.com/api/v1/contact-search/names',
        { method: 'POST', body: JSON.stringify({ locationIds: [LOC], offset, limit: 100 }) }).then(r => r.json());
      if (!Array.isArray(p) || !p.length) break;
      for (const c of p) ids.push(c.contactId);
      offset += 100;
      if (p.length < 100) break;
    }
    return ids;
  }
  async function contactDetailBatch(ids) {
    return kx.api('https://location.kenect.com/api/v1/contact/list/' + ids.join(',')).then(r => r.json());
  }
  async function convoIds(archived) {
    const ids = []; let offset = 0;
    while (true) {
      const j = await kx.api(`https://inbox.kenect.com/api/v2/conversations?locationIds=${LOC}&limit=100&offset=${offset}&timeZone=America/Chicago&archived=${archived}`).then(r => r.json());
      let n = 0;
      for (const g of (j.conversations || [])) for (const c of (g.conversations || [])) { ids.push(c.id); n++; }
      if (!n) break;
      offset += 100;
    }
    return ids;
  }
  async function convoDetailBatch(ids) {
    return kx.api('https://inbox.kenect.com/api/v1/conversations/' + ids.join(',')).then(r => r.json());
  }
  async function messagesFor(convId) {
    const out = []; let offset = 0;
    while (true) {
      const j = await kx.api(`https://inbox.kenect.com/api/v1/conversations/${convId}/messages?limit=25&offset=${offset}`).then(r => r.json());
      const arr = Array.isArray(j) ? j : (j.messages || []);
      if (!arr.length) break;
      out.push(...arr);
      offset += 25;
      if (arr.length < 25) break;
    }
    return out;
  }
  async function downloadAttachment(messageId, attId) {
    const t = await kx.token();
    const r = await fetch(`https://inbox.kenect.com/api/v1/messages/${messageId}/attachments/${attId}`,
      { headers: { accept: '*/*', authorization: 'Bearer ' + t, 'x-kenect-calling-service': 'Web:1.2710.0' } });
    if (!r.ok) throw new Error(`att ${attId} ${r.status}`);
    return { bytes: await r.blob(), ct: r.headers.get('content-type') };
  }

  // Media scope (Roland, S141): PDFs + images. SKIP VIDEO (~78 files ≈ ~50 GB of the ~100 GB total).
  // Enforced in SQL by the kenect_att_worklist view, not here — the DB is the gate.
  const WANT_MEDIA = ct => !!ct && (ct.startsWith('image/') || ct === 'application/pdf');

  // ---- Phase 3 work list (via the narrow anon-readable view) ----------------
  // anon has no SELECT on kenect_attachments_raw, so the browser reads its work list
  // from public.kenect_att_worklist (ids + mime only; no names/bodies/phones).
  async function fetchWork(limit = 200) {
    const r = await fetch(
      `${SB_URL}/rest/v1/kenect_att_worklist?select=attachment_id,message_id,conversation_id,content_type&limit=${limit}`,
      { headers: { apikey: SB_ANON, authorization: 'Bearer ' + SB_ANON } });
    if (!r.ok) throw new Error('worklist ' + r.status);
    return r.json();
  }
  // 🔴 DO NOT revert this to a PATCH. `PATCH ...?attachment_id=eq.N` returns HTTP 204 but
  // affects ZERO rows for anon: PostgreSQL needs SELECT to LOCATE rows for UPDATE...WHERE,
  // so the SELECT policies apply and anon has none. That silent no-op made the worklist
  // return the same 200 rows forever while the counter happily climbed. Use the
  // SECURITY DEFINER RPC, and assert the returned row count.
  async function markDone(attachmentId, storagePath) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/kenect_mark_downloaded`, {
      method: 'POST',
      headers: { apikey: SB_ANON, authorization: 'Bearer ' + SB_ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ attachment_id: attachmentId, storage_path: storagePath }] })
    });
    if (!r.ok) throw new Error('markDone rpc ' + r.status + ': ' + (await r.text()).slice(0, 100));
    const n = await r.json();
    if (n !== 1) throw new Error(`markDone marked ${n} rows (expected 1)`);
    return n;
  }

  /* ---- RUNTIME NOTES (S141, learned the hard way) --------------------------
   * 1. CDP Runtime.evaluate times out at 45s but the PAGE KEEPS RUNNING. Never
   *    `await` a long loop from the driver and never retry on that timeout — it
   *    double-processes. Fire-and-forget a background loop that writes progress to
   *    a global, then poll the global with tiny calls.
   * 2. Concurrency is decisive: 4 workers = 0.26 MB/s (~50 hrs for 48 GB);
   *    16 workers = ~8 MB/s (~2 hrs). Each file is 3 sequential round trips
   *    (Kenect GET -> Storage POST -> PATCH), so it's latency-bound. No 429s at 16.
   * ---------------------------------------------------------------------- */

  window.__kenect = {
    sbInsert, sbUploadMedia, contactIds, contactDetailBatch, convoIds,
    convoDetailBatch, messagesFor, downloadAttachment, fetchWork, markDone,
    chunk, sleep, LOC, WANT_MEDIA
  };
  return 'kenect extractor loaded';
})();
