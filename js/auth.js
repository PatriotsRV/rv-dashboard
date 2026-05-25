// js/auth.js — Authentication & Session Management module
// ─────────────────────────────────────────────────────────────────────
// PHASE 4A (Session 76, 2026-05-25) — Groups A + B extracted (10 of 18
// auth functions). Pure-additive: inline copies in index.html still own
// runtime. This module re-implements the same logic against window-attached
// state so it can be invoked independently for DevTools verification and
// future Phase 4B/4.5 ownership transfer.
//
// PHASE 4B-C (Session 77, 2026-05-25) — Group C extracted (6 more
// Supabase-plumbing functions). Pure-additive: inline copies still own
// runtime. Module versions read/write window-attached state.
//
// PHASE 4B-D (Session 77, 2026-05-25) — Group D extracted (3 large
// session-restore + One Tap + signInWithIdToken functions). Pure-additive:
// inline copies still own runtime. v1.416 + v1.417 Lynn-fix code surface
// preserved verbatim in module versions. With Phase 4B-D, ALL 18 originally
// inline auth functions are now also exported from this module — Phase 4.5
// (delete-inline cleanup) can run any time after a full regression matrix.
//
// Functions exported so far:
//
//   GROUP A — pure role helpers (read-only against window.userRoles):
//     isAdmin
//     hasRole
//     canSeeWorkList
//     isSrManagerOrAdmin
//     canManageSilo
//
//   GROUP B — token + GAPI bootstrap (localStorage + gapi.client.init):
//     saveToken
//     clearToken
//     setupTokenRefresh
//     gapiLoaded
//     initializeGapiClient
//
//   GROUP C — Supabase plumbing + auth-status UI:
//     getSB                      — cached Supabase client (window._sb shared)
//     loadUserRoles              — user_roles + staff merge (Lynn-fix surface)
//     upsertUser                 — INSERT/UPDATE users row after login
//     initSupabaseAuthListener   — onAuthStateChange handler
//     updateAuthStatus           — DOM update for connection indicator + buttons
//     handleAuthClick            — Connect-button onClick handler
//
//   GROUP D — Session restore + One Tap + signInWithIdToken (Lynn-fix surface):
//     getUserInfo                — fetch Google userinfo, populate currentUser
//     loadSavedToken             — DOMContentLoaded entry; Step 1 Supabase
//                                  session restore, Step 2 Google token fallback
//     gisLoaded                  — google.accounts initializer (One Tap +
//                                  tokenClient); CDN onload= hook
//
// State references:
//   - Reads window.userRoles, window.accessToken, window.currentUser,
//     window.tokenClient, window._currentStaffSilo, window._currentStaffRole,
//     window.supabaseSession, window._sb, window.gapiInited, window.gisInited,
//     window.initialLoadDone, window.sessionRestoredFromCache,
//     window._pendingScheduleIndex, window.googleIdToken
//   - Writes window.gapiInited, window.accessToken, window.currentUser,
//     window.userRoles, window._sb, window.supabaseSession,
//     window._currentStaffSilo, window._currentStaffRole, window.currentData,
//     window.initialLoadDone, window.sessionRestoredFromCache,
//     window.gisInited, window.googleIdToken, window._pendingScheduleIndex
//
// Imports from config.js:
//   - GOOGLE_CONFIG (API_KEY + DISCOVERY_DOCS for gapi.client.init,
//     CLIENT_ID + SCOPES for gisLoaded's tokenClient)
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SB_AUTH_OPTIONS (for getSB)
// ─────────────────────────────────────────────────────────────────────

import { GOOGLE_CONFIG, SUPABASE_URL, SUPABASE_ANON_KEY, SB_AUTH_OPTIONS } from './config.js';

// ─────────────────────────────────────────────────────────────────────
// GROUP A — Pure role helpers (read window.userRoles, no side effects)
// ─────────────────────────────────────────────────────────────────────

/** True iff the current user has the 'Admin' role (from user_roles table). */
export function isAdmin() {
    return Array.isArray(window.userRoles) && window.userRoles.includes('Admin');
}

/** True iff the current user has the given role name in window.userRoles. */
export function hasRole(role) {
    return Array.isArray(window.userRoles) && window.userRoles.includes(role);
}

/** True iff the user can see the Manager Work List header button (admin or any manager tier). */
export function canSeeWorkList() {
    return isAdmin() || hasRole('Manager') || hasRole('Sr Manager');
}

