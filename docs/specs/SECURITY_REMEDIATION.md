# PRVS Dashboard — Security Remediation Plan

**Version:** 1.0  
**Target file:** `index.html` (v1.308, ~13,631 lines) + supporting files  
**Prepared for:** Claude Cowork execution  
**Last updated:** 2026-04

---

## Executive Summary (for Roland)

This plan fixes 10 security issues found in the PRVS Dashboard code, organized from most urgent to least. The top three are real security risks:

1. **XSS** — A customer with a malicious name or repair description could inject code that runs in every staff member's browser, stealing sessions or data.
2. **Hardcoded emails** — Admin/Manager email addresses are visible to anyone who views page source, and adding or removing staff requires a code change and redeploy.
3. **Analytics auth gap** — `analytics.html` relies on localStorage-stored identity only; it never establishes a real Supabase session, so enhancement request submissions will break once RLS is tightened.

Items 4–10 are lower urgency — they don't represent immediate exploits but should be cleaned up in steady-state sessions.

---

## Session Plan

| Session | Items | Description |
|---|---|---|
| **S1** | #1 (XSS) | `escapeHtml()` utility + apply to all render functions |
| **S2** | #2 (RBAC) | Remove hardcoded email arrays, migrate to staff table |
| **S3** | #3 (analytics.html auth) | Full Supabase session auth in analytics.html |
| **S4** | #4 (Anthropic key) | Edge Function proxy for Claude Vision |
| **S5** | #5 (console.log) | Debug flag / logging removal |
| **S6** | #6 (inline onclick) | addEventListener migration (board cards) |
| **S7** | #7–#10 (MEDIUM) | CORS, anon key, Calendar IDs, search_path |

---

## CRITICAL — Fix First

---

### Issue 1 — XSS via Unescaped User Data in Template Literals

**Session: S1**

#### Risk (plain English)
Every RO card is built by pasting database values directly into HTML. If a customer's name, repair description, or any text field contains HTML like `<img src=x onerror=alert(1)>`, that code runs in every browser showing the board. A real attack could silently exfiltrate the Supabase session token (which is stored in localStorage) and replay it from an attacker's machine — giving full authenticated access to the dashboard.

#### What to change

**Step 1 — Add `escapeHtml()` utility function**

Location: Add immediately after the `shouldShow()` function at approximately line 6632, before `renderBoard()`.

