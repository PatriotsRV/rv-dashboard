# PRVS Dashboard — Security Remediation Plan

**Version:** 1.0  
**Target file:** `index.html` (v1.308, ~13,649 lines) + `worklist-report.html`, `closed-ros.html`, `analytics.html`, `checkin.html`  
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
| **S2** | #2 (RBAC) | Remove hardcoded email arrays from all 5 files, migrate to Supabase role-based access (6 DB migrations + ~40 code changes across index.html, worklist-report.html, closed-ros.html, analytics.html, checkin.html) |
| **S3** | #3 (analytics.html auth) | Full Supabase session auth in analytics.html |
| **S4** | #4 (Anthropic key) | Edge Function proxy for Claude Vision |
| **S5** | #5 (console.log) | Debug flag / logging removal |
| **S6** | #6 (inline onclick) | addEventListener migration (board cards) |
| **S7** | #7–#10 (MEDIUM) | CORS, anon key, Calendar IDs, search_path |

---

## Pre-Implementation Backup — REQUIRED BEFORE ANY CHANGES

> **Claude: Run these steps at the start of the first Security Remediation session (S1), before writing any code.** This creates a known-good restore point for the entire remediation effort.

### Step 1 — Full Backup (files + Supabase data + git tag)

> `backup.sh` supports `--supabase` (exports all 20 Supabase tables to JSON) and `--tag <name>` (creates + pushes a named git tag). Both are optional flags — without them it only snapshots local files.

```bash
bash scripts/backup.sh --supabase --tag pre-security-remediation
```

This single command will:
1. Snapshot all HTML pages + Edge Functions into `.backups/<timestamp>/`
2. Export all 20 Supabase tables to `.backups/<timestamp>/supabase-data/*.json` (requires `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in environment or `.env`)
3. Create and push git tag `pre-security-remediation` — a permanent restore point

If anything goes wrong during any session (S1–S7), Roland can restore to exactly this state with:
```bash
git checkout pre-security-remediation
```

### Step 2 — Local HTML Backup
```bash
cp index.html index.html.backup-pre-security
```
This keeps a side-by-side copy of the monolith in the working directory. Do **not** commit this file — it's a local safety net only.

### Verification
Before proceeding to S1, confirm all of these:
- [ ] `backup.sh` ran successfully (file snapshot saved)
- [ ] Supabase export completed (20 tables exported, check output for failures)
- [ ] `pre-security-remediation` tag exists on GitHub (`git tag -l | grep pre-security`)
- [ ] `index.html.backup-pre-security` exists in the repo root (`ls -la index.html.backup*`)

Report the verification results to Roland before starting any code changes.

> **Note:** For routine session backups (pause/end), just run `bash scripts/backup.sh` without flags — it will only snapshot files, no Supabase export or tagging.

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
Three arrays of real employee email addresses live in plain text in the JavaScript source of **five separate files**, visible to anyone who opens browser DevTools → Sources. More importantly, if you hire or fire someone, you have to edit code in up to five files and redeploy instead of just updating a database row. The `staff` table already exists with 19 people — this change cuts the cord between the code and the email lists across the entire codebase.

#### Scope — 5 Files, ~40 Call Sites

| File | Hardcoded Arrays | Call Sites | Notes |
|---|---|---|---|
| `index.html` | `ADMIN_EMAILS`, `MANAGER_EMAILS`, `SR_MANAGER_EMAILS` | ~16 | Core app — most complex; has `loadUserRoles()` + `_staffCache` already |
| `worklist-report.html` | `ADMIN_EMAILS`, `SR_MANAGER_EMAILS`, `MANAGER_EMAILS` | 10 | Admin-only report page; no `loadUserRoles()` — needs new role system |
| `closed-ros.html` | `ADMIN_EMAILS`, `SR_MANAGER_EMAILS`, `MANAGER_EMAILS` | 6 | Archive viewer; no `loadUserRoles()` — needs new role system |
| `analytics.html` | `ADMIN_EMAILS` | 3 | Admin-only analytics; no `loadUserRoles()` — needs new role system |
| `checkin.html` | `ADMIN_EMAILS` | 1 | Tech check-in kiosk; `ADMIN_EMAILS` declared but never used — dead code |

---

#### Phase 1 — Database Migrations (run FIRST, before any code changes)

**Step 1.1 — Add "Sr Manager" role to the `roles` table**

The `roles` table has 6 roles but "Sr Manager" is missing. This role is needed for `hasRole('Sr Manager')` checks.

```sql
-- Migration: add_sr_manager_role.sql
-- Run in Supabase SQL Editor

INSERT INTO roles (name)
VALUES ('Sr Manager')
ON CONFLICT (name) DO NOTHING;
```

**Step 1.2 — Assign Admin role to Roland and Lynn in `user_roles`**

The `user_roles` table currently has 7 entries. Roland (`roland@patriotsrvservices.com`) and Lynn (`lynn@patriotsrvservices.com`) are MISSING their Admin role assignments. Without this, `isAdmin()` will return `false` once we remove the email fallback.

```sql
-- Migration: assign_admin_roles.sql
-- Run in Supabase SQL Editor

-- Get the Admin role ID
-- Then insert user_roles for Roland and Lynn

DO $$
DECLARE
    admin_role_id UUID;
    roland_user_id UUID;
    lynn_user_id UUID;
BEGIN
    -- Get Admin role ID
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';
    IF admin_role_id IS NULL THEN
        RAISE EXCEPTION 'Admin role not found in roles table';
    END IF;

    -- Get Roland's user ID
    SELECT id INTO roland_user_id FROM users WHERE email = 'roland@patriotsrvservices.com';
    IF roland_user_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id)
        VALUES (roland_user_id, admin_role_id)
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Roland assigned Admin role';
    ELSE
        RAISE WARNING 'Roland not found in users table — he must sign in once first, then re-run this';
    END IF;

    -- Get Lynn's user ID
    SELECT id INTO lynn_user_id FROM users WHERE email = 'lynn@patriotsrvservices.com';
    IF lynn_user_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id)
        VALUES (lynn_user_id, admin_role_id)
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Lynn assigned Admin role';
    ELSE
        RAISE WARNING 'Lynn not found in users table — she must sign in once first, then re-run this';
    END IF;
END $$;
```

**Step 1.3 — Assign Sr Manager roles in `user_roles`**

Ryan, Kevin, and Sofia are Sr Managers in the hardcoded arrays. They need `user_roles` entries so `hasRole('Sr Manager')` works.

```sql
-- Migration: assign_sr_manager_roles.sql
-- Run in Supabase SQL Editor

DO $$
DECLARE
    sr_mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
BEGIN
    SELECT id INTO sr_mgr_role_id FROM roles WHERE name = 'Sr Manager';
    IF sr_mgr_role_id IS NULL THEN
        RAISE EXCEPTION 'Sr Manager role not found — run Step 1.1 first';
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'ryan@patriotsrvservices.com',
        'kevin@patriotsrvservices.com',
        'sofia@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            INSERT INTO user_roles (user_id, role_id)
            VALUES (_user_id, sr_mgr_role_id)
            ON CONFLICT DO NOTHING;
            RAISE NOTICE '% assigned Sr Manager role', _email;
        ELSE
            RAISE WARNING '% not found in users table — they must sign in first', _email;
        END IF;
    END LOOP;
