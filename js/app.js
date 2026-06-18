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
import * as WorkOrders from './work-orders.js';
import * as Photos from './photos.js';
import * as TimeTracking from './time-tracking.js';
import * as Scheduling from './scheduling.js';
import * as QR from './qr.js';
import * as WorkList from './work-list.js';
import * as Insurance from './insurance.js';
import * as Duplicates from './duplicates.js';
import * as Enhancement from './enhancement.js';

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
window.PRVS_WorkOrders = WorkOrders;
window.PRVS_Photos = Photos;
window.PRVS_TimeTracking = TimeTracking;
window.PRVS_Scheduling = Scheduling;
window.PRVS_QR  = QR;
window.PRVS_WorkList = WorkList;
window.PRVS_Insurance = Insurance;
window.PRVS_Duplicates = Duplicates;
window.PRVS_Enhancement = Enhancement;

console.log('[PRVS] Module system loaded — v1.454 [ER S117]: render.js no longer counts "Scheduled" units as on-lot (Total RVs "N on lot" sub-line + days-on-lot stats; future drop-off, not physically here yet, ER 9b046808); photos.js lightbox supports Left/Right arrow navigation + Escape-to-close (ER 74a33621). Prior v1.453 [ER BUGFIX S114]: photos.js attaches the upload <input> to the DOM before click (iOS Safari was dropping the change event -> silent no-upload, ER 2c3d5633); Total RVs tile shows a distinct "N on lot" sub-line (ER cdd77a8b). Prior v1.452 Employee Guide deep-links (S113): header Guide button + ⓘ helpers on the WO build form (guide.html#build-wo) and the part Service Silo label (guide.html#part-silo). Prior v1.451 WO Estimated Hours field (S109): basic-WO fallback estimated_hours on service_work_orders + WO modal input; effective estimate = task est_hours rollup when present, else WO-level (no double-count). Prior v1.450 Removed dead parts_status=outstanding render alias (S106: 4 render.js + 3 parts.js fallbacks; CHECK-forbidden + 0 live rows since v1.449 Phase 2; no DB/behavior change). Prior v1.447 [ER BUGFIX S94] currency inputs show 2 decimals (n33) + checkin Return-to-Dashboard button (n22). Prior v1.446 Parts Requested->Ordered state machine (S93: parts.js state machine [submitPartsRequest->requested, setPartsStatus +requested/+ordered, modal buttons + manager gate] + render.js chips/filters + css/dashboard.css chip styles; outstanding->ordered rename w/ legacy fallback; orphaned markPartsOrdered/_doMarkPartsOrdered deleted from index.html; send-parts-report split Needs Ordering vs On Order). Prior v1.445 Kenect + Slack teardown (S92: dead Kenect UI/JS + notifySlack call sites removed from render.js/ro-crud.js/parts.js + inline). Prior v1.444 Phase 19 CSS extraction (embedded style block -> css/dashboard.css, verbatim). Prior v1.443 DELETE-INLINE cleanup Phases 13/14/15/17/18 (config.js + utils.js + state.js + auth.js + i18n.js + render.js + ro-crud.js + parts.js + work-orders.js + photos.js + time-tracking.js + scheduling.js + qr.js + work-list.js + insurance.js + duplicates.js + enhancement.js). The 40 inline twins of qr.js (3) + work-list.js (13) + insurance.js (8) + duplicates.js (5) + enhancement.js (11) are now DELETED from index.html — modules are SOLE owners via this window bridge (each verified byte-identical before deletion; greppable [PHASE N DELETED v1.443 S91] markers remain). Phases 6-12 inline twins remain DELETED (73 fns, v1.437). Remaining: Phase 19 final ESM/CSS cleanup. Dependencies still resolve via the shared global environment.');
