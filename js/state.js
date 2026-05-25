// js/state.js — PRVS Dashboard module-level state schema (Path B)
// Phase 3 of MODULARIZATION_ROADMAP.md — 2026-05-25 (Session 75)
//
// ── PURPOSE ─────────────────────────────────────────────────────────
// Documents the ~37 module-level state items currently declared in the
// inline <script> block of index.html, with their default values and
// JSDoc-style notes. Exposes them as `window.PRVS_State` (and also
// `window.state` for forward-spec compatibility) so DevTools and future
// modules can inspect / read the schema.
//
// ── LIVE vs. SCHEMA-ONLY (READ THIS) ────────────────────────────────
// This file is the FUTURE source of truth. It is NOT the runtime source
// of truth yet. The inline <script> in index.html still owns every live
// value. About 25 of the 37 state items are declared with `let` in the
// inline script — `let` at script top level does NOT auto-attach to
// `window`, so this module CANNOT read their live values without help.
// The remaining ~10 items are declared with `var` and DO land on
// `window.X`; those can be snapshotted live via `snapshot()` below.
//
// Plan for going live:
//   - Phase 3 (this file, additive): schema + defaults + snapshot helper
//     for the var-globals. No inline-script changes. Zero risk.
//   - Phase 3.5 (separate session, when a future module actually needs
//     live state reads): convert specific `let X` declarations to
//     `var X` (or to `window.X = ...`) for ONLY the items that module
//     needs, then wire state.snapshot() to pick them up.
//   - Phase 19 (final cleanup): inline declarations removed entirely.
//     state.js becomes the only source of truth.
//
// Until then: future modules should import the schema for type/structure
// awareness, but should read live runtime values from `window.X` for
// the var-globals, and accept that the let-globals are not yet readable
// from outside the inline script.
//
// ── PURELY ADDITIVE — NO INLINE CHANGES ─────────────────────────────
// The inline <script> declarations are untouched in Phase 3. This
// module is duplicate schema, similar to the Phase 1/2 pattern.