END $$;
```

**Step 1.4 — Assign Manager roles in `user_roles`**

All managers in the hardcoded `MANAGER_EMAILS` array need `user_roles` entries. Note: Ryan is both a Sr Manager and in MANAGER_EMAILS — he gets both roles.

```sql
-- Migration: assign_manager_roles.sql
-- Run in Supabase SQL Editor

DO $$
DECLARE
    mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
BEGIN
    SELECT id INTO mgr_role_id FROM roles WHERE name = 'Manager';
    IF mgr_role_id IS NULL THEN
        RAISE EXCEPTION 'Manager role not found in roles table';
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'ryan@patriotsrvservices.com',
        'mauricio@patriotsrvservices.com',
        'jason@patriotsrvservices.com',
        'andrew@patriotsrvservices.com',
        'solar@patriotsrvservices.com',
        'bobby@patriotsrvservices.com',
        'brandon@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            INSERT INTO user_roles (user_id, role_id)
            VALUES (_user_id, mgr_role_id)
            ON CONFLICT DO NOTHING;
            RAISE NOTICE '% assigned Manager role', _email;
        ELSE
            RAISE WARNING '% not found in users table — they must sign in first', _email;
        END IF;
    END LOOP;
END $$;
```

**Step 1.5 — Ensure Kevin McHenry exists in `staff` table**

Kevin is in `SR_MANAGER_EMAILS` but may be missing from the `staff` table:

```sql
-- Migration: ensure_kevin_in_staff.sql

INSERT INTO staff (name, email, role, service_silo)
VALUES ('Kevin McHenry', 'kevin@patriotsrvservices.com', 'sr_manager', NULL)
ON CONFLICT (email) DO UPDATE SET role = 'sr_manager', active = TRUE;
```

**Step 1.6 — Ensure Sofia exists in `staff` table**

Sofia is in `SR_MANAGER_EMAILS` and `closed-ros.html` — verify she's in staff:

```sql
INSERT INTO staff (name, email, role, service_silo)
VALUES ('Sofia', 'sofia@patriotsrvservices.com', 'sr_manager', NULL)
ON CONFLICT (email) DO UPDATE SET role = 'sr_manager', active = TRUE;
```

**Verification query — run after all migrations:**

```sql
-- Verify: all hardcoded emails now have matching user_roles entries
SELECT u.email, r.name AS role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY r.name, u.email;

-- Verify: Sr Manager role exists
SELECT * FROM roles WHERE name = 'Sr Manager';

-- Verify: staff table has all expected entries
SELECT name, email, role, active FROM staff WHERE active = TRUE ORDER BY role, name;
```

> **IMPORTANT:** If any users show "not found in users table" warnings, they need to sign in to the dashboard once (which triggers `upsertUser()`), then re-run the relevant migration.

#### Pre-flight Safety Check — Email-Fallback Access (run after EACH Phase 1 step)

During Phase 1 the code is unchanged — all five files still have hardcoded `ADMIN_EMAILS` arrays. Roland and Lynn's access flows through two parallel paths:

1. **Email fallback (always works during Phase 1):** `isAdmin()` in index.html checks `ADMIN_EMAILS.includes(email)` at line 8238 as a fallback after the `userRoles` check. worklist-report.html, closed-ros.html, and analytics.html use `ADMIN_EMAILS.includes()` exclusively — they have no `userRoles` system yet.
2. **Database path (being built by Phase 1):** `loadUserRoles()` in index.html queries `user_roles` → populates `userRoles[]` → `isAdmin()` checks `userRoles.includes('Admin')`. Also has a hardcoded Roland catch at line 8271.

The risk: a bad migration could cause `loadUserRoles()` to throw an unhandled error before it reaches the email fallback. Run the following check after **each** Phase 1 step to confirm the database path doesn't break.

**After Step 1.1 (add Sr Manager role):**

```sql
-- Confirm roles table is clean — no duplicate names, no nulls
SELECT name, COUNT(*) FROM roles GROUP BY name HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)

-- Confirm the new role didn't break the roles FK relationship
SELECT ur.user_id, ur.role_id
FROM user_roles ur
LEFT JOIN roles r ON r.id = ur.role_id
WHERE r.id IS NULL;
-- Expected: 0 rows (no orphaned role references)
```

Then open the dashboard in a browser, sign in as Roland, and verify:
- Console shows `✅ User roles: [...]` (the `loadUserRoles()` log at line 8268)
- No errors in console related to roles/user_roles queries
- All admin buttons visible (Admin Settings, Analytics, Work List Report, etc.)

**After Step 1.2 (assign Admin to Roland and Lynn):**

```sql
-- Confirm Roland and Lynn now have Admin in user_roles
SELECT u.email, r.name
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE u.email IN ('roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com');
-- Expected: 2 rows — roland/Admin, lynn/Admin

-- Confirm no duplicate role assignments were created
SELECT user_id, role_id, COUNT(*)
FROM user_roles
GROUP BY user_id, role_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

Then in the browser console (as Roland):
```javascript
// Both paths should now return true:
userRoles.includes('Admin')  // true — database path
isAdmin()                     // true — should hit userRoles first, email fallback also works
```

**After Step 1.3 (assign Sr Manager to Ryan, Kevin, Sofia):**

```sql
-- Confirm Sr Manager assignments exist
SELECT u.email, r.name
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE r.name = 'Sr Manager';
-- Expected: 3 rows — ryan, kevin, sofia

-- Confirm Roland's roles are untouched
SELECT u.email, r.name
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'roland@patriotsrvservices.com';
-- Expected: 1 row — roland/Admin (unchanged from Step 1.2)
```

Refresh dashboard as Roland — confirm admin access still works, no console errors.

**After Step 1.4 (assign Manager to 7 managers):**

```sql
-- Confirm total user_roles count is correct
SELECT COUNT(*) FROM user_roles;
-- Expected: 7 (pre-existing) + 2 (Admin: Roland, Lynn) + 3 (Sr Manager) + 3 (new Managers: jason, solar, bobby) = 15
-- Note: ryan already had Manager, so ON CONFLICT DO NOTHING keeps it at 15, not 16

-- Confirm Roland and Lynn still have exactly Admin
SELECT u.email, r.name
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE u.email IN ('roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com')
ORDER BY u.email;
-- Expected: roland/Admin, lynn/Admin — nothing else added
```

Refresh dashboard as Roland — confirm admin access still works.

**After Steps 1.5 and 1.6 (Kevin and Sofia staff UPSERTs):**

These are no-ops (both already exist as `sr_manager`), but confirm nothing changed:

```sql
-- Confirm Kevin and Sofia staff entries are unchanged
SELECT name, email, role, active FROM staff
WHERE email IN ('kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com');
-- Expected: Kevin/sr_manager/true, Sofia/sr_manager/true

-- Final full state check — all user_roles
SELECT u.email, r.name AS role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY r.name, u.email;
```

