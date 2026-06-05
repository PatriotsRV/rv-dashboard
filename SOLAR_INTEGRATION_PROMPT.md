# Prompt for External Claude Session — Adjust `solar.html` for Integration into PatriotsRV/rv-dashboard

> **How to use this file:** Paste everything below the horizontal rule into the other tech's Claude session as a single message. Attach the advanced `solar.html` file in the same turn. The external Claude will produce an adjusted `solar.html` ready for drop-in integration.

---

# SOLAR.HTML — INTEGRATION ADJUSTMENTS FOR THE PATRIOTSRV/RV-DASHBOARD PROJECT

## Context (read first)

You are adjusting a self-contained `solar.html` page so it can drop into an existing static-HTML web app called the **PRVS RO Dashboard** (GitHub repo `PatriotsRV/rv-dashboard`, deployed via GitHub Pages from the `main` branch). The receiving project is a Supabase + Google SSO + vanilla-HTML application used by Patriots RV Services to manage repair orders, parts, work orders, and analytics. There is already a `solar.html` v2.0 live in production; you are replacing it with the more advanced version attached to this conversation.

Your job is **not** to rewrite the advanced solar.html — preserve its features and UX. Your job is to adjust the auth, schema, security, and file conventions so it integrates cleanly. After your changes the file should drop in as `/solar.html` at the repo root and work end-to-end as soon as the receiving developer fills in the credential placeholders you'll leave behind.

## Deliverable

A single self-contained `solar.html` file (no external CSS or JS files; all code inline; React + Babel-standalone CDN imports are fine) that:

- Drops in as `/solar.html` at the repo root.
- Authenticates against Supabase + Google OAuth using **placeholders** the receiving developer fills in.
- Persists Supabase auth across reloads with a `storageKey` unique to this file.
- Uses the **canonical `repair_orders` schema** (see below) — the existing v2.0 has a latent bug here that you must NOT replicate.
- Follows the project's security, RBAC, and UI conventions described below.
- Includes a self-check section in the file header showing every requirement was verified.

---

## HARD REQUIREMENTS

### 1. Credentials — placeholders only, never real values

Do **not** hard-code real Supabase keys, OAuth client IDs, or shared secrets. The receiving developer will fill these in after delivery. Use these exact placeholder strings so they're trivial to grep:

```javascript
const SUPABASE_URL         = 'CONFIG_TODO_SUPABASE_URL';            // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY    = 'CONFIG_TODO_SUPABASE_ANON_KEY';
const GOOGLE_CLIENT_ID     = 'CONFIG_TODO_GOOGLE_CLIENT_ID';
const PRVS_FUNCTION_SECRET = 'CONFIG_TODO_PRVS_FUNCTION_SECRET';    // only if calling edge functions that require X-PRVS-Secret
```

Near the top of the `<script>` block, add a `<!-- CONFIG_TODO checklist -->` comment listing every placeholder so the receiving developer has one grep to find them all.

### 2. Supabase auth — match project pattern exactly

Use these auth options. The `storageKey` MUST be unique to `solar.html` so it doesn't collide with the dashboard's other pages (which use `prvs_supabase_auth`, `prvs_checkin_auth`, etc.):

```javascript
const SB_AUTH_OPTIONS = {
    auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        storageKey:         'prvs_solar_auth',
        detectSessionInUrl: true,
    }
};
```

Auth flow:
1. On page load, call `sb.auth.getSession()` first — if a session exists, restore it and load roles immediately.
2. If no session, initialize Google One Tap with a nonce. Generate a random 16-byte nonce, hash it with `crypto.subtle.digest('SHA-256', ...)`, store both raw and hashed values in `localStorage` under `prvs_solar_nonce` and `prvs_solar_nonce_hash`.
3. On the Google credential callback, call `sb.auth.signInWithIdToken({ provider: 'google', token: credentialResponse.credential, nonce: retrievedNonce })` and clear the nonce keys from localStorage on success.
4. Register `sb.auth.onAuthStateChange` to re-load roles and refresh UI on every session change.
5. **Every Supabase-write guard must use `if (!getSB() || !supabaseSession) return;`** — NEVER guard with `!accessToken` alone. `accessToken` is the Google OAuth token, not the Supabase JWT; conflating them caused multiple production regressions in this project.

### 3. RBAC — load roles from BOTH sources, never hardcode emails

