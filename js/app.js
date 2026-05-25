// js/app.js — PRVS Dashboard module entry point
// Modules are added phase-by-phase per docs/specs/MODULARIZATION_ROADMAP.md.
//
// Current phase: 2 (config.js + utils.js populated). Inline <script> in
// index.html still owns runtime behavior; this entry point only loads the
// modules so future code can import from them without disturbing prod.

import * as Config from './config.js';
import * as Utils from './utils.js';

// Expose the namespaces on window so they can be inspected from DevTools
// while we verify each phase in production. These are the migration shims,
// not the long-term API — modules should `import { FOO } from './config.js'`
// or `import { escapeHtml } from './utils.js'` directly.
window.PRVS_Config = Config;
window.PRVS_Utils  = Utils;

console.log('[PRVS] Module system loaded — Phase 2 (config.js + utils.js)');
