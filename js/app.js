// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 4B-C (config.js + utils.js + state.js + auth.js [Groups A+B+C]
// + i18n.js populated). Inline <script> in index.html still owns runtime
// behavior; this entry point only loads the modules so future code can
// import from them without disturbing prod.
//
// Phase 4A scope notes:
//   - auth.js exports 10 of the 18 auth functions (Groups A + B).
//
// Phase 5 scope notes:
//   - i18n.js exports all 5 translation functions (getLang, setLang, t,
//     translateStaticUI, setupI18n). Pure additive; localStorage IS the
//     state, so no state.js dependency was needed.
//
// Phase 4B-C scope notes (Session 77, 2026-05-25):
//   - auth.js gains Group C — 6 more Supabase-plumbing functions: getSB,
//     loadUserRoles, upsertUser, initSupabaseAuthListener, updateAuthStatus,
//     handleAuthClick. Lynn-fix code surface (v1.416 in loadUserRoles)
//     preserved verbatim.
//   - config.js gains SB_AUTH_OPTIONS (moved from inline).
//   - index.html: `let _sb` → `var _sb` so module and inline share the
//     same cached Supabase client via window._sb.
//   - 3 Group-D functions (getUserInfo, loadSavedToken, gisLoaded) deferred
//     to Phase 4B-D in this same session's next commit.

import * as Config from './config.js';
import * as Utils from './utils.js';
import * as State from './state.js';
import * as Auth from './auth.js';
import * as I18n from './i18n.js';

// Expose the namespaces on window so they can be inspected from DevTools
// while we verify each phase in production. These are the migration shims,
// not the long-term API — modules should `import { FOO } from './config.js'`
// or `import { escapeHtml } from './utils.js'` or `import { state } from
// './state.js'` or `import { isAdmin } from './auth.js'` or `import { t }
// from './i18n.js'` directly.
window.PRVS_Config = Config;
window.PRVS_Utils  = Utils;
window.PRVS_State  = State;
window.PRVS_Auth   = Auth;
window.PRVS_I18n   = I18n;

console.log('[PRVS] Module system loaded — Phase 4B-C (config.js + utils.js + state.js + auth.js [Groups A+B+C] + i18n.js)');