// ── DEFAULTS ────────────────────────────────────────────────────────
// Initial values matching the inline declarations as of v1.420.
export const STATE_DEFAULTS = Object.freeze({
    // ── Filter / view state ─────────────────────────────────────────
    /** @type {Array<object>} All ROs loaded from Supabase (post rowToRO). Inline: let, line 3928. */
    currentData: [],
    /** @type {Array<object>} Currently visible after filter+sort. Inline: let, line 3929. */
    currentFilteredData: [],
    /** @type {Array<string>} Multi-select status filter pills. Inline: let, line 3930. */
    currentStatusFilters: [],
    /** @type {string} Repair-type filter ('all' or canonical type label). Inline: let, line 3931. */
    currentRepairFilter: 'all',
    /** @type {string} Search box raw query. Inline: let, line 3932. */
    currentSearchFilter: '',
    /** @type {?number} Days-on-lot >= filter, null = off. Inline: let, line 3933. */
    currentDaysFilter: null,
    /** @type {string} Parts status filter: 'all' | 'sourcing' | 'outstanding' | 'received' | 'estimate' | 'backordered'. Inline: let, line 3934. */
    currentPartsFilter: 'all',
    /** @type {string} RO type filter: 'all' | 'insurance' | 'hybrid' | 'standard' | 'warranty' | 'shop' | 'training'. Inline: let, line 3935. */
    currentROTypeFilter: 'all',
    /** @type {boolean} Show training ROs in the board? Default false (training hidden). Inline: let, line 3936. */
    showTrainingROs: false,
    /** @type {string} View mode: 'condensed' | 'regular' | 'expanded' | 'custom'. Inline: let, line 3941. */
    currentViewMode: 'condensed',
    /** @type {Object<string,boolean>} Which card sections render. Defaults all true. Inline: let, line 3942. */
    tileVisibility: {
        rvPhoto: true,
        customerName: true,
        rvDetails: true,
        dollarValue: true,
        daysOnLot: true,
        qrCode: true,
        printLabel: true,
        photoUpload: true,
        urgencySelector: true,
        statusDropdown: true,
        repairTypeTags: true,
        technicianAssigned: true,
        contactInfo: true,
        repairDescription: true,
        progressBar: true,
        roStatusNotes: true,
        customerCommNotes: true,
        timeLogs: true,
        editButton: true,
    },

    // ── Time logs ───────────────────────────────────────────────────
    /** @type {Array<object>} Cached time-log rows. Inline: let, line 3937. */
    timeLogsData: [],
    /** @type {?number} setInterval handle for the auto-refresh timer. Inline: let, line 3938. */
    timeLogsRefreshInterval: null,

    // ── New RO form ─────────────────────────────────────────────────
    /** @type {Array<object>} Dynamic insurance fields in the New RO modal. Inline: let, line 5363. */
    customInsuranceFields: [],
    /** @type {string} Current RO type selector in the New RO modal: 'standard' | 'insurance' | 'hybrid' | 'warranty' | 'shop'. Inline: let, line 5563. */
    currentROType: 'standard',

    // ── Parts ───────────────────────────────────────────────────────
    /** @type {Object<string, Array<object>>} Parts cache keyed by RO id. Inline: let, line 7241. */
    partsData: {},
    /** @type {Array<File>} Files selected in the Parts Request modal pre-submit. Inline: let, line 12489. */
    _partsRequestFiles: [],

    // ── Deep linking (URL ?ro= param) ───────────────────────────────
    /** @type {?string} RO id from URL ?ro= param at page load. Inline: let, line 7905. */
    _deepLinkRoId: null,

    // ── Work list sidebar ───────────────────────────────────────────
    /** @type {boolean} Is the My Work List sidebar open? Inline: let, line 8585. */
    _workListOpen: false,
    /** @type {Array<object>} Current work list rows being displayed. Inline: let, line 8586. */
    _workListData: [],
    /** @type {?string} If non-null, sr_manager is viewing this manager's list. Inline: let, line 8587. */
    _workListViewEmail: null,

    // ── Auth (Supabase + Google OAuth) ──────────────────────────────
    /** @type {?object} Supabase client cache. Inline: let, line 10223. */
    _sb: null,
    /** @type {?object} Active Supabase auth session. Inline: let, line 10246. */
    supabaseSession: null,
    /** @type {boolean} Has gapi.client finished initializing? Inline: var, line 10248. WINDOW-RESIDENT (snapshot-readable). */
    gapiInited: false,
    /** @type {boolean} Has Google Identity Services finished initializing? Inline: var, line 10249. WINDOW-RESIDENT. */
    gisInited: false,
    /** @type {boolean} Has the initial RO load completed? Inline: var, line 10250. WINDOW-RESIDENT. */
    initialLoadDone: false,
    /** @type {?object} Google token client (set after gisLoaded). Inline: var, line 10251. WINDOW-RESIDENT. */
    tokenClient: null,
    /** @type {?string} Google OAuth access token. Inline: var, line 10252. WINDOW-RESIDENT. */
    accessToken: null,
    /** @type {?string} Google id_token for Supabase RBAC bridge. Inline: var, line 10253. WINDOW-RESIDENT. */
    googleIdToken: null,
    /** @type {?number} Schedule modal index pending re-auth completion. Inline: var, line 10254. WINDOW-RESIDENT. */
    _pendingScheduleIndex: null,
    /** @type {?string} Raw nonce shared between gisLoaded and tokenClient callback. Inline: var, line 10255. WINDOW-RESIDENT. */
    supabaseNonce: null,
    /** @type {boolean} Set by loadSavedToken to prevent gisLoaded from re-authing. NOTE: post-v1.417 the auth flow no longer keys decisions on this flag; preserved for non-auth UI hydration only. Inline: var, line 10256. WINDOW-RESIDENT. */
    sessionRestoredFromCache: false,
    /** @type {?object} { email, name, picture } of current Google user. Inline: var, line 10257. WINDOW-RESIDENT. */
    currentUser: null,
    /** @type {Array<string>} Role names — e.g., ['Admin', 'Sr Manager']. Driven by users + user_roles + staff merge. Inline: let, line 10347. */
    userRoles: [],

    // ── Editing ─────────────────────────────────────────────────────
    /** @type {?number} Index into currentFilteredData of RO currently being edited. Inline: let, line 13183. */
    editingROIndex: null,

    // ── Caches ──────────────────────────────────────────────────────
    /** @type {Array<object>} Staff table cache. Inline: let, line 14286. */
    _staffCache: [],
    /** @type {Object<string, {orders: Array, tasks: Array}>} Work order cache keyed by repair_orders.id UUID. Inline: let, line 14287. */
    _workOrderCache: {},
    /** @type {Object<string, *>} app_config table cache. Inline: let, line 14303. */
    _appConfig: {},

    // ── Enhancement Request admin view (2nd <script> block) ─────────
    /** @type {Array<object>} ER rows for admin view. Inline: let, line 16110 (unindented). */
    _erData: [],
    /** @type {string} ER admin filter — status. Inline: let, line 16111. */
    _erFilterStatus: 'all',
    /** @type {string} ER admin filter — category. Inline: let, line 16112. */
    _erFilterCategory: 'all',

    // ── Window-attached state (not declared with let/var) ───────────
    // These are already on window via direct `window.X = ...` writes,
    // so they CAN be read live from this module. Schema for docs:
    /** @type {?{filteredIndex:number,originalIndex:number,roId:string}} Parts modal context. Lives at window._partsModalContext (lines 7631+). LIVE-READABLE via snapshot(). */
    _partsModalContext: null,
    /** @type {boolean} Insurance WO Writer restricted mode flag for Brandon. Lives at window._woFormRestricted (lines 14584+, v1.415). LIVE-READABLE via snapshot(). */
    _woFormRestricted: false,
});

