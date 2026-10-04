// js/session-gate.js  v1.0  (Session 195, 2026-10-04)  -- NOT YET WIRED
// Provose Phase 0: one tiny gate every page calls instead of rendering its own
// Google sign-in. If there is no Supabase session, send the person to
// login.html and bring them back here afterwards.
//
// Usage (classic <script>, after supabase-js and the page's createClient):
//     <script src="js/session-gate.js"></script>
//     const session = await PRVS.requireSession(_sb);   // null => redirect already issued
//
// Usage (ES module pages, e.g. index.html via js/auth.js): side-effect import,
// then use the global - the file stays a classic script so BOTH kinds of page load it:
//     import './session-gate.js';   const session = await window.PRVS.requireSession(getSB());
//
// RULE: the page's Supabase client MUST use storageKey 'prvs_supabase_auth'
// (js/config.js SB_AUTH_OPTIONS). login.html persists the session under that
// key; a page with its own key will never see it and will loop to login.
(function (global) {
    const LOGIN_PAGE = 'login.html';

    function currentPath() {
        // relative path + query + hash of THIS page, safe to hand to ?next=
        const p = location.pathname.split('/').pop() || 'home.html';
        return p + location.search + location.hash;
    }

    async function requireSession(sb, opts) {
        opts = opts || {};
        if (!sb || !sb.auth) throw new Error('requireSession: supabase client required');
        let session = null;
        try { session = (await sb.auth.getSession()).data?.session || null; } catch (_) { session = null; }
        if (session) return session;
        if (opts.noRedirect) return null;
        const next = encodeURIComponent(opts.next || currentPath());
        location.replace(LOGIN_PAGE + '?next=' + next);
        return null;
    }

    async function signOutEverywhere(sb) {
        try { await sb.auth.signOut(); } catch (_) {}
        try { localStorage.removeItem('prvs_supabase_auth'); } catch (_) {}
        location.replace(LOGIN_PAGE);
    }

    const api = { requireSession, signOutEverywhere, LOGIN_PAGE };
    global.PRVS = Object.assign(global.PRVS || {}, api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
