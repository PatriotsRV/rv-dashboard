# PRVS Dashboard — Modularization Roadmap

**Target file:** `index.html` (13,631 lines, ~740 KB, v1.308)  
**Goal:** Split a single-file vanilla JS SPA into logical ES modules without a build step, keeping the app fully functional after every phase.  
**Executor:** Claude Cowork (one phase per session)  
**Constraint:** GitHub Pages — static files only, no bundler, no Node.js.

---

## Quick Reference

| Phase | Module(s) Created | Functions Moved | Risk |
|---|---|---|---|
| 0 | Infrastructure scaffold | 0 | None |
| 1 | `config.js` | ~60 constants | Very Low |
| 2 | `utils.js` | ~15 pure helpers | Low |
| 3 | `state.js` | ~30 state vars + `window` bridge | Low |
| 4 | `auth.js` | ~18 auth functions | Medium |
| 5 | `i18n.js` | 6 i18n functions | Low |
| 6 | `render.js` | `renderBoard`, `updateStats`, card HTML | High |
| 7 | `ro-crud.js` | ~13 RO CRUD functions | Medium |
| 8 | `parts.js` | ~16 parts functions | Medium |
| 9 | `work-orders.js` | ~10 WO functions | Medium |
| 10 | `photos.js` | ~8 photo functions | Medium |
| 11 | `time-tracking.js` | ~6 time log functions | Low |
| 12 | `scheduling.js` | 4 calendar functions | Low |
| 13 | `qr.js` | 3 QR functions | Low |
| 14 | `work-list.js` | ~5 work list functions | Low |
| 15 | `insurance.js` | 5 scanner functions | Low |
| 16 | `kenect.js` | 5 Kenect functions | Low |
| 17 | `duplicates.js` | 3 dupe functions | Low |
| 18 | `enhancement.js` | 5 ER functions | Low |
| 19 | CSS extraction | 0 (CSS only) | Low |

**Total estimated sessions:** ~10–14 (some phases can be combined in a single session when both are low-risk and logically adjacent)

---

## Architecture Overview

### How ES Modules Work on GitHub Pages

```html
<!-- In index.html, at end of <body>, BEFORE external CDN scripts -->
<script type="module" src="js/app.js"></script>
```

`type="module"` scripts:
- Are deferred automatically (equivalent to `defer`)
- Are strict mode by default
- Do **not** pollute `window` unless you explicitly assign `window.fnName = fn`
- Support `import`/`export` syntax
- Are subject to CORS — must be served over HTTP(S), not `file://` locally (GitHub Pages is fine)

### The Global Function Problem

193 inline `onclick` handlers in the HTML reference function names as bare strings (e.g., `onclick="openPartsModal(0)"`). These work because the current `<script>` block runs in global scope. ES module scope is **not** global.

**Strategy: The `window` Bridge**

Every function referenced by an `onclick` handler must be explicitly attached to `window` inside its module. This is done once, at the bottom of the module file, in a single block:

```javascript
// At the bottom of parts.js:
Object.assign(window, {
  openPartsModal,
  showAddPartForm,
  savePartForm,
  editPartRow,
  deletePartRow,
  markPartReceived,
  openPartsRequestModal,
  submitPartsRequest,
  openPartsStatusModal,
  setPartsStatus,
  markPartsOrdered,
  notifyPartsRequester,
  notifyPartsEtaUpdate,
});
```

This is intentional and explicit — it's not a mistake, it's the migration strategy. The `window` assignments can be removed in a future cleanup pass once all inline `onclick` handlers have been converted to `addEventListener` calls (that is a post-modularization task, not part of this roadmap).

### Module Loading Order

Modules that import from each other must be loaded after their dependencies. The dependency graph is:

```
config.js        (no imports)
  └─ state.js    (imports config)
       ├─ utils.js         (imports config, state)
       ├─ auth.js          (imports config, state, utils)
       ├─ i18n.js          (imports state)
       ├─ render.js        (imports config, state, utils, i18n)
       ├─ ro-crud.js       (imports config, state, utils, render)
       ├─ parts.js         (imports config, state, utils, render, ro-crud)
       ├─ work-orders.js   (imports config, state, utils, render)
       ├─ photos.js        (imports config, state, utils)
       ├─ time-tracking.js (imports config, state, utils)
       ├─ scheduling.js    (imports config, state, utils)
       ├─ qr.js            (imports state, utils)
       ├─ work-list.js     (imports config, state, utils, render)
       ├─ insurance.js     (imports state, utils, render)
       ├─ kenect.js        (imports config, state, utils)
       ├─ duplicates.js    (imports config, state, utils)
       └─ enhancement.js   (imports state, utils)
```

Because ES modules resolve imports statically, circular dependencies must be avoided. The tree above has no cycles.

The entry point `js/app.js` imports everything and calls `init()`:

```javascript
// js/app.js
import { init } from './lifecycle.js';   // or inline in app.js
document.addEventListener('DOMContentLoaded', init);
```

### Rollback Protocol (applies to every phase)

Before starting any phase:

```bash
# Create a tagged snapshot in git
git add -A && git commit -m "pre-phase-N snapshot: before extracting <module>"
git tag phase-N-before
```

If something breaks:

```bash
git checkout phase-N-before -- index.html js/
# or nuclear option:
git revert HEAD
```

The single-file `index.html` must be kept buildable as a standalone fallback until Phase 19 is complete. Never delete a function from `index.html` until the module version has been tested and working in production for at least one deploy cycle.

---

## Phase 0 — Infrastructure Scaffold

**Session goal:** Create the directory structure and entry point without moving any code. The app should be byte-for-byte identical in behavior after this phase.

**Duration estimate:** 30–45 minutes

### Steps

1. **Create the `js/` directory** in the repo root (same level as `index.html`).

2. **Create placeholder module files** — each file exports a single comment so it is valid JS:

```
js/app.js
js/config.js
js/state.js
js/utils.js
js/auth.js
js/i18n.js
js/render.js
js/ro-crud.js
js/parts.js
js/work-orders.js
js/photos.js
js/time-tracking.js
js/scheduling.js
js/qr.js
js/work-list.js
js/insurance.js
js/kenect.js
js/duplicates.js
js/enhancement.js
```

Placeholder content for each:
```javascript
// js/config.js — PLACEHOLDER (Phase 0)
// Content will be populated in Phase 1.
export const _placeholder = true;
```

3. **Add a single module script tag** to `index.html`, placed BEFORE the external CDN `<script>` tags at the end of `<body>`:

```html
<!-- Phase 0: module entry point (currently a no-op) -->
<script type="module" src="js/app.js"></script>
```

`js/app.js` at this stage:
```javascript
// js/app.js — Phase 0: no-op entry point
// Imports and init() call will be added as modules are populated.
console.log('[PRVS] Module system loaded (Phase 0)');
```

4. **Verify** that adding the `<script type="module">` tag does not break anything. The existing inline `<script>` block in index.html remains completely unchanged.

### Test Plan

- Open the app in a browser with DevTools open.
- Confirm the console shows `[PRVS] Module system loaded (Phase 0)`.
- Confirm no new errors appear.
- Confirm the app loads data, renders cards, and all interactive elements work.
- Check the Network tab — confirm `app.js` loads with HTTP 200.