/** True iff the user is a Sr Manager or Admin (used in several gate checks). */
export function isSrManagerOrAdmin() {
    return isAdmin() || hasRole('Sr Manager');
}

/**
 * True iff the user can manage Work Orders in the given silo.
 * Mirrors inline canManageSilo() in index.html exactly. Reads window.userRoles
 * + window._currentStaffSilo + window._currentStaffRole (all populated by
 * loadUserRoles staff merge step — still inline-owned in Phase 4A).
 */
export function canManageSilo(silo) {
    if (isAdmin()) return true;
    if (hasRole('Sr Manager')) return true;
    // Silo-specific manager: check staff table silo assignment
    if (hasRole('Manager') && window._currentStaffSilo === silo) return true;
    // Insurance WO Writer (e.g. Brandon Dillon) — cross-silo WO write privilege,
    // restricted by submitWOForm + openBuildWOForm + DB triggers from
    // BRANDON_INSURANCE_WO_WRITER.sql (cannot approve/close/reassign/delete/re-price).
    if (hasRole('Insurance WO Writer')) return true;
    if (hasRole('Manager') && window._currentStaffRole === 'parts_manager') return false;
    return false;
}

// ─────────────────────────────────────────────────────────────────────
// GROUP B — Token + GAPI bootstrap (localStorage + gapi.client.init)
// ─────────────────────────────────────────────────────────────────────

/**
 * Save a Google OAuth access token to localStorage with expiry tracking.
 * Used by both the tokenClient callback (after silent refresh) and after fresh login.
 * `expiresIn` is in seconds (Google convention); we persist absolute ms timestamp.
 */
export function saveToken(token, expiresIn) {
    localStorage.setItem('google_access_token', token);
    // expiresIn is in seconds, convert to milliseconds and add to current time
    const expiry = Date.now() + (expiresIn * 1000);
    localStorage.setItem('google_token_expiry', expiry.toString());

    // Save last successful auth time for session tracking
    localStorage.setItem('last_auth_time', Date.now().toString());
}

/**
 * Clear all Google-side auth artifacts from localStorage and reset in-memory
 * accessToken + currentUser. Does NOT touch Supabase session (that lives at
 * its own storageKey 'prvs_supabase_auth' and is cleared via getSB().auth.signOut()
 * — see Phase 4B for that path).
 */
export function clearToken() {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expiry');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('last_auth_time');
    window.accessToken = null;
    window.currentUser = null;
}

/**
 * Schedule a silent Google OAuth token refresh 5 min before the current token
 * expires. Reads expiry from localStorage. Fires-and-forgets: if the silent
 * refresh fails (no recent session, popup blocker, etc.) it logs and exits —
 * the user re-clicks "Connect to PRVS" the next time they need a fresh token
 * (e.g. for Drive uploads). No popup will ever appear from this function.
 */
export function setupTokenRefresh() {
    const tokenExpiry = localStorage.getItem('google_token_expiry');
    if (!tokenExpiry) return;

    const expiryTime = parseInt(tokenExpiry);
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;

    // Refresh 5 minutes before expiry
    const refreshTime = timeUntilExpiry - 300000;

    if (refreshTime > 0) {
        console.log('Token refresh scheduled in', Math.round(refreshTime / 60000), 'minutes');
        setTimeout(() => {
            console.log('Auto-refreshing token silently...');
            // Silent refresh only — no popup ever
            // If it fails, user just reconnects manually when needed (Drive uploads)
            try {
                window.tokenClient.requestAccessToken({ prompt: '', hint: window.currentUser?.email || '' });
            } catch (e) {
                console.log('Silent refresh not available — token will expire naturally');
            }
        }, refreshTime);
    }
}

/**
 * CDN onload callback for https://apis.google.com/js/api.js. Loads the gapi
 * 'client' module then chains into initializeGapiClient(). Re-attempts every
 * 500 ms if gapi is not yet defined on window.
 */
export function gapiLoaded() {
    if (typeof gapi === 'undefined') {
        console.error('gapi not loaded yet, retrying...');
        setTimeout(gapiLoaded, 500);
        return;
    }
    gapi.load('client', initializeGapiClient);
}

/**
 * Initialize gapi.client with API_KEY + DISCOVERY_DOCS from config.js's
 * GOOGLE_CONFIG. Sets window.gapiInited = true on success. On error, retries
 * after 1 sec (transient network failures are common during page load).
 */
