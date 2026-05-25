// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 4A (config.js + utils.js + state.js + auth.js [Groups A+B]
// populated). Inline <script> in index.html still owns runtime behavior; this
// entry point only loads the modules so future code can import from them
// without disturbing prod.
//
// Phase 4A scope notes:
//   - auth.js exports 10 of the 18 auth functions (Groups A + B).
//   - Groups C + D (session restore, One Tap, Supabase signInWithIdToken)
//     deferred to Phase 4B per session-76 risk-stratification decision —
//     they contain the Lynn-fix code paths (v1.416/v1.417) and deserve a
//     dedicated regression session.

import * as Config from './config.js';
import * as Utils from './utils.js';
import * as State from './state.js';
import * as Auth from './auth.js';

// Expose the namespaces on window so they can be inspected from DevTools
// while we verify each phase in production. These are the migration shims,
// not the long-term API — modules should `import { FOO } from './config.js'`
// or `import { escapeHtml } from './utils.js'` or `import { state } from
// './state.js'` or `import { isAdmin } from './auth.js'` directly.
window.PRVS_Config = Config;
window.PRVS_Utils  = Utils;
window.PRVS_State  = State;
window.PRVS_Auth   = Auth;

console.log('[PRVS] Module system loaded — Phase 4A (config.js + utils.js + state.js + auth.js [Groups A+B])');