### Rollback

Delete the `js/` directory and remove the `<script type="module">` tag from `index.html`.

---

## Phase 1 — `config.js`: Constants

**Session goal:** Move all constants and configuration objects out of `index.html` into `config.js`. These have zero dependencies and no side effects — the lowest-risk migration possible.

**Duration estimate:** 45–60 minutes

### What Moves

All of the following, currently declared at the top of the inline `<script>` block:

| Constant | Line (approx.) | Notes |
|---|---|---|\
| `SUPABASE_URL` | ~2700 | String |
| `SUPABASE_ANON_KEY` | ~2701 | Long JWT string |
| `GOOGLE_CONFIG` | ~2705 | Object with CLIENT_ID, API_KEY, DISCOVERY_DOCS, SCOPES |
| `ADMIN_EMAILS` | ~2720 | Array of 2 emails |
| `MANAGER_EMAILS` | ~2721 | Array of 7 emails |
| `SR_MANAGER_EMAILS` | ~2722 | Array of 2 emails |
| `SERVICE_SILOS` | ~2730 | Array of 8 silo objects |
| `REPAIR_TYPE_TO_SILO` | ~2750 | Object map |
| `SILO_TO_REPAIR_TYPE` | ~2760 | Object map |
| `CALENDAR_IDS` | ~2770 | Object — 8 calendar IDs |
| `STATUS_PROGRESS_MAP` | ~2780 | Object — 10 status keys → numbers |
| `WO_STATUS_LABELS` | ~2790 | Object |
| `WO_STATUS_COLORS` | ~2795 | Object |
| `TASK_STATUSES` | ~2800 | Array |
| `TASK_STATUS_LABELS` | ~2805 | Object |
| `TASK_STATUS_COLORS` | ~2810 | Object |
| `PART_STATUSES` | ~2820 | Array |
| `PART_STATUS_COLORS` | ~2825 | Object |
| `ALL_PART_FIELDS` | ~2830 | Array of 26 field names |
| `DAY_BASED_SERVICES` | ~2840 | Array of 4 service names |
| `TRANSLATIONS_ES` | ~8012 | Object — ~120 key/value pairs |

### `config.js` Structure

```javascript
// js/config.js
// All application-wide constants. No side effects.

export const SUPABASE_URL = 'https://axfejhudchdejoiwaetq.supabase.co';
export const SUPABASE_ANON_KEY = '...';  // copy verbatim

export const GOOGLE_CONFIG = { ... };    // copy verbatim

export const ADMIN_EMAILS = [...];
export const MANAGER_EMAILS = [...];
export const SR_MANAGER_EMAILS = [...];

export const SERVICE_SILOS = [...];
export const REPAIR_TYPE_TO_SILO = {...};
export const SILO_TO_REPAIR_TYPE = {...};
export const CALENDAR_IDS = {...};

export const STATUS_PROGRESS_MAP = {...};

export const WO_STATUS_LABELS = {...};
export const WO_STATUS_COLORS = {...};
export const TASK_STATUSES = [...];
export const TASK_STATUS_LABELS = {...};
export const TASK_STATUS_COLORS = {...};

export const PART_STATUSES = [...];
export const PART_STATUS_COLORS = {...};
export const ALL_PART_FIELDS = [...];
export const DAY_BASED_SERVICES = [...];

export const TRANSLATIONS_ES = {...};
```

### Wiring in `index.html`

**Do not remove the originals from the inline `<script>` yet.** Instead, add a comment marking them for later removal:

```javascript
// PHASE 1 MIGRATED — these declarations remain for backward compat
// until all module files import from config.js.
// Remove after Phase 19 CSS cleanup.
const SUPABASE_URL = '...';  // TODO: remove after Phase 3
// ... etc
```

### Wiring in `app.js`

```javascript
// js/app.js (Phase 1)
import * as Config from './config.js';
// Re-export for convenience — other modules import from config.js directly
export { Config };
console.log('[PRVS] config.js loaded');
```

### Test Plan