```javascript
// BEFORE — no escape utility exists

// AFTER — add this function
/**
 * escapeHtml — sanitizes a string for safe insertion into innerHTML.
 * Converts the five HTML-special characters to their entity equivalents.
 * Use on every database field rendered into template literals.
 * @param {any} unsafe — raw value (will be coerced to string)
 * @returns {string}
 */
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**Step 2 — Apply `escapeHtml()` in `renderBoard()` (lines 7171–7756)**

The following substitutions must be made inside the `grid.innerHTML = filtered.map(...)` template literal. All occurrences are in the card template returned from the `.map()` callback.

| Line | Before | After |
|---|---|---|
| 7212 | `${ro.customerName \|\| t('Unknown Customer')}` | `${escapeHtml(ro.customerName) \|\| t('Unknown Customer')}` |
| 7213 | `${ro.roId}` (inside the monospace div) | `${escapeHtml(ro.roId)}` |
| 7215 | `${ro.parkingSpot}` (inside the 📍 chip) | `${escapeHtml(ro.parkingSpot)}` |
| 7238 | `${ro.customerName \|\| t('Unknown')}` (QR label) | `${escapeHtml(ro.customerName) \|\| t('Unknown')}` |
| 7240 | `${ro.rv \|\| t('RV Not Specified')}` (QR label) | `${escapeHtml(ro.rv) \|\| t('RV Not Specified')}` |
| 7293 | `${ro.rv \|\| t('Not specified')}` | `${escapeHtml(ro.rv) \|\| t('Not specified')}` |
| 7298 | `${ro.vin}` | `${escapeHtml(ro.vin)}` |
| 7311 | `${ro.customerPhone}` (inside `<a href="tel:...">`) | `${escapeHtml(ro.customerPhone)}` |
| 7323 | `${ro.customerAddress}` | `${escapeHtml(ro.customerAddress)}` |
| 7335 | `${ro.repairDescription \|\| ...}` | `${escapeHtml(ro.repairDescription) \|\| ...}` |
| 7367 | `${ro.roStatusNotes ? ro.roStatusNotes.split...}` | wrap each split segment: `.split('\n').map(escapeHtml).reverse().join('\n')` |
| 7376 | `${ro.customerCommunicationNotes ? ...}` | same pattern as roStatusNotes above |

**Exact before/after for the most critical line (repair description, ~line 7335):**

```javascript
// BEFORE
<div class="note-content repair-desc">${ro.repairDescription || '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>

// AFTER
<div class="note-content repair-desc">${ro.repairDescription ? escapeHtml(ro.repairDescription) : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>
```

**Exact before/after for roStatusNotes (line ~7367):**

```javascript
// BEFORE
<div class="note-content">${ro.roStatusNotes ? ro.roStatusNotes.split('\n').reverse().join('\n') : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>

// AFTER
<div class="note-content">${ro.roStatusNotes ? ro.roStatusNotes.split('\n').map(escapeHtml).reverse().join('\n') : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>
```

**Step 3 — Apply `escapeHtml()` in other render functions**

These functions also interpolate database values into innerHTML:

**`renderKenectMessages()` (line 11134) — HIGH priority (SMS messages from external senders):**

```javascript
// BEFORE (~line 11169)
const body = msg.messageBody || msg.body || msg.text || msg.message || '(media)';
// ...
}>${body.replace(/\n/g, '<br>')}</div>

// AFTER
const body = msg.messageBody || msg.body || msg.text || msg.message || '(media)';
// ...
}>${escapeHtml(body).replace(/\n/g, '<br>')}</div>
```

**`openPhotoLibrary()` (line ~3813) — customer name in modal title:**

```javascript
// BEFORE
<h2 style="...">📷 Photos &amp; Docs — ${ro.customerName}</h2>

// AFTER
<h2 style="...">📷 Photos &amp; Docs — ${escapeHtml(ro.customerName)}</h2>
```

**`openPartsModal()` (line ~6013) — customer name and RV:**

```javascript
// BEFORE
<h2 style="...">🔩 Parts — ${ro.customerName}</h2>
<div style="...">${ro.rv || ''} &nbsp;•&nbsp; RO: ${roId || '—'}</div>

// AFTER
<h2 style="...">🔩 Parts — ${escapeHtml(ro.customerName)}</h2>
<div style="...">${escapeHtml(ro.rv) || ''} &nbsp;•&nbsp; RO: ${escapeHtml(roId) || '—'}</div>
```

**`openPartsRequestModal()` (line ~10261), `openPartsStatusModal()` (line ~10603), `openTimeLogsModal()` (line ~10854)** — same pattern, wrap all `${ro.customerName}`, `${ro.rv}`, `${ro.roId}` references.

**`buildWOTaskRowHtml()` (line 12114) — task names come from user input:**

```javascript
// BEFORE (any ${task.name} or ${task.description} interpolation)
<td>${task.name || ''}</td>

// AFTER
<td>${escapeHtml(task.name) || ''}</td>
```

**Step 4 — Apply to duplicate manager overlay (line ~9847–9848):**

```javascript
// BEFORE
<div style="font-weight:700;color:#1e293b;font-size:14px;">${ro.roId}</div>
<div style="color:#475569;font-size:12px;margin-top:2px;">${ro.customerName} · ${ro.rv || 'No RV'} · ...</div>

// AFTER
<div style="font-weight:700;color:#1e293b;font-size:14px;">${escapeHtml(ro.roId)}</div>
<div style="color:#475569;font-size:12px;margin-top:2px;">${escapeHtml(ro.customerName)} · ${escapeHtml(ro.rv) || 'No RV'} · ...</div>
```

#### Supabase migrations needed
None — this is a client-side change only.

#### Testing steps
1. In Supabase, create a test RO with `customerName` set to `<img src=x onerror="alert('XSS')">`.
2. Load the dashboard. Confirm the name appears as literal text on the card — no alert fires.
3. Set `repairDescription` to `<script>alert('xss')</script>`. Confirm it renders as escaped text.
4. Set `roStatusNotes` to `line1\n<b>bold</b>\nline3`. Confirm the `<b>` tag appears as text, not bold.
5. Test the Kenect message modal with a message body containing `<a href="javascript:alert(1)">click</a>`. Confirm it renders as text.
6. Delete the test RO.

---

### Issue 2 — Hardcoded Email-Based RBAC

**Session: S2**

#### Risk (plain English)
Three arrays of real employee email addresses live in plain text in the JavaScript source, visible to anyone who opens browser DevTools → Sources. More importantly, if you hire or fire someone, you have to edit the code and redeploy to GitHub Pages instead of just updating a database row. The `staff` table already exists and is seeded — this change just cuts the cord between the code and the email lists.

#### Current hardcoded arrays (lines 8123–8133)

```javascript
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];
const MANAGER_EMAILS = [
    'ryan@patriotsrvservices.com',
    'mauricio@patriotsrvservices.com',
    'jason@patriotsrvservices.com',
    'andrew@patriotsrvservices.com',
    'solar@patriotsrvservices.com',
    'bobby@patriotsrvservices.com',
    'brandon@patriotsrvservices.com',
];
const SR_MANAGER_EMAILS = ['ryan@patriotsrvservices.com', 'kevin@patriotsrvservices.com'];
```

#### Where these arrays are used (all call sites to update)

| Line | Usage | Resolution |
|---|---|---|
| 6685 | `SR_MANAGER_EMAILS.includes(email) \|\| ADMIN_EMAILS.includes(email) \|\| MANAGER_EMAILS.includes(email)` in `canSeeWorkList()` | Replace with role check |
| 6691 | `SR_MANAGER_EMAILS.includes(email) \|\| ADMIN_EMAILS.includes(email)` in `isSrManagerOrAdmin()` | Replace with role check |
| 6723 | `[...SR_MANAGER_EMAILS, ...MANAGER_EMAILS]` (work list picker population) | Replace with staff table lookup |
| 6891 | `SR_MANAGER_EMAILS.includes(targetEmail) \|\| ADMIN_EMAILS.includes(targetEmail)` | Replace with role check |
| 8221 | `ADMIN_EMAILS.includes(currentUser.email)` in `isAdmin()` fallback | Remove fallback, rely on `userRoles` only |
| 8227–8228 | `MANAGER_EMAILS.includes(...)` / `ADMIN_EMAILS.includes(...)` in `hasRole()` | Remove fallback, rely on `userRoles` only |
| 9071 | `ADMIN_EMAILS.includes(_sessionEmail)` in `loadDataFromSupabase()` | Replace with `userRoles` check |
| 11815–11816 | `ADMIN_EMAILS.includes(email)` and `SR_MANAGER_EMAILS.includes(email)` in `canManageSilo()` | Replace with role check |

#### What to change

**Step 1 — Add `kevin@` to the `staff` table (Sr. Manager)**

Kevin McHenry is in `SR_MANAGER_EMAILS` but was not in the original staff seed. The changelog (`v1.300`) records this addition. Confirm he exists:

```sql
-- Run in Supabase SQL Editor to verify and insert if missing
INSERT INTO staff (name, email, role, service_silo)
VALUES ('Kevin McHenry', 'kevin@patriotsrvservices.com', 'sr_manager', NULL)
ON CONFLICT (email) DO UPDATE SET role = 'sr_manager', active = TRUE;
```

**Step 2 — Ensure `userRoles` is populated with Sr. Manager**

The `loadUserRoles()` function queries `user_roles` (the junction table). The `staff` table exists separately. The `isAdmin()`/`hasRole()` system reads from `userRoles[]`. The gap is that `staff.role` is not automatically reflected in `userRoles`.

**Option A (recommended, minimal code change):** Extend `loadUserRoles()` to also read from `staff` for the current user's role and merge it into `userRoles`.

```javascript
// In loadUserRoles() (~line 8233), after the existing userRoles population block:

// AFTER — add staff table role sync
try {
    const { data: staffRecord } = await getSB()
        .from('staff')
        .select('role, service_silo, active')
        .eq('email', email)
        .single();

    if (staffRecord && staffRecord.active) {
        // Map staff.role values to the userRoles convention
        const staffRoleMap = {
            'sr_manager':    'Sr Manager',
            'manager':       'Manager',
            'parts_manager': 'Manager',
            'tech':          'Tech',
        };
        const mapped = staffRoleMap[staffRecord.role];
        if (mapped && !userRoles.includes(mapped)) {
            userRoles.push(mapped);
        }
        // Store silo for canManageSilo() use
        window._currentStaffSilo = staffRecord.service_silo || null;
        window._currentStaffRole = staffRecord.role || null;
    }
} catch (e) {
    // Non-critical — fall through
}
```

**Step 3 — Rewrite `isAdmin()` to use only `userRoles`**

```javascript
// BEFORE (~line 8220)
function isAdmin() {
    // Check roles array first, then fall back to email check
    if (userRoles.includes('Admin')) return true;
    if (currentUser && ADMIN_EMAILS.includes(currentUser.email?.toLowerCase())) return true;
    return false;
}

// AFTER
function isAdmin() {
    return userRoles.includes('Admin');
}
```

**Step 4 — Rewrite `hasRole()` to use only `userRoles`**

```javascript
// BEFORE (~line 8223)
function hasRole(role) {
    if (userRoles.includes(role)) return true;
    // Email fallback while Supabase roles load
    if (role === 'Manager' && currentUser) return MANAGER_EMAILS.includes(currentUser.email?.toLowerCase());
    if (role === 'Admin' && currentUser) return ADMIN_EMAILS.includes(currentUser.email?.toLowerCase());
    return false;
}

// AFTER
function hasRole(role) {
    return userRoles.includes(role);
}
```

**Step 5 — Rewrite `canSeeWorkList()` (line ~6685)**

```javascript
// BEFORE
function canSeeWorkList() {
    const email = currentUser?.email?.toLowerCase() || '';
    return SR_MANAGER_EMAILS.includes(email) ||
           ADMIN_EMAILS.includes(email) ||
           MANAGER_EMAILS.includes(email);
}

// AFTER
function canSeeWorkList() {
    return isAdmin() || hasRole('Manager') || hasRole('Sr Manager');
}
```

**Step 6 — Rewrite `isSrManagerOrAdmin()` (line ~6691)**

```javascript
// BEFORE
function isSrManagerOrAdmin() {
    const email = currentUser?.email?.toLowerCase() || '';
    return SR_MANAGER_EMAILS.includes(email) || ADMIN_EMAILS.includes(email);
}

// AFTER
function isSrManagerOrAdmin() {
    return isAdmin() || hasRole('Sr Manager');
}
```

**Step 7 — Rewrite `canManageSilo()` (line ~11815)**

```javascript
// BEFORE
function canManageSilo(silo) {
    const email = currentUser?.email?.toLowerCase() || '';
    if (isAdmin()) return true;
    if (ADMIN_EMAILS.includes(email)) return true;
    if (SR_MANAGER_EMAILS.includes(email)) return true;
    // Check user_roles for silo-specific manager
    return userRoles.some(r => r === silo + '_manager' || r === 'Manager');
}

// AFTER
function canManageSilo(silo) {
    if (isAdmin()) return true;
    if (hasRole('Sr Manager')) return true;
    // Silo-specific manager: check staff table silo assignment
    if (hasRole('Manager') && window._currentStaffSilo === silo) return true;
    // Parts managers have their own access path; general Manager role
    if (hasRole('Manager') && window._currentStaffRole === 'parts_manager') return false;
    return false;
}
```

**Step 8 — Remove the `ADMIN_EMAILS`, `MANAGER_EMAILS`, `SR_MANAGER_EMAILS` constant declarations**

After all call sites above are updated and tested, delete lines 8123–8133:

```javascript
// DELETE these three constant declarations entirely:
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];
const MANAGER_EMAILS = [
    'ryan@patriotsrvservices.com',
    // ...
];
const SR_MANAGER_EMAILS = ['ryan@patriotsrvservices.com', 'kevin@patriotsrvservices.com'];
```

**Step 9 — Fix `loadDataFromSupabase()` fallback (line ~9071)**

```javascript
// BEFORE
const _isAdminNow = isAdmin() || ADMIN_EMAILS.includes(_sessionEmail);