> **Why this matters:** Phase 2 removes the email fallback from `isAdmin()` and `hasRole()`. If the database path is broken after Phase 1, Phase 2 will lock everyone out. These checks confirm the database path is solid before any code changes begin.
>
> **If any check fails:** Run `bash scripts/rollback-s2-phase1.sh --step <N>` to revert the specific step, or `--verify` to inspect the current state. See the Rollback plan section below for full details.

---

#### Phase 2 — index.html Changes (~16 call sites)

index.html is the most complex file because it already has `loadUserRoles()`, `userRoles[]`, `isAdmin()`, `hasRole()`, and `_staffCache`. The strategy is: (a) enhance `loadUserRoles()` to also read from `staff` table, (b) rewrite `isAdmin()`/`hasRole()` to use `userRoles` only (no email fallback), (c) rewrite work list functions to use `_staffCache`, (d) delete the three hardcoded arrays.

**Step 2.1 — Enhance `loadUserRoles()` to merge staff table roles (~line 8250)**

The existing `loadUserRoles()` queries `user_roles` junction table. We add a second query to `staff` to pull the user's operational role and silo:

```javascript
// BEFORE (~line 8250)
async function loadUserRoles() {
    if (!supabaseSession) return;
    try {
        const email = supabaseSession.user.email;
        // Get user record
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (!userRecord) return;
        // Get roles via junction table
        const { data: roleData } = await getSB()
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', userRecord.id);
        if (roleData) {
            userRoles = roleData.map(r => r.roles?.name).filter(Boolean);
            console.log('✅ User roles:', userRoles);
        }
        // Admin fallback — always give Roland admin
        if (email === 'roland@patriotsrvservices.com' && !userRoles.includes('Admin')) {
            userRoles.push('Admin');
        }
    } catch(e) {
        console.warn('Could not load roles:', e);
        // Fallback: give admin to roland
        if (supabaseSession?.user?.email === 'roland@patriotsrvservices.com') {
            userRoles = ['Admin'];
        }
    }
}

// AFTER
async function loadUserRoles() {
    if (!supabaseSession) return;
    try {
        const email = supabaseSession.user.email;
        // Get user record
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (!userRecord) return;
        // Get roles via junction table
        const { data: roleData } = await getSB()
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', userRecord.id);
        if (roleData) {
            userRoles = roleData.map(r => r.roles?.name).filter(Boolean);
        }

        // Also read staff table for operational role + silo
        try {
            const { data: staffRecord } = await getSB()
                .from('staff')
                .select('role, service_silo, active')
                .eq('email', email)
                .maybeSingle();

            if (staffRecord && staffRecord.active) {
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
                // Store silo + staff role for canManageSilo() and solar access
                window._currentStaffSilo = staffRecord.service_silo || null;
                window._currentStaffRole = staffRecord.role || null;
            }
        } catch (e) {
            // Non-critical — staff lookup is supplementary
        }

        console.log('✅ User roles:', userRoles);
    } catch(e) {
        console.warn('Could not load roles:', e);
    }
}
```

> **Key change:** Removed the hardcoded Roland fallback (`if (email === 'roland@...')`) — Roland now gets Admin from the `user_roles` table (Step 1.2). Also removed the catch-block Roland fallback.

**Step 2.2 — Rewrite `isAdmin()` (~line 8235)**

```javascript
// BEFORE
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

**Step 2.3 — Rewrite `hasRole()` (~line 8241)**

```javascript
// BEFORE
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

**Step 2.4 — Rewrite `canSeeWorkList()` (~line 6700)**

```javascript
// BEFORE
function canSeeWorkList() {
    const email = supabaseSession?.user?.email || '';
    return SR_MANAGER_EMAILS.includes(email) ||
           ADMIN_EMAILS.includes(email) ||
           MANAGER_EMAILS.includes(email);
}

// AFTER
function canSeeWorkList() {
    return isAdmin() || hasRole('Sr Manager') || hasRole('Manager');
}
```

**Step 2.5 — Rewrite `isSrOrAdmin()` (~line 6706)**

```javascript
// BEFORE
function isSrOrAdmin() {
    const email = supabaseSession?.user?.email || '';
    return SR_MANAGER_EMAILS.includes(email) || ADMIN_EMAILS.includes(email);
}

// AFTER
function isSrOrAdmin() {
    return isAdmin() || hasRole('Sr Manager');
}
```

**Step 2.6 — Rewrite `_populateManagerPicker()` (~line 6734)**

Replace hardcoded email arrays with `_staffCache`:

```javascript
// BEFORE (~line 6738–6743)
if (!isSrOrAdmin()) { bar.style.display = 'none'; return; }
bar.style.display = 'block';
const all = [...(SR_MANAGER_EMAILS || []), ...(MANAGER_EMAILS || [])];
const myEmail = supabaseSession?.user?.email || '';
sel.innerHTML = '<option value="">— My List —</option>' +
    all.filter(e => e !== myEmail).map(e => `<option value="${e}">${e}</option>`).join('');

// AFTER
if (!isSrOrAdmin()) { bar.style.display = 'none'; return; }
bar.style.display = 'block';
const managerStaff = (_staffCache || []).filter(s =>
    s.active && (s.role === 'manager' || s.role === 'sr_manager' || s.role === 'parts_manager')
);
const myEmail = (supabaseSession?.user?.email || '').toLowerCase();
sel.innerHTML = '<option value="">— My List —</option>' +
    managerStaff
        .filter(s => s.email.toLowerCase() !== myEmail)
        .map(s => `<option value="${escapeHtml(s.email)}">${escapeHtml(s.name)} (${escapeHtml(s.email)})</option>`)
        .join('');
```

Note: `_staffCache` is populated by `loadStaff()` which is called during auth. If empty at this point, add `if (!_staffCache.length) await loadStaff();` before the filter.

**Step 2.7 — Rewrite `_renderWorkListSiloTabs()` isSrManagerList check (~line 6908)**

```javascript
// BEFORE (~line 6907–6908)
const targetEmail = _workListViewEmail || supabaseSession?.user?.email || '';
const isSrManagerList = SR_MANAGER_EMAILS.includes(targetEmail) || ADMIN_EMAILS.includes(targetEmail);

// AFTER
const targetEmail = _workListViewEmail || supabaseSession?.user?.email || '';
// Check if the viewed list belongs to a Sr Manager or Admin via staff table
const targetStaff = (_staffCache || []).find(s => s.email.toLowerCase() === targetEmail.toLowerCase());
const isSrManagerList = (targetStaff && targetStaff.role === 'sr_manager') ||
    (!_workListViewEmail && (isAdmin() || hasRole('Sr Manager')));
```

**Step 2.8 — Fix Solar access check (~line 8312)**

```javascript
// BEFORE
const hasSolarAccess = isAdmin() || hasRole('Solar') ||
    (currentUser && ['solar@patriotsrvservices.com','tipton@patriotsrvservices.com','ryan@patriotsrvservices.com'].includes(currentUser.email?.toLowerCase()));

// AFTER — use staff table silo assignment
const hasSolarAccess = isAdmin() || hasRole('Solar') ||
    window._currentStaffSilo === 'solar' ||
    window._currentStaffRole === 'sr_manager';
```

