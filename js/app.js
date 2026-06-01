// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 4B-D (config.js + utils.js + state.js + auth.js [Groups A+B+C+D]
// + i18n.js populated). Inline <script> in index.html still owns runtime
// behavior; this entry point only loads the modules so future code can
// import from them without disturbing prod. With Phase 4B-D, all 18
// originally-inline auth functions are now also exported from auth.js —
// Phase 4.5 (delete-inline cleanup) can run any time after a full
// regression matrix.
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
//
// Phase 4B-D scope notes (Session 77, 2026-05-25):
//   - auth.js gains Group D — getUserInfo, loadSavedToken, gisLoaded. The
//     3 large Lynn-fix-surface functions (session restore + One Tap +
//     signInWithIdToken). v1.417 fixes preserved verbatim in module
//     versions: skip-if-supabaseSession in id callback + post-One-Tap
//     role refresh + One Tap prompt skip-if-supabaseSession.
//   - All 18 originally-inline auth functions now also live in auth.js
//     as real ES module exports. Inline copies still own runtime;
//     window bridge ensures the module exports overwrite the inline
//     auto-globalized versions in a behaviorally identical way.

import * as Config from './config.js';
import * as Utils from './utils.js';
import * as State from './state.js';
import * as Auth from './auth.js';
import * as I18n from './i18n.js';
import * as Render from './render.js';
import * as RoCrud from './ro-crud.js';
import * as Parts from './parts.js';

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
window.PRVS_Render = Render;
window.PRVS_RoCrud = RoCrud;
window.PRVS_Parts  = Parts;

console.log('[PRVS] Module system loaded — Phase 8 v1.432 (config.js + utils.js + state.js + auth.js + i18n.js + render.js + ro-crud.js + parts.js [17 live fns: loadPartsFromSupabase, openPartsModal, showAddPartForm, savePartForm, editPartRow, deletePartRow, markPartReceived, appendPartToSupabase, updatePartInSupabase, deletePartFromSupabase, openPartsRequestModal, submitPartsRequest, openPartsStatusModal, setPartsStatus, notifyPartsRequester, notifyPartsEtaUpdate, renderPartsPhotoPreview — ADDITIVE: inline copies still present, module bridge re-points window.* to byte-identical copies; markPartsOrdered left inline for the upcoming Requested/Ordered feature])');