export async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
        });
        window.gapiInited = true;
        console.log('gapi initialized successfully');
    } catch (error) {
        console.error('Error initializing gapi:', error);
        setTimeout(initializeGapiClient, 1000);
    }
}

// ─────────────────────────────────────────────────────────────────────
// GROUP C — Supabase plumbing + auth-status UI
// ─────────────────────────────────────────────────────────────────────

/**
 * Cached Supabase client. Shared with the inline copy in index.html via
 * window._sb so both call sites construct exactly ONE client per page load
 * (two clients pointed at the same project would create two separate auth
 * sessions and two separate JWTs).
 *
 * On first call: looks for the UMD-loaded `supabase` global (or window.supabase)
 * and constructs the client with SB_AUTH_OPTIONS from config.js. Returns a
 * dummy stub if the SDK script tag hasn't loaded yet — caller can retry
 * later. Subsequent calls return the cached instance.
 */
export function getSB() {
    if (!window._sb) {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, SB_AUTH_OPTIONS);
        } else if (window.supabase && window.supabase.createClient) {
            window._sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, SB_AUTH_OPTIONS);
        } else {
            console.error('Supabase SDK not available yet');
            return {
                from: () => ({ select: () => Promise.resolve({ data: [], error: new Error('Supabase not ready') }) }),
                auth: {
                    getSession: () => Promise.resolve({ data: { session: null } }),
                    signInWithIdToken: () => Promise.resolve({ data: null, error: new Error('Supabase not ready') }),
                },
            };
        }
    }
    return window._sb;
}

/**
 * Load roles for the signed-in user from Supabase (user_roles via users.id
 * for hand-assigned roles like 'Admin' / 'Insurance WO Writer'; staff table
 * for the role tier — Sr Manager / Manager / Tech). Writes the merged result
 * to window.userRoles plus window._currentStaffSilo + window._currentStaffRole.
 *
 * v1.416 hardening preserved verbatim: the two role sources are INDEPENDENT
 * try/catch blocks so a missing/duplicate `users` row no longer silently
 * demotes a real staff manager. Lynn-fix surface — touch with care.
 */
export async function loadUserRoles() {
    if (!window.supabaseSession) return;
    const email = window.supabaseSession.user.email;
    let mergedRoles = [];

    // 1) Preferred path: user_roles via users.id (Admin lives here, plus any
    //    hand-assigned roles like 'Insurance WO Writer'). Failures are logged
    //    but do NOT prevent the staff-table fallback in step 2.
    try {
        const { data: userRecord } = await getSB()
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle(); // .single() returns 406 when no row found; .maybeSingle() returns null
        if (userRecord) {
            const { data: roleData } = await getSB()
                .from('user_roles')
                .select('roles(name)')
                .eq('user_id', userRecord.id);
            if (roleData) {
                mergedRoles = roleData.map(r => r.roles?.name).filter(Boolean);
            }
        } else {
            console.warn('⚠️ No users row for', email, '— role will be derived from staff table only.');
        }
    } catch (e) {
        console.warn('user_roles lookup failed (continuing with staff merge):', e);
    }

    // 2) Staff-table merge (S2 Phase 2 staff → role sync). Runs unconditionally
    //    so a missing/duplicate users row can't silently demote a real staffer.
    //    .maybeSingle() so 0 rows is a quiet null instead of a 406.
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
            if (mapped && !mergedRoles.includes(mapped)) {
                mergedRoles.push(mapped);
            }
            // Store silo for canManageSilo() use
            window._currentStaffSilo = staffRecord.service_silo || null;
            window._currentStaffRole = staffRecord.role || null;
        }
    } catch (e) {
        console.warn('staff role merge failed:', e);
    }

    window.userRoles = mergedRoles;
    console.log('✅ User roles:', window.userRoles);
}

/**
 * Ensure a row exists in the public.users table after a successful Supabase
 * sign-in. Called from the gisLoaded tokenClient callback (Phase 4B-D).
 * onConflict: 'id' upserts safely on re-login.
 */