- Open app, confirm no errors.
- In DevTools console: `window.SUPABASE_URL` should still return the value (from the inline script, not the module — that's fine at this stage).
- Navigate to `js/config.js` in the browser directly — confirm it serves without a 404.
- Confirm all functionality still works (data loads, cards render, buttons work).

### Rollback

Empty `js/config.js` back to the Phase 0 placeholder. The inline script constants remain unchanged.

---

## Phase 2 — `utils.js`: Pure Helper Functions

**Session goal:** Move stateless utility functions to `utils.js`. These functions have no dependency on global state — they are pure (or near-pure) input→output functions.

**Duration estimate:** 45–60 minutes

### What Moves

| Function | Line | Notes |
|---|---|---|
| `calculateDaysOnLot(roOrDate)` | 6612 | Pure date math |
| `getDaysHeatColor(days)` | 6675 | Pure color calculation |
| `calculatePriority(ro)` | 6636 | Uses `STATUS_PROGRESS_MAP` from config |
| `formatHours(seconds)` | 9731 | Pure string formatter |
| `generateROId(customerName, rv, dateReceived)` | 9775 | Pure hash function |
| `generateROIdCandidates(...)` | 9790 | Pure, calls generateROId |
| `normalisePhone(raw)` | 11020 | Pure string cleaner |
| `isVideoUrl(url)` | 3602 | Pure string check |
| `escapeHtml(str)` | (find in source) | Pure string sanitizer |
| `driveImgUrl(url)` | 9746 | Pure URL transform |
| `loadDriveImage(url)` | 9761 | Returns transformed URL |
| `parseCSV(file)` | 6562 | Legacy, returns Promise |
| `rowToRO(row)` | 8882 | Maps DB row → RO object (~40 fields) |

### `utils.js` Structure

```javascript
// js/utils.js
import { STATUS_PROGRESS_MAP } from './config.js';

export function calculateDaysOnLot(roOrDate) { ... }
export function getDaysHeatColor(days) { ... }
export function calculatePriority(ro) { ... }
export function formatHours(seconds) { ... }
export function generateROId(customerName, rv, dateReceived) { ... }
export function generateROIdCandidates(...) { ... }
export function normalisePhone(raw) { ... }
export function isVideoUrl(url) { ... }
export function escapeHtml(str) { ... }
export function driveImgUrl(url) { ... }
export function loadDriveImage(url) { ... }
export function parseCSV(file) { ... }
export function rowToRO(row) { ... }

// Window bridge — utils are called from inline onclick handlers
// in template literals (e.g., card HTML), so they need to be global.
// escapeHtml in particular is called frequently inside template literals.
Object.assign(window, {
  escapeHtml,
  isVideoUrl,
  calculateDaysOnLot,
  getDaysHeatColor,
  formatHours,
});
```

**Note on `rowToRO`:** This function maps ~40 snake_case Supabase fields to camelCase RO object properties. It is called in `loadDataFromSupabase`. It does not reference any globals other than constants, so it belongs in utils. However, it is long (~80 lines) — copy it carefully.

### Wiring in `app.js`

```javascript
import './config.js';
import './utils.js';
console.log('[PRVS] utils.js loaded');
```

### Test Plan

- Confirm `window.escapeHtml` is accessible in console.
- Open an RO card — confirm days-on-lot number appears correctly (uses `calculateDaysOnLot`).
- Confirm heat color gradient works on cards (uses `getDaysHeatColor`).
- Confirm RO data loads from Supabase (uses `rowToRO` in inline script — at this stage, `rowToRO` is still in the inline script, so this is a no-op test — just confirming no breakage).

### Rollback

Empty `js/utils.js` to Phase 0 placeholder. Remove the `Object.assign(window, {...})` call. Inline script `rowToRO` remains intact.

---

## Phase 3 — `state.js`: Global State Container

**Session goal:** Centralize all mutable global state in `state.js`. This is the pivotal phase — it changes the programming model from implicit globals to explicit imports.

**Duration estimate:** 1–2 hours (most careful phase)

### The Challenge

The inline `<script>` currently uses bare variable assignments like:

```javascript
let currentData = [];
let currentFilteredData = [];
```

...and 277 functions access them directly by name. When functions move to modules, they must import these from `state.js`. But the inline script functions still reference the bare names.

**Strategy: Expose state on `window` immediately**

`state.js` declares the variables AND assigns them to `window`. The inline script's existing `let`/`var` declarations are replaced with assignments to the already-existing `window` properties:

```javascript
// In state.js:
export let currentData = [];
window.currentData = currentData;
```

```javascript
// In inline script (index.html), REPLACE:
let currentData = [];
// WITH:
// currentData is now managed in state.js — do not redeclare
// Access via window.currentData or import from state.js
```

Wait — this approach has a subtlety. `export let` creates a live binding, but `window.currentData = currentData` is a one-time snapshot. Mutation of `currentData` in one module (e.g., `currentData = newArray`) won't update the `window.currentData` reference.

**Correct pattern — use a mutable state object:**

```javascript
// js/state.js
export const state = {
  currentData: [],
  currentFilteredData: [],
  currentStatusFilters: [],
  currentRepairFilter: 'all',
  currentSearchFilter: '',
  currentDaysFilter: null,
  currentPartsFilter: 'all',
  currentROTypeFilter: 'all',
  currentViewMode: 'regular',
  tileVisibility: {},
  viewPresets: {},
  timeLogsData: [],
  partsData: {},
  userRoles: [],
  currentUser: null,
  supabaseSession: null,
  accessToken: null,
  googleIdToken: null,
  supabaseNonce: null,
  initialLoadDone: false,
  gapiInited: false,
  gisInited: false,
  _workListOpen: false,
  _workListData: [],
  _workListViewEmail: null,
  _partsRequestFiles: [],
  editingROIndex: null,
  _staffCache: [],
  _workOrderCache: {},
  _deepLinkRoId: null,
  _erData: [],
};

// Expose state object globally so inline-script code can still access variables
// via window.state.currentData during the transition period.
window.state = state;

// TRANSITION SHIMS: Also expose individual properties as window globals
// so that the existing inline <script> code continues to work unchanged.
// Remove these shims phase by phase as each module migrates its callers.
const stateProxy = new Proxy(state, {
  get(target, prop) { return target[prop]; },
  set(target, prop, value) { target[prop] = value; return true; }
});

// Direct global aliases for backward compat
Object.defineProperties(window, {
  currentData:          { get() { return state.currentData; },          set(v) { state.currentData = v; },          configurable: true, enumerable: true },
  currentFilteredData:  { get() { return state.currentFilteredData; },  set(v) { state.currentFilteredData = v; },  configurable: true, enumerable: true },
  currentStatusFilters: { get() { return state.currentStatusFilters; }, set(v) { state.currentStatusFilters = v; }, configurable: true, enumerable: true },
  currentRepairFilter:  { get() { return state.currentRepairFilter; },  set(v) { state.currentRepairFilter = v; },  configurable: true, enumerable: true },
  currentSearchFilter:  { get() { return state.currentSearchFilter; },  set(v) { state.currentSearchFilter = v; },  configurable: true, enumerable: true },
  currentDaysFilter:    { get() { return state.currentDaysFilter; },    set(v) { state.currentDaysFilter = v; },    configurable: true, enumerable: true },
  currentPartsFilter:   { get() { return state.currentPartsFilter; },   set(v) { state.currentPartsFilter = v; },   configurable: true, enumerable: true },
  currentROTypeFilter:  { get() { return state.currentROTypeFilter; },  set(v) { state.currentROTypeFilter = v; },  configurable: true, enumerable: true },
  currentViewMode:      { get() { return state.currentViewMode; },      set(v) { state.currentViewMode = v; },      configurable: true, enumerable: true },
  tileVisibility:       { get() { return state.tileVisibility; },       set(v) { state.tileVisibility = v; },       configurable: true, enumerable: true },
  viewPresets:          { get() { return state.viewPresets; },          set(v) { state.viewPresets = v; },          configurable: true, enumerable: true },
  timeLogsData:         { get() { return state.timeLogsData; },         set(v) { state.timeLogsData = v; },         configurable: true, enumerable: true },
  partsData:            { get() { return state.partsData; },            set(v) { state.partsData = v; },            configurable: true, enumerable: true },
  userRoles:            { get() { return state.userRoles; },            set(v) { state.userRoles = v; },            configurable: true, enumerable: true },
  currentUser:          { get() { return state.currentUser; },          set(v) { state.currentUser = v; },          configurable: true, enumerable: true },
  supabaseSession:      { get() { return state.supabaseSession; },      set(v) { state.supabaseSession = v; },      configurable: true, enumerable: true },
  accessToken:          { get() { return state.accessToken; },          set(v) { state.accessToken = v; },          configurable: true, enumerable: true },
  googleIdToken:        { get() { return state.googleIdToken; },        set(v) { state.googleIdToken = v; },        configurable: true, enumerable: true },
  supabaseNonce:        { get() { return state.supabaseNonce; },        set(v) { state.supabaseNonce = v; },        configurable: true, enumerable: true },
  initialLoadDone:      { get() { return state.initialLoadDone; },      set(v) { state.initialLoadDone = v; },      configurable: true, enumerable: true },
  gapiInited:           { get() { return state.gapiInited; },           set(v) { state.gapiInited = v; },           configurable: true, enumerable: true },
  gisInited:            { get() { return state.gisInited; },            set(v) { state.gisInited = v; },            configurable: true, enumerable: true },
  _workListOpen:        { get() { return state._workListOpen; },        set(v) { state._workListOpen = v; },        configurable: true, enumerable: true },
  _workListData:        { get() { return state._workListData; },        set(v) { state._workListData = v; },        configurable: true, enumerable: true },
  _workListViewEmail:   { get() { return state._workListViewEmail; },   set(v) { state._workListViewEmail = v; },   configurable: true, enumerable: true },
  _partsRequestFiles:   { get() { return state._partsRequestFiles; },   set(v) { state._partsRequestFiles = v; },   configurable: true, enumerable: true },
  editingROIndex:       { get() { return state.editingROIndex; },       set(v) { state.editingROIndex = v; },       configurable: true, enumerable: true },
  _staffCache:          { get() { return state._staffCache; },          set(v) { state._staffCache = v; },          configurable: true, enumerable: true },
  _workOrderCache:      { get() { return state._workOrderCache; },      set(v) { state._workOrderCache = v; },      configurable: true, enumerable: true },
  _deepLinkRoId:        { get() { return state._deepLinkRoId; },        set(v) { state._deepLinkRoId = v; },        configurable: true, enumerable: true },
  _erData:              { get() { return state._erData; },              set(v) { state._erData = v; },              configurable: true, enumerable: true },
});
```

**Why `Object.defineProperties` with getters/setters?**  
Because ES modules and inline scripts share the same `window` object. If inline script code does `currentData = newArray`, the setter intercepts it and writes to `state.currentData`. If module code reads `state.currentData`, it gets the updated value. This is the two-way binding that makes gradual migration safe.

### What to Remove from `index.html`

Find all bare `let`/`var`/`const` declarations for the state variables listed above. **Comment them out rather than deleting them**, with a note:

```javascript
// STATE MIGRATED TO js/state.js (Phase 3) — do not redeclare
// let currentData = [];  
// let currentFilteredData = [];
// ... etc
```

This prevents "already declared" errors in strict mode while keeping the code readable during the migration.

### Test Plan

1. Open app. All cards should render as before.
2. In DevTools console, check: `window.currentData.length` — should match visible card count.
3. Change a status filter. Check that `window.currentStatusFilters` updates.
4. Perform a search. Check that `window.currentSearchFilter` updates.
5. Open and close a modal. Check that `window.editingROIndex` is set/cleared correctly.
6. Full user flow: connect → load data → filter → open RO → edit field → reload.

### Rollback

1. Restore commented-out state variable declarations in inline script.
2. Empty `js/state.js` to Phase 0 placeholder.
3. Remove state.js import from `app.js`.

---

## Phase 4 — `auth.js`: Authentication & Session Management

**Session goal:** Extract all Google Identity Services, GAPI, and Supabase auth functions.

**Duration estimate:** 1.5–2 hours

### What Moves

| Function | Line | Exported? |
|---|---|---|
| `getSB()` | 8095 | Yes — used everywhere |
| `initSupabaseAuthListener()` | 8438 | Yes — called in init |
| `loadSavedToken()` | 8454 | Yes — called in init |
| `getUserInfo()` | 8393 | Yes |
| `loadUserRoles()` | 8233 | Yes — called after auth |
| `upsertUser(session)` | 8267 | Yes |
| `gapiLoaded()` | 8629 | Yes — called by CDN onload |
| `initializeGapiClient()` | 8638 | Yes |
| `gisLoaded()` | 8652 | Yes — called by CDN onload |
| `handleAuthClick()` | 8818 | Yes — called by button onclick |
| `updateAuthStatus(connected)` | 8818 | Yes |
| `saveToken(token, expiresIn)` | 8583 | Yes |
| `clearToken()` | 8593 | Yes |
| `setupTokenRefresh()` | 8603 | Yes |
| `isAdmin()` | (find) | Yes — used everywhere |
| `hasRole(role)` | (find) | Yes — used everywhere |
| `canManageSilo(silo)` | (find) | Yes |
| `canSeeWorkList()` | (find) | Yes |

### `auth.js` Structure

```javascript
// js/auth.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_CONFIG,
         ADMIN_EMAILS, MANAGER_EMAILS, SR_MANAGER_EMAILS } from './config.js';
import { state } from './state.js';

let _sbClient = null;

export function getSB() {
  if (!_sbClient) {
    _sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'prvs_supabase_auth', autoRefreshToken: true }
    });
  }
  return _sbClient;
}

export function isAdmin() {
  if (!state.currentUser) return false;
  return ADMIN_EMAILS.includes(state.currentUser.email)
      || state.userRoles.includes('Admin');
}

export function hasRole(role) {
  return state.userRoles.includes(role);
}

export function canManageSilo(silo) { ... }
export function canSeeWorkList() { ... }

export async function loadUserRoles() { ... }
export async function upsertUser(session) { ... }
export async function getUserInfo() { ... }
export async function loadSavedToken() { ... }
export function gapiLoaded() { ... }
export function initializeGapiClient() { ... }
export function gisLoaded() { ... }
export function handleAuthClick() { ... }
export function updateAuthStatus(connected) { ... }
export function saveToken(token, expiresIn) { ... }
export function clearToken() { ... }
export function setupTokenRefresh() { ... }
export function initSupabaseAuthListener() { ... }

// Window bridge — these are called by CDN script onload= attributes
// and by inline onclick handlers
Object.assign(window, {
  getSB,
  isAdmin,
  hasRole,
  canManageSilo,
  canSeeWorkList,
  gisLoaded,
  gapiLoaded,
  handleAuthClick,
  updateAuthStatus,
  loadUserRoles,
});
```

**Critical note on `getSB()`:** The Supabase CDN (`supabase-js`) is loaded via a `<script>` tag in `<head>` **before** any module scripts run. Since modules are deferred, `supabase` will be available on `window` by the time `getSB()` is first called. However, the function should guard against this:

```javascript
export function getSB() {
  if (!_sbClient) {
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase CDN not loaded yet');
    }
    _sbClient = supabase.createClient(...);
  }
  return _sbClient;
}
```

**Critical note on `gisLoaded` / `gapiLoaded`:** The CDN script tags use:
```html
<script src="https://accounts.google.com/gsi/client" onload="gisLoaded()"></script>
<script src="https://apis.google.com/js/api.js?v=2" onload="gapiLoaded()"></script>
```

These `onload` callbacks reference global function names. After Phase 4, these functions exist only in `auth.js` scope unless explicitly assigned to `window`. The `Object.assign(window, { gisLoaded, gapiLoaded })` call handles this — but the assignment must happen **before** the CDN scripts fire their `onload`. Since module scripts are deferred and CDN scripts are not, there is a race condition risk.

**Solution:** Move the CDN script tags to the bottom of `<body>` (they may already be there), and ensure `app.js` is loaded via `<script type="module">` which is also deferred — so both CDN scripts and the module script fire after DOMContentLoaded, but the module script fires first in the "deferred" queue because it appears first in the HTML.

Alternatively, add `async` to the CDN scripts and handle the race in `gisLoaded`/`gapiLoaded` themselves (they already do this via `gapiInited`/`gisInited` flags).

### Test Plan

1. Hard refresh. Watch Network tab — confirm auth.js loads 200.
2. Click "Connect to PRVS". Confirm Google One Tap or OAuth popup appears.
3. Sign in. Confirm `window.currentUser` is populated (proxy from state.js).
4. Confirm `window.isAdmin()` returns correct boolean for current user.
5. Check admin-gated buttons appear/hide correctly.
6. Disconnect (if available). Confirm `clearToken()` works and UI resets.
7. Reload page. Confirm session restores silently (Supabase session).

### Rollback

Empty `auth.js` to placeholder. The inline script copies of all these functions remain. Remove `Object.assign(window, {...})` from auth.js.

---

## Phase 5 — `i18n.js`: Internationalization

**Session goal:** Extract the translation system. Low risk, no cross-module dependencies except `state.js`.

**Duration estimate:** 30–45 minutes

### What Moves

| Function | Line |
|---|---|
| `getLang()` | 8012 |
| `setLang(lang)` | 8014 |
| `t(str)` | 8022 |
| `translateStaticUI()` | 8027 |
| `setupI18n()` | 8054 |
| `TRANSLATIONS_ES` | (already in config.js after Phase 1) |

### `i18n.js` Structure

```javascript
// js/i18n.js
import { TRANSLATIONS_ES } from './config.js';
import { state } from './state.js';

export function getLang() {
  return localStorage.getItem('prvs_lang') || 'en';
}

export function setLang(lang) {
  localStorage.setItem('prvs_lang', lang);
  state.currentLang = lang;
  translateStaticUI();
  // Re-render board if data is loaded
  if (state.currentData.length > 0) {
    window.renderBoard && window.renderBoard();
  }
}

export function t(str) {
  if (getLang() === 'es' && TRANSLATIONS_ES[str]) return TRANSLATIONS_ES[str];
  return str;
}

export function translateStaticUI() { ... }
export function setupI18n() { ... }

// Window bridge — setLang and getLang are called from inline onclick
Object.assign(window, { getLang, setLang, t, translateStaticUI, setupI18n });
```

### Test Plan

- Click the ES/EN language toggle button. Confirm UI text switches.
- Reload page. Confirm language preference persists.
- Confirm `window.t('Status')` returns 'Estado' when lang is 'es'.

---

## Phase 6 — `render.js`: Board Rendering

**Session goal:** Extract the rendering engine. This is the largest and most complex phase.

**Duration estimate:** 2–3 hours

**Risk: HIGH** — `renderBoard()` is the central function. It is ~700 lines and touches nearly every other system. However, it is also the function that, once extracted, makes the biggest improvement to code organization.

### What Moves

| Function | Line | Notes |
|---|---|---|
| `renderBoard()` | 7063 | ~700 lines — the main render loop |
| `updateStats(data, filteredData)` | 7757 | Stat tiles |
| `shouldShow(element)` | 6632 | Simple lookup in `tileVisibility` |
| `renderERAdminList()` | 13538 | Enhancement requests admin table |

**Note on card HTML generation:** `renderBoard()` contains a massive template literal (the RO card HTML). This template literal calls many global functions by name (e.g., `onclick="openPartsModal(${filteredIndex})"`, `${escapeHtml(ro.customerName)}`). These calls go through the `window` bridge established in earlier phases and in this phase. They do not need to be converted — they just need those functions to be on `window`.

### `render.js` Structure

```javascript
// js/render.js
import { SERVICE_SILOS, STATUS_PROGRESS_MAP, PART_STATUS_COLORS,
         WO_STATUS_LABELS, WO_STATUS_COLORS } from './config.js';
import { state } from './state.js';
import { calculateDaysOnLot, getDaysHeatColor, calculatePriority,
         escapeHtml, formatHours, isVideoUrl } from './utils.js';
import { t } from './i18n.js';
import { isAdmin, hasRole, canManageSilo, canSeeWorkList } from './auth.js';

export function renderBoard() { ... }
export function updateStats(data, filteredData) { ... }
export function shouldShow(element) {
  return state.tileVisibility[element];
}
export function renderERAdminList() { ... }

// Window bridge
Object.assign(window, {
  renderBoard,
  updateStats,
  shouldShow,
  renderERAdminList,
});
```

### Pre-migration audit

Before moving `renderBoard()`, do a text search for every function it calls and confirm each one will be available via `window` or direct import at the time of migration:

```bash
# In index.html, inside renderBoard():
grep -n "onclick=" ... # collect all function names called in card onclick handlers
```

Ensure every one of those functions either:
(a) is still in the inline `<script>` (and thus global), or  
(b) has been moved to a module AND is in that module's `Object.assign(window, {...})` block

### Test Plan

1. After migration, hard-reload and confirm board renders with correct card count.
2. Apply each filter type (status, parts, days, search). Confirm filtering works.
3. Change view mode (condensed/regular). Confirm card sections show/hide.
4. Check stats bar — all tiles should update when filters are applied.
5. Verify urgency color, days heat color, and priority sort order.
6. Click every button on a card and confirm modals open (buttons call window functions).
7. Confirm deep link (`?ro=PRVS-xxxx`) still scrolls and pulses the target card.

### Rollback

This phase is highest-risk. The rollback is straightforward:
1. Delete the body of `render.js` (back to placeholder).
2. The inline script copy of `renderBoard()` is still present — it will run as before.
3. Remove render.js import from `app.js`.

---

## Phase 7 — `ro-crud.js`: Repair Order CRUD

**Session goal:** Extract all Supabase read/write functions for the core repair_orders table.

**Duration estimate:** 1.5–2 hours

### What Moves

| Function | Line |
|---|---|
| `loadDataFromSupabase()` | 8919 |
| `loadDataFromSheets()` | 9431 (shim) |
| `appendToSupabase(formData)` | 9174 |
| `updateROInSupabase(originalIndex, formData)` | 9230 |
| `updateFieldInSupabase(originalIndex, fieldName, newValue)` | 9269 |
| `archiveROInSupabase(originalIndex)` | 9331 |
| `updateROStatus(index, newStatus)` | 3491 |
| `updateROUrgency(index, newUrgency)` | 3289 |
| `updateROProgress(index, newProgress)` | 3444 |
| `editField(index, fieldName)` | 3356 |
| `openEditRO(index)` | 11508 |
| `closeEditModal()` | 11578 |
| `writeAuditLog(roId, changes)` | 10695 |
| `loadCustomFieldConfigFromSupabase()` | 9384 |

### `ro-crud.js` Structure

```javascript
// js/ro-crud.js
import { SUPABASE_URL } from './config.js';
import { state } from './state.js';
import { getSB, isAdmin } from './auth.js';
import { rowToRO, generateROId, generateROIdCandidates } from './utils.js';
import { renderBoard } from './render.js';

export async function loadDataFromSupabase() { ... }
export async function appendToSupabase(formData) { ... }
export async function updateROInSupabase(originalIndex, formData) { ... }
export async function updateFieldInSupabase(originalIndex, fieldName, newValue) { ... }
export async function archiveROInSupabase(originalIndex) { ... }
export async function updateROStatus(index, newStatus) { ... }
export async function updateROUrgency(index, newUrgency) { ... }
export async function updateROProgress(index, newProgress) { ... }
export function editField(index, fieldName) { ... }
export function openEditRO(index) { ... }
export function closeEditModal() { ... }
export async function writeAuditLog(roId, changes) { ... }
export async function loadCustomFieldConfigFromSupabase() { ... }

// Window bridge
Object.assign(window, {
  loadDataFromSupabase,
  appendToSupabase,
  updateROInSupabase,
  updateFieldInSupabase,
  archiveROInSupabase,
  updateROStatus,
  updateROUrgency,
  updateROProgress,
  editField,
  openEditRO,
  closeEditModal,
  writeAuditLog,
  loadCustomFieldConfigFromSupabase,
});
```

### Test Plan

1. Load page — confirm data loads (calls `loadDataFromSupabase`).
2. Create a new RO — confirm it appears on the board.
3. Edit an existing RO — confirm changes persist after reload.
4. Change status on a card dropdown — confirm `updateROStatus` fires and card updates.
5. Change urgency — confirm card updates.
6. Archive an RO (admin only) — confirm it disappears from board.
7. Open Edit RO modal — confirm fields are pre-filled.

---

## Phase 8 — `parts.js`: Parts System

**Session goal:** Extract all parts management, parts request, and parts notification functions.

**Duration estimate:** 1.5–2 hours

### What Moves

| Function | Line |
|---|---|
| `loadPartsFromSupabase()` | 9018 |
| `openPartsModal(filteredIndex)` | 5972 |
| `showAddPartForm(editIndex)` | 6136 |
| `savePartForm(filteredIndex)` | 6172 |
| `editPartRow(filteredIndex, partIndex)` | 6277 |
| `deletePartRow(filteredIndex, partIndex)` | 6281 |
| `markPartReceived(filteredIndex, partIndex)` | 6302 |
| `appendPartToSupabase(part, roSupabaseId)` | 9087 |
| `updatePartInSupabase(part)` | 9121 |
| `deletePartFromSupabase(supabaseId)` | 9155 |
| `openPartsRequestModal(filteredIndex)` | 10242 |
| `submitPartsRequest(filteredIndex)` | 10340 |
| `openPartsStatusModal(filteredIndex)` | 10580 |
| `setPartsStatus(filteredIndex, newStatus)` | 10636 |
| `markPartsOrdered(filteredIndex)` | 10531 |
| `notifyPartsRequester(filteredIndex)` | 10175 |
| `notifyPartsEtaUpdate(ro, partName, eta)` | 10217 |
| `renderPartsPhotoPreview()` | 10152 |

### `parts.js` Imports

```javascript
import { ALL_PART_FIELDS, PART_STATUSES, PART_STATUS_COLORS } from './config.js';
import { state } from './state.js';
import { getSB, isAdmin, hasRole } from './auth.js';
import { escapeHtml } from './utils.js';
import { renderBoard } from './render.js';
import { writeAuditLog } from './ro-crud.js';
```

### Window Bridge

```javascript
Object.assign(window, {
  loadPartsFromSupabase,
  openPartsModal,
  showAddPartForm,
  savePartForm,
  editPartRow,
  deletePartRow,
  markPartReceived,
  openPartsRequestModal,
  submitPartsRequest,
  openPartsStatusModal,
  setPartsStatus,
  markPartsOrdered,
  notifyPartsRequester,
  notifyPartsEtaUpdate,
  renderPartsPhotoPreview,
});
```

### Test Plan

1. Open "Manage Parts" on a card — modal opens, parts list shows.
2. Add a new part — appears in list; persists after modal close/reopen.
3. Mark a part received — status chip updates.
4. Open "Request Parts" (as Tech role user) — form shows, can attach photos.
5. Submit parts request — check that email edge function is called.
6. Open "Set Parts Status" (as Manager) — picker shows, selection updates card chip.

---

## Phase 9 — `work-orders.js`: Work Orders & Tasks

**Session goal:** Extract the work order management system.

**Duration estimate:** 1.5–2 hours

### What Moves

| Function | Line |
|---|---|
| `loadWorkOrdersForRO(supabaseId)` | 11836 |
| `loadStaff()` | 11795 |
| `openWorkOrderModal(filteredIndex)` | 11862 |
| `openAddServicePicker(roIndex)` | 12003 |
| `addServiceToRO(roIndex, siloKey)` | 12028 |
| `openBuildWOForm(roIndex, silo)` | 12049 |
| `submitWOForm(roIndex, silo, existingWOId)` | 12345 |
| `updateTaskStatusWO(taskId, newStatus, roIndex)` | 12425 |
| `computeAndSaveWORollup(supabaseId, roIndex)` | 12443 |
| `loadWOTemplate(roIndex, silo)` | 12158 |
| `saveWOTemplate(silo)` | 12249 |
| `applyWOTemplate(templateId, roIndex, silo, mode)` | 12222 |
| `renderWorkOrderView(roIndex, ro, orders, tasks)` | 11901 |
| `buildWOTaskRowHtml(index, task, techOptions, silo)` | 12114 |

### `work-orders.js` Imports

```javascript
import { SERVICE_SILOS, SILO_TO_REPAIR_TYPE, TASK_STATUSES,
         TASK_STATUS_LABELS, TASK_STATUS_COLORS,
         WO_STATUS_LABELS, WO_STATUS_COLORS } from './config.js';
import { state } from './state.js';
import { getSB, isAdmin, hasRole, canManageSilo } from './auth.js';
import { escapeHtml } from './utils.js';
import { renderBoard } from './render.js';
import { writeAuditLog, updateFieldInSupabase } from './ro-crud.js';
```

### Test Plan

1. Click "Work Orders" on a card — modal opens with silo sections.
2. Add a new work order for a silo — form appears.
3. Add tasks to the WO — tasks render as rows.
4. Save WO — persists after close/reopen.
5. Update a task status — chip color changes, rollup dollar value updates.
6. Save and load a template — template appears in picker.

---

## Phase 10 — `photos.js`: Photo Library & Documents

**Duration estimate:** 1–1.5 hours

### What Moves

| Function | Line |
|---|---|
| `openPhotoLibrary(index, initialTab)` | 3747 |
| `uploadPhoto(index)` | 3607 |
| `uploadDocument(index, input)` | 3849 |
| `uploadToSupabaseStorage(file, roId, options)` | 4082 |
| `setMainPhoto(index, newMainUrl)` | 3907 |
| `openPhotoLightbox(photoIdx, libIndex)` | 3925 |
| `closePhotoLightbox()` | (find) |
| `navigateLightbox(direction)` | (find) |
| `openPhotoEmailModal(index)` | 3980 |
| `sendPhotosToCustomer(index)` | 4031 |
| `closePhotoLibrary(event)` | (find) |
| `switchLibTab(tab, index)` | (find) |
| `renderPhotosTab()` | (find) |
| `openPhotoMigrationTool()` | 5243 |

### Window Bridge

```javascript
Object.assign(window, {
  openPhotoLibrary,
  uploadPhoto,
  uploadDocument,
  setMainPhoto,
  openPhotoLightbox,
  closePhotoLightbox,
  navigateLightbox,
  openPhotoEmailModal,
  sendPhotosToCustomer,
  closePhotoLibrary,
  switchLibTab,
  openPhotoMigrationTool,
});
```

### Test Plan

1. Click photo thumbnail on a card — photo library opens.
2. Switch to Documents tab — tab switch works.
3. Upload a photo — new thumbnail appears in library.
4. Click a photo — lightbox opens with prev/next navigation.
5. Set as main photo — card thumbnail updates after board re-render.
6. Email photos to customer — sends without error (check Supabase Edge Function logs).

---

## Phase 11 — `time-tracking.js`

**Duration estimate:** 45–60 minutes

### What Moves

| Function | Line |
|---|---|
| `loadTimeLogsFromSupabase()` | 8988 |
| `loadTimeLogsFromSheets()` | 9509 (shim) |
| `openTimeLogsModal(index)` | 10798 |
| `getTimeLogsForRO(roId)` | 9716 |
| `calculateTotalHours(roId)` | 9720 |
| `startTimeLogsAutoRefresh()` | 9556 |
| `manualRefreshTimeLogs()` | 9583 |

### Window Bridge

```javascript
Object.assign(window, {
  loadTimeLogsFromSupabase,
  openTimeLogsModal,
  getTimeLogsForRO,
  calculateTotalHours,
  manualRefreshTimeLogs,
});
```

Note: `formatHours` was already moved to `utils.js` and is imported here.

### Test Plan

1. Time logs section on a card shows total hours.
2. Click "View Time Logs" — modal opens with session list.
3. Admin "Refresh" button triggers `manualRefreshTimeLogs`.
4. Auto-refresh interval fires without error (check console after 60 seconds).

---

## Phase 12 — `scheduling.js`: Google Calendar

**Duration estimate:** 1 hour

### What Moves

| Function | Line |
|---|---|
| `openScheduleModal(filteredIndex)` | 5429 |
| `confirmSchedule(filteredIndex)` | 5542 |
| `proceedWithSchedule(filteredIndex)` | 5633 |
| `reauthorizeCalendar(filteredIndex)` | 5416 |

### `scheduling.js` Imports

```javascript
import { CALENDAR_IDS, DAY_BASED_SERVICES, SERVICE_SILOS,
         REPAIR_TYPE_TO_SILO } from './config.js';
import { state } from './state.js';
import { getSB, isAdmin, hasRole } from './auth.js';
import { escapeHtml } from './utils.js';
```

### Window Bridge

```javascript
Object.assign(window, {
  openScheduleModal,
  confirmSchedule,
  proceedWithSchedule,
  reauthorizeCalendar,
});
```

### Test Plan

1. Click "Schedule" on a card — date/time pickers appear with silo-relevant fields.
2. Pick a date/time and confirm — check that Google Calendar event is created (verify in Google Calendar UI).
3. Schedule when token is expired — confirm re-auth prompt appears.

---

## Phase 13 — `qr.js`: QR Codes & Deep Links

**Duration estimate:** 30–45 minutes

### What Moves

| Function | Line |
|---|---|
| `openQRModal(index)` | 7572 |
| `printQRLabel(index)` | 7653 |
| `handleDeepLink()` | 6381 |

### `qr.js` Imports

```javascript
import { state } from './state.js';
// QRCode is loaded from CDN — available as window.QRCode
```

### Window Bridge

```javascript
Object.assign(window, { openQRModal, printQRLabel, handleDeepLink });
```

### Test Plan

1. Expand QR section on a card — QR canvas renders.
2. Click QR code — full-size modal opens.
3. Click print — print dialog opens with dual-sticker layout.
4. Navigate to `index.html?ro=PRVS-xxxx` — card pulses and scrolls into view.

---

## Phase 14 — `work-list.js`: Manager Work List Sidebar

**Duration estimate:** 1 hour

### What Moves

| Function | Line |
|---|---|
| `loadWorkList(viewEmail)` | 6730 |
| `renderWorkList()` | 6928 |
| `toggleWorkListPanel()` | (find) |
| `addToMyList(filteredIndex)` | (find) |
| `removeFromMyList(roId)` | (find) |

### `work-list.js` Imports

```javascript
import { SERVICE_SILOS } from './config.js';
import { state } from './state.js';
import { getSB, isAdmin, hasRole, canSeeWorkList } from './auth.js';
import { escapeHtml } from './utils.js';
```

### Window Bridge

```javascript
Object.assign(window, {
  loadWorkList,
  renderWorkList,
  toggleWorkListPanel,
  addToMyList,
  removeFromMyList,
});
```

### Test Plan

1. Click "My Work List" button — sidebar slides in.
2. Drag an RO row to reorder — order persists after panel close/reopen.
3. Click an RO in the list — board scrolls to the card.
4. Manager picker (Admin/Sr. Manager) — switching emails loads different lists.

---

## Phase 15 — `insurance.js`: Claude Vision Estimate Scanner

**Duration estimate:** 1 hour

### What Moves

| Function | Line |
|---|---|
| `openEstimateScanner(mode)` | 4594 |
| `handleEstimateFile(input, mode)` | 4605 |
| `callClaudeVision(apiKey, base64Data, mediaType, isPDF)` | 4823 |
| `renderSuggestions(mode, extracted)` | 4980 |
| `applyChip(inputId, value, mode, key, chipEl)` | 5164 |
| `writeInsuranceData(roId, extractedData, dataIndex)` | 5200 |
| `renderCustomFields(mode, savedValues)` | 4233 |

### `insurance.js` Imports

```javascript
import { state } from './state.js';
import { getSB } from './auth.js';
import { escapeHtml } from './utils.js';
```

### Window Bridge

```javascript
Object.assign(window, {
  openEstimateScanner,
  handleEstimateFile,
  renderSuggestions,
  applyChip,
  renderCustomFields,
  writeInsuranceData,
});
```

### Test Plan

1. Open New RO modal — "Scan Insurance Estimate" button appears for Insurance type.
2. Upload a PDF estimate — suggestion chips appear with extracted field values.
3. Click a chip — value populates the corresponding form field.
4. Submit RO — insurance data saved to `insurance_scans` table.

---

## Phase 16 — `kenect.js`: Kenect Messaging (Dormant)

**Duration estimate:** 30–45 minutes

**Note:** Kenect is currently dormant (buttons may be hidden). Migrate functions without breaking anything, but don't invest heavily in testing the actual API calls.

### What Moves

| Function | Line |
|---|---|
| `kenectCall(action, params, payload)` | 11029 |
| `openKenectModal(roIndex)` | 11044 |
| `refreshKenectMessages(phone, locationId)` | 11108 |
| `renderKenectMessages(container, data)` | 11134 |
| `sendKenectMessage(roIndex)` | 11186 |
| `sendKenectReview(roIndex)` | 11228 |

### Window Bridge

```javascript
Object.assign(window, {
  kenectCall,
  openKenectModal,
  refreshKenectMessages,
  sendKenectMessage,
  sendKenectReview,
});
```

---

## Phase 17 — `duplicates.js`: Duplicate RO Detection & Merging

**Duration estimate:** 45 minutes

### What Moves

| Function | Line |
|---|---|
| `findDuplicateGroups()` | 9807 |
| `openDuplicateManager()` | 9819 |
| `executeDupeMerge()` | 9917 |

### Window Bridge

```javascript
Object.assign(window, { findDuplicateGroups, openDuplicateManager, executeDupeMerge });
```

### Test Plan

1. Click "Manage Dupes" button (Admin) — duplicate groups list renders.
2. Verify merge UI appears (do not execute merge in testing unless test data is available).

---

## Phase 18 — `enhancement.js`: Genie Lamp / Enhancement Requests

**Duration estimate:** 30–45 minutes

### What Moves

| Function | Line |
|---|---|
| `openERModal()` | 13404 |
| `closeERModal()` | (find) |
| `startERDictation()` | (find) |
| `submitEnhancementRequest()` | 13459 |
| `openERAdminView()` | 13506 |
| `updateERStatus(id, status)` | 13570 |
| `loadERUnreviewedCount()` | 13495 |
| `filterERAdmin(field, value)` | (find, inline in erAdminOverlay `onchange` handlers) |
| `renderERAdminList()` | 13538 (already moved in Phase 6) |

### Window Bridge

```javascript
Object.assign(window, {
  openERModal,
  closeERModal,
  startERDictation,
  submitEnhancementRequest,
  openERAdminView,
  updateERStatus,
  loadERUnreviewedCount,
  filterERAdmin,
});
```

---

## Phase 19 — CSS Extraction (Optional, Low Priority)

**Session goal:** Move the ~2,600-line embedded CSS block from `index.html` into `css/dashboard.css`.

**Duration estimate:** 30 minutes

**Note:** This phase has no JavaScript changes. It is purely a structural cleanup.

### Steps

1. Create `css/dashboard.css`.
2. Cut the content of the `<style>` block (lines ~63–2672) and paste into `css/dashboard.css`.
3. Replace the `<style>` block in `index.html` with:

```html
<link rel="stylesheet" href="css/dashboard.css">
```

### Test Plan

- Open app. Confirm all styling is identical.
- Check browser DevTools > Sources — confirm `dashboard.css` loads correctly.
- Test on mobile viewport — responsive styles intact.
- Test dark/light transitions if any CSS animations exist.

### Rollback

Move content back to `<style>` tag, remove `<link>` tag.

---

## Final State: `index.html` After All Phases

After all phases complete, `index.html` should look like:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Supabase CDN -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/..."></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RV Repair Order Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:..." rel="stylesheet">
  <link rel="stylesheet" href="css/dashboard.css">       <!-- Phase 19 -->
</head>
<body>
  <!-- All HTML structure (noise overlay, header, controls, board, modals) -->
  <!-- Approximately 10,500 lines of HTML/template literals -->

  <!-- Module entry point (Phase 0+) -->
  <script type="module" src="js/app.js"></script>

  <!-- External CDN scripts (must stay non-module for onload= callbacks) -->
  <script src="https://accounts.google.com/gsi/client" onload="gisLoaded()" async defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://apis.google.com/js/api.js?v=2" onload="gapiLoaded()"></script>
</body>
</html>
```

The main `<script>` block (~11,000 lines) is completely removed. The inline `onclick` handlers in the HTML remain unchanged — they still work because all referenced functions are attached to `window` by their respective modules.

---

## `js/app.js`: Final Entry Point

```javascript
// js/app.js — Module orchestrator
// Import order follows dependency graph (leaves first)

import './config.js';
import './utils.js';
import { state } from './state.js';
import { initSupabaseAuthListener, loadSavedToken } from './auth.js';
import { setupI18n } from './i18n.js';
import { renderBoard } from './render.js';
import './ro-crud.js';
import './parts.js';
import './work-orders.js';
import './photos.js';
import './time-tracking.js';
import './scheduling.js';
import './qr.js';
import './work-list.js';
import './insurance.js';
import './kenect.js';
import './duplicates.js';
import './enhancement.js';

// Lifecycle functions (init, setupEventListeners, setupModalListeners, updateClock)
// These remain last — either inline here or imported from a lifecycle.js module.

function updateClock() {
  const now = new Date();
  const el = document.getElementById('currentTime');
  if (el) el.textContent = now.toLocaleTimeString();
  setTimeout(updateClock, 1000);
}

function setupEventListeners() {
  // Wire search, filter buttons, etc.
  // (extracted from inline script)
}

function setupModalListeners() {
  // Wire New RO / Edit RO form submit, close, outside-click
  // (extracted from inline script)
}

async function init() {
  setupI18n();
  setupEventListeners();
  setupModalListeners();
  updateClock();
  handleDeepLink();     // window.handleDeepLink — from qr.js
  startTimeLogsAutoRefresh(); // window.startTimeLogsAutoRefresh — from time-tracking.js
  initSupabaseAuthListener();
  // Auth check (waits for gapiInited && gisInited via polling)
  setTimeout(function checkAuth() {
    if (!state.gapiInited || !state.gisInited) {
      setTimeout(checkAuth, 100);
      return;
    }
    loadSavedToken();
  }, 500);
}

document.addEventListener('DOMContentLoaded', init);
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `gisLoaded`/`gapiLoaded` race condition (CDN fires before module window bridge) | Medium | High | Ensure `app.js` script tag appears before CDN scripts in HTML; CDN scripts have `async defer` |
| Duplicate function declarations (module + inline script both define same function) | High (during transition) | Medium | Use `// MIGRATED` comments in inline script; browser will prefer later declaration |
| `Object.defineProperties` getter/setter not intercepting module-scope `let` reassignments | Low | High | All state mutations must go through `state.xxx =`, never `let xxx =` inside modules |
| A function is called from an `onclick` before its module's `Object.assign(window,...)` runs | Low | Medium | Module scripts are deferred — they all run before any user interaction is possible |
| Cross-module circular imports | Low | High | Follow dependency graph strictly; `state.js` must never import from feature modules |
| CSS specificity changes if CSS is extracted (Phase 19) | Low | Low | Verbatim cut-paste preserves all rules |
| `escapeHtml` undefined in template literals during Phase 2 window bridge gap | Medium | High | Add `escapeHtml` to window bridge immediately in Phase 2 |

---

## Execution Checklist (Per Phase)

Use this checklist at the start of every Cowork session:

```
[ ] Read this roadmap from the top for context
[ ] Read CLAUDE_CONTEXT.md for project background  
[ ] git status is clean (no uncommitted changes)
[ ] git tag phase-N-before created
[ ] Identify the exact line range in index.html for functions being moved
[ ] Copy functions verbatim to new module (do not refactor yet)
[ ] Add import statements at top of new module
[ ] Add Object.assign(window, {...}) at bottom of new module
[ ] Add import './new-module.js' to app.js
[ ] Comment out (do not delete) originals in index.html inline script
[ ] Hard-reload app in browser with DevTools open
[ ] Run test plan for this phase
[ ] git commit -m "Phase N: extract <module-name>"
[ ] git tag phase-N-after
[ ] Update this roadmap: mark phase complete, note any issues
```

---

## Session Handoff Notes

When handing off between Cowork sessions, include in the handoff prompt:

1. Which phase was last completed (and its git tag)
2. Any functions that deviated from this spec (rename, split, etc.)
3. Any `onclick` handler function names that were found during the phase but not listed here
4. Any test failures encountered and their resolutions

The canonical function inventory is in `/home/user/workspace/scan-index.md`. If a function is not listed in this roadmap, check scan-index.md first, then search `index.html` directly with `grep -n "function functionName"`.

---

*Roadmap version: 1.0 — generated from scan-index.md (v1.308 analysis)*  
*Last updated: 2026*