// AFTER
const _isAdminNow = isAdmin();
```

**Step 10 — Fix work list manager picker (line ~6723)**

The Sr. Manager work list picker currently uses the hardcoded arrays to populate the email dropdown:

```javascript
// BEFORE
const all = [...(SR_MANAGER_EMAILS || []), ...(MANAGER_EMAILS || [])];
sel.innerHTML = '<option value="">— My List —</option>' + all.map(e => `<option value="${e}">${e}</option>`).join('');

// AFTER — pull from staff cache instead
const managerStaff = (_staffCache || []).filter(s =>
    s.active && (s.role === 'manager' || s.role === 'sr_manager')
);
sel.innerHTML = '<option value="">— My List —</option>' +
    managerStaff.map(s =>
        `<option value="${escapeHtml(s.email)}">${escapeHtml(s.name)} (${escapeHtml(s.email)})</option>`
    ).join('');
```

Note: `_staffCache` is populated by `loadStaff()` which is already called during auth. If it's not yet loaded at this call site, call `await loadStaff()` first.

#### Supabase migrations needed

```sql
-- Migration: add kevin@patriotsrvservices.com to staff table
-- File: supabase/migrations/add_kevin_sr_manager.sql

INSERT INTO staff (name, email, role, service_silo)
VALUES ('Kevin McHenry', 'kevin@patriotsrvservices.com', 'sr_manager', NULL)
ON CONFLICT (email) DO UPDATE SET
    role   = 'sr_manager',
    active = TRUE;
```

Also ensure Roland and Lynn have the `Admin` role in `user_roles` (if not already set, use the Admin → Manage Users UI after this change is live).

#### Testing steps
1. Sign in as Roland (`roland@`). Confirm `isAdmin()` returns `true` via console: `isAdmin()`.
2. Sign in as Ryan (`ryan@`). Confirm Work List and Sr Manager features are visible.
3. Sign in as Mauricio (`mauricio@`). Confirm Manager features are accessible, Admin features are not.
4. Sign in as a Tech. Confirm only tech-level actions are available.
5. In Supabase, temporarily change Mauricio's `staff.active` to `false`. Refresh — confirm Manager access is revoked without a code change.
6. Restore `active = true`.
7. Confirm no console errors about missing `ADMIN_EMAILS`.

---

### Issue 3 — analytics.html Auth Gap

**Session: S3**

#### Risk (plain English)
`analytics.html` authenticates by reading a stored identity from `localStorage` and checking the email against a hardcoded `ADMIN_EMAILS` array — it never establishes a real Supabase session. This means:
- The enhancement request INSERT (`submitEnhancementRequest()`) runs as the anonymous Supabase role.
- Once the anon INSERT policy is removed from `enhancement_requests`, every submission from analytics.html will fail with a permission error.
- The security check is trivially bypassable: anyone who sets `prvs_user_identity` in localStorage with an admin email gets full access.

#### Current broken auth flow in analytics.html (lines ~579–648)

```javascript
// CURRENT — localStorage identity check only, no Supabase session
document.addEventListener('DOMContentLoaded', () => {
    const stored = localStorage.getItem('prvs_user_identity');
    if (stored) {
        const identity = JSON.parse(stored);
        if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
            showApp();  // ← no real session, just localStorage check
            return;
        }
    }
    initGoogleSignIn();
});