Do **not** include any constant like `ADMIN_EMAILS = [...]` or `MANAGER_EMAILS = [...]`. Roles come from two Supabase tables (`user_roles` joined through `users`, and `staff`) and must be merged **independently** so a failure in one source doesn't silently demote a real manager:

```javascript
async function loadUserRoles() {
    if (!supabaseSession) return;
    const email = supabaseSession.user.email;
    let mergedRoles = [];

    // 1) user_roles via users.id — failures must NOT abort step 2
    try {
        const { data: userRecord } = await getSB()
            .from('users').select('id').eq('email', email).maybeSingle();
        if (userRecord) {
            const { data: roleData } = await getSB()
                .from('user_roles').select('roles(name)').eq('user_id', userRecord.id);
            if (roleData) {
                mergedRoles = roleData.map(r => r.roles?.name).filter(Boolean);
            }
        }
    } catch (e) { warn('user_roles lookup failed (continuing with staff merge):', e); }

    // 2) staff-table merge — unconditional; .maybeSingle() so 0 rows is quiet null
    try {
        const { data: staffRecord } = await getSB()
            .from('staff').select('role, service_silo, active').eq('email', email).maybeSingle();
        if (staffRecord && staffRecord.active) {
            const staffRoleMap = { 'sr_manager': 'Sr Manager', 'manager': 'Manager', 'parts_manager': 'Manager', 'tech': 'Tech' };
            const mapped = staffRoleMap[staffRecord.role];
            if (mapped && !mergedRoles.includes(mapped)) mergedRoles.push(mapped);
        }
    } catch (e) { warn('staff role merge failed:', e); }

    userRoles = mergedRoles;
}
```

Use `.maybeSingle()` for any lookup where 0 rows is a valid result. Never `.single()`.

Implement role check helpers like `isAdmin()`, `hasRole(role)`, `isManagerOrAbove()` purely from `userRoles`. NEVER reference email addresses directly in role checks.

### 4. `repair_orders` schema — canonical column names (DO NOT GUESS)

**This is the single most important section of this prompt.** The existing `solar.html` v2.0 has a latent bug where `createRO()` writes column names that don't exist on the table — every solar-side RO creation has been silently failing for months. Do NOT replicate that bug. When inserting into or updating `repair_orders`, use these exact column names:

| Use this column name | NOT |
|---|---|
| `customerName` | `customer_name` |
| `email` | `customer_email` |
| `phone` | `customer_phone` |
| `address` | `customer_address` |
| `rv` (single text field, e.g. `"2024 Thor Aria"`) | `year`, `make`, `model` (these columns DO NOT EXIST) |
| `vin` | `vehicle_vin` |
| `dateReceived` (date string `YYYY-MM-DD`) | `created_at`, `received_date` |
| `repairDescription` | `description`, `notes` |
| `dollarValue` (numeric) | `quote_amount`, `value` |
| `status` (see canonical values below) | — |
| `repairType` | `service_type`, `type` |
| `urgency` | `priority` |
| `parkingSpot` | `lot_spot` |
| `deleted_at`, `deleted_by` (for soft-delete) | — |

The DB primary key column is `id` (UUID). When reading rows back from Supabase, map `row.id` into a JS property like `_supabaseId` so downstream code can do UUID-first lookups.

**`repair_orders.status` is case-sensitive and protected by a DB CHECK constraint** that rejects any value not in this exact list (case must match):

- `Awaiting parts`
- `Ready to Work`
- `In progress`  ← lowercase `p`; writing `In Progress` (capital P) will be REJECTED by the DB
- `On Lot`
- `Not On Lot`
- `Awaiting Approval`
- `Ready for pickup`
- `Delivered/Cashed Out`
- `Scheduled`
- `Drop Off`
- `Scheduled Drop Off`

If you need a status value not in this list, add a `CONFIG_TODO` comment asking the receiving developer rather than inventing one — the DB will reject it.

### 5. Audit log writes — required for every tracked-field update

Any `.update()` against `repair_orders` that changes a tracked field MUST also insert one or more `audit_log` rows. Implement this helper and use it everywhere:

```javascript
async function writeAuditLog(roId, changes) {
    // changes = [{ field, oldValue, newValue }, ...]
    if (!getSB() || !supabaseSession || !roId || !changes?.length) return;
    const email = supabaseSession.user.email;
    const rows = changes.map(c => ({
        ro_id: roId,
        field_changed: c.field,
        old_value: c.oldValue == null ? null : String(c.oldValue),
        new_value: c.newValue == null ? null : String(c.newValue),
        changed_by_email: email,
        changed_at: new Date().toISOString(),
    }));
    try {
        await getSB().from('audit_log').insert(rows);
    } catch (e) { warn('audit_log insert failed (non-fatal):', e); }
}
```

**Capture `oldValue` BEFORE mutating local state**, otherwise the audit log records `new -> new` and forensics are useless.

### 6. Security patterns

- **XSS:** Every user-supplied string injected into HTML must pass through `escapeHtml()`. Implement:
  ```javascript
  function escapeHtml(s) {
      return String(s ?? '')
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  ```
- **No `alert()` or `confirm()`:** The receiving project banned blocking dialogs site-wide. Use a non-blocking toast pattern. If the advanced solar.html already has one, keep it. Otherwise define a `showToast(msg, type)` stub (type in `'success' | 'warning' | 'error' | 'info'`) and the receiving developer will wire it to the project's existing toast system.
- **Anthropic API calls:** NEVER call `api.anthropic.com` directly from the browser. The receiving project has an edge function `claude-vision-proxy` for Anthropic Vision calls. POST to `${SUPABASE_URL}/functions/v1/claude-vision-proxy` with `Authorization: Bearer ${supabaseSession.access_token}` and the standard Anthropic Messages API body. If the advanced solar.html needs a different Anthropic endpoint (e.g., a text-only model), leave a `CONFIG_TODO` comment instead of inventing a proxy URL.
- **CORS:** Edge functions in this project validate `origin === 'https://patriotsrv.github.io'`. Local testing must be via the live URL or `python3 -m http.server` — never `file://`.

### 7. Console logging — DEBUG-gated

All `console.log` / `console.warn` calls (except genuine error fallbacks shown to the user) must be wrapped behind a `DEBUG` flag:

```javascript
const DEBUG = false;
function log(...args)  { if (DEBUG) console.log(...args); }
function warn(...args) { if (DEBUG) console.warn(...args); }
```

Use `log()` and `warn()` throughout. Real errors that need to surface to the user can still call `console.error` directly.

### 8. File conventions

- **Single-file HTML at repo root** — `/solar.html`. No external `js/` or `css/` files. React 18 + Babel-standalone CDN is fine (current v2.0 uses this).
- **Top-of-file version comment block** in this format so future maintainers can grep version history:

  ```html
  <!--
      PRVS Solar v3.0
      Released: YYYY-MM-DD
      v3.0: [one-line summary of advanced features in this revision]
      v2.0: [prior version, preserved for grep — current production version]
  -->
  ```

- **Visible version badge** bottom-right, fixed position, navy pill (this exact styling matches the rest of the dashboard):

  ```html
  <div style="position: fixed; bottom: 10px; right: 12px;
              background: rgba(30,58,138,0.82); color: #fff;
              font-size: 0.68rem; font-weight: 600; letter-spacing: 0.4px;
              padding: 3px 8px; border-radius: 20px;
              pointer-events: none; z-index: 9999;">
      PRVS Solar v3.0
  </div>
  ```

- **Console boot log** so DevTools can confirm which version is live: `console.log('[PRVS Solar v3.0] booted');`

---

## REFERENCE — Edge functions you can call

All edge functions live under `${SUPABASE_URL}/functions/v1/<name>`. Call with `fetch(url, { method: 'POST', headers: {...}, body: JSON.stringify(payload) })`.

| Function | Purpose | Headers | Notes |
|---|---|---|---|
| `claude-vision-proxy` | Anthropic Vision API proxy | `Authorization: Bearer ${session.access_token}` | Accepts the full Anthropic Messages API body (system, messages, model, max_tokens). Server-side Anthropic key. |
| `send-quote-email` | Email delivery — already handles `type: 'solar_quote'` | `Authorization: Bearer ${session.access_token}`, `x-prvs-secret: ${PRVS_FUNCTION_SECRET}` | Reuse with `type: 'solar_quote'` for solar quote emails. Payload includes recipient, subject, html body, attachments. |
| `roof-lookup` | AI roof dimension lookup from address | `Authorization: Bearer ${session.access_token}` | Returns roof dimensions. Useful if the advanced solar.html keeps the roof planner. |
| `slack-notify` | Slack channel notifications | None (origin-validated server-side) | Payload: `{ event_type, payload }`. Valid `event_type` values include `ro_created`, `ro_ready_pickup`, `warranty_ro_opened`. |