> **Note:** Sr Managers (Ryan, Kevin, Sofia) get solar access by virtue of their role; solar@ and tipton@ should have `service_silo = 'solar'` in the staff table. Verify: `SELECT name, email, service_silo FROM staff WHERE service_silo = 'solar' OR role = 'sr_manager';`

**Step 2.9 — Fix `loadDataFromSupabase()` fallback (~line 9088)**

```javascript
// BEFORE
const _isAdminNow = isAdmin() || ADMIN_EMAILS.includes(_sessionEmail);

// AFTER
const _isAdminNow = isAdmin();
```

The `_sessionEmail` variable on line 9087 can be left in place (it's used for logging) or removed. The `ADMIN_EMAILS` reference must go.

**Step 2.10 — Rewrite `isSrManagerOrAdmin()` in WO module (~line 11830)**

```javascript
// BEFORE
function isSrManagerOrAdmin() {
    const email = (supabaseSession?.user?.email || currentUser?.email || '').toLowerCase();
    if (isAdmin() || ADMIN_EMAILS.includes(email)) return true;
    if (SR_MANAGER_EMAILS.includes(email)) return true;
    return _staffCache.some(s => s.email.toLowerCase() === email && s.role === 'sr_manager');
}

// AFTER
function isSrManagerOrAdmin() {
    return isAdmin() || hasRole('Sr Manager');
}
```

**Step 2.11 — Rewrite `canManageSilo()` in WO module (~line 11837)**

```javascript
// BEFORE
function canManageSilo(silo) {
    if (isSrManagerOrAdmin()) return true;
    const email = (supabaseSession?.user?.email || currentUser?.email || '').toLowerCase();
    return _staffCache.some(s =>
        s.email.toLowerCase() === email &&
        s.role === 'manager' &&
        s.service_silo === silo
    );
}

// AFTER
function canManageSilo(silo) {
    if (isAdmin() || hasRole('Sr Manager')) return true;
    // Silo-specific manager: check staff table silo assignment
    if (hasRole('Manager') && window._currentStaffSilo === silo) return true;
    return false;
}
```

**Step 2.12 — Replace hardcoded `mailto:roland@` (~line 4819)**

```javascript
// BEFORE
window.location.href = `mailto:roland@patriotsrvservices.com?subject=${subject}&body=${body}`;

// AFTER — send to the first Admin in the staff/users tables, or fall back
const adminEmail = (_staffCache || []).find(s => s.role === 'admin')?.email || 'roland@patriotsrvservices.com';
window.location.href = `mailto:${encodeURIComponent(adminEmail)}?subject=${subject}&body=${body}`;
```

> **Alternative:** If you want this to always go to the owner regardless of role changes, keep it hardcoded but add a comment: `// Owner email — intentionally hardcoded`. Roland can decide.

**Step 2.13 — Delete the three constant declarations (~lines 8140–8150)**

After all call sites above are updated and tested, delete these lines entirely:

```javascript
// DELETE these constant declarations:
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
const SR_MANAGER_EMAILS = ['ryan@patriotsrvservices.com', 'kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com'];
```

**Remaining `isAdmin()` call sites that need NO code changes** (they already call the function, which will now use roles):

| Line | Context | Why it's fine |
|---|---|---|
| 3229 | `if (!isAdmin())` in `saveCurrentAsPreset()` | Calls `isAdmin()` — works with new role-based version |
| 3243 | `if (!isAdmin())` in `setViewMode('custom')` | Same |
| 3251 | `if (!isAdmin())` in `setViewMode('expanded')` | Same |
| 4150 | `if (!isAdmin())` in `archiveRO()` | Same |
| 4727 | `if (isAdmin())` in card render | Same |
| 7413 | `${isAdmin() ? ...}` in RO card template | Same |
| 7444 | `${(isAdmin() || hasRole('Manager'))...}` | Same |
| 7449 | `${(isAdmin() || hasRole('Manager'))...}` | Same |
| 7454 | `${isAdmin() && ...}` | Same |
| 8307 | `isAdmin() ? 'inline-block' : 'none'` | Same |
| 8319 | Analytics button visibility | Same |
| 8324 | WL Report button visibility | Same |
| 8334 | ER Admin button visibility | Same |
| 8335 | `if (isAdmin()) loadERUnreviewedCount()` | Same |
| 8339 | `if (manageDupesBtn && isAdmin())` | Same |
| 8351 | `if (isAdmin())` | Same |
| 9837 | `if (!isAdmin())` in `openDuplicateManager()` | Same |

---

#### Phase 3 — worklist-report.html Changes (10 call sites)

This file has NO `loadUserRoles()` or `userRoles[]` — it's a standalone admin report page. Strategy: add a shared `loadUserRoles()` function, rewrite `isAdmin()`, replace all hardcoded array references.

**Step 3.1 — Add `userRoles` state and `loadUserRoles()` function**

Add after the existing state declarations (~line 365, after `let _countdownSec = 180;`):

```javascript
// ── Role-based access ────────────────────────────────────
let userRoles = [];
window._currentStaffRole = null;

async function loadUserRoles() {
    if (!supabaseSession) return;
    try {
        const email = supabaseSession.user.email;
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (!userRecord) return;
        const { data: roleData } = await getSB()
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', userRecord.id);
        if (roleData) {
            userRoles = roleData.map(r => r.roles?.name).filter(Boolean);
        }
        // Also read staff table for operational role
        try {
            const { data: staffRecord } = await getSB()
                .from('staff')
                .select('role, active')
                .eq('email', email)
                .maybeSingle();
            if (staffRecord && staffRecord.active) {
                window._currentStaffRole = staffRecord.role || null;
                const staffRoleMap = {
                    'sr_manager': 'Sr Manager',
                    'manager': 'Manager',
                    'parts_manager': 'Manager',
                    'tech': 'Tech',
                };
                const mapped = staffRoleMap[staffRecord.role];
                if (mapped && !userRoles.includes(mapped)) {
                    userRoles.push(mapped);
                }
            }
        } catch (e) {}
        console.log('✅ WL Report roles:', userRoles);
    } catch(e) {
        console.warn('Could not load roles:', e);
    }
}

function hasRole(role) {
    return userRoles.includes(role);
}
```

**Step 3.2 — Rewrite `isAdmin()` (~line 421)**

```javascript
// BEFORE
function isAdmin() {
    const email = (currentUser?.email || '').toLowerCase();
    return ADMIN_EMAILS.includes(email);
}

// AFTER
function isAdmin() {
    return userRoles.includes('Admin');
}
```

**Step 3.3 — Update `initAuth()` to call `loadUserRoles()` before access check (~line 395)**

```javascript
// BEFORE (~line 388–398)
const { data: { session } } = await getSB().auth.getSession();
if (session) {
    supabaseSession = session;
    currentUser = {
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email,
    };
    if (isAdmin()) {
        showApp();
        return;
    }
}

// AFTER
const { data: { session } } = await getSB().auth.getSession();
if (session) {
    supabaseSession = session;
    currentUser = {
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email,
    };
    await loadUserRoles();
    if (isAdmin()) {
        showApp();
        return;
    }
}
```

**Step 3.4 — Update localStorage identity check to use roles (~line 406)**

```javascript
// BEFORE (~line 406)
if (parsed.email && ADMIN_EMAILS.includes(parsed.email.toLowerCase())) {
    currentUser = { email: parsed.email, name: parsed.name };
    if (supabaseSession) {
        showApp();
        return;
    }
}

// AFTER
if (parsed.email && supabaseSession) {
    currentUser = { email: parsed.email, name: parsed.name };
    await loadUserRoles();
    if (isAdmin()) {
        showApp();
        return;
    }
}
```

> **Note:** We require `supabaseSession` here because `loadUserRoles()` needs it to query Supabase. Without a session, we fall through to Google sign-in.

**Step 3.5 — Update `handleGoogleSignIn()` to load roles (~line 452)**

```javascript
// BEFORE
if (!isAdmin()) {

// AFTER — insert loadUserRoles() call before the check
await loadUserRoles();
if (!isAdmin()) {
```

**Step 3.6 — Replace admin filter in `renderReport()` (~line 586–591)**

```javascript
// BEFORE
const adminEmails = ADMIN_EMAILS.map(e => e.toLowerCase());
Object.keys(byManager).forEach(email => {
    if (adminEmails.includes(email.toLowerCase()) && !SR_MANAGER_EMAILS.includes(email.toLowerCase())) {
        delete byManager[email];
    }
});

// AFTER — filter out admins who are NOT also managers, using staff table
const adminStaff = (_allStaff || []).filter(s =>
    s.role !== 'sr_manager' && s.role !== 'manager' && s.role !== 'parts_manager' && s.role !== 'tech'
);
const adminOnlyEmails = adminStaff.map(s => s.email.toLowerCase());
Object.keys(byManager).forEach(email => {
    if (adminOnlyEmails.includes(email.toLowerCase())) {
        delete byManager[email];
    }
});
```

> **Logic:** Admins who are ALSO managers (dual-role) should still appear. We only hide pure-admin entries (like Roland/Lynn who manage the tool but don't have work lists).

**Step 3.7 — Replace manager sort by role (~line 594–600)**

```javascript
// BEFORE
const managerOrder = Object.keys(byManager).sort((a, b) => {
    const aIsSr = SR_MANAGER_EMAILS.includes(a);
    const bIsSr = SR_MANAGER_EMAILS.includes(b);
    if (aIsSr && !bIsSr) return -1;
    if (!aIsSr && bIsSr) return 1;
    return a.localeCompare(b);
});

// AFTER — use _allStaff to determine Sr Manager status
const managerOrder = Object.keys(byManager).sort((a, b) => {
    const aStaff = (_allStaff || []).find(s => s.email.toLowerCase() === a.toLowerCase());
    const bStaff = (_allStaff || []).find(s => s.email.toLowerCase() === b.toLowerCase());
    const aIsSr = aStaff?.role === 'sr_manager';
    const bIsSr = bStaff?.role === 'sr_manager';
    if (aIsSr && !bIsSr) return -1;
    if (!aIsSr && bIsSr) return 1;
    return a.localeCompare(b);
});
```

**Step 3.8 — Replace Sr Manager badge and silo grouping (~line 629–636)**

```javascript
// BEFORE
const isSr = SR_MANAGER_EMAILS.includes(email);
const roleBadge = isSr ? 'Sr Manager' : 'Manager';
// ... later:
if (isSr) {

// AFTER
const staffEntry = (_allStaff || []).find(s => s.email.toLowerCase() === email.toLowerCase());
const isSr = staffEntry?.role === 'sr_manager';
const roleBadge = isSr ? 'Sr Manager' : 'Manager';
// ... later:
if (isSr) {
```

**Step 3.9 — Replace admin filter in `renderStaffTiles()` (~line 690–691)**

```javascript
// BEFORE
const adminEmails = ADMIN_EMAILS.map(e => e.toLowerCase());
const staffToShow = _allStaff.filter(s => !adminEmails.includes(s.email.toLowerCase()));

// AFTER — filter out staff with no operational role (pure admins)
// If someone is in staff table, they should appear; hide only if they have no staff entry
// or their staff.role indicates non-operational (future-proof)
const staffToShow = _allStaff.filter(s => {
    // Show everyone who has an operational role (tech, manager, sr_manager, parts_manager)
    return ['tech', 'manager', 'sr_manager', 'parts_manager'].includes(s.role);
});
```

**Step 3.10 — Delete the three constant declarations (~lines 331–341)**

```javascript
// DELETE these constant declarations:
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];
const SR_MANAGER_EMAILS = ['ryan@patriotsrvservices.com', 'kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com'];
const MANAGER_EMAILS = [
    'ryan@patriotsrvservices.com',
    'mauricio@patriotsrvservices.com',
    // ...
];
```

---

#### Phase 4 — closed-ros.html Changes (6 call sites)

This file has `ADMIN_EMAILS`, `SR_MANAGER_EMAILS`, `MANAGER_EMAILS`, `isAdmin()`, and `isManagerOrAdmin()`. No existing `loadUserRoles()`. Strategy: add role system, rewrite access functions, remove arrays.

**Step 4.1 — Add `userRoles` state and `loadUserRoles()` function**

Add after line 363 (after `let currentPage = 1;`):

```javascript
// ── Role-based access ────────────────────────────────────
let userRoles = [];

async function loadUserRoles() {
    if (!supabaseSession) return;
    try {
        const email = supabaseSession.user.email;
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (!userRecord) return;
        const { data: roleData } = await getSB()
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', userRecord.id);
        if (roleData) {
            userRoles = roleData.map(r => r.roles?.name).filter(Boolean);
        }
        // Also read staff table
        try {
            const { data: staffRecord } = await getSB()
                .from('staff')
                .select('role, active')
                .eq('email', email)
                .maybeSingle();
            if (staffRecord && staffRecord.active) {
                const staffRoleMap = {
                    'sr_manager': 'Sr Manager',
                    'manager': 'Manager',
                    'parts_manager': 'Manager',
                    'tech': 'Tech',
                };
                const mapped = staffRoleMap[staffRecord.role];
                if (mapped && !userRoles.includes(mapped)) {
                    userRoles.push(mapped);
                }
            }
        } catch (e) {}
        console.log('✅ Closed ROs roles:', userRoles);
    } catch(e) {
        console.warn('Could not load roles:', e);
    }
}

function hasRole(role) {
    return userRoles.includes(role);
}
```

**Step 4.2 — Rewrite `isAdmin()` (~line 451)**

```javascript
// BEFORE
function isAdmin() {
    const email = (currentUser?.email || supabaseSession?.user?.email || '').toLowerCase();
    return ADMIN_EMAILS.includes(email);
}

// AFTER
function isAdmin() {
    return userRoles.includes('Admin');
}
```

**Step 4.3 — Rewrite `isManagerOrAdmin()` (~line 456)**

```javascript
// BEFORE
function isManagerOrAdmin() {
    const email = (currentUser?.email || supabaseSession?.user?.email || '').toLowerCase();
    return ADMIN_EMAILS.includes(email) || SR_MANAGER_EMAILS.includes(email) || MANAGER_EMAILS.includes(email);
}

// AFTER
function isManagerOrAdmin() {
    return isAdmin() || hasRole('Sr Manager') || hasRole('Manager');
}
```

**Step 4.4 — Add `await loadUserRoles()` in the auth flow**

In the `handleGoogleCredential()` function (or equivalent sign-in handler), add `await loadUserRoles();` after `supabaseSession` is set and before `showApp()` is called.

In the `initAuth()` / `DOMContentLoaded` flow where Supabase session is restored, add `await loadUserRoles();` before `showApp()`.

**Step 4.5 — Delete the three constant declarations (~lines 342–352)**

```javascript
// DELETE:
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];
const SR_MANAGER_EMAILS = ['ryan@patriotsrvservices.com', 'kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com'];
const MANAGER_EMAILS = [
    'ryan@patriotsrvservices.com',
    // ...
];
```

**Call sites that need NO changes** (they call `isAdmin()` or `isManagerOrAdmin()` which are now role-based):

| Line | Usage | Why it's fine |
|---|---|---|
| 468 | `if (isAdmin())` in `showApp()` badge logic | Calls rewritten `isAdmin()` |
| 471 | `else if (isManagerOrAdmin())` in badge logic | Calls rewritten function |

---

#### Phase 5 — analytics.html Changes (3 call sites)

This is the simplest file after checkin.html. Only `ADMIN_EMAILS` is used — for admin-only access gating.

**Step 5.1 — Add `userRoles` and `loadUserRoles()`**

Add after `let techChartInstance = null;` (~line 573):

```javascript
// ── Role-based access ────────────────────────────────────
let userRoles = [];

async function loadUserRoles() {
    // analytics.html does NOT have a Supabase session (S3 will fix this)
    // For now, use a lightweight approach: query staff + user_roles via anon key
    // This works because RLS allows authenticated reads on user_roles
    // NOTE: After S3 adds full Supabase auth, this function can be simplified
    if (!currentUser?.email) return;
    try {
        const email = currentUser.email.toLowerCase();
        // Try to get user record and roles
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (!userRecord) return;
        const { data: roleData } = await getSB()
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', userRecord.id);
        if (roleData) {
            userRoles = roleData.map(r => r.roles?.name).filter(Boolean);
        }
    } catch(e) {
        console.warn('Could not load roles:', e);
    }
}
```

> **Note:** analytics.html currently has no real Supabase session (Issue #3 / S3 will fix this). The `loadUserRoles()` query may fail under strict RLS. As a fallback, if the query fails, the user won't get access — which is safe (fail-closed). S3 will give analytics.html a proper Supabase session, making this fully reliable.

**Step 5.2 — Replace `ADMIN_EMAILS` check in stored identity flow (~line 585)**

```javascript
// BEFORE
if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
    showApp();
    return;
} else {
    showAccessDenied();
    return;
}

// AFTER
await loadUserRoles();
if (userRoles.includes('Admin')) {
    showApp();
    return;
} else {
    showAccessDenied();
    return;
}
```

> **Important:** The enclosing `DOMContentLoaded` callback must become `async` for `await` to work. Change `document.addEventListener('DOMContentLoaded', () => {` to `document.addEventListener('DOMContentLoaded', async () => {`.

**Step 5.3 — Replace `ADMIN_EMAILS` check in `handleSignIn()` (~line 625)**

```javascript
// BEFORE
if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
    showApp();
} else {
    showAccessDenied();
}

// AFTER
await loadUserRoles();
if (userRoles.includes('Admin')) {
    showApp();
} else {
    showAccessDenied();
}
```

> **Important:** `handleSignIn()` must become `async function handleSignIn(response)`.

**Step 5.4 — Delete the constant declaration (~line 560)**

```javascript
// DELETE:
const ADMIN_EMAILS = ['roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com'];
```

---

#### Phase 6 — checkin.html Changes (1 call site — dead code)

checkin.html has `const ADMIN_EMAILS = ['roland@patriotsrvservices.com'];` on line 205, but it is **never referenced** anywhere in the file. This is dead code.

**Step 6.1 — Delete the unused constant (~line 205)**

```javascript
// DELETE this line:
const ADMIN_EMAILS = ['roland@patriotsrvservices.com'];
```

No other changes needed in checkin.html.

---

#### Execution Order

Claude must execute these phases in strict order:

1. **Phase 1 — Database migrations** (Steps 1.1–1.6) — run all SQL in Supabase SQL Editor, then verify
2. **Phase 2 — index.html** (Steps 2.1–2.13) — the core app; largest change set
3. **Phase 3 — worklist-report.html** (Steps 3.1–3.10) — admin report page
4. **Phase 4 — closed-ros.html** (Steps 4.1–4.5) — archive viewer
5. **Phase 5 — analytics.html** (Steps 5.1–5.4) — admin analytics
6. **Phase 6 — checkin.html** (Step 6.1) — dead code removal

> **Why this order:** index.html must go first because other pages (worklist-report, closed-ros) link back to it. Database migrations must be first because the code changes depend on roles existing in the tables.

#### Testing Plan

**Pre-flight checks (before any code changes):**

```sql
-- Verify all migrations succeeded
SELECT u.email, r.name AS role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY r.name, u.email;
```

Expected output should show:
- Roland → Admin
- Lynn → Admin
- Ryan → Sr Manager, Manager
- Kevin → Sr Manager
- Sofia → Sr Manager
- Mauricio, Jason, Andrew, Solar, Bobby, Brandon → Manager

**Test matrix (after all code changes deployed):**

| Test | User | Expected Result | File(s) |
|---|---|---|---|
| 1 | Roland (`roland@`) | Full admin access, all buttons visible, `isAdmin()` → true via console | index.html |
| 2 | Lynn (`lynn@`) | Full admin access, matches Roland's permissions | index.html |
| 3 | Ryan (`ryan@`) | Sr Manager — Work List visible, can view other managers' lists, silo tabs shown, WO silo management works | index.html |
| 4 | Kevin (`kevin@`) | Sr Manager — same as Ryan | index.html |
| 5 | Mauricio (`mauricio@`) | Manager — Work List visible but can't see others' lists, no silo tabs, can manage assigned silo only | index.html |
| 6 | Tech user | No Work List, no Admin buttons, can only see own ROs and check in/out | index.html, checkin.html |
| 7 | Roland | Can access worklist-report.html, sees all manager sections | worklist-report.html |
| 8 | Non-admin | Gets "Access Denied" on worklist-report.html | worklist-report.html |
| 9 | Roland | Can access analytics.html, dashboard loads | analytics.html |
| 10 | Non-admin | Gets "Access Denied" on analytics.html | analytics.html |
| 11 | Roland | Can access closed-ros.html with Admin badge | closed-ros.html |
| 12 | Ryan | Can access closed-ros.html with Manager badge | closed-ros.html |
| 13 | Tech user | Can access closed-ros.html with User badge (read-only) | closed-ros.html |
| 14 | Any | No console errors about `ADMIN_EMAILS`, `MANAGER_EMAILS`, or `SR_MANAGER_EMAILS` being undefined | All 5 files |
| 15 | Roland | Deactivate Mauricio in `staff` table (`active = false`), refresh → Mauricio loses Manager access without code change | index.html |
| 16 | Roland | Restore Mauricio (`active = true`), refresh → access returns | index.html |

**Rollback plan — Code files:**

If code changes break functionality, restore from the pre-S2 backup:
```bash
git checkout pre-s2-backup -- index.html worklist-report.html closed-ros.html analytics.html checkin.html
git commit -m "Rollback S2 code changes"
git push
```

#### Rollback plan — Phase 1 Database Migrations

A companion rollback script is available at `scripts/rollback-s2-phase1.sh`. It reverses each migration step in strict reverse order (1.6 → 1.1), with verification queries after each step.

```bash
# Preview what would run (no changes made)
bash scripts/rollback-s2-phase1.sh --dry-run

# Full rollback (all steps, reverse order)
bash scripts/rollback-s2-phase1.sh

# Rollback a single step
bash scripts/rollback-s2-phase1.sh --step 1.4

# Nuclear option (single transaction)
bash scripts/rollback-s2-phase1.sh --nuclear

# Just check current state
bash scripts/rollback-s2-phase1.sh --verify
```

The script requires `SUPABASE_DB_URL` for direct execution. Without it, it prints the SQL for you to paste into the Supabase SQL Editor. Each step is idempotent — safe to run multiple times.

The individual SQL for each rollback step is also documented below for manual execution.

> **IMPORTANT:** The code files contain hardcoded email fallbacks that act as a safety net. If you rollback the database but the code is still the OLD version (pre-S2), access will continue to work via the email arrays. If you rollback the database AND the code is the NEW version (post-S2), access will break because the new code has no email fallback. Always rollback code FIRST, then database.

**Rollback 1.6 — Revert Sofia staff UPSERT**

Sofia already existed as `sr_manager` before S2, so Step 1.6 is a no-op in practice. No rollback needed. If for any reason her role was changed, restore:

```sql
-- Rollback 1.6 — Sofia was already sr_manager before S2 (no-op)
-- Only run if you suspect Step 1.6 changed something unexpected:
UPDATE staff SET role = 'sr_manager', active = TRUE
WHERE email = 'sofia@patriotsrvservices.com';
```

**Rollback 1.5 — Revert Kevin staff UPSERT**

Kevin already existed as `sr_manager` before S2, so Step 1.5 is a no-op in practice. No rollback needed. Same logic as 1.6:

```sql
-- Rollback 1.5 — Kevin was already sr_manager before S2 (no-op)
-- Only run if you suspect Step 1.5 changed something unexpected:
UPDATE staff SET role = 'sr_manager', active = TRUE
WHERE email = 'kevin@patriotsrvservices.com';
```

**Rollback 1.4 — Remove Manager role assignments added by S2**

Before S2, these 4 managers already had Manager in `user_roles`: andrew@, brandon@, mauricio@, ryan@. The 3 managers that did NOT have entries were: jason@, solar@, bobby@. Ryan already had Manager, so only the 3 new ones need removal.

```sql
-- Rollback 1.4 — Remove Manager roles that S2 added (keep pre-existing ones)
-- Pre-S2 state: andrew, brandon, mauricio, ryan already had Manager
-- S2 added: jason, solar (note: solar@ had Solar but not Manager), bobby

DO $$
DECLARE
    mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
BEGIN
    SELECT id INTO mgr_role_id FROM roles WHERE name = 'Manager';
    IF mgr_role_id IS NULL THEN
        RAISE WARNING 'Manager role not found — nothing to rollback';
        RETURN;
    END IF;

    -- Only remove the 3 Manager assignments that S2 ADDED (not the 4 that pre-existed)
    FOREACH _email IN ARRAY ARRAY[
        'jason@patriotsrvservices.com',
        'solar@patriotsrvservices.com',
        'bobby@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = mgr_role_id;
            RAISE NOTICE 'Removed Manager role from %', _email;
        END IF;
    END LOOP;
END $$;
```

> **Note:** brandon@ had Manager pre-S2, so we do NOT remove it. solar@ had Solar pre-S2 but not Manager — the Manager assignment is new and gets removed; the Solar assignment is untouched.

**Rollback 1.3 — Remove Sr Manager role assignments**

No one had Sr Manager in `user_roles` before S2 (the role didn't even exist). Remove all three:

```sql
-- Rollback 1.3 — Remove all Sr Manager role assignments (none existed pre-S2)

DO $$
DECLARE
    sr_mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
BEGIN
    SELECT id INTO sr_mgr_role_id FROM roles WHERE name = 'Sr Manager';
    IF sr_mgr_role_id IS NULL THEN
        RAISE WARNING 'Sr Manager role not found — nothing to rollback';
        RETURN;
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'ryan@patriotsrvservices.com',
        'kevin@patriotsrvservices.com',
        'sofia@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = sr_mgr_role_id;
            RAISE NOTICE 'Removed Sr Manager role from %', _email;
        END IF;
    END LOOP;
END $$;
```

**Rollback 1.2 — Remove Admin role assignments for Roland and Lynn**

Neither Roland nor Lynn had Admin in `user_roles` before S2. Remove both:

```sql
-- Rollback 1.2 — Remove Admin roles for Roland and Lynn (neither had it pre-S2)

DO $$
DECLARE
    admin_role_id UUID;
    _email TEXT;
    _user_id UUID;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';
    IF admin_role_id IS NULL THEN
        RAISE WARNING 'Admin role not found — nothing to rollback';
        RETURN;
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'roland@patriotsrvservices.com',
        'lynn@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = admin_role_id;
            RAISE NOTICE 'Removed Admin role from %', _email;
        END IF;
    END LOOP;
END $$;
```

**Rollback 1.1 — Remove "Sr Manager" role from roles table**

"Sr Manager" did not exist before S2. Removing it will also cascade-delete any `user_roles` entries that reference it (if Rollback 1.3 wasn't run first). Check for CASCADE behavior on your FK before running:

```sql
-- Rollback 1.1 — Remove the Sr Manager role entirely
-- WARNING: if user_roles FK has ON DELETE CASCADE, this also removes
-- the Sr Manager assignments (making Rollback 1.3 redundant).
-- If FK has ON DELETE RESTRICT, run Rollback 1.3 first.

DELETE FROM roles WHERE name = 'Sr Manager';
```

**Verification query — confirm rollback restored pre-S2 state:**

```sql
-- After rollback, user_roles should show exactly 7 rows:
-- andrew/Manager, brandon/Manager, mauricio/Manager, ryan/Manager,
-- ryan/Solar, solar/Solar, tipton/Solar
-- Roland and Lynn should have NO entries.
-- Sr Manager role should not exist.

SELECT u.email, r.name AS role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY r.name, u.email;

SELECT name FROM roles ORDER BY name;
-- Expected: Admin, Insurance Manager, Manager, Parts Manager, Solar, Technician (6 rows, no Sr Manager)
```

**Quick rollback — nuclear option (revert ALL S2 database changes in one shot):**

If you need to revert everything at once and don't want to run individual steps:

```sql
-- NUCLEAR ROLLBACK — removes all S2 database changes in one transaction
BEGIN;

-- Remove all Sr Manager role assignments, then the role itself
DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'Sr Manager');
DELETE FROM roles WHERE name = 'Sr Manager';

-- Remove Admin for Roland and Lynn
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'Admin')
  AND user_id IN (
    SELECT id FROM users WHERE email IN ('roland@patriotsrvservices.com', 'lynn@patriotsrvservices.com')
  );

-- Remove Manager for jason, solar, bobby (the 3 S2 added; keep pre-existing 4)
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'Manager')
  AND user_id IN (
    SELECT id FROM users WHERE email IN (
        'jason@patriotsrvservices.com',
        'solar@patriotsrvservices.com',
        'bobby@patriotsrvservices.com'
    )
  );

-- Kevin and Sofia staff entries: no-op (they were already sr_manager before S2)

COMMIT;
```

#### Supabase migrations summary

| Migration | Table | Action |
|---|---|---|
| 1.1 | `roles` | INSERT "Sr Manager" role |
| 1.2 | `user_roles` | INSERT Admin for Roland + Lynn |
| 1.3 | `user_roles` | INSERT Sr Manager for Ryan, Kevin, Sofia |
| 1.4 | `user_roles` | INSERT Manager for 7 managers |
| 1.5 | `staff` | UPSERT Kevin as sr_manager |
| 1.6 | `staff` | UPSERT Sofia as sr_manager |
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
| `supabase/migrations/s2_add_sr_manager_role.sql` | S2 | Adds "Sr Manager" to roles table |
| `supabase/migrations/s2_assign_admin_roles.sql` | S2 | Assigns Admin role to Roland + Lynn in user_roles |
| `supabase/migrations/s2_assign_sr_manager_roles.sql` | S2 | Assigns Sr Manager to Ryan, Kevin, Sofia in user_roles |
| `supabase/migrations/s2_assign_manager_roles.sql` | S2 | Assigns Manager to 7 managers in user_roles |
| `supabase/migrations/s2_ensure_kevin_in_staff.sql` | S2 | UPSERTs Kevin McHenry as sr_manager in staff |
| `supabase/migrations/s2_ensure_sofia_in_staff.sql` | S2 | UPSERTs Sofia as sr_manager in staff |
| `supabase/migrations/tighten_enhancement_requests_rls.sql` | S3 | Removes anon INSERT on enhancement_requests |
| `supabase/migrations/fix_is_silo_manager_search_path.sql` | S7 | Adds SET search_path to is_silo_manager() |
| `supabase/migrations/app_config_table.sql` | S7 | Creates app_config table, seeds Calendar IDs |
| `supabase/functions/claude-vision-proxy/index.ts` | S4 | New Edge Function for Anthropic API proxy |
| `scripts/rollback-s2-phase1.sh` | S2 | Rollback script for all Phase 1 DB migrations (individual, full, or nuclear) |

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
| `isAdmin()` | 8235 | Remove ADMIN_EMAILS fallback — use `userRoles` only |
| `hasRole()` | 8241 | Remove MANAGER/ADMIN_EMAILS fallback — use `userRoles` only |
| `canSeeWorkList()` | ~6700 | Replace email array checks with `isAdmin() \|\| hasRole()` |
| `isSrOrAdmin()` | ~6706 | Replace email array checks with `isAdmin() \|\| hasRole('Sr Manager')` |
| `isSrManagerOrAdmin()` | ~11830 | Replace email array checks with `isAdmin() \|\| hasRole('Sr Manager')` |
| `canManageSilo()` | ~11837 | Replace email array + _staffCache with role + silo checks |
| `_populateManagerPicker()` | ~6734 | Replace hardcoded email arrays with `_staffCache` lookup |
| `_renderWorkListSiloTabs()` | ~6908 | Replace SR_MANAGER_EMAILS check with `_staffCache` lookup |
| `loadUserRoles()` | 8250 | Add staff table role merge + store silo/role in window globals |
| `loadDataFromSupabase()` | ~9088 | Replace `ADMIN_EMAILS.includes()` fallback with `isAdmin()` |
| `updateViewModeDropdown()` | ~8312 | Replace hardcoded solar email array with staff silo check |

### Functions Modified in worklist-report.html (S2)

| Function | Lines | Change |
|---|---|---|
| *(new)* `loadUserRoles()` | Insert ~366 | New — query user_roles + staff table |
| *(new)* `hasRole()` | Insert ~366 | New — check userRoles array |
| `isAdmin()` | 421 | Rewrite to use `userRoles.includes('Admin')` |
| `initAuth()` | 395 | Add `await loadUserRoles()` before access check |
| `handleGoogleSignIn()` | 452 | Add `await loadUserRoles()` before access check |
| `renderReport()` | 586–600 | Replace ADMIN_EMAILS/SR_MANAGER_EMAILS with _allStaff lookups |
| `renderReport()` | 629 | Replace SR_MANAGER_EMAILS.includes with _allStaff lookup |
| `renderStaffTiles()` | 690 | Replace ADMIN_EMAILS filter with operational role filter |

### Functions Modified in closed-ros.html (S2)

| Function | Lines | Change |
|---|---|---|
| *(new)* `loadUserRoles()` | Insert ~364 | New — query user_roles + staff table |
| *(new)* `hasRole()` | Insert ~364 | New — check userRoles array |
| `isAdmin()` | 451 | Rewrite to use `userRoles.includes('Admin')` |
| `isManagerOrAdmin()` | 456 | Rewrite to use `isAdmin() \|\| hasRole('Sr Manager') \|\| hasRole('Manager')` |

### Functions Modified in analytics.html (S2)

| Function | Lines | Change |
|---|---|---|
| *(new)* `loadUserRoles()` | Insert ~574 | New — lightweight role query (no Supabase session yet) |
| DOMContentLoaded handler | 585 | Replace `ADMIN_EMAILS.includes()` with `loadUserRoles()` + role check |
| `handleSignIn()` | 625 | Replace `ADMIN_EMAILS.includes()` with `loadUserRoles()` + role check |

### checkin.html (S2)

| Change | Line | Description |
|---|---|---|
| Delete dead code | 205 | Remove unused `ADMIN_EMAILS` constant |
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

**S2 should come before S3** — the analytics.html auth change references the role system that S2 sets up. S2 now covers all 5 files with 6 phases: database migrations first, then index.html → worklist-report.html → closed-ros.html → analytics.html → checkin.html.

**S4 can run in parallel with S2/S3** — the Anthropic proxy is completely independent.

**S5 (console.log)** is low-risk and can be done in any session that has slack time.

**S6 (onclick migration)** is the highest-effort change per-session. Start with the card grid only; defer modal onclick to future sessions.

**S7 groups four small MEDIUM items** — each can be done independently if S7 runs long.
