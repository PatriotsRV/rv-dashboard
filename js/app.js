// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 3 (config.js + utils.js + state.js populated). Inline
// <script> in index.html still owns runtime behavior; this entry point
// only loads the modules so future code can import from them without
// disturbing prod. State.js follows Path B from the Phase 3 plan: schema
// + defaults + snapshot helper for window-resident globals, NO inline
// declaration changes (yet).

import * as Config from './config.js';
import * as Utils from './utils.js';
import * as State from './state.js';

// Expose the namespaces on window so they can be inspected from DevTools
// while we verify each phase in production. These are the migration shims,
// not the long-term API — modules should `import { FOO } from './config.js'`
// or `import { escapeHtml } from './utils.js'` or `import { state } from
// './state.js'` directly.
window.PRVS_Config = Config;
window.PRVS_Utils  = Utils;
window.PRVS_State  = State;

console.log('[PRVS] Module system loaded — Phase 3 (config.js + utils.js + state.js)');