If the advanced solar.html introduces a NEW capability that needs an edge function that doesn't exist yet (e.g., a different AI proxy or a new email type), leave a `CONFIG_TODO` comment block describing the needed function instead of calling something that doesn't exist.

---

## REFERENCE — Guaranteed tables in the receiving Supabase project

These tables are guaranteed to exist (the receiving project's schema). If your advanced solar.html needs a table not in this list, flag it with a `CONFIG_TODO` migration note rather than assuming it exists:

`repair_orders`, `staff`, `users`, `user_roles`, `roles`, `audit_log`, `notes`, `parts`, `time_logs`, `service_work_orders`, `service_tasks`, `cashiered`, `enhancement_requests`, `app_config`, `scheduled_notifications`, `manager_work_lists`, `wo_task_templates`, `wo_template_tasks`.

---

## REFERENCE — Sandboxing rules

- The receiving project deploys via GitHub Pages from `main` branch root. `solar.html` must work as a static file served from `https://patriotsrv.github.io/rv-dashboard/solar.html`.
- All Supabase calls run under the project's RLS policies. If your file needs an RLS change, flag it with a `CONFIG_TODO` SQL note — don't assume the receiving developer will figure it out from runtime errors.
- The receiving project's branch model lands changes on `pre-prod` first, then fast-forwards to `main`. Your deliverable doesn't need to know branches; the receiving developer handles git.

---

## PRE-DELIVERY CHECKLIST — verify EVERY item before handing the file back

Add this block as a comment at the top of the file. Tick each box only after verifying by reading the relevant code in the file you're about to deliver:

```html
<!-- ═══════════════════════════════════════════════════════════════════════
     PRE-DELIVERY CHECKLIST — every item must be [x] before handoff
     ═══════════════════════════════════════════════════════════════════════
     [ ] No real Supabase URL / anon key / Google client ID / function secret
         — only CONFIG_TODO_* placeholders
     [ ] Top-of-file CONFIG_TODO checklist comment lists every placeholder
     [ ] storageKey in SB_AUTH_OPTIONS is 'prvs_solar_auth' (unique to this file)
     [ ] Every Supabase-write guard uses !getSB() || !supabaseSession — no
         lone !accessToken guards
     [ ] No hardcoded ADMIN_EMAILS / MANAGER_EMAILS / SR_MANAGER_EMAILS arrays
         — RBAC derived entirely from user_roles + staff table merge
     [ ] loadUserRoles() splits user_roles + staff lookups into TWO independent
         try/catch blocks; uses .maybeSingle() not .single()
     [ ] Every repair_orders write uses canonical column names: customerName,
         email, phone, address, rv, dateReceived, repairDescription,
         dollarValue, status, repairType, urgency, parkingSpot — NOT
         customer_email, customer_phone, year, make, model
     [ ] Every repair_orders.status write uses one of the 11 canonical values
         with EXACT casing (especially 'In progress' lowercase p)
     [ ] writeAuditLog() helper is implemented and called from every
         repair_orders .update() that changes a tracked field
     [ ] oldValue is captured BEFORE the local state mutation
     [ ] escapeHtml() is used on every user-supplied string injected into HTML
     [ ] No alert() or confirm() calls — toast notifications only
     [ ] No direct calls to api.anthropic.com — claude-vision-proxy edge
         function is used for all Anthropic Vision calls
     [ ] All console.log / console.warn calls behind DEBUG flag via log()/warn()
     [ ] Top-of-file version comment block present and lists this revision
     [ ] Visible version badge bottom-right matches the version comment block
     [ ] Console boot log prints version on load
     [ ] File is a single self-contained HTML with no external js/css files
     ═══════════════════════════════════════════════════════════════════════ -->
```

---

## DELIVERY FORMAT

Hand the file back as a single `.html` file (or pasted into a single `<html>` code block). Do NOT include a separate "summary of changes" document — the version comment block + pre-delivery checklist inside the file itself serves that purpose.

If any requirement on the checklist could not be met, replace that line's `[ ]` with `[!]` and add a one-line note explaining why. The receiving developer will work with you to resolve those before integration.
