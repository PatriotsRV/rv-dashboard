# PRVS Dashboard — Release Notes
## v1.265 — 2026-03-20

---

### 🗂 Files Changed
| File | Change |
|---|---|
| `index.html` | RO Description bug fixes (4), mobile filter fix, calendar re-auth |
| `solar.html` | PDF quote generation + email attachment |
| `supabase/functions/send-quote-email/index.ts` | PDF attachment support via nodemailer |

---

### 📄 Solar Quote — PDF Generation & Email Attachment

Quotes sent from the Solar dashboard now arrive as a **proper branded PDF attachment** instead of plain text in the email body.

**What changed:**

- Added `generateQuotePdf()` using jsPDF 2.5.1 + jspdf-autotable 3.5.31 (loaded from Cloudflare CDN). PDF is generated client-side and converted to base64 before sending.
- `sendQuoteEmail()` includes the base64 PDF in the API payload; the Supabase Edge Function attaches it via nodemailer as `PatriotsRV-Quote-XXXX.pdf`.
- The email body is now a brief intro with "see attached PDF" — no more pre-formatted text block.
- The email modal preview was updated to show a clean PDF card UI instead of the raw text preview.

**PDF layout — Page 1:**
- Patriots RV logo (24×24 mm, correct square aspect ratio — was stretched 2:1 previously)
- Company header with red divider
- Quote number, RO number, customer info block
- Line items table (jspdf-autotable)
- Parts Subtotal, Install Labor, Configuration, and Grand Total drawn in downward flow with a page-overflow check — totals can no longer overlap the items table or get clipped off-page
- Fixed footer at bottom of page

**PDF layout — Page 2:**
- Mini company header
- Assumptions & Notes (gray box)
- Additional Notes (free-text quoteNotes field)
- Terms & Acceptance (quoteTerms field)
- Signature block anchored at `pageH - 102` mm (was `pageH - 68`, which caused the deposit box to overflow off the page)
- Deposit / payment box

If jsPDF fails to load or throws, the email sends without the attachment rather than blocking delivery (silent fallback with console warning).

---

### 🔧 RO Description — Four Bug Fixes

Users reported that the Repair Description field would disappear or fail to save. Root cause was four separate issues, all now resolved.

#### Fix 1 — Inline edit connection check (`editField`)
`editField()` was checking `if (!accessToken)` where `accessToken` is the Google OAuth token, which can be `null` even when a valid Supabase session is active. This produced a false "Please connect to PRVS database first!" popup when users tried to edit inline.

**Fix:** Changed the guard to `if (!getSB())`, which correctly reflects whether the Supabase client is ready.

#### Fix 2 — Missing field in `updateFieldInSupabase` fieldMap
`repairDescription` was not mapped to a database column in the `fieldMap` object inside `updateFieldInSupabase()`. Clicking the inline edit pencil appeared to work but the `description` column in Supabase was never written to.

**Fix:** Added `repairDescription: 'description'` to the fieldMap.

#### Fix 3 — Edit RO modal silently nulling the description
`updateROInSupabase()` always included `description: formData.repairDescription || null` in its Supabase update payload. Because the Edit RO modal had no description field, `formData.repairDescription` was always `undefined`, which evaluated to `null` — wiping the stored description every time any other field (phone, technician, promised date, etc.) was saved through the modal.

**Fix:** Changed to a conditional fallback:
```js
description: formData.repairDescription !== undefined
    ? (formData.repairDescription || null)
    : (ro.repairDescription || null),
```
If the form didn't include a description field, the existing database value is preserved.

#### Fix 4 — Repair Description field added to Edit RO modal
The Edit RO modal was missing a description input entirely, making it impossible to set or update the description through the modal.

**Fix:**
- Added a `<textarea id="editRepairDescription">` to the Edit RO modal form (between Customer Address and Repair Type)
- `openEditRO()` now pre-fills it with `ro.repairDescription`
- The form submit handler collects it and includes it in `formData`
- Added `repairDescription: 'Repair Description'` to the audit diff field labels so description changes are tracked in the audit log

---

### 📱 Mobile — Status Filter Buttons Cut Off

On iPhone, the "Ready for Pickup" and "Delivered/Cashed Out" status filter buttons were not visible — they were being clipped by a `max-height: 300px` cap on the collapsible filter panel. With 10 status buttons at mobile font size wrapping across multiple rows, 300px wasn't enough.

**Fix:** Increased `.filter-collapsible.open` max-height from `300px` to `600px`. All filter buttons now render fully on mobile.

---

### 📅 Calendar Scheduling — Re-authorization Flow

When a user's Google OAuth token expires (happens after ~1 hour), the Schedule RO modal was showing a misleading "Connect to PRVS first" warning (the user IS connected via Supabase) and still allowing the Schedule button to be clicked, resulting in a silent failure with "Failed to create calendar events."

**What changed:**

- Warning message corrected to "Google Calendar access has expired. Re-authorize to create events."
- Schedule button renders grayed-out and disabled when `accessToken` is null — users can no longer attempt a doomed calendar request
- Silent refresh (`prompt:''`) replaced with `prompt:'consent'` to force the interactive Google OAuth popup when token is fully expired
- Added `reauthorizeCalendar(filteredIndex)` named function that stores the pending schedule index and triggers the OAuth flow
- Added `_pendingScheduleIndex` global so the RO index survives the async OAuth round-trip
- Token client callback now detects a pending re-auth: after the token arrives, it automatically closes the stale modal and re-opens it fresh with the Schedule button enabled
- Status feedback in the warning banner updates to "⏳ Opening Google authorization…" while the popup is loading

**Flow after fix:** Tap Re-authorize → Google popup → authorize → modal auto-reopens with Schedule enabled → tap Schedule → event created ✅

---

### ⚠️ Known / Non-Issues
- `favicon.ico 404` — no favicon file present; cosmetic only
- `'nonce' parameter` Google Sign-In warning — future Chrome 145 API change; no current impact
- `web-client-content-script.js` errors — LastPass browser extension, not dashboard code
- Supabase `users` 406 on login — non-blocking role check; app loads and functions correctly