export async function upsertUser(session) {
    if (!session) return;
    try {
        const { user } = session;
        await getSB().from('users').upsert({
            id:         user.id,
            email:      user.email,
            name:       user.user_metadata?.full_name || user.email,
            avatar_url: user.user_metadata?.avatar_url || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (e) {
        console.warn('Could not upsert user:', e);
    }
}

/**
 * Register a Supabase onAuthStateChange listener that keeps window.supabaseSession
 * in sync whenever Supabase silently auto-refreshes the JWT (every ~55 min).
 * Without this, the UI's connection check eventually goes stale even though
 * Supabase itself still has a valid session.
 *
 * Idempotent: Supabase deduplicates listener registrations by reference.
 */
export function initSupabaseAuthListener() {
    getSB().auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
            window.supabaseSession = session;
            console.log('✅ Supabase session updated via onAuthStateChange:', event);
            updateAuthStatus(true);
        } else if (event === 'SIGNED_OUT') {
            window.supabaseSession = null;
            window.currentUser = null;
            updateAuthStatus(false);
            console.log('🔒 Supabase session signed out');
        }
    });
}

/**
 * Update the auth-status DOM: indicator dot, status text, modal button, header
 * connect button, and connection status label. Also wires the disconnect/connect
 * onClick handlers. Called whenever the connection state changes.
 *
 * Calls into runtime-owned globals (window.handleAuthClick, window.clearToken,
 * window.renderBoard, window.currentData, window.sampleData) so the module
 * version stays equivalent to inline through Phase 4.5.
 */
export function updateAuthStatus(connected) {
    const indicator = document.getElementById('authIndicator');
    const status = document.getElementById('authStatus');
    const authButton = document.getElementById('authButton');
    const connectSheetsBtn = document.getElementById('connectSheetsBtn');
    const connectionStatus = document.getElementById('connectionStatus');

    if (connected) {
        // Modal button
        indicator.classList.add('connected');
        status.textContent = 'Connected to PRVS Database';
        authButton.textContent = 'Disconnect';
        authButton.onclick = async () => {
            await getSB().auth.signOut(); // end Supabase session
            (window.clearToken || clearToken)();
            updateAuthStatus(false);
            // currentData + sampleData are inline `let`/`const` — not window-
            // attached in Phase 4B-C. Only reset if window has them (future
            // Phase 3.5-style let→var conversion); otherwise inline's onclick
            // (the actual runtime owner) is what reset state at boot. Avoids
            // setting window.currentData = undefined if a DevTools call to
            // PRVS_Auth.updateAuthStatus(true) rewires this onclick.
            if (typeof window.sampleData !== 'undefined') {
                window.currentData = window.sampleData;
            }
            if (typeof window.renderBoard === 'function') window.renderBoard();
        };

        // Header button
        connectSheetsBtn.classList.add('connected');
        connectionStatus.textContent = '✓ Connected to PRVS';
    } else {
        // Modal button
        indicator.classList.remove('connected');
        status.textContent = 'Not connected to PRVS Database';
        authButton.textContent = 'Connect to PRVS';
        authButton.onclick = () => {
            if (!window.gapiInited || !window.gisInited) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Google APIs are still loading. Please wait and try again.', 'info', { duration: 6000 });
                }
                return;
            }
            handleAuthClick();
        };

        // Header button
        connectSheetsBtn.classList.remove('connected');
        connectionStatus.textContent = '🔗 Connect to PRVS';
    }
}

/**
 * Connect-button onClick handler. Requests a new Google OAuth access token
 * via the cached tokenClient. If a token already exists, attempts a silent
 * refresh first (no popup). Falls back silently if silent refresh isn't
 * available — user re-clicks if they need to.
 */