function handleSignIn(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = { email: payload.email, name: payload.name };
    // ← never calls signInWithIdToken — no Supabase session created
    if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
        showApp();
    }
}
```

#### What to change — model on closed-ros.html

`closed-ros.html` has the correct pattern. Mirror it exactly for `analytics.html`.

**Step 1 — Add nonce generation and `signInWithIdToken` to `handleSignIn()`**

```javascript
// BEFORE (analytics.html ~line 617)
function handleSignIn(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        currentUser = { email: payload.email, name: payload.name };
        localStorage.setItem('prvs_user_identity', JSON.stringify({
            email: currentUser.email, name: currentUser.name, savedAt: Date.now()
        }));
        if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
            showApp();
        } else {
            showAccessDenied();
        }
    } catch(e) {
        console.error('Sign-in error:', e);
    }
}

// AFTER
async function handleSignIn(response) {
    try {
        const idToken = response.credential;
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        currentUser = { email: payload.email, name: payload.name };

        // Establish real Supabase session (required for authenticated DB writes)
        const { data, error } = await getSB().auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
        });
        if (error) {
            console.error('Supabase sign-in error:', error);
        } else {
            supabaseSession = data.session;
            localStorage.setItem('prvs_user_identity', JSON.stringify({
                email: currentUser.email, name: currentUser.name, savedAt: Date.now()
            }));
        }

        // Role check via Supabase (not hardcoded array)
        const isAdmin = await checkIsAdmin(currentUser.email);
        if (isAdmin) {
            showApp();
        } else {
            showAccessDenied();
        }
    } catch(e) {
        console.error('Sign-in error:', e);
    }
}
```

**Step 2 — Add `supabaseSession` variable and `checkIsAdmin()` helper**

```javascript
// Add near top of analytics.html <script> block, after currentUser declaration:
let supabaseSession = null;

async function checkIsAdmin(email) {
    // First: check Supabase user_roles table
    try {
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (userRecord) {
            const { data: roles } = await getSB()
                .from('user_roles')
                .select('roles(name)')
                .eq('user_id', userRecord.id);

            if (roles && roles.some(r => r.roles?.name === 'Admin')) return true;
        }
    } catch(e) {}

    // Second: check staff table role
    try {
        const { data: staffRecord } = await getSB()
            .from('staff')
            .select('role')
            .eq('email', email)
            .eq('active', true)
            .single();
        if (staffRecord && staffRecord.role === 'sr_manager') return true;
    } catch(e) {}

    return false;
}
```

**Step 3 — Replace localStorage session restore with Supabase `getSession()`**

```javascript
// BEFORE (analytics.html DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
    const stored = localStorage.getItem('prvs_user_identity');
    if (stored) {
        // ... localStorage-only check
    }
    initGoogleSignIn();
});

// AFTER
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Try to restore existing Supabase session
    const { data: { session } } = await getSB().auth.getSession();
    if (session) {
        supabaseSession = session;
        currentUser = {
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email
        };
        const isAdmin = await checkIsAdmin(currentUser.email);
        if (isAdmin) { showApp(); return; }
        showAccessDenied(); return;
    }

    // 2. No session — show Google sign-in
    initGoogleSignIn();
});
```

**Step 4 — Update `submitEnhancementRequest()` to guard on session**

```javascript
// BEFORE (analytics.html ~line 986)
async function submitEnhancementRequest() {
    // ... no session check
    const { error } = await getSB().from('enhancement_requests').insert({ ... });
}

// AFTER
async function submitEnhancementRequest() {
    if (!supabaseSession) {
        alert('Session expired. Please refresh the page and sign in again.');
        return;
    }
    const desc = document.getElementById('erDescription').value.trim();
    const cat = document.getElementById('erCategory').value;
    if (!desc) { alert('Please describe your request.'); return; }
    try {
        const { error } = await getSB().from('enhancement_requests').insert({
            submitted_by: currentUser.email,
            submitted_by_name: currentUser.name,
            source_page: 'analytics',
            category: cat,
            description: desc
        });
        if (error) throw error;
        // ... existing toast logic
    } catch(err) {
        alert('Error: ' + (err.message || err));
    }
}
```

**Step 5 — Remove `ADMIN_EMAILS` hardcoded array from analytics.html**

```javascript
// BEFORE (analytics.html ~line 562)
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];

// AFTER — delete this line entirely (role check is now done via Supabase)
```

**Step 6 — Configure Supabase client with session persistence**

```javascript
// BEFORE (analytics.html ~line 564)
function getSB() {
    if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return _sb;
}

// AFTER
function getSB() {
    if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'prvs_analytics_auth'
        }
    });
    return _sb;
}
```

#### Supabase migrations needed

Update the `enhancement_requests` RLS INSERT policy to require an authenticated session (remove anon INSERT access):

```sql
-- File: supabase/migrations/tighten_enhancement_requests_rls.sql

-- Drop permissive anon insert if it exists
DROP POLICY IF EXISTS "er_anon_insert" ON enhancement_requests;

-- Ensure authenticated users can insert
CREATE POLICY "er_authenticated_insert"
  ON enhancement_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Only admins can select/update/delete
CREATE POLICY "er_admin_manage"
  ON enhancement_requests FOR ALL
  TO authenticated
  USING (has_role('Admin'));
```

#### Testing steps
1. Open `analytics.html` in an incognito window. Confirm Google sign-in prompt appears.
2. Sign in as Roland. Confirm the app loads and the Supabase session is active: in DevTools console, run `getSB().auth.getSession()` and verify `session` is not null.
3. Submit an enhancement request via the genie lamp. Confirm it appears in the database.
4. Reload the page — confirm the existing session is restored without signing in again.
5. Sign in as a non-admin Google account. Confirm "Access denied" message appears.
6. Try accessing analytics.html after manually setting `localStorage.setItem('prvs_user_identity', JSON.stringify({email:'roland@patriotsrvservices.com', name:'Test', savedAt: Date.now()}))` for a non-admin account. Confirm access is still denied (Supabase session check prevails).

---

## HIGH — Fix Next

---

### Issue 4 — Anthropic API Key in localStorage

**Session: S4**

#### Risk (plain English)
The Anthropic Claude API key is stored in `localStorage` under `prvs_anthropic_key`. Any JavaScript running on the page (including from an XSS attack) can read it with `localStorage.getItem('prvs_anthropic_key')`. Once stolen, the key gives unlimited access to Anthropic's API charged to the Patriots RV account.

#### Current flow (lines 4597–4601, 4823)
```javascript
// openEstimateScanner() saves key to localStorage
localStorage.setItem('prvs_anthropic_key', apiKey);

