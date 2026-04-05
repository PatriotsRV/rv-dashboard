# PRVS Dashboard — Release Notes
## v1.266 — 2026-03-20

---

### 🗂 Files Changed
| File | Change |
|---|---|
| `index.html` | Error handling + audit logging for 5 write functions |

---

### 🔧 Write Function Hardening — Error Handling & Audit Logging

A comprehensive audit of all Supabase write operations was performed. Five functions were missing error propagation and/or audit log entries. All are now fixed.

#### `updateFieldInSupabase` — Error handling on all writes

All three database writes in `updateFieldInSupabase` (the `repair_orders` update and the two `notes` inserts for `roStatusNotes` and `customerCommunicationNotes`) now destructure the Supabase error and throw immediately if one is returned. Previously, errors were silently swallowed — the function would return normally even if the write failed, leaving the UI out of sync with the database.

```js
// Before
await getSB().from('repair_orders').update({...}).eq('id', supabaseId);

// After
const { error: fieldErr } = await getSB().from('repair_orders').update({...}).eq('id', supabaseId);
if (fieldErr) throw fieldErr;
```

Same pattern applied to both `notes` inserts (`notesErr`, `commErr`).

#### `updateROStatus` — Error handling + audit log

The `repair_orders` update in `updateROStatus` now checks for an error and throws. An audit log entry is also written after a successful update, capturing `status`, `percentComplete`, and `dateArrived` (if auto-set) with correct old → new values.

```js
const auditChanges = [{ field: 'status', oldValue: ro.status, newValue: newStatus }];
if (autoProgress !== ro.percentComplete) auditChanges.push({ field: 'percentComplete', ... });
if (autoDateArrived) auditChanges.push({ field: 'dateArrived', ... });
await writeAuditLog(ro.roId, auditChanges);
```

`ro` is captured from `currentFilteredData` before any mutation, so `oldValue` is always the pre-change value.

#### `updateROUrgency` — Audit log added

An audit log call is now written after a successful Supabase urgency update. `ro` is captured from `currentFilteredData` before mutation so the old urgency value is correct.

```js
await writeAuditLog(ro.roId, [{ field: 'urgency', oldValue: ro.urgency, newValue: newUrgency }]);
```

#### `updateROProgress` — Audit log added

Same pattern as urgency — audit log written after confirmed Supabase write with correct old/new `percentComplete` values.

#### `updatePhotoInSupabase` — Error handling added

```js
const { error: photoErr } = await getSB().from('repair_orders').update({...}).eq('id', supabaseId);
if (photoErr) throw photoErr;
```

Callers of `updatePhotoInSupabase` already have try/catch blocks, so the thrown error will surface correctly.

---

### ✅ Photo Migration Bug — Confirmed Not an Issue

A previous audit flagged `photoJobs.push({ roId: ro.id, ... })` as potentially using the PRVS string ID instead of the Supabase UUID. On re-inspection, `ro.id` in this context IS the Supabase UUID primary key (the PRVS string ID is `ro.ro_id`). The `.eq('id', job.roId)` calls at lines 4835 and 4845 are correct. No change needed.

---

### 📋 Audit Log Coverage — Current State

| Function | Audit log? |
|---|---|
| `updateROInSupabase` (Edit RO modal) | ✅ Yes |
| `updateROStatus` | ✅ Yes (added v1.266) |
| `updateROUrgency` | ✅ Yes (added v1.266) |
| `updateROProgress` | ✅ Yes (added v1.266) |
| `scheduleRO` | ✅ Yes (status → Scheduled) |
| `appendToSupabase` (new RO) | ✅ Yes |
| `updatePhotoInSupabase` | ❌ Not tracked (photo URL changes not audited — low priority) |
| `updateFieldInSupabase` (notes fields) | ❌ Not tracked (append-only notes, not audited — low priority) |

---

### ⚠️ Known / Non-Issues
- `favicon.ico 404` — no favicon file present; cosmetic only
- `'nonce' parameter` Google Sign-In warning — future Chrome 145 API change; no current impact
- `web-client-content-script.js` errors — LastPass browser extension, not dashboard code
- Supabase `users` 406 on login — fixed in v1.265 (`.maybeSingle()`)
