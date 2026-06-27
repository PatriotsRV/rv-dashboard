// js/utils.js — PRVS Dashboard pure utility functions
// Phase 2 of MODULARIZATION_ROADMAP.md — 2026-05-25 (Session 75)
//
// Stateless input→output helpers. Zero imports from other modules.
// Zero side effects (with the documented exception of the window-bridge
// `Object.assign(window, ...)` at the bottom — forward-looking shim for
// Phase 19 cleanup when inline copies are deleted).
//
// The inline <script> block in index.html still declares each of these —
// that is intentional (Phase 2 is purely additive). The duplicates will be
// removed once every caller has been migrated to import from this module
// (Phase 19 cleanup). DO NOT delete the index.html copies yet.
//
// Spec deltas from MODULARIZATION_ROADMAP.md (Roland-approved 2026-05-25):
//   - Added getPriorityLevel (pure, pairs with calculatePriority).
//   - Added loadAllDriveImages (pure no-op compat stub, pairs with
//     driveImgUrl / loadDriveImage).
//   - Pulled in DEBUG flag + log() + warn() — Phase 1 deferred them here
//     because the inline log()/warn() bodies reference DEBUG and the three
//     are conceptually a unit.
//   - Spec said utils would import STATUS_PROGRESS_MAP from config.js;
//     verified false against current code — calculatePriority uses a local
//     `urgencyMap`, not STATUS_PROGRESS_MAP. Utils.js has zero imports.
//   - parseCSV / toCamelCase deferred (not pure — parseCSV mutates the
//     global currentData and calls renderBoard). Plus probably dead code
//     since the app loads from Supabase, not CSV.
//   - shouldShow deferred (reads tileVisibility global — Phase 3 state).
//   - getBaseROId / findDuplicateGroups deferred to Phase 17 duplicates.js.

// ── DEBUG / logging (deferred from Phase 1) ─────────────────────────
// Set DEBUG=true locally for verbose logging; false in production.
// Never commit with DEBUG=true.
export const DEBUG = false;
/** log() — gated console.log. Use instead of console.log throughout. */
export function log(...args) { if (DEBUG) console.log(...args); }
/** warn() — gated console.warn. */
export function warn(...args) { if (DEBUG) console.warn(...args); }

// ── String / URL utilities ──────────────────────────────────────────

export function isVideoUrl(url) {
    return /\.(mp4|mov|avi|mkv|webm|m4v|3gp)(\?|$)/i.test(url || '');
}

/**
 * escapeHtml — sanitizes a string for safe insertion into innerHTML.
 * Converts the five HTML-special characters to their entity equivalents.
 * Use on every database field rendered into template literals.
 * @param {any} unsafe — raw value (will be coerced to string)
 * @returns {string}
 */
export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Drive thumbnail URLs (sz=w200, sz=w400) load fine directly as <img src> tags.
// fetch() is blocked by CORS on the thumbnail endpoint, so we just return the URL as-is.
// Only use the Drive API (alt=media) for non-thumbnail full file downloads if ever needed.

// Convert Google Drive thumbnail URL to direct open URL (works without auth)
export function driveImgUrl(url) {
    if (!url) return url;
    // Already a thumbnail URL: extract file ID and use uc?export=view format
    const match = url.match(/[?&]id=([^&]+)/);
    if (match) {
        return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
    // Handle /file/d/FILE_ID/view format
    const match2 = url.match(/\/file\/d\/([^/]+)/);
    if (match2) {
        return `https://drive.google.com/uc?export=view&id=${match2[1]}`;
    }
    return url;
}

export function loadDriveImage(url) {
    // Thumbnails load natively in <img> tags — no fetch needed
    return Promise.resolve(url);
}

// Apply Drive thumbnail URLs directly to img tags — no fetch, no CORS issues
export function loadAllDriveImages() {
    // Thumbnail URLs already set as img src — browser loads them natively.
    // Nothing to do here; this function is kept for compatibility.
}

// ── Phone normalisation ─────────────────────────────────────────────

export function normalisePhone(raw) {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits.length >= 7 ? digits : null;
}

// ── Date / priority math ────────────────────────────────────────────

// calculateDaysOnLot: pass full RO object for smart logic, or a date string for legacy use
export function calculateDaysOnLot(roOrDate) {
    if (!roOrDate) return 0;
    // If passed a full RO object
    if (typeof roOrDate === 'object') {
        const ro = roOrDate;
        // RV is Not On Lot with no arrival date — don't count days
        if (ro.status === 'Not On Lot' && !ro.dateArrived) return null;
        // Use dateArrived if set, otherwise fall back to dateReceived
        const startDate = ro.dateArrived || ro.dateReceived;
        if (!startDate) return 0;
        const start = new Date(startDate);
        const today = new Date();
        return Math.floor(Math.abs(today - start) / (1000 * 60 * 60 * 24));
    }
    // Legacy: raw date string
    const received = new Date(roOrDate);
    const today = new Date();
    return Math.floor(Math.abs(today - received) / (1000 * 60 * 60 * 24));
}

export function calculatePriority(ro) {
    let score = 0;

    // Days waiting (primary factor) - 10 points per day
    const daysOnLot = calculateDaysOnLot(ro) || 0;
    score += daysOnLot * 10;

    // Urgency (secondary factor)
    const urgencyMap = {
        'Critical': 100,
        'High': 70,
        'Medium': 40,
        'Low': 10
    };
    score += urgencyMap[ro.urgency] || 0;

    // Promised date (tertiary factor) - days until promise
    if (ro.promisedDate) {
        const promised = new Date(ro.promisedDate);
        const now = new Date();
        const daysUntil = Math.floor((promised - now) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0) score += 200; // Overdue
        else if (daysUntil < 3) score += 50; // Very soon
        else if (daysUntil < 7) score += 20; // Coming up
    }

    // Customer type (quaternary factor)
    if (ro.customerType === 'VIP') score += 15;

    return score;
}

export function getPriorityLevel(score) {
    if (score >= 250) return 'urgent';
    if (score >= 150) return 'high';
    if (score >= 80) return 'medium';
    return 'low';
}

export function getDaysHeatColor(days) {
    if (days <= 30) return 'var(--text-primary)'; // Default
    if (days <= 40) return '#FF8C00'; // Orange
    if (days <= 50) return '#FF4500'; // Orange-red
    if (days <= 60) return '#FF1744'; // Red-pink
    return '#FF1493'; // Neon pink (hottest)
}

// ── Time formatting ─────────────────────────────────────────────────

export function formatHours(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        return `${mins}m`;
    }
    const hours = (seconds / 3600).toFixed(1);
    return `${hours}h`;
}