// callClaudeVision() uses the key directly in a client-side POST
async function callClaudeVision(apiKey, base64Data, mediaType, isPDF) {
    // ... POSTs directly to https://api.anthropic.com/v1/messages
}
```

#### What to change

**Step 1 — Create a new Supabase Edge Function `claude-vision-proxy`**

Create file: `supabase/functions/claude-vision-proxy/index.ts`

```typescript
/**
 * claude-vision-proxy — Supabase Edge Function
 * Proxies Claude Vision API calls so the Anthropic key
 * never leaves the server.
 *
 * Required secret:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *
 * Requires authenticated Supabase session (Authorization header).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://patriotsrv.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Require authenticated session
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { base64Data, mediaType, isPDF } = await req.json();

    // Build Anthropic request (mirrors existing callClaudeVision logic)
    const messages = isPDF
      ? [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
          { type: 'text', text: 'Extract all insurance estimate fields from this document.' }
        ]}]
      : [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extract all insurance estimate fields from this image.' }
        ]}];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...(isPDF ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages,
      }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**Step 2 — Set the secret in Supabase CLI**

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
supabase functions deploy claude-vision-proxy
```

**Step 3 — Replace `callClaudeVision()` in index.html (line 4823)**

```javascript
// BEFORE — direct API call with user-supplied key
async function callClaudeVision(apiKey, base64Data, mediaType, isPDF) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            // ...
        },
        // ...
    });
    // ...
}

// AFTER — proxy through Edge Function
async function callClaudeVision(base64Data, mediaType, isPDF) {
    if (!supabaseSession) throw new Error('You must be signed in to use the estimate scanner.');

    const response = await fetch(
        `${SUPABASE_URL}/functions/v1/claude-vision-proxy`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseSession.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ base64Data, mediaType, isPDF }),
        }
    );
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Claude Vision proxy error');
    }
    return response.json();
}
```

**Step 4 — Update all callers of `callClaudeVision()` (line ~4632)**

```javascript
// BEFORE
const extracted = await callClaudeVision(apiKey, base64, mediaType, isPDF);

// AFTER — apiKey parameter removed
const extracted = await callClaudeVision(base64, mediaType, isPDF);
```

**Step 5 — Remove the API key input fields from the New RO and Edit RO forms**

Remove the `<label>🔑 Anthropic API Key:</label>` input sections from:
- New RO form (~line 12493)
- Edit RO form (~line 13017)

**Step 6 — Remove localStorage key saving (lines 4601, 6425–6431, 6509)**

```javascript
// DELETE: line 4601
localStorage.setItem('prvs_anthropic_key', apiKey);

// DELETE: lines 6425–6431 (auto-fill on init)
const savedAnthropicKey = localStorage.getItem('prvs_anthropic_key');
if (savedAnthropicKey) {
    if (newKey) newKey.value = savedAnthropicKey;
    if (editKey) editKey.value = savedAnthropicKey;
}

// DELETE: line 6509 (sync listener)
localStorage.setItem('prvs_anthropic_key', val);
```

**Step 7 — Clean up localStorage**

Add to `clearToken()` or a one-time migration on init:

```javascript
localStorage.removeItem('prvs_anthropic_key');
```

#### Supabase migrations needed
None. Edge Function deployment + secret only.

#### Testing steps
1. Deploy `claude-vision-proxy` Edge Function.
2. Set the `ANTHROPIC_API_KEY` secret via CLI.
3. Sign in to the dashboard, open New RO, trigger the estimate scanner with a real insurance PDF.
4. Confirm the extraction works without entering an API key.
5. Confirm `localStorage.getItem('prvs_anthropic_key')` returns `null`.
6. In Supabase Edge Function logs, confirm the request shows a valid authenticated JWT.
7. Sign out and attempt the same call — confirm it fails with "must be signed in."

---

### Issue 5 — 233 `console.log/warn/error` Calls in Production

**Session: S5**

#### Risk (plain English)
There are 233 console calls in production. Many log sensitive data: user emails (line 8415), session details (line 8442), token expiry times (line 8521), and access token previews (line 4681). Anyone with DevTools open — including a tech on their phone — can read this data. It also pollutes the console and makes real errors harder to spot.

#### What to change

**Step 1 — Add a `DEBUG` flag constant near the top of the `<script>` block**

Add immediately after the `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants (~line 7908):

```javascript
// BEFORE — no debug flag

// AFTER
/**
 * DEBUG — set to true locally for verbose logging; false in production.
 * Never commit with DEBUG = true.
 */
const DEBUG = false;

/** log() — gated console.log. Use instead of console.log throughout. */
function log(...args) { if (DEBUG) console.log(...args); }
/** warn() — gated console.warn. */
function warn(...args) { if (DEBUG) console.warn(...args); }
```

**Step 2 — Replace sensitive `console.log` calls with `log()`**

High-priority replacements (sensitive data):

```javascript
// Line 4681 — access token preview
// BEFORE
console.log('Drive upload - accessToken present:', !!accessToken, 'token preview:', accessToken ? accessToken.substring(0,20) + '...' : 'NULL');
// AFTER — delete entirely (token presence check is not needed in production)

// Line 8415 — user email on login
// BEFORE
console.log('✓ Logged in as:', currentUser.name, '(' + currentUser.email + ')');
// AFTER
log('✓ Logged in as:', currentUser.name, '(' + currentUser.email + ')');

// Line 8462 — token expiry
// BEFORE
console.log('Saved token exists:', !!savedToken, '| Expiry:', tokenExpiry);
// AFTER
log('Saved token exists:', !!savedToken);

// Line 8521 — minutes until expiry
// BEFORE
console.log('Time until Google token expiry (minutes):', Math.round((expiryTime - now) / 60000));
// AFTER
log('Token valid for:', Math.round((expiryTime - now) / 60000), 'min');