export function handleAuthClick() {
    console.log('=== handleAuthClick called ===');
    // Always try silent first, only show popup on explicit user click
    if (window.accessToken === null) {
        console.log('Requesting new token...');
        window.tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        console.log('Refreshing existing token silently...');
        try {
            window.tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.log('Silent refresh not available');
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// GROUP D — Session restore + One Tap + signInWithIdToken (Lynn-fix surface)
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetch Google userinfo for the current access token and populate
 * window.currentUser. Called from the gisLoaded tokenClient callback after
 * a fresh login. On failure (expired token, network error, missing scope)
 * sets currentUser to an Unknown User stub and returns it.
 *
 * v1.417 fix preserved: awaits loadUserRoles() BEFORE updateViewModeDropdown()
 * so role-gated buttons never render empty during fresh-login paths.
 */
export async function getUserInfo() {
    if (!window.accessToken) {
        console.warn('No access token available for user info');
        window.currentUser = { email: 'unknown@user.com', name: 'Unknown User' };
        return window.currentUser;
    }

    try {
        console.log('Fetching user info...');

        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${window.accessToken}`,
            },
        });

        if (response.ok) {
            const userInfo = await response.json();
            window.currentUser = {
                email: userInfo.email || 'unknown@user.com',
                name:  userInfo.name || userInfo.email?.split('@')[0] || 'Unknown User',
            };
            console.log('✓ Logged in as:', window.currentUser.name, '(' + window.currentUser.email + ')');
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));

            // v1.417: load roles BEFORE first paint so role-gated buttons never
            // render empty during fresh-login paths. Without this, the first
            // updateViewModeDropdown() call ran with userRoles=[] until a later
            // paint overwrote it.
            await loadUserRoles();
            if (typeof window.updateViewModeDropdown === 'function') window.updateViewModeDropdown();

            return window.currentUser;
        } else {
            console.warn('Could not fetch user info (status:', response.status + ')');
            console.warn('You need to disconnect and reconnect to grant userinfo permissions.');
            window.currentUser = { email: 'unknown@user.com', name: 'Unknown User' };
            return window.currentUser;
        }
    } catch (error) {
        console.error('Error getting user info:', error);
        window.currentUser = { email: 'unknown@user.com', name: 'Unknown User' };
        return window.currentUser;
    }
}

/**
 * Page-boot session restorer. Two-step strategy:
 *
 *   Step 1 — Supabase first: if getSB().auth.getSession() returns a live
 *   session, restore window.supabaseSession + window.currentUser, opportunistically
 *   restore the Google access token if still valid, load all data, mark
 *   initialLoadDone and sessionRestoredFromCache true, return true.
 *
 *   Step 2 — Google token fallback: if Supabase session is gone but a non-expired
 *   Google access token is in localStorage, restore the Google session, load
 *   data, fire One Tap (via gisLoaded) to re-auth Supabase in the background.
 *
 *   Step 3 — Silent refresh (Chrome only, < 24h since last auth): try
 *   tokenClient.requestAccessToken({prompt:''}). If that fails, clearToken().
 *
 *   No saved state → return false, app shows Connect button.
 *
 * v1.417 hardening preserved: Step 2 awaits loadUserRoles() before
 * updateViewModeDropdown() so role-gated buttons reflect actual state even
 * during the Google-only fallback path (and the One Tap that follows will
 * re-auth Supabase and refresh roles again via the signInWithIdToken callback).
 */
export async function loadSavedToken() {
    console.log('🔍 loadSavedToken called');
    const savedToken    = localStorage.getItem('google_access_token');
    const tokenExpiry   = localStorage.getItem('google_token_expiry');
    const savedUser     = localStorage.getItem('currentUser');
    const lastAuthTime  = localStorage.getItem('last_auth_time');
    const isSafari      = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    console.log('Saved token exists:', !!savedToken, '| Expiry:', tokenExpiry);

    // Register auth state listener once (idempotent — Supabase deduplicates)
    initSupabaseAuthListener();

    // ── STEP 1: Always check Supabase session first ──────────
    // Supabase persists its own session in localStorage for weeks.
    // If valid, load data immediately regardless of Google token state.
    try {
        const { data: { session } } = await getSB().auth.getSession();
        if (session) {
            window.supabaseSession = session;
            console.log('✅ Supabase session active — loading data');

            // Restore user from Supabase session
            if (!window.currentUser) {
                const u = session.user;
                window.currentUser = {
                    email: u.email,
                    name:  u.user_metadata?.full_name || u.email,
                    id:    u.id,
                };
                localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            } else if (savedUser) {
                try { window.currentUser = JSON.parse(savedUser); } catch (e) {}
            }

            // Restore Google token if still valid (for Drive compat)
            const now = Date.now();
            if (savedToken && tokenExpiry && now < (parseInt(tokenExpiry) - 300000)) {
                window.accessToken = savedToken;
                gapi.client.setToken({ access_token: savedToken });
                console.log('✅ Google token also valid');
            }

            await loadUserRoles();
            if (typeof window.updateViewModeDropdown === 'function') window.updateViewModeDropdown();
            updateAuthStatus(true);
            if (typeof window.loadDataFromSupabase === 'function') await window.loadDataFromSupabase();
            if (typeof window.loadTimeLogsFromSupabase === 'function') await window.loadTimeLogsFromSupabase();
            if (typeof window.loadStaff === 'function') window.loadStaff(); // GH#5 — staff roster for WO assignment
            if (typeof window.loadAppConfig === 'function') window.loadAppConfig(); // S7 — calendar IDs from Supabase

            window.initialLoadDone = true;
            if (typeof window.startTimeLogsAutoRefresh === 'function') window.startTimeLogsAutoRefresh();
            if (!isSafari) setupTokenRefresh();

            window.sessionRestoredFromCache = true;
            console.log('✅ Session restored via Supabase');
            return true;
        }
    } catch (e) {
        console.warn('Supabase session check failed:', e);
    }

    // ── STEP 2: Fall back to Google token if Supabase session gone ──
    if (savedToken && tokenExpiry) {
        const now = Date.now();
        const expiryTime = parseInt(tokenExpiry);

        console.log('Time until Google token expiry (minutes):', Math.round((expiryTime - now) / 60000));

        if (now < (expiryTime - 300000)) {
            console.log('✅ Google token valid, loading...');
            window.accessToken = savedToken;
            gapi.client.setToken({ access_token: savedToken });

            if (savedUser) {
                try {
                    window.currentUser = JSON.parse(savedUser);
                    console.log('Loaded saved user:', window.currentUser.name);
                    // v1.417: load roles BEFORE updateViewModeDropdown so role-gated
                    // buttons reflect actual state, not the empty userRoles=[] default.
                    // Even if Supabase session is gone (we're in the Google-only fallback
                    // path), this call won't hurt — and the One Tap prompt below will
                    // re-auth Supabase and trigger a follow-up role load via the
                    // signInWithIdToken callback (see v1.417 changes in gisLoaded).
                    await loadUserRoles();
                    if (typeof window.updateViewModeDropdown === 'function') window.updateViewModeDropdown();
                } catch (e) {}
            }

            updateAuthStatus(true);
            if (typeof window.loadDataFromSupabase === 'function') await window.loadDataFromSupabase();
            if (typeof window.loadTimeLogsFromSupabase === 'function') await window.loadTimeLogsFromSupabase();

            window.initialLoadDone = true;
            if (typeof window.startTimeLogsAutoRefresh === 'function') window.startTimeLogsAutoRefresh();
            if (!isSafari) setupTokenRefresh();
            window.sessionRestoredFromCache = true;

            return true;
        } else if (lastAuthTime && !isSafari) {
            console.log('Token expired, attempting silent refresh (Chrome only)...');
            // Token expired but user had recent session - try silent refresh
            // SKIP on Safari - silent refresh not supported
            const lastAuth = parseInt(lastAuthTime);
            const hoursSinceAuth = (now - lastAuth) / (1000 * 60 * 60);

            if (hoursSinceAuth < 24) {
                console.log('Token expired but recent session detected, attempting silent refresh...');
                // Load user info first
                if (savedUser) {
                    try {
                        window.currentUser = JSON.parse(savedUser);
                    } catch (e) {}
                }
                // Try silent token refresh
                try {
                    window.tokenClient.requestAccessToken({ prompt: '' });
                } catch (e) {
                    console.log('Silent refresh not supported, clearing token');
                    clearToken();
                }
                return true;
            } else {
                console.log('Session too old, clearing...');
                clearToken();
            }
        } else {
            console.log('❌ Saved token expired, clearing...');
            clearToken();
        }
    } else {
        console.log('❌ No saved token found');
    }
    return false;
}

/**
 * google.accounts CDN initializer. Sets up BOTH:
 *   1. google.accounts.id (for Supabase signInWithIdToken via id_token / One Tap)
 *   2. google.accounts.oauth2 tokenClient (for access_token / Drive + Calendar)
 *
 * Nonce is persisted in localStorage as a hex string (both raw + SHA-256 hash)
 * so it survives async callback gaps and page reloads. Supabase verifies the
 * hashed nonce in the JWT against the raw nonce we pass to signInWithIdToken.
 *
 * v1.417 fixes preserved verbatim:
 *   - id callback skip-condition: `if (window.supabaseSession) return` —
 *     NOT `(sessionRestoredFromCache || supabaseSession)` which silently
 *     aborted re-auth when only a stale Google token had been restored.
 *   - post-signInWithIdToken success block re-runs loadUserRoles +
 *     updateViewModeDropdown + updateAuthStatus so role-gated UI re-renders
 *     once Supabase auth is back.
 *   - One Tap prompt skip uses `!window.supabaseSession` — not the
 *     `sessionRestoredFromCache` flag.
 */
export async function gisLoaded() {
    if (typeof google === 'undefined' || !google.accounts) {
        console.error('google identity services not loaded yet, retrying...');
        setTimeout(gisLoaded, 500);
        return;
    }

    // Initialize ID token client — captures id_token for Supabase RBAC
    // Nonce persisted in localStorage so it survives async callback gaps and page reloads.
    // IMPORTANT: both raw nonce and hash must be hex strings — Supabase verifies using hex SHA-256.
    let sbNonce = localStorage.getItem('prvs_sb_nonce');
    let sbHashedNonce = localStorage.getItem('prvs_sb_nonce_hash');
    if (!sbNonce) {
        const rawNonceBytes = crypto.getRandomValues(new Uint8Array(16));
        sbNonce = Array.from(rawNonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const nonceBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sbNonce));
        sbHashedNonce = Array.from(new Uint8Array(nonceBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('prvs_sb_nonce', sbNonce);
        localStorage.setItem('prvs_sb_nonce_hash', sbHashedNonce);
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        nonce: sbHashedNonce,             // top-level: current Chrome support
        params: { nonce: sbHashedNonce }, // inside params: required by Chrome 145+
        callback: async (credentialResponse) => {
            if (credentialResponse.credential) {
                window.googleIdToken = credentialResponse.credential;
                // v1.417: skip ONLY if Supabase session is actually live. The previous
                // condition (sessionRestoredFromCache || supabaseSession) also returned
                // early when Step 2 restored UI from a stale Google-only cache without
                // a Supabase session — silently aborting the re-auth that would have
                // fixed Lynn's missing admin buttons.
                if (window.supabaseSession) {
                    console.log('✅ Supabase session already active — skipping signInWithIdToken');
                    return;
                }
                try {
                    const retrievedNonce = localStorage.getItem('prvs_sb_nonce');
                    const { data: sbData, error: sbError } = await getSB().auth.signInWithIdToken({
                        provider: 'google',
                        token:    window.googleIdToken,
                        nonce:    retrievedNonce,
                    });
                    if (sbError) {
                        console.warn('⚠️ Supabase signInWithIdToken failed:', sbError.message);
                        // Clear nonce on failure — fresh one generated on next attempt
                        localStorage.removeItem('prvs_sb_nonce');
                        localStorage.removeItem('prvs_sb_nonce_hash');
                    } else {
                        window.supabaseSession = sbData.session;
                        console.log('✅ Supabase authenticated session created — RBAC active');
                        // Clear nonce after successful use
                        localStorage.removeItem('prvs_sb_nonce');
                        localStorage.removeItem('prvs_sb_nonce_hash');
                        // v1.417: re-render role-gated UI now that Supabase auth is back.
                        // Required when Step 2 fallback fired and userRoles is stale [].
                        // Without this, the buttons stay hidden even though RBAC is live.
                        try {
                            await loadUserRoles();
                            if (typeof window.updateViewModeDropdown === 'function') window.updateViewModeDropdown();
                            updateAuthStatus(true);
                            console.log('✅ Roles reloaded post-One-Tap; buttons refreshed');
                        } catch (refreshErr) {
                            console.warn('⚠️ Post-One-Tap role refresh failed:', refreshErr.message);
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Supabase auth exchange failed:', e.message);
                }
            }
        },
        auto_select: true,
    });
    // v1.417: prompt One Tap whenever Supabase session is NOT live, regardless of
    // whether some UI was restored from cache. The previous `!sessionRestoredFromCache`
    // check was a misleading proxy — Step 2 set the flag true even when the cache
    // only contained a stale Google token, suppressing the One Tap prompt that would
    // have re-authed Supabase. This is the root-cause edit for Lynn's flakiness.
    if (!window.supabaseSession) {
        google.accounts.id.prompt();
    } else {
        console.log('✅ Supabase session live — skipping One Tap prompt');
    }

    window.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        scope:     GOOGLE_CONFIG.SCOPES,
        callback: async (resp) => {
            console.log('Auth callback received:', resp);
            if (resp.error !== undefined) {
                console.error('Auth error:', resp.error);
                return;
            }
            window.accessToken = resp.access_token;

            // CRITICAL: always set token in gapi client — covers both fresh login and silent refresh
            gapi.client.setToken({ access_token: window.accessToken });
            console.log('✅ Token set in gapi client');

            const expiresIn = resp.expires_in || 3600;
            saveToken(window.accessToken, expiresIn);
            setupTokenRefresh();

            // If re-auth was triggered from inside the Schedule modal, re-open it
            if (window._pendingScheduleIndex !== null && window._pendingScheduleIndex !== undefined) {
                const idx = window._pendingScheduleIndex;
                window._pendingScheduleIndex = null;
                if (typeof window.closeScheduleModal === 'function') window.closeScheduleModal();
                if (typeof window.openScheduleModal === 'function') window.openScheduleModal(idx);
                return;
            }

            // Only do full load if this is a fresh login (no data yet)
            if (!window.initialLoadDone) {
                await getUserInfo();
                updateAuthStatus(true);

                if (window.currentUser?.email) {
                    // ── Store identity for persistent sessions ──────
                    localStorage.setItem('prvs_user_identity', JSON.stringify({
                        email:   window.currentUser.email,
                        name:    window.currentUser.name,
                        savedAt: Date.now(),
                    }));
                    console.log('✅ User identity saved for persistent sessions');

                    // ── Wire Supabase authenticated session ──────────
                    // Exchange Google ID token for a real Supabase session.
                    // This enables proper RLS enforcement and replaces anon key writes.
                    try {
                        // Use Google id_token (JWT) for Supabase signInWithIdToken
                        // id_token comes from google.accounts.id.initialize callback
                        const idTokenToUse = window.googleIdToken || resp.id_token;
                        if (!idTokenToUse) {
                            console.warn('⚠️ No Google id_token available — requesting via prompt...');
                            google.accounts.id.prompt();
                        }
                        const { data: sbData, error: sbError } = await getSB().auth.signInWithIdToken({
                            provider: 'google',
                            token:    idTokenToUse || '',
                            nonce:    localStorage.getItem('prvs_sb_nonce') || undefined,
                        });
                        if (sbError) {
                            console.warn('⚠️ Supabase signInWithIdToken failed (non-fatal):', sbError.message);
                            console.log('Continuing with anon key — RBAC not enforced this session');
                        } else {
                            window.supabaseSession = sbData.session;
                            console.log('✅ Supabase authenticated session created — RBAC active');
                            console.log('Session expires:', new Date(window.supabaseSession.expires_at * 1000).toLocaleString());
                        }
                    } catch (e) {
                        console.warn('⚠️ Supabase auth exchange failed (non-fatal):', e.message);
                    }
                    // ─────────────────────────────────────────────────

                    await loadUserRoles();
                    if (typeof window.updateViewModeDropdown === 'function') window.updateViewModeDropdown();
                }

                if (typeof window.loadDataFromSupabase === 'function') await window.loadDataFromSupabase();
                if (typeof window.loadTimeLogsFromSupabase === 'function') await window.loadTimeLogsFromSupabase();
                if (typeof window.loadAppConfig === 'function') window.loadAppConfig(); // S7 — calendar IDs from Supabase

                window.initialLoadDone = true;
                if (typeof window.startTimeLogsAutoRefresh === 'function') window.startTimeLogsAutoRefresh();
                if (typeof window.loadCustomFieldConfig === 'function') window.loadCustomFieldConfig();
                if (typeof window.loadPartsFromSupabase === 'function') window.loadPartsFromSupabase();
            } else {
                console.log('✅ Token silently refreshed — session continues');
                // Refresh Supabase session on Google token refresh
                if (window.supabaseSession) {
                    const { data } = await getSB().auth.getSession();
                    if (data?.session) {
                        window.supabaseSession = data.session;
                        console.log('✅ Supabase session refreshed');
                    }
                }
            }
        },
    });
    window.gisInited = true;
    console.log('gis initialized successfully');
}

// ─────────────────────────────────────────────────────────────────────
// Window bridge — expose all exports on window so inline onclick handlers
// and CDN script onload= attributes can still find them. When Phase 4.5
// deletes the inline copies, these assignments take over runtime ownership
// for ALL 19 functions in Groups A + B + C + D.
//
// Note: with the Group D additions, ALL 18 originally-inline auth functions
// are now also exported from this module. Phase 4.5 (delete-inline cleanup)
// can run any time after a full regression matrix proves the module copies
// are equivalent to the inline copies in every runtime path.
// ─────────────────────────────────────────────────────────────────────

Object.assign(window, {
    // Group A
    isAdmin,
    hasRole,
    canSeeWorkList,
    isSrManagerOrAdmin,
    canManageSilo,
    // Group B
    saveToken,
    clearToken,
    setupTokenRefresh,
    gapiLoaded,
    initializeGapiClient,
    // Group C (Phase 4B-C)
    getSB,
    loadUserRoles,
    upsertUser,
    initSupabaseAuthListener,
    updateAuthStatus,
    handleAuthClick,
    // Group D (Phase 4B-D)
    getUserInfo,
    loadSavedToken,
    gisLoaded,
});