// ── LIVE STATE OBJECT ───────────────────────────────────────────────
// Mutable copy of defaults. Modules can write to this, but writes do NOT
// propagate back to the inline-script declarations. Treat as scratch
// space until Phase 19 cleanup or until an explicit sync helper wires
// a specific field both directions.
export const state = Object.assign({}, structuredClone(STATE_DEFAULTS));

// ── SNAPSHOT HELPER ─────────────────────────────────────────────────
// Reads window-resident state (the ~10 var-declared globals + the 2
// explicit window.X assignments) and copies into the `state` object.
// Returns the same object for chaining/inspection.
//
// Properties this DOES NOT pick up live (still owned by inline `let`):
//   currentData, currentFilteredData, currentStatusFilters,
//   currentRepairFilter, currentSearchFilter, currentDaysFilter,
//   currentPartsFilter, currentROTypeFilter, showTrainingROs,
//   currentViewMode, tileVisibility, timeLogsData,
//   timeLogsRefreshInterval, customInsuranceFields, currentROType,
//   partsData, _partsRequestFiles, _deepLinkRoId, _workListOpen,
//   _workListData, _workListViewEmail, _sb, supabaseSession,
//   userRoles, editingROIndex, _staffCache, _workOrderCache,
//   _appConfig, _erData, _erFilterStatus, _erFilterCategory.
// Those return the default placeholders until Phase 3.5 wires them.
//
// Properties this CAN pick up live:
//   gapiInited, gisInited, initialLoadDone, tokenClient,
//   accessToken, googleIdToken, _pendingScheduleIndex,
//   supabaseNonce, sessionRestoredFromCache, currentUser,
//   _partsModalContext, _woFormRestricted.
const SNAPSHOT_LIVE_KEYS = [
    'gapiInited',
    'gisInited',
    'initialLoadDone',
    'tokenClient',
    'accessToken',
    'googleIdToken',
    '_pendingScheduleIndex',
    'supabaseNonce',
    'sessionRestoredFromCache',
    'currentUser',
    '_partsModalContext',
    '_woFormRestricted',
];
export function snapshot() {
    for (const key of SNAPSHOT_LIVE_KEYS) {
        if (typeof window !== 'undefined' && key in window) {
            state[key] = window[key];
        }
    }
    return state;
}

// Expose for DevTools + spec-style window.state access.
window.PRVS_State = { state, STATE_DEFAULTS, snapshot, SNAPSHOT_LIVE_KEYS };
window.state = state;