// Lines 8442, 8448, 8474, 8494, 8524, 8547, 8554, 8565, 8574, 8578,
//       8617, 8623, 8680, 8700, 8759 — auth flow logs
// AFTER — replace all with log() calls using the same message text
```

**Step 3 — Bulk find-and-replace strategy**

For the remaining non-sensitive `console.log` calls (lifecycle, data loading confirmations):

Use a search-and-replace across the file:
- `console.log(` → `log(`  
- `console.warn(` → `warn(`

Keep `console.error(` calls unchanged — errors should always surface.

**Step 4 — Specific `console.error` review**

Review all `console.error` calls. Those that expose internal structure should be generalized:

```javascript
// BEFORE (line ~8105)
console.error('Supabase SDK not available yet');

// AFTER — acceptable, keep as-is (no sensitive data)
console.error('Supabase SDK not available yet');
```

#### Supabase migrations needed
None.

#### Testing steps
1. After changes, open DevTools Console and sign in. Confirm zero `console.log` output in production (`DEBUG = false`).
2. Temporarily set `DEBUG = true`, reload. Confirm verbose logs appear for auth flow.
3. Confirm `console.error` still fires on real errors (temporarily force a Supabase error to verify).
4. Confirm `DEBUG = false` before committing.

---

### Issue 6 — 193 Inline `onclick` Attributes

**Session: S6**

#### Risk (plain English)
Having 193 `onclick="functionName()"` attributes in HTML strings means Content Security Policy cannot be hardened to block `unsafe-inline` scripts. It also means any XSS that injects HTML can add `onclick` handlers. The immediate concern is not a running exploit but a blocker for future CSP headers. Session 37 already demonstrated the correct pattern (Work List uses `addEventListener`).

#### Strategy
Due to the volume (193), this is a multi-phase effort. S6 targets the board card grid (the largest attack surface). Remaining modals can be addressed in follow-on sessions.

#### What to change

**Phase 1 (S6) — Remove inline onclick from RO card buttons in `renderBoard()`**

The card template generates buttons with `onclick="functionName(${index})"`. The fix is to use `data-*` attributes and a single delegated event listener on `#boardGrid`.

**Step 1 — Add event delegation to `setupEventListeners()` (line ~6477)**

```javascript
// Add inside setupEventListeners(), after existing listeners:

document.getElementById('boardGrid').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx    = parseInt(btn.dataset.idx, 10);

    switch (action) {
        case 'checkin':           openCheckIn(idx);                   break;
        case 'upload-photo':      document.getElementById(`photoUpload-${idx}`).click(); break;
        case 'open-qr':           openQRModal(idx);                   break;
        case 'print-qr':          printQRLabel(idx);                  break;
        case 'toggle-qr':         toggleQRSection(btn, idx);          break;
        case 'parts-badge':       openPartsModal(idx);                break;
        case 'parts-status':      openPartsStatusModal(idx);          break;
        case 'edit-ro':           openEditRO(idx);                    break;
        case 'manage-parts':      openPartsModal(idx);                break;
        case 'request-parts':     openPartsRequestModal(idx);         break;
        case 'work-orders':       openWorkOrderModal(idx);            break;
        case 'add-to-list':       addToWorkList(idx);                 break;
        case 'messages':          openKenectModal(idx);               break;
        case 'set-parts-status':  openPartsStatusModal(idx);          break;
        case 'schedule':          openScheduleModal(idx);             break;
        case 'archive':           archiveROInSupabase(idx);           break;
        case 'parking-spot':      openEditRO(idx);                    break;
        case 'time-logs':         openTimeLogsModal(idx);             break;
        case 'refresh-logs':      manualRefreshTimeLogs();             break;
    }
});

document.getElementById('boardGrid').addEventListener('change', function(e) {
    const el = e.target;
    if (el.classList.contains('urgency-dropdown')) {
        const idx = parseInt(el.closest('[data-ro-index]').dataset.roIndex, 10);
        updateROUrgency(idx, el.value);
    }
    if (el.classList.contains('status-dropdown')) {
        const idx = parseInt(el.closest('[data-ro-index]').dataset.roIndex, 10);
        updateROStatus(idx, el.value);
    }
    if (el.classList.contains('progress-input')) {
        const idx = parseInt(el.closest('[data-ro-index]').dataset.roIndex, 10);
        updateROProgress(idx, parseInt(el.value));
    }
});
```

**Step 2 — Replace inline `onclick` in the card template with `data-action` + `data-idx`**

```javascript
// BEFORE (checkin button, ~line 7257)
<button class="checkin-btn" onclick="openCheckIn(${index})" title="Check in to this RO">

// AFTER
<button class="checkin-btn" data-action="checkin" data-idx="${index}" title="Check in to this RO">
```

```javascript
// BEFORE (Edit RO button in button group, ~line 7420)
<button class="action-btn" onclick="openEditRO(${index})">✏️ ${t('Edit RO')}</button>

// AFTER
<button class="action-btn" data-action="edit-ro" data-idx="${index}">✏️ ${t('Edit RO')}</button>
```

```javascript
// BEFORE (parking spot chip, ~line 7215)
onclick="openEditRO(${index})"

// AFTER
data-action="parking-spot" data-idx="${index}"
```

Apply the same pattern systematically to every `onclick=` in the card template section (lines 7171–7756). Each button gets `data-action="<action-name>"` and `data-idx="${index}"` instead of `onclick`.

**Note on urgency/status/progress dropdowns:** These use `onchange` not `onclick`. The delegated `change` listener above handles them. Replace:

```javascript
// BEFORE
<select class="urgency-dropdown ..." onchange="updateROUrgency(${index}, this.value)">

// AFTER
<select class="urgency-dropdown ..." data-ro-index-pending>
```
The `data-ro-index` is already on the wrapping `.ro-card` div, so the change listener can walk up to find it.

#### Supabase migrations needed
None.

#### Testing steps
1. Load the board. Click "Check In" on an RO card — confirm the check-in modal opens.
2. Change the urgency dropdown — confirm the urgency updates.
3. Click "Edit RO" — confirm the edit modal opens for the correct RO.
4. Open DevTools → Console, confirm no `Uncaught ReferenceError` for any function.
5. Apply a board filter, then click buttons — confirm correct RO is targeted (the `data-idx` value must match `currentFilteredData` index, which it does since card rendering and listener use the same filtered array).

---

## MEDIUM — Ongoing

---

### Issue 7 — CORS Wildcard on Edge Functions

**Session: S7**

#### Risk (plain English)
All Edge Functions currently return `"Access-Control-Allow-Origin": "*"`, which means any website on the internet can call them from a browser. Since the functions require the Supabase anon key and/or a session JWT, this is low-risk but still a defense-in-depth gap. Restricting to the actual origin eliminates the wildcard.

#### Affected files (all functions with `"*"` CORS)
- `supabase/functions/kenect-proxy/index.ts` (line 14)
- `supabase/functions/roof-lookup/index.ts` (line 2)
- `supabase/functions/send-er-report/index.ts` (line 2)
- `supabase/functions/send-parts-report/index.ts` (same pattern)
- `supabase/functions/send-quote-email/index.ts` (same pattern)

#### What to change

In every Edge Function that has:

```typescript
// BEFORE
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

Change to:

```typescript
// AFTER
const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
```

Then replace all `{ headers: corsHeaders }` with `{ headers: getCorsHeaders(req) }` throughout each function.

Apply to all five Edge Functions listed above.

#### Supabase migrations needed
None. Redeploy all Edge Functions after the change:

```bash
supabase functions deploy kenect-proxy
supabase functions deploy roof-lookup
supabase functions deploy send-er-report
supabase functions deploy send-parts-report
supabase functions deploy send-quote-email
```

#### Testing steps
1. From the dashboard (`https://patriotsrv.github.io`), test the Kenect modal — confirm messages load.
2. From a local `localhost:8080` test page, attempt a direct `fetch()` to the Edge Function. Confirm the response has an empty or missing `Access-Control-Allow-Origin` header.
3. Confirm no functionality regression in the main dashboard.

---

### Issue 8 — Supabase Anon Key Appears 10 Times

**Session: S7**

#### Risk (plain English)
The `SUPABASE_ANON_KEY` JWT is defined once at line 7902 as a `const` but then also hardcoded inline at 9 other locations (lines 4051, 10190, 10222, 10428, 11034–11035) where it's used in `fetch()` Authorization headers. This is a maintenance problem: if the key is ever rotated (e.g., after a suspected exposure), all 10 occurrences must be updated. There is also one variant constant named `SUPABASE_ANON` in `analytics.html` and `closed-ros.html`.

#### Current occurrences in index.html

```
Line 7902:  const SUPABASE_ANON_KEY = 'eyJ...'     ← canonical definition
Line 4051:  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`   ← sendPhotosToCustomer()
Line 10190: headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, ... }  ← notifyPartsRequester()
Line 10222: headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, ... }  ← notifyPartsEtaUpdate()
Line 10428: 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,  ← submitPartsRequest()
Line 11034: 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,  ← kenectCall()
Line 11035: 'apikey': SUPABASE_ANON_KEY,                     ← kenectCall()
```

#### What to change

All of the inline fetch calls that use `SUPABASE_ANON_KEY` directly in Authorization headers should instead use the session token when a session is active:

```javascript
// BEFORE (notifyPartsRequester, ~line 10190)
headers: {
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
}

// AFTER — prefer session token; fall back to anon key
headers: {
    'Authorization': supabaseSession?.access_token
        ? `Bearer ${supabaseSession.access_token}`
        : `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
}
```

Apply this pattern to all 6 inline fetch call sites listed above. The `SUPABASE_ANON_KEY` constant itself stays (it's needed for `getSB()` client creation and as a fallback).

For `kenectCall()` (lines 11034–11035), the `apikey` header is Supabase's standard header for its anon key identification — it must remain the anon key even when the session token is used for Authorization.

#### Supabase migrations needed
None.

#### Testing steps
1. Confirm there are still exactly 1 occurrence of the literal JWT string (the constant definition).
2. Test email notifications by requesting parts and verifying the email fires.
3. Test Kenect messaging — confirm messages send.
4. Confirm no 401 errors in the Supabase Edge Function logs.

---

### Issue 9 — Google Calendar IDs Hardcoded

**Session: S7**

#### Risk (plain English)
Eight Google Calendar UUIDs are hardcoded in the `CALENDAR_IDS` constant (~line 8204). These cannot be changed without a code edit and redeploy. If a calendar is deleted and recreated (e.g., after a Google Workspace reorganization), a hotfix deploy is required. Moving them to a config table lets Roland update them from the Admin settings.

#### Current hardcoded constant

```javascript
const CALENDAR_IDS = {
    'Roof':          'c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com',
    'Solar':         'c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com',
    'Vroom':         'c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com',
    'Repairs':       'c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com',
    'TrueTopper':    'c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com',
    'Paint and Body': 'c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com',
    'Detailing':     'c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com',
    'Chassis':       'c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com',
};
```

#### What to change

**Step 1 — Create `app_config` table**

```sql
-- File: supabase/migrations/app_config_table.sql

CREATE TABLE IF NOT EXISTS app_config (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL,
    label   TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config
CREATE POLICY "config_select_authenticated"
  ON app_config FOR SELECT TO authenticated USING (true);

-- Only Admins can write config
CREATE POLICY "config_write_admin"
  ON app_config FOR ALL TO authenticated
  USING (has_role('Admin')) WITH CHECK (has_role('Admin'));

-- Seed with current Calendar IDs
INSERT INTO app_config (key, value, label) VALUES
  ('calendar_id_roof',          'c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com', 'Roof Calendar ID'),
  ('calendar_id_solar',         'c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com', 'Solar Calendar ID'),
  ('calendar_id_vroom',         'c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com', 'Vroom Calendar ID'),
  ('calendar_id_repairs',       'c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com', 'Repairs Calendar ID'),
  ('calendar_id_truetopper',    'c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com', 'TrueTopper Calendar ID'),
  ('calendar_id_paint_and_body','c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com', 'Paint & Body Calendar ID'),
  ('calendar_id_detailing',     'c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com', 'Detailing Calendar ID'),
  ('calendar_id_chassis',       'c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com', 'Chassis Calendar ID')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

**Step 2 — Add `loadAppConfig()` function in index.html**

Add after `loadStaff()` (~line 11795):

```javascript
let _appConfig = {};  // { key: value }

async function loadAppConfig() {
    try {
        const { data, error } = await getSB()
            .from('app_config')
            .select('key, value');
        if (!error && data) {
            _appConfig = Object.fromEntries(data.map(r => [r.key, r.value]));
        }
    } catch(e) {
        log('app_config load failed, using hardcoded defaults:', e);
    }
}
```

**Step 3 — Replace `CALENDAR_IDS` constant with a dynamic getter**

```javascript
// BEFORE — static constant
const CALENDAR_IDS = { ... };

// AFTER — dynamic with fallback to hardcoded values
const CALENDAR_IDS_FALLBACK = {
    'Roof':           'c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com',
    'Solar':          'c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com',
    'Vroom':          'c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com',
    'Repairs':        'c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com',
    'TrueTopper':     'c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com',
    'Paint and Body': 'c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com',
    'Detailing':      'c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com',
    'Chassis':        'c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com',
};

function getCalendarId(serviceType) {
    const key = 'calendar_id_' + serviceType.toLowerCase().replace(/ /g, '_').replace(/&/g, '').replace(/__/g, '_');
    return _appConfig[key] || CALENDAR_IDS_FALLBACK[serviceType] || null;
}
```

**Step 4 — Update all `CALENDAR_IDS[...]` references**

```javascript
// BEFORE (in proceedWithSchedule, ~line 5633)
const calId = CALENDAR_IDS[silo];

// AFTER
const calId = getCalendarId(silo);
```

Find and replace all `CALENDAR_IDS[` with `getCalendarId(` (adjust closing bracket/syntax for each call site).

**Step 5 — Call `loadAppConfig()` during auth**

In the successful auth callback (alongside `loadUserRoles()` and `loadStaff()`):

```javascript
await loadAppConfig();
```

#### Supabase migrations needed
See Step 1 above (`app_config_table.sql`).

#### Testing steps
1. Run the migration — confirm 8 rows in `app_config` table.
2. Load the dashboard. Open a schedule modal and confirm calendar events still create correctly.
3. In Supabase, update one `app_config` value (e.g., change `calendar_id_vroom` to a test calendar ID).
4. Reload the dashboard — confirm `getCalendarId('Vroom')` returns the new value without a code change.
5. Restore the original value.

---

### Issue 10 — `is_silo_manager()` Missing `SET search_path`

**Session: S7**

#### Risk (plain English)
The `is_silo_manager()` PostgreSQL function is defined with `SECURITY DEFINER`, which means it runs with the permissions of the function owner (the superuser), not the calling user. Without `SET search_path = public`, a malicious database user could create a schema that shadows the `staff` table and redirect the function to read from a fake table, bypassing the access check. This is a low-likelihood attack (requires database-level access) but it's a 2-line fix.

#### Current function definition (`supabase/migrations/work_assignment.sql`, line 24)

```sql
CREATE OR REPLACE FUNCTION is_silo_manager(silo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    has_role('Admin')
    OR EXISTS (
      SELECT 1 FROM staff
      WHERE email = (auth.jwt() ->> 'email')
        AND active = true
        AND (
          role = 'sr_manager'
          OR (role = 'manager' AND service_silo = silo)
        )
    );
$$;
```

#### What to change

```sql
-- File: supabase/migrations/fix_is_silo_manager_search_path.sql

CREATE OR REPLACE FUNCTION is_silo_manager(silo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public          -- ADD THIS LINE
AS $$
  SELECT
    has_role('Admin')
    OR EXISTS (
      SELECT 1 FROM staff
      WHERE email = (auth.jwt() ->> 'email')
        AND active = true
        AND (
          role = 'sr_manager'
          OR (role = 'manager' AND service_silo = silo)
        )
    );
$$;
```

Run this migration in the Supabase SQL Editor (it replaces the function in-place, no downtime).

#### Supabase migrations needed
`supabase/migrations/fix_is_silo_manager_search_path.sql` (content above).

#### Testing steps
1. Run the migration in Supabase SQL Editor. Confirm no errors.
2. Sign in as a Manager (e.g., Mauricio). Open a Work Order — confirm silo access still works correctly.
3. Sign in as a Tech. Confirm Work Order edit access is denied for non-assigned silos.
4. Run `\df+ is_silo_manager` in psql or check the Supabase function inspector to confirm `search_path=public` appears in the function definition.

---

## Appendix A — Migration File Index

| File | Session | Contents |
|---|---|---|
| `supabase/migrations/add_kevin_sr_manager.sql` | S2 | Adds Kevin McHenry to staff table |
| `supabase/migrations/tighten_enhancement_requests_rls.sql` | S3 | Removes anon INSERT on enhancement_requests |
| `supabase/migrations/fix_is_silo_manager_search_path.sql` | S7 | Adds SET search_path to is_silo_manager() |
| `supabase/migrations/app_config_table.sql` | S7 | Creates app_config table, seeds Calendar IDs |
| `supabase/functions/claude-vision-proxy/index.ts` | S4 | New Edge Function for Anthropic API proxy |

---

## Appendix B — Functions Modified in index.html

| Function | Lines | Change |
|---|---|---|
| *(new)* `escapeHtml()` | Insert ~6633 | New utility |
| `renderBoard()` | 7171–7756 | Apply escapeHtml to all DB field interpolations |
| `renderKenectMessages()` | 11134+ | Apply escapeHtml to message body |
| `openPhotoLibrary()` | ~3813 | Apply escapeHtml to customerName in title |
| `openPartsModal()` | ~6013 | Apply escapeHtml |
| `openPartsRequestModal()` | ~10261 | Apply escapeHtml |
| `openPartsStatusModal()` | ~10603 | Apply escapeHtml |
| `openTimeLogsModal()` | ~10854 | Apply escapeHtml |
| `buildWOTaskRowHtml()` | 12114+ | Apply escapeHtml to task fields |
| `isAdmin()` | 8220 | Remove ADMIN_EMAILS fallback |
| `hasRole()` | 8223 | Remove MANAGER_EMAILS/ADMIN_EMAILS fallback |
| `canSeeWorkList()` | ~6685 | Replace email array checks with role checks |
| `isSrManagerOrAdmin()` | ~6691 | Replace email array checks with role checks |
| `canManageSilo()` | ~11815 | Replace email array checks with role checks |
| `loadUserRoles()` | 8233 | Add staff table role merge |
| `loadDataFromSupabase()` | ~9071 | Replace ADMIN_EMAILS check |
| `callClaudeVision()` | 4823 | Replace direct Anthropic call with proxy fetch |
| `openEstimateScanner()` | 4597 | Remove apiKey parameter |
| `handleEstimateFile()` | 4605 | Remove apiKey parameter |
| *(new)* `log()` / `warn()` | Insert ~7910 | Debug-gated logging wrappers |
| *(new)* `loadAppConfig()` | Insert ~11800 | Load app_config table |
| *(new)* `getCalendarId()` | Insert ~8210 | Dynamic calendar ID lookup |
| `setupEventListeners()` | 6477 | Add boardGrid event delegation |
| *(new)* `loadAppConfig()` call | Auth callback | Load config on auth |

---

## Appendix C — Session Sequencing Notes

**S1 must come first** — the escapeHtml utility is a prerequisite for safe rendering regardless of other changes. It has zero risk of regression since it only adds encoding.

**S2 should come before S3** — the analytics.html auth change references `checkIsAdmin()` which uses the staff table role system that S2 sets up.

**S4 can run in parallel with S2/S3** — the Anthropic proxy is completely independent.

**S5 (console.log)** is low-risk and can be done in any session that has slack time.

**S6 (onclick migration)** is the highest-effort change per-session. Start with the card grid only; defer modal onclick to future sessions.

**S7 groups four small MEDIUM items** — each can be done independently if S7 runs long.
