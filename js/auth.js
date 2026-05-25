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
// DEFERRED to Phase 4B-D (this session, next commit):
//   getUserInfo, loadSavedToken, gisLoaded
//
// These three are the session-restore + One Tap + signInWithIdToken paths
// where the Lynn-silent-demote bugs (v1.416, v1.417) lived. Larger surface
// area → own commit so any regression at DevTools verify is bisectable.
//
// State references:
//   - Reads window.userRoles, window.accessToken, window.currentUser,
//     window.tokenClient, window._currentStaffSilo, window._currentStaffRole,
//     window.supabaseSession, window._sb, window.gapiInited, window.gisInited
//   - Writes window.gapiInited, window.accessToken, window.currentUser,
//     window.userRoles, window._sb, window.supabaseSession,
//     window._currentStaffSilo, window._currentStaffRole, window.currentData
//
// Imports from config.js:
//   - GOOGLE_CONFIG (API_KEY + DISCOVERY_DOCS for gapi.client.init)
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
// Window bridge — expose all exports on window so inline onclick handlers
// and CDN script onload= attributes can still find them. When Phase 4.5
// deletes the inline copies, these assignments take over runtime ownership
// for the 16 functions in Groups A + B + C.
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
});
