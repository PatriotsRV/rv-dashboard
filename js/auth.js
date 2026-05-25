// js/auth.js — Authentication & Session Management module
// ─────────────────────────────────────────────────────────────────────
// PHASE 4A (Session 76, 2026-05-25) — Groups A + B extracted (10 of 18
// auth functions). Pure-additive: inline copies in index.html still own
// runtime. This module re-implements the same logic against window-attached
// state so it can be invoked independently for DevTools verification and
// future Phase 4B/4.5 ownership transfer.
//
// Functions exported in this phase:
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
// DEFERRED to Phase 4B (next session):
//   getSB, initSupabaseAuthListener, loadSavedToken, getUserInfo,
//   loadUserRoles, upsertUser, gisLoaded, handleAuthClick, updateAuthStatus
//
// These are the session-restore + One Tap + signInWithIdToken paths
// where the Lynn-silent-demote bugs (v1.416, v1.417) lived. They warrant
// their own focused regression session.
//
// State references:
//   - Reads window.userRoles, window.accessToken, window.currentUser,
//     window.tokenClient, window._currentStaffSilo, window._currentStaffRole
//     (all auto-attached via `var` at top-level of inline script in index.html)
//   - Writes window.gapiInited, window.accessToken, window.currentUser
//
// Imports from config.js:
//   - GOOGLE_CONFIG (API_KEY + DISCOVERY_DOCS for gapi.client.init)
// ─────────────────────────────────────────────────────────────────────

import { GOOGLE_CONFIG } from './config.js';

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
// Window bridge — expose all exports on window so inline onclick handlers
// and CDN script onload= attributes can still find them. When Phase 4.5
// deletes the inline copies, these assignments take over runtime ownership
// for the 10 functions in Groups A + B.
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
});