// ── RO ID generation (deterministic hash + collision candidates) ────

// Generate a deterministic PRVS-XXXX-XXXX ID from customerName + rv + dateReceived
export function generateROId(customerName, rv, dateReceived) {
    const raw = `${customerName}|${rv}|${dateReceived}`.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0; // Convert to 32-bit int
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `PRVS-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

// Builds the ordered list of ro_id candidates to try on insert:
// base → base-2 → base-3 … base-9 → base-XXXX (timestamp fallback)
// appendToSupabase uses these in an optimistic-insert loop — no pre-SELECT needed,
// so concurrent submits can no longer race past a check-then-insert window.
export function generateROIdCandidates(customerName, rv, dateStr) {
    const base = generateROId(customerName, rv, dateStr);
    const suffixed = Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`);
    const fallback = `${base}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    return [base, ...suffixed, fallback];
}

// ── DB row → RO object mapper ───────────────────────────────────────
// Maps 26 snake_case Supabase columns → camelCase RO properties used
// throughout the inline script. Called from loadDataFromSupabase.

export function rowToRO(row) {
    if (!row) return null;
    return {
        roId:                     row.ro_id || '',
        customerName:             row.customer_name || '',
        customerPhone:            row.phone || '',
        customerEmail:            row.email || '',
        customerAddress:          row.address || '',
        rv:                       row.rv || '',
        vin:                      row.vin || '',
        rvPhotoUrl:               row.photo_url || '',
        repairType:               row.repair_type || '',
        repairDescription:        row.description || '',
        technicianAssigned:       row.technician || '',
        dateReceived:             row.date_received || '',
        dateArrived:              row.date_arrived || '',
        promisedDate:             row.promised_date || '',
        percentComplete:          row.pct_complete || 0,
        dollarValue:              row.dollar_value || 0,
        parkingSpot:              row.parking_spot || '',
        status:                   row.status || 'Not On Lot',
        urgency:                  row.urgency || '',
        customerType:             row.customer_type || '',
        roType:                   row.ro_type || 'standard',
        photoLibrary:             row.photo_library ? JSON.stringify(row.photo_library) : '',
        insuranceData:            row.insurance_data ? JSON.stringify(row.insurance_data) : '',
        roStatusNotes:            row._ro_notes || '',
        customerCommunicationNotes: row._comm_notes || '',
        partsJson:                row._parts_json || '',
        hasOpenPartsRequest:      !!row.has_open_parts_request,
        partsStatus:              row.parts_status || null,
        requestedByEmail:         row.requested_by_email || null,
        isTraining:               !!row.is_training,
        plannedDropoffDate:       row.planned_dropoff_date || null,
        pickupDate:               row.pickup_date || null,  // [Key Dates P1 S117] ER d2561e11
        calEventIds:              row.cal_event_ids || null, // [Key Dates P2 S119] silo calendar event IDs per key date
        keyStatus:                row.key_status || null,   // [ER BUGFIX v1.458 S118] keys/power (ERs 34fc03c2 + b87eb2fb)
        keypadCode:               row.keypad_code || null,  // [ER BUGFIX v1.458 S118]
        keepPluggedIn:            !!row.keep_plugged_in,    // [ER BUGFIX v1.458 S118]
        urgentUpdate:             row.urgent_update || null, // [ER a7d1474e v1.466 S127] always-visible urgent-update banner
        _woSummary:               row._wo_summary || null,  // v1.414 Phase A1+A2
        _supabaseId:              row.id,  // keep uuid for updates
    };
}

// ── Window bridge ───────────────────────────────────────────────────
// Forward-looking shim for Phase 19 cleanup. Several utils are called
// from inline `onclick="..."` attributes inside card template literals;
// those attributes resolve at the global scope. The inline declarations
// in index.html auto-globalize because <script> top-level declarations
// land on window in non-strict mode — so this assignment is a no-op
// today (inline duplicates already on window). It becomes load-bearing
// when the inline copies are removed in Phase 19.
//
// log/warn included so post-cleanup, any module not yet importing them
// directly still finds them on window.
Object.assign(window, {
    escapeHtml,
    isVideoUrl,
    calculateDaysOnLot,
    getDaysHeatColor,
    formatHours,
    log,
    warn,
});
