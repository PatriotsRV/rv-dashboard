// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 1 (config.js populated). Inline <script> in index.html
// still owns runtime behavior; this entry point only loads constants so
// future modules can import from `./config.js` without disturbing prod.

import * as Config from './config.js';

// Expose the namespace on window so it can be inspected from DevTools
// while we verify Phase 1 in production. This is the migration shim,
// not the long-term API — modules should `import { FOO } from './config.js'`.
window.PRVS_Config = Config;

console.log('[PRVS] Module system loaded — Phase 1 (config.js)');
