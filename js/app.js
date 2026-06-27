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

console.log('[PRVS] Module system loaded — v1.466 [ER a7d1474e S127]: Urgent Updates tile field (Lynn) — NEW repair_orders.urgent_update; New/Edit RO "🚨 Urgent Update" textarea renders an always-visible red banner at the top of the card (compact view shows a 🚨 marker); any staff can set it; setting/changing it notifies the silo manager(s)+admins via scheduled_notifications source urgent_update_notify (15-min cron) + an RO note; ro-crud create/update + openEditRO + edit audit; normalizeRO utils+inline; CSS .urgent-update-banner. Prior v1.465 [ER S127]: (1) b06a285f (Lynn) key-date hover panel beside the customer name lists drop-off/promised/pickup in full (render.js inline indicator + css/dashboard.css .kd-name-cal/.kd-pop). (2) a5ff3e2d (Lynn) NEW "Warranty + Repair" RO type — warranty claim WITH billable repair; setROType warranty_repair reuses Warranty Details but no $0/Critical force; 🔄🔧 badge + compact chip + board filter; ro-crud openEditRO restore; ro_type=warranty_repair, no migration. Pairs with time-off.html v1.5 (88395acc exact partial-day absence window). Prior v1.464 [ER e27311bf S125]: WO task drag-and-drop reorder — each task row in the Build/Edit Work Order form gets a grip handle; dragging reorders rows (desktop HTML5 drag + touch), and since DOM order drives sort_order the new order persists on Save WO / Save as Template / Overwrite (work-orders.js _initWOTaskDrag + _renumberWOTaskRows; no DB change). Prior v1.463 [ER 3f415c88 S125]: Recurring reminders — the Schedule Notification modal gains Repeat (none/daily/weekly) + a "Repeat until" date; on save the reminder expands into one cancellable scheduled_notifications row per occurrence (cap 60) through the until date, fired by the same process-scheduled-notifications cron (no DB/edge change, source stays manual). Prior v1.462 [ER BUGFIX S125]: Shop Operations tiles pinned + searchable (ER 80390f36, Lynn) — render.js renderBoard sorts roType==="shop" ROs to the top of the board (then by priority), and adds a "shop operations shop" token to the search haystack so shop ROs are reliably found regardless of customerName text; additive UI, no DB change. Prior v1.461 [S124]: NEW admin-only "📥 Leads" header button -> opens leads.html (WooSender lead review queue), gated by isAdmin() like the Wishes/Recently-Deleted buttons; additive UI, no DB change (pairs with leads.html v1.2 staff-notify clone). Prior v1.460 [ER S120]: (1) 9b823d25 — adding a new service silo to an RO emails that silo manager (work-orders.js addServiceToRO -> scheduled_notifications source service_added_notify; needs migration service_added_notify_source.sql). (2) 0b2e128c — clock-out work notes copied into the RO update timeline (checkin.html v1.38). (3) dac9fdda — NEW "Off Lot - Returning" RO status (status select + card dropdowns + filter + STATUS_PROGRESS_MAP + ES + statusColorMap; excluded from on-lot count). (4) fd6c122d — Manager Work List drag-drop now works on touch devices (work-list.js touch handlers + shared _reorderWorkList). Prior v1.459 [S119]: (1) ER completion notification email — Done flips email the requester what-was-done + how-to-test (NEW completion_notes/test_steps/completion_emailed_at + trg_notify_er_completion -> send-er-completion edge fn; render.js textareas + enhancement.js saveERDetails/updateERStatus). (2) Key Dates P2 — promised/pickup create/update/delete all-day silo calendar events, auto-on-save when a Google token is present, idempotent via repair_orders.cal_event_ids (scheduling.js syncKeyDateCalendars, hooked in ro-crud.js; normalizeRO map). (3) Key Dates P3 — promised/pickup day-before + morning-of email reminders to silo manager(s) + admins via scheduled_notifications, superseded on change/clear (ro-crud.js _syncOneKeyDateReminder). Prior v1.458 [ER BUGFIX S118]: Keys + Power RO fields (ERs 34fc03c2 + b87eb2fb) — key_status / keypad_code / keep_plugged_in columns; Keys select + Keypad code + Keep-plugged-in checkbox on New + Edit RO; keys/power chip row on cards (render.js); persist in ro-crud create/update + openEditRO populate + edit form-data gather + audit labels; normalizeRO map (utils.js + inline). Prior v1.457 [Key Dates P1 S117]: pickup_date field + Pickup/Completed inputs (New RO + Edit RO), Edit RO regains the Planned Drop Off input (was nulling planned_dropoff_date on save), colored Key Dates chip row on cards (Drop/Promised/Pickup; ro-crud.js + render.js + utils.js). Prior v1.456 [ER S117]: Manage Parts modal shows a Ticket Totals bar (parts wholesale + freight + total cost + retail; parts.js openPartsModal, ER a8e90a7d). Prior v1.455 [ER S117]: ER admin board defaults to "Open (active)" — hides done+declined (archived) ERs (enhancement.js openERAdminView/loadERAdminData "open" sentinel + index.html filter option); All Statuses still shows everything; in-progress stays visible. Prior v1.454 [ER S117]: render.js no longer counts "Scheduled" units as on-lot (Total RVs "N on lot" sub-line + days-on-lot stats; future drop-off, not physically here yet, ER 9b046808); photos.js lightbox supports Left/Right arrow navigation + Escape-to-close (ER 74a33621). Prior v1.453 [ER BUGFIX S114]: photos.js attaches the upload <input> to the DOM before click (iOS Safari was dropping the change event -> silent no-upload, ER 2c3d5633); Total RVs tile shows a distinct "N on lot" sub-line (ER cdd77a8b). Prior v1.452 Employee Guide deep-links (S113): header Guide button + ⓘ helpers on the WO build form (guide.html#build-wo) and the part Service Silo label (guide.html#part-silo). Prior v1.451 WO Estimated Hours field (S109): basic-WO fallback estimated_hours on service_work_orders + WO modal input; effective estimate = task est_hours rollup when present, else WO-level (no double-count). Prior v1.450 Removed dead parts_status=outstanding render alias (S106: 4 render.js + 3 parts.js fallbacks; CHECK-forbidden + 0 live rows since v1.449 Phase 2; no DB/behavior change). Prior v1.447 [ER BUGFIX S94] currency inputs show 2 decimals (n33) + checkin Return-to-Dashboard button (n22). Prior v1.446 Parts Requested->Ordered state machine (S93: parts.js state machine [submitPartsRequest->requested, setPartsStatus +requested/+ordered, modal buttons + manager gate] + render.js chips/filters + css/dashboard.css chip styles; outstanding->ordered rename w/ legacy fallback; orphaned markPartsOrdered/_doMarkPartsOrdered deleted from index.html; send-parts-report split Needs Ordering vs On Order). Prior v1.445 Kenect + Slack teardown (S92: dead Kenect UI/JS + notifySlack call sites removed from render.js/ro-crud.js/parts.js + inline). Prior v1.444 Phase 19 CSS extraction (embedded style block -> css/dashboard.css, verbatim). Prior v1.443 DELETE-INLINE cleanup Phases 13/14/15/17/18 (config.js + utils.js + state.js + auth.js + i18n.js + render.js + ro-crud.js + parts.js + work-orders.js + photos.js + time-tracking.js + scheduling.js + qr.js + work-list.js + insurance.js + duplicates.js + enhancement.js). The 40 inline twins of qr.js (3) + work-list.js (13) + insurance.js (8) + duplicates.js (5) + enhancement.js (11) are now DELETED from index.html — modules are SOLE owners via this window bridge (each verified byte-identical before deletion; greppable [PHASE N DELETED v1.443 S91] markers remain). Phases 6-12 inline twins remain DELETED (73 fns, v1.437). Remaining: Phase 19 final ESM/CSS cleanup. Dependencies still resolve via the shared global environment.');
