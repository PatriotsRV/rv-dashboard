// ═══════════════════════════════════════════════════════════════════════
// js/planner.js — 🗓 WORK PLANNER  (v1.504, Session 188, 2026-09-05)
// ───────────────────────────────────────────────────────────────────────
// Manager-facing dynamic RO report + daily/weekly work-list builder that
// lives ON index.html (full-screen overlay, #plannerOverlay).
//
// Mindset: a Sr Shop Manager / Director deciding what gets worked. The
// board already knows everything about every RO — this view slices it by
// service silo (including ROs that SPAN silos), promised date, urgency,
// status, days on lot, dollar value, parts state, WO progress … then lets
// the manager:
//   • sort by any column, or switch to MANUAL order and drag rows (mouse + touch)
//   • bucket each RO into TODAY / THIS WEEK / LATER / HOLD  (the "work list")
//   • jot a one-line planner note per RO
//   • SAVE the whole thing as a named view (planner_views table), SHARE it
//     (link + shared flag), reload it, Save As a copy
//   • push the TODAY bucket onto the existing Manager Work List
//   • export CSV / print
//
// Data source: the already-loaded `currentData` (no extra round trip).
// Silo membership of an RO = union of its service_work_orders silos
// (_woSummary.silos) and its repairType text (REPAIR_TYPE_TO_SILO).
//
// Wiring: module namespace on window.PRVS_Planner (js/app.js) + the
// Object.assign(window, {...}) bridge at the bottom so inline onclick=
// handlers resolve. Reads inline globals (currentData, getSB,
// supabaseSession, SERVICE_SILOS, REPAIR_TYPE_TO_SILO, _staffCache,
// scrollToROInBoard, showToast, escapeHtml, calculateDaysOnLot,
// calculatePriority, isTerminalStatus, isAdmin, hasRole, canSeeWorkList,
// _addToWorkListWithSilo) via the shared global environment, exactly like
// js/work-list.js.
//
// Persistence:
//   planner_views (supabase/migrations/planner_views_s188.sql)
//     id uuid · name · owner_email · shared bool · config jsonb · rows jsonb
//   config = { filters, sort, columns, mode }
//   rows   = { [ro_uuid]: { order, bucket, note } }
//   Unsaved working state is mirrored to localStorage prvs_planner_draft.
// ═══════════════════════════════════════════════════════════════════════

// ── Constants ──────────────────────────────────────────────────────────
export const PLANNER_BUCKETS = [
    { key: 'today', label: 'Today',     emoji: '🔥', color: '#ef4444' },
    { key: 'week',  label: 'This Week', emoji: '📅', color: '#f59e0b' },
    { key: 'later', label: 'Later',     emoji: '⏳', color: '#3b82f6' },
    { key: 'hold',  label: 'Hold',      emoji: '⏸', color: '#6b7280' },
];

// Every board status, in pipeline order (mirrors render.js ALL_STATUSES + the
// two scheduling statuses it omits). Kept local on purpose — ALL_STATUSES is
// function-scoped inside updateStats().
export const PLANNER_STATUSES = [
    'Not On Lot', 'Scheduled', 'On Lot', 'Off Lot - Returning',
    'Awaiting Insurance', 'Awaiting Customer', 'Awaiting Extended Warranty',
    'Approved Insurance', 'Approved Customer', 'Approved Extended Warranty',
    'Awaiting parts', 'Ready to Work', 'In progress', 'Repairs Completed',
    'Waiting for QA/QC', 'Ready for pickup',
    'Delivered/Cashed Out', 'Closed - No Charge', 'Delivered - No Review',
];

const STATUS_PRESETS = {
    active:   { label: 'Active (not closed)', pick: s => !_isTerminal(s) },
    workable: { label: 'Workable (Ready/In progress/Approved)', pick: s => /^(Ready to Work|In progress|Approved )/.test(s) },
    waiting:  { label: 'Waiting on someone', pick: s => /^(Awaiting|Waiting)/.test(s) },
    onlot:    { label: 'On lot (physical)', pick: s => !_isTerminal(s) && !/^(Not On Lot|Scheduled|Off Lot)/.test(s) },
    finishing:{ label: 'Finishing (Completed/QA/Pickup)', pick: s => /^(Repairs Completed|Waiting for QA|Ready for pickup)/.test(s) },
    all:      { label: 'All statuses', pick: () => true },
};

const PROMISED_PRESETS = [
    ['any',     'Any promised date'],
    ['overdue', 'Overdue'],
    ['today',   'Due today'],
    ['3d',      'Due within 3 days'],
    ['7d',      'Due within 7 days'],
    ['14d',     'Due within 14 days'],
    ['30d',     'Due within 30 days'],
    ['none',    'No promised date'],
    ['has',     'Has a promised date'],
];

const URGENCIES = ['Critical', 'High', 'Medium', 'Low'];

// Column catalogue. `get` returns the raw sortable value; `cell` returns HTML.
const COLUMNS = [
    { key: 'ro',       label: 'RO',        default: true,  get: r => r.roId },
    { key: 'customer', label: 'Customer',  default: true,  get: r => r.customerName },
    { key: 'rv',       label: 'RV',        default: true,  get: r => r.rv },
    { key: 'silos',    label: 'Services',  default: true,  get: r => _roSilos(r).join(',') },
    { key: 'status',   label: 'Status',    default: true,  get: r => PLANNER_STATUSES.indexOf(r.status) },
    { key: 'urgency',  label: 'Urgency',   default: true,  get: r => ({ Critical: 0, High: 1, Medium: 2, Low: 3 })[r.urgency] ?? 9 },
    { key: 'promised', label: 'Promised',  default: true,  get: r => r.promisedDate || '9999-99-99' },
    { key: 'dropoff',  label: 'Drop-off',  default: false, get: r => r.plannedDropoffDate || '9999-99-99' },
    { key: 'pickup',   label: 'Pickup',    default: false, get: r => r.pickupDate || '9999-99-99' },
    { key: 'days',     label: 'Days',      default: true,  get: r => _daysOnLot(r) ?? -1 },
    { key: 'dollars',  label: '$ Value',   default: true,  get: r => parseFloat(r.dollarValue) || 0 },
    { key: 'wo',       label: 'WO %',      default: true,  get: r => _woPct(r) ?? -1 },
    { key: 'parts',    label: 'Parts',     default: true,  get: r => _partsRank(r) },
    { key: 'tech',     label: 'Tech',      default: false, get: r => r.technicianAssigned || '' },
    { key: 'type',     label: 'Type',      default: false, get: r => r.roType || '' },
    { key: 'spot',     label: 'Spot',      default: false, get: r => r.parkingSpot || '' },
    { key: 'score',    label: 'Score',     default: false, get: r => _score(r) },
    { key: 'bucket',   label: 'Bucket',    default: true,  get: (r, s) => PLANNER_BUCKETS.findIndex(b => b.key === (s?.bucket || '')) },
    { key: 'note',     label: 'Plan note', default: true,  get: (r, s) => s?.note || '' },
];

// ── Module state ───────────────────────────────────────────────────────
let _open = false;
let _view = null;            // { id, name, owner_email, shared } of the loaded saved view (null = unsaved draft)
let _dirty = false;
let _filters = _defaultFilters();
let _sort = { key: 'score', dir: 'desc' };   // key 'manual' = drag order
let _columns = COLUMNS.filter(c => c.default).map(c => c.key);
let _rows = {};              // ro_uuid -> { order, bucket, note }
let _bucketTab = 'all';      // all | today | week | later | hold | unbucketed
let _savedViews = [];        // cache of planner_views rows (id,name,owner_email,shared,updated_at)
let _lastRendered = [];      // ROs in display order (for drag index mapping + export)

function _defaultFilters() {
    return {
        silos: [],            // [] = all silos
        siloMode: 'any',      // any | all | only   (only = RO's silo set ⊆ selection)
        multiSiloOnly: false,
        statusPreset: 'active',
        statuses: [],         // explicit list overrides preset when non-empty
        promised: 'any',
        promisedFrom: '',
        promisedTo: '',
        urgencies: [],
        minDays: '',
        minDollars: '',
        roTypes: [],
        flags: [],            // parts_open | urgent | receivable | no_wo | wo_done | vip | training
        search: '',
        includeShop: false,
    };
}

// ── Small helpers ──────────────────────────────────────────────────────
function _isTerminal(s) {
    try { return typeof isTerminalStatus === 'function' ? isTerminalStatus(s) : /^(Delivered|Closed)/.test(s || ''); }
    catch (_) { return /^(Delivered|Closed)/.test(s || ''); }
}
function _me() { return (window.supabaseSession?.user?.email || '').toLowerCase(); }
function _todayISO() { return new Date().toLocaleDateString('en-CA'); }
function _addDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); }
function _fmtDate(d) {
    if (!d) return '';
    try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (_) { return String(d).slice(0, 10); }
}
function _fmtMoney(n) { n = parseFloat(n) || 0; return n ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'; }
function _esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s); }
function _daysOnLot(r) { try { return calculateDaysOnLot(r); } catch (_) { return null; } }
function _score(r) { try { return calculatePriority(r) || 0; } catch (_) { return 0; } }
function _woPct(r) {
    const s = r._woSummary; if (!s || !s.total_wos) return null;
    if (!s.total_tasks) return s.silos.every(x => x.wo_completed) ? 100 : 0;
    return Math.round((s.completed_tasks / s.total_tasks) * 100);
}
function _partsRank(r) {
    if (r.hasOpenPartsRequest || r.partsStatus === 'requested') return 0;
    if (r.partsStatus === 'ordered') return 1;
    if (r.partsStatus === 'received') return 2;
    return 3;
}
function _partsLabel(r) {
    if (r.hasOpenPartsRequest || r.partsStatus === 'requested') return { t: '🔩 Requested', c: '#f97316' };
    if (r.partsStatus === 'ordered')  return { t: '📦 On order', c: '#eab308' };
    if (r.partsStatus === 'received') return { t: '✅ Received', c: '#22c55e' };
    return { t: '—', c: '#6b7280' };
}
function _siloMeta(key) { return (SERVICE_SILOS || []).find(s => s.key === key) || { key, label: key, emoji: '' }; }

/** Silo keys an RO belongs to: WO silos ∪ repairType-derived silos. */
export function _roSilos(r) {
    const set = new Set();
    (r._woSummary?.silos || []).forEach(x => { if (x.silo) set.add(x.silo); });
    String(r.repairType || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).forEach(t => {
        const k = REPAIR_TYPE_TO_SILO[t]; if (k) set.add(k);
    });
    return Array.from(set);
}

function _mySilo() { return window._currentStaffSilo || null; }
function _canUse() { try { return canSeeWorkList(); } catch (_) { return false; } }
function _canEditView(v) {
    if (!v) return true;
    return (v.owner_email || '').toLowerCase() === _me() || (typeof isAdmin === 'function' && isAdmin());
}

// ── Filtering ──────────────────────────────────────────────────────────
export function _applyFilters(list) {
    const f = _filters;
    const today = _todayISO();
    const horizon = { '3d': _addDaysISO(3), '7d': _addDaysISO(7), '14d': _addDaysISO(14), '30d': _addDaysISO(30) };
    const statusPick = f.statuses.length ? (s => f.statuses.includes(s)) : (STATUS_PRESETS[f.statusPreset] || STATUS_PRESETS.active).pick;
    const q = (f.search || '').trim().toLowerCase();
    return list.filter(r => {
        if (!r || !r._supabaseId) return false;
        if (r.roType === 'shop' && !f.includeShop) return false;
        if (!statusPick(r.status)) return false;
        const silos = _roSilos(r);
        if (f.multiSiloOnly && silos.length < 2) return false;
        if (f.silos.length) {
            if (f.siloMode === 'all') { if (!f.silos.every(k => silos.includes(k))) return false; }
            else if (f.siloMode === 'only') { if (!silos.length || !silos.every(k => f.silos.includes(k))) return false; }
            else { if (!f.silos.some(k => silos.includes(k))) return false; }
        }
        if (f.urgencies.length && !f.urgencies.includes(r.urgency)) return false;
        if (f.roTypes.length && !f.roTypes.includes(r.roType || 'standard')) return false;
        const p = (r.promisedDate || '').slice(0, 10);
        switch (f.promised) {
            case 'overdue': if (!p || p >= today) return false; break;
            case 'today':   if (p !== today) return false; break;
            case '3d': case '7d': case '14d': case '30d': if (!p || p > horizon[f.promised]) return false; break;
            case 'none':    if (p) return false; break;
            case 'has':     if (!p) return false; break;
            default: break;
        }
        if (f.promisedFrom && (!p || p < f.promisedFrom)) return false;
        if (f.promisedTo && (!p || p > f.promisedTo)) return false;
        if (f.minDays !== '' && f.minDays != null) { const d = _daysOnLot(r); if (d == null || d < Number(f.minDays)) return false; }
        if (f.minDollars !== '' && f.minDollars != null && (parseFloat(r.dollarValue) || 0) < Number(f.minDollars)) return false;
        for (const fl of f.flags) {
            if (fl === 'parts_open' && _partsRank(r) > 1) return false;
            if (fl === 'urgent' && !r.urgentUpdate) return false;
            if (fl === 'receivable' && !(r._receivable && r._receivable.count)) return false;
            if (fl === 'no_wo' && (r._woSummary?.total_wos || 0) > 0) return false;
            if (fl === 'wo_open' && !((r._woSummary?.total_wos || 0) > 0 && (_woPct(r) ?? 0) < 100)) return false;
            if (fl === 'vip' && r.customerType !== 'VIP') return false;
            if (fl === 'no_promised' && r.promisedDate) return false;
        }
        if (q) {
            const hay = [r.roId, r.customerName, r.rv, r.vin, r.technicianAssigned, r.parkingSpot, r.repairDescription, r.status, (_rows[r._supabaseId]?.note || '')].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (_bucketTab !== 'all') {
            const b = _rows[r._supabaseId]?.bucket || '';
            if (_bucketTab === 'unbucketed' ? !!b : b !== _bucketTab) return false;
        }
        return true;
    });
}

function _sortRows(list) {
    if (_sort.key === 'manual') {
        return list.slice().sort((a, b) => {
            const oa = _rows[a._supabaseId]?.order, ob = _rows[b._supabaseId]?.order;
            if (oa == null && ob == null) return _score(b) - _score(a);
            if (oa == null) return 1; if (ob == null) return -1;
            return oa - ob;
        });
    }
    const col = COLUMNS.find(c => c.key === _sort.key) || COLUMNS.find(c => c.key === 'score');
    const dir = _sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
        const va = col.get(a, _rows[a._supabaseId]), vb = col.get(b, _rows[b._supabaseId]);
        if (va === vb) return _score(b) - _score(a);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
}

// ── Open / close ───────────────────────────────────────────────────────
export function openPlanner(viewId) {
    if (!_canUse()) { showToast('Work Planner is for managers and admins.', 'warning'); return; }
    const ov = document.getElementById('plannerOverlay');
    if (!ov) return;
    _open = true;
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (viewId) {
        loadPlannerView(viewId);
    } else if (!_view && !_dirty) {
        _restoreDraft();
        // First-time default for a silo manager: their own silo
        if (!_filters.silos.length && _mySilo() && !(typeof isAdmin === 'function' && isAdmin()) && !hasRole('Sr Manager')) {
            _filters.silos = [_mySilo()];
        }
    }
    _refreshSavedViews();
    renderPlanner();
}

export function closePlanner() {
    const ov = document.getElementById('plannerOverlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
    _open = false;
    _saveDraft();
}

export function _initPlannerBtn() {
    const btn = document.getElementById('plannerBtn');
    if (btn) btn.style.display = _canUse() ? 'inline-block' : 'none';
    // Deep link: index.html?planner=<view uuid>  → open once data + session are ready
    try {
        const id = new URLSearchParams(location.search).get('planner');
        if (id && !window._plannerDeepLinked) {
            window._plannerDeepLinked = true;
            let tries = 0;
            const t = setInterval(() => {
                tries++;
                if (window.supabaseSession && Array.isArray(currentData) && currentData.length) {
                    clearInterval(t); openPlanner(id);
                } else if (tries > 120) clearInterval(t);
            }, 500);
        }
    } catch (_) { /* no-op */ }
}

// ── Draft persistence (localStorage) ───────────────────────────────────
function _saveDraft() {
    try {
        localStorage.setItem('prvs_planner_draft', JSON.stringify({
            view: _view, filters: _filters, sort: _sort, columns: _columns, rows: _rows, bucketTab: _bucketTab, dirty: _dirty,
        }));
    } catch (_) { /* storage may be unavailable */ }
}
function _restoreDraft() {
    try {
        const d = JSON.parse(localStorage.getItem('prvs_planner_draft') || 'null');
        if (!d) return;
        _view = d.view || null; _filters = Object.assign(_defaultFilters(), d.filters || {});
        _sort = d.sort || _sort; _columns = d.columns || _columns; _rows = d.rows || {}; _bucketTab = d.bucketTab || 'all'; _dirty = !!d.dirty;
    } catch (_) { /* ignore */ }
}
function _touch() { _dirty = true; _saveDraft(); }

// ── Filter/sort/column mutators (called from inline handlers) ──────────
export function plannerSetFilter(key, value) {
    if (key === 'silos' || key === 'urgencies' || key === 'roTypes' || key === 'flags' || key === 'statuses') {
        const arr = _filters[key].slice();
        const i = arr.indexOf(value);
        if (i >= 0) arr.splice(i, 1); else arr.push(value);
        _filters[key] = arr;
        if (key === 'statuses' && arr.length) _filters.statusPreset = 'custom';
    } else if (key === 'multiSiloOnly' || key === 'includeShop') {
        _filters[key] = !!value;
    } else {
        _filters[key] = value;
        if (key === 'statusPreset') _filters.statuses = [];
    }
    _touch(); renderPlanner();
}
export function plannerSearch(v) { _filters.search = v || ''; _touch(); renderPlanner({ bodyOnly: true }); }
export function plannerResetFilters() { _filters = _defaultFilters(); _bucketTab = 'all'; _touch(); renderPlanner(); }
export function plannerSort(key) {
    if (key === 'manual') { _sort = { key: 'manual', dir: 'asc' }; _freezeManualOrder(); }
    else if (_sort.key === key) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    else _sort = { key, dir: ['ro', 'customer', 'rv', 'status', 'urgency', 'promised', 'dropoff', 'pickup', 'parts', 'tech', 'type', 'spot', 'bucket', 'note', 'silos'].includes(key) ? 'asc' : 'desc' };
    _touch(); renderPlanner();
}
export function plannerToggleColumn(key) {
    const i = _columns.indexOf(key);
    if (i >= 0) { if (_columns.length > 2) _columns.splice(i, 1); } else _columns.push(key);
    _columns = COLUMNS.map(c => c.key).filter(k => _columns.includes(k)); // keep catalogue order
    _touch(); renderPlanner();
}
export function plannerSetBucketTab(tab) { _bucketTab = tab; _saveDraft(); renderPlanner(); }
export function plannerSetBucket(roUuid, bucket) {
    const s = _rows[roUuid] || (_rows[roUuid] = {});
    s.bucket = bucket || '';
    if (s.order == null) s.order = _nextOrder();
    _touch(); renderPlanner();
}
export function plannerSetNote(roUuid, note) {
    const s = _rows[roUuid] || (_rows[roUuid] = {});
    s.note = note || '';
    if (s.order == null && s.note) s.order = _nextOrder();
    _touch(); // no re-render — user is typing
}
export function plannerBulkBucket(bucket) {
    // Apply to everything currently displayed
    _lastRendered.forEach(r => { const s = _rows[r._supabaseId] || (_rows[r._supabaseId] = {}); s.bucket = bucket; if (s.order == null) s.order = _nextOrder(); });
    _touch(); renderPlanner();
}
function _nextOrder() { return Object.values(_rows).reduce((m, s) => Math.max(m, s.order ?? -1), -1) + 1; }
function _freezeManualOrder() {
    // Snapshot the current display order into rows.order so manual mode starts from what the manager sees
    _lastRendered.forEach((r, i) => { const s = _rows[r._supabaseId] || (_rows[r._supabaseId] = {}); s.order = i; });
}
function _reorder(srcIdx, destIdx) {
    if (srcIdx == null || destIdx == null || srcIdx === destIdx) return;
    if (_sort.key !== 'manual') { _sort = { key: 'manual', dir: 'asc' }; _freezeManualOrder(); }
    if (_lastRendered.some(r => _rows[r._supabaseId]?.order == null)) _freezeManualOrder();
    const list = _lastRendered.slice();
    const [moved] = list.splice(srcIdx, 1);
    list.splice(destIdx, 0, moved);
    // Re-number ONLY the displayed rows, preserving their relative slots among hidden rows
    const slots = _lastRendered.map(r => _rows[r._supabaseId]?.order ?? 0).sort((a, b) => a - b);
    list.forEach((r, i) => { const s = _rows[r._supabaseId] || (_rows[r._supabaseId] = {}); s.order = slots[i]; });
    _touch(); renderPlanner();
}

// ── Saved views (planner_views) ────────────────────────────────────────
async function _refreshSavedViews() {
    const sb = getSB(); if (!sb || !window.supabaseSession) return;
    const { data, error } = await sb.from('planner_views')
        .select('id,name,owner_email,shared,updated_at')
        .order('updated_at', { ascending: false });
    if (error) { console.warn('[Planner] views load failed', error); return; }
    _savedViews = data || [];
    _renderViewPicker();
}

export async function loadPlannerView(id) {
    const sb = getSB(); if (!sb || !window.supabaseSession) return;
    const { data, error } = await sb.from('planner_views').select('*').eq('id', id).maybeSingle();
    if (error) { showToast('Could not load view: ' + error.message, 'error'); return; }
    if (!data) { showToast('That planner view no longer exists (or is not shared with you).', 'warning'); return; }
    _view = { id: data.id, name: data.name, owner_email: data.owner_email, shared: !!data.shared };
    const cfg = data.config || {};
    _filters = Object.assign(_defaultFilters(), cfg.filters || {});
    _sort = cfg.sort || { key: 'score', dir: 'desc' };
    _columns = Array.isArray(cfg.columns) && cfg.columns.length ? cfg.columns : COLUMNS.filter(c => c.default).map(c => c.key);
    _rows = data.rows || {};
    _bucketTab = 'all';
    _dirty = false; _saveDraft();
    renderPlanner();
    showToast(`Loaded "${data.name}"`, 'success', { duration: 2000 });
}

export async function savePlannerView(asCopy) {
    const sb = getSB(); if (!sb || !window.supabaseSession) { showToast('Not signed in.', 'error'); return; }
    let name = _view?.name || '';
    const mustName = asCopy || !_view || !_canEditView(_view);
    if (mustName) {
        name = prompt(asCopy || !_view ? 'Name this planner view:' : `You cannot overwrite "${_view.name}" (owned by ${_view.owner_email}). Save a copy as:`, name ? name + (asCopy ? ' (copy)' : '') : _suggestName());
        if (!name) return;
    }
    const payload = {
        name: name.trim(),
        owner_email: _me(),
        shared: mustName ? (_view?.shared || false) : _view.shared,
        config: { filters: _filters, sort: _sort, columns: _columns },
        rows: _prunedRows(),
        updated_at: new Date().toISOString(),
    };
    let res;
    if (mustName) {
        res = await sb.from('planner_views').insert(payload).select('id,name,owner_email,shared').maybeSingle();
    } else {
        res = await sb.from('planner_views').update(payload).eq('id', _view.id).select('id,name,owner_email,shared').maybeSingle();
    }
    const { data, error } = res;
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    if (!data) { showToast('Save returned no row — RLS may have blocked it.', 'error'); return; }
    _view = { id: data.id, name: data.name, owner_email: data.owner_email, shared: !!data.shared };
    _dirty = false; _saveDraft();
    showToast(`Saved "${data.name}"`, 'success', { duration: 2500 });
    _refreshSavedViews(); renderPlanner();
}

export async function deletePlannerView() {
    if (!_view) return;
    if (!_canEditView(_view)) { showToast('Only the owner or an admin can delete this view.', 'warning'); return; }
    if (!confirm(`Delete planner view "${_view.name}"? This cannot be undone.`)) return;
    const sb = getSB();
    const { error } = await sb.from('planner_views').delete().eq('id', _view.id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('View deleted', 'success', { duration: 2000 });
    newPlannerView(true);
    _refreshSavedViews();
}

export async function togglePlannerShared() {
    if (!_view) { showToast('Save the view first, then share it.', 'info'); return; }
    if (!_canEditView(_view)) { showToast('Only the owner can change sharing.', 'warning'); return; }
    const sb = getSB();
    const next = !_view.shared;
    const { data, error } = await sb.from('planner_views').update({ shared: next, updated_at: new Date().toISOString() }).eq('id', _view.id).select('id').maybeSingle();
    if (error || !data) { showToast('Could not update sharing' + (error ? ': ' + error.message : ''), 'error'); return; }
    _view.shared = next; _saveDraft();
    showToast(next ? 'View is now SHARED with all managers' : 'View is now private', 'success', { duration: 2500 });
    _refreshSavedViews(); renderPlanner();
}

export function copyPlannerLink() {
    if (!_view) { showToast('Save the view first — the link points at the saved view.', 'info'); return; }
    const url = `${location.origin}${location.pathname}?planner=${_view.id}`;
    const done = () => showToast((_view.shared ? '' : '⚠️ View is PRIVATE — others will not see it. ') + 'Link copied: ' + url, _view.shared ? 'success' : 'warning', { duration: 6000 });
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
    else prompt('Copy this link:', url);
}

export function newPlannerView(silent) {
    if (!silent && _dirty && !confirm('Discard unsaved planner changes?')) return;
    _view = null; _rows = {}; _dirty = false; _sort = { key: 'score', dir: 'desc' }; _bucketTab = 'all';
    _filters = _defaultFilters();
    if (_mySilo() && !(typeof isAdmin === 'function' && isAdmin()) && !hasRole('Sr Manager')) _filters.silos = [_mySilo()];
    _saveDraft(); renderPlanner();
}

function _suggestName() {
    const silo = _filters.silos.length === 1 ? _siloMeta(_filters.silos[0]).label : (_filters.silos.length ? _filters.silos.length + ' silos' : 'All silos');
    return `${silo} — week of ${_fmtDate(_todayISO())}`;
}
function _prunedRows() {
    // Drop empty entries so the jsonb stays small; keep anything with a bucket, note or manual order
    const out = {};
    Object.entries(_rows).forEach(([k, s]) => { if (s && (s.bucket || s.note || s.order != null)) out[k] = { order: s.order ?? null, bucket: s.bucket || '', note: s.note || '' }; });
    return out;
}

// ── Push TODAY bucket → Manager Work List ──────────────────────────────
export async function plannerPushToWorkList(bucket) {
    bucket = bucket || 'today';
    if (typeof _addToWorkListWithSilo !== 'function') { showToast('Work List module not loaded.', 'error'); return; }
    const targets = (Array.isArray(currentData) ? currentData : []).filter(r => (_rows[r._supabaseId]?.bucket || '') === bucket);
    if (!targets.length) { showToast(`Nothing in the ${bucket.toUpperCase()} bucket.`, 'info'); return; }
    if (!confirm(`Add ${targets.length} RO(s) from the ${bucket.toUpperCase()} bucket to YOUR Manager Work List?\n(ROs already on your list are skipped.)`)) return;
    const sb = getSB();
    const { data: existing } = await sb.from('manager_work_lists').select('ro_id').eq('manager_email', _me());
    const have = new Set((existing || []).map(x => String(x.ro_id)));
    let added = 0;
    for (const r of targets) {
        if (have.has(String(r._supabaseId))) continue;
        const silos = _roSilos(r);
        const silo = _filters.silos.length === 1 ? _filters.silos[0] : (silos.length === 1 ? silos[0] : (_mySilo() && silos.includes(_mySilo()) ? _mySilo() : null));
        try { await _addToWorkListWithSilo(r._supabaseId, `${r.customerName} — ${r.roId}`, silo); added++; }
        catch (e) { console.warn('[Planner] work list add failed', r.roId, e); }
    }
    showToast(`Added ${added} RO(s) to your Work List`, 'success');
}

// ── Export / print ─────────────────────────────────────────────────────
export function plannerExportCSV() {
    const cols = COLUMNS.filter(c => _columns.includes(c.key));
    const line = arr => arr.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',');
    const rows = [line(cols.map(c => c.label))];
    _lastRendered.forEach(r => rows.push(line(cols.map(c => _cellText(c.key, r)))));
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `work-planner-${(_view?.name || 'draft').replace(/[^\w-]+/g, '_')}-${_todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
}

export function plannerPrint() {
    const cols = COLUMNS.filter(c => _columns.includes(c.key));
    const title = _esc(_view?.name || 'Work Planner (unsaved)');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}tr:nth-child(even) td{background:#fafafa}
.b-today td:first-child{border-left:4px solid #ef4444}.b-week td:first-child{border-left:4px solid #f59e0b}</style></head><body>
<h1>${title}</h1><p>${_lastRendered.length} ROs · printed ${new Date().toLocaleString()} · ${_esc(_me())}</p>
<table><thead><tr>${cols.map(c => `<th>${_esc(c.label)}</th>`).join('')}</tr></thead><tbody>
${_lastRendered.map(r => `<tr class="b-${_rows[r._supabaseId]?.bucket || ''}">${cols.map(c => `<td>${_esc(_cellText(c.key, r))}</td>`).join('')}</tr>`).join('')}
</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('Pop-up blocked — allow pop-ups to print.', 'warning'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

function _cellText(key, r) {
    const s = _rows[r._supabaseId] || {};
    switch (key) {
        case 'ro': return r.roId;
        case 'customer': return r.customerName;
        case 'rv': return r.rv;
        case 'silos': return _roSilos(r).map(k => _siloMeta(k).label).join(', ');
        case 'status': return r.status;
        case 'urgency': return r.urgency || '';
        case 'promised': return r.promisedDate ? String(r.promisedDate).slice(0, 10) : '';
        case 'dropoff': return r.plannedDropoffDate ? String(r.plannedDropoffDate).slice(0, 10) : '';
        case 'pickup': return r.pickupDate ? String(r.pickupDate).slice(0, 10) : '';
        case 'days': { const d = _daysOnLot(r); return d == null ? '' : d; }
        case 'dollars': return parseFloat(r.dollarValue) || 0;
        case 'wo': { const p = _woPct(r); return p == null ? '' : p + '%'; }
        case 'parts': return _partsLabel(r).t.replace(/^[^\w]+/, '');
        case 'tech': return r.technicianAssigned || '';
        case 'type': return r.roType || 'standard';
        case 'spot': return r.parkingSpot || '';
        case 'score': return _score(r);
        case 'bucket': { const b = PLANNER_BUCKETS.find(x => x.key === s.bucket); return b ? b.label : ''; }
        case 'note': return s.note || '';
        default: return '';
    }
}

// ── Rendering ──────────────────────────────────────────────────────────
export function renderPlanner(opts) {
    if (!_open) return;
    const bodyOnly = !!(opts && opts.bodyOnly);
    const body = document.getElementById('plannerBody');
    const head = document.getElementById('plannerHead');
    if (!body || !head) return;
    const all = (Array.isArray(currentData) ? currentData : []);
    const list = _sortRows(_applyFilters(all));
    _lastRendered = list;
    if (!bodyOnly) head.innerHTML = _headerHtml(all);
    body.innerHTML = _tableHtml(list);
    _wireDrag(body);
    if (!bodyOnly) _renderViewPicker();
}

function _headerHtml(all) {
    const f = _filters;
    const chip = (on, label, onclick, color) =>
        `<button type="button" class="pl-chip${on ? ' on' : ''}" onclick="${onclick}" ${color ? `style="--chip:${color}"` : ''}>${label}</button>`;
    const bucketCounts = { all: 0, today: 0, week: 0, later: 0, hold: 0, unbucketed: 0 };
    // counts use the filter WITHOUT the bucket tab so tabs show what each bucket holds
    const savedTab = _bucketTab; _bucketTab = 'all';
    const base = _applyFilters(all); _bucketTab = savedTab;
    base.forEach(r => { const b = _rows[r._supabaseId]?.bucket || ''; bucketCounts.all++; if (b) bucketCounts[b] = (bucketCounts[b] || 0) + 1; else bucketCounts.unbucketed++; });
    const totalDollars = base.reduce((s, r) => s + (parseFloat(r.dollarValue) || 0), 0);

    const viewTitle = _view ? `${_esc(_view.name)}${_view.shared ? ' <span class="pl-tag pl-tag-shared">SHARED</span>' : ' <span class="pl-tag">private</span>'}${_canEditView(_view) ? '' : ' <span class="pl-tag">read-only · ' + _esc(_view.owner_email) + '</span>'}` : '<em>Unsaved draft</em>';

    return `
    <div class="pl-toolbar">
        <div class="pl-title">
            <span class="pl-viewname">${viewTitle}${_dirty ? ' <span class="pl-dirty" title="Unsaved changes">●</span>' : ''}</span>
            <select id="plannerViewPicker" class="pl-select" onchange="if(this.value==='__new'){newPlannerView()}else if(this.value){loadPlannerView(this.value)};this.value=''"><option value="">Open saved view…</option></select>
        </div>
        <div class="pl-actions">
            <button class="pl-btn pl-btn-primary" onclick="savePlannerView(false)" title="Save this view (filters, columns, order, buckets, notes)">💾 Save</button>
            <button class="pl-btn" onclick="savePlannerView(true)" title="Save as a new copy">Save As</button>
            <button class="pl-btn" onclick="togglePlannerShared()" title="Toggle sharing with all managers">${_view?.shared ? '🔓 Shared' : '🔒 Share'}</button>
            <button class="pl-btn" onclick="copyPlannerLink()" title="Copy a link that opens this saved view">🔗 Link</button>
            <button class="pl-btn" onclick="plannerPushToWorkList('today')" title="Add every TODAY-bucket RO to your Manager Work List">➕ Today → My Work List</button>
            <button class="pl-btn" onclick="plannerExportCSV()">⬇ CSV</button>
            <button class="pl-btn" onclick="plannerPrint()">🖨 Print</button>
            ${_view && _canEditView(_view) ? '<button class="pl-btn pl-btn-danger" onclick="deletePlannerView()" title="Delete this saved view">🗑</button>' : ''}
            <button class="pl-btn" onclick="newPlannerView()" title="Start a fresh, empty planner">✨ New</button>
        </div>
    </div>
    <div class="pl-filters">
        <div class="pl-frow">
            <span class="pl-flabel">Services</span>
            ${(SERVICE_SILOS || []).map(s => chip(f.silos.includes(s.key), `${s.emoji} ${_esc(s.label)}`, `plannerSetFilter('silos','${s.key}')`)).join('')}
            <select class="pl-select" onchange="plannerSetFilter('siloMode',this.value)" title="How the selected services match an RO">
                <option value="any"${f.siloMode === 'any' ? ' selected' : ''}>has ANY selected</option>
                <option value="all"${f.siloMode === 'all' ? ' selected' : ''}>has ALL selected</option>
                <option value="only"${f.siloMode === 'only' ? ' selected' : ''}>ONLY selected (no others)</option>
            </select>
            ${chip(f.multiSiloOnly, '🔀 Spans 2+ services', `plannerSetFilter('multiSiloOnly',${!f.multiSiloOnly})`)}
            ${chip(f.includeShop, '🏭 Include Shop ROs', `plannerSetFilter('includeShop',${!f.includeShop})`)}
        </div>
        <div class="pl-frow">
            <span class="pl-flabel">Status</span>
            <select class="pl-select" onchange="plannerSetFilter('statusPreset',this.value)">
                ${Object.entries(STATUS_PRESETS).map(([k, p]) => `<option value="${k}"${f.statusPreset === k ? ' selected' : ''}>${p.label}</option>`).join('')}
                ${f.statuses.length ? '<option value="custom" selected>Custom…</option>' : ''}
            </select>
            <details class="pl-details"><summary>pick statuses${f.statuses.length ? ` (${f.statuses.length})` : ''}</summary>
                <div class="pl-popover">${PLANNER_STATUSES.map(s => chip(f.statuses.includes(s), _esc(s), `plannerSetFilter('statuses','${s.replace(/'/g, "\\'")}')`)).join('')}</div>
            </details>
            <span class="pl-flabel">Promised</span>
            <select class="pl-select" onchange="plannerSetFilter('promised',this.value)">
                ${PROMISED_PRESETS.map(([k, l]) => `<option value="${k}"${f.promised === k ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
            <input type="date" class="pl-input" value="${_esc(f.promisedFrom)}" onchange="plannerSetFilter('promisedFrom',this.value)" title="Promised from">
            <span class="pl-flabel">→</span>
            <input type="date" class="pl-input" value="${_esc(f.promisedTo)}" onchange="plannerSetFilter('promisedTo',this.value)" title="Promised to">
        </div>
        <div class="pl-frow">
            <span class="pl-flabel">Urgency</span>
            ${URGENCIES.map(u => chip(f.urgencies.includes(u), u, `plannerSetFilter('urgencies','${u}')`, { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }[u])).join('')}
            <span class="pl-flabel">Type</span>
            ${['standard', 'insurance', 'hybrid', 'warranty', 'warranty_repair'].map(t => chip(f.roTypes.includes(t), t.replace('_', '+'), `plannerSetFilter('roTypes','${t}')`)).join('')}
            <span class="pl-flabel">Flags</span>
            ${[['parts_open', '🔩 Parts pending'], ['urgent', '🚨 Urgent update'], ['receivable', '💵 Open balance'], ['no_wo', '📭 No WO'], ['wo_open', '🛠 WO in progress'], ['vip', '⭐ VIP'], ['no_promised', '📆 No promise']]
                .map(([k, l]) => chip(f.flags.includes(k), l, `plannerSetFilter('flags','${k}')`)).join('')}
        </div>
        <div class="pl-frow">
            <span class="pl-flabel">Days on lot ≥</span><input type="number" min="0" class="pl-input pl-num" value="${_esc(f.minDays)}" onchange="plannerSetFilter('minDays',this.value)">
            <span class="pl-flabel">$ ≥</span><input type="number" min="0" step="100" class="pl-input pl-num" value="${_esc(f.minDollars)}" onchange="plannerSetFilter('minDollars',this.value)">
            <span class="pl-flabel">Search</span><input type="search" class="pl-input" style="min-width:200px" placeholder="RO, customer, RV, VIN, tech, note…" value="${_esc(f.search)}" oninput="plannerSearch(this.value)">
            <details class="pl-details"><summary>columns</summary>
                <div class="pl-popover">${COLUMNS.map(c => chip(_columns.includes(c.key), _esc(c.label), `plannerToggleColumn('${c.key}')`)).join('')}</div>
            </details>
            <button class="pl-btn pl-btn-sm" onclick="plannerResetFilters()">Reset filters</button>
        </div>
    </div>
    <div class="pl-buckets">
        ${[['all', 'All', '#94a3b8'], ...PLANNER_BUCKETS.map(b => [b.key, b.emoji + ' ' + b.label, b.color]), ['unbucketed', 'Unplanned', '#64748b']]
            .map(([k, l, c]) => `<button type="button" class="pl-tab${_bucketTab === k ? ' on' : ''}" style="--tab:${c}" onclick="plannerSetBucketTab('${k}')">${l} <b>${bucketCounts[k] || 0}</b></button>`).join('')}
        <span class="pl-summary">${bucketCounts.all} ROs · ${_fmtMoney(totalDollars)} · sort: <b>${_sort.key === 'manual' ? '✋ manual (drag rows)' : (COLUMNS.find(c => c.key === _sort.key)?.label || _sort.key) + (_sort.dir === 'asc' ? ' ↑' : ' ↓')}</b></span>
        <span class="pl-bulk">Set all shown → ${PLANNER_BUCKETS.map(b => `<button class="pl-btn pl-btn-sm" style="border-color:${b.color}" onclick="plannerBulkBucket('${b.key}')">${b.emoji} ${b.label}</button>`).join('')}<button class="pl-btn pl-btn-sm" onclick="plannerBulkBucket('')">clear</button></span>
    </div>`;
}

function _tableHtml(list) {
    if (!list.length) return '<div class="pl-empty">No ROs match these filters.<br><small>Loosen a filter, change the status preset, or check the bucket tab.</small></div>';
    const cols = COLUMNS.filter(c => _columns.includes(c.key));
    const th = cols.map(c => {
        const on = _sort.key === c.key;
        return `<th class="pl-th${on ? ' on' : ''}" onclick="plannerSort('${c.key}')">${_esc(c.label)}${on ? (_sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
    }).join('');
    const manualOn = _sort.key === 'manual';
    return `<table class="pl-table"><thead><tr>
        <th class="pl-th pl-th-grip${manualOn ? ' on' : ''}" onclick="plannerSort('manual')" title="Manual order — drag rows">#</th>${th}<th></th></tr></thead>
        <tbody>${list.map((r, i) => _rowHtml(r, i, cols)).join('')}</tbody></table>`;
}

function _rowHtml(r, i, cols) {
    const s = _rows[r._supabaseId] || {};
    const b = PLANNER_BUCKETS.find(x => x.key === s.bucket);
    const tds = cols.map(c => `<td class="pl-td pl-td-${c.key}">${_cellHtml(c.key, r, s)}</td>`).join('');
    return `<tr class="pl-row${b ? ' pl-b-' + b.key : ''}${r.urgentUpdate ? ' pl-urgent' : ''}" data-idx="${i}" data-id="${r._supabaseId}" style="--bucket:${b ? b.color : 'transparent'}">
        <td class="pl-td pl-grip" draggable="true" title="Drag to reorder">⋮⋮ <span class="pl-num-cell">${i + 1}</span></td>${tds}
        <td class="pl-td pl-td-go"><button class="pl-btn pl-btn-sm" onclick="closePlanner();scrollToROInBoard('${r._supabaseId}')" title="Jump to this RO on the board">→ card</button></td></tr>`;
}

function _cellHtml(key, r, s) {
    const today = _todayISO();
    switch (key) {
        case 'ro': return `<span class="pl-ro">${_esc(r.roId)}</span>${r.customerType === 'VIP' ? ' ⭐' : ''}${r.isTraining ? ' 🎓' : ''}`;
        case 'customer': return `<span class="pl-cust">${_esc(r.customerName)}</span>${r.urgentUpdate ? `<div class="pl-urgent-txt" title="${_esc(r.urgentUpdate)}">🚨 ${_esc(String(r.urgentUpdate).slice(0, 60))}</div>` : ''}`;
        case 'rv': return _esc(r.rv);
        case 'silos': {
            const wos = r._woSummary?.silos || [];
            return _roSilos(r).map(k => {
                const m = _siloMeta(k); const wo = wos.find(x => x.silo === k);
                const st = wo ? (wo.wo_completed ? 'done' : (wo.tech_done ? 'tech' : (wo.task_count ? 'open' : 'basic'))) : 'nowo';
                const tip = wo ? `${m.label}: WO ${wo.completed}/${wo.task_count} tasks${wo.est_hours ? ', ' + wo.est_hours + 'h est' : ''}${wo.wo_completed ? ' — COMPLETE' : (wo.tech_done ? ' — tech done' : '')}` : `${m.label}: no work order yet`;
                return `<span class="pl-silo pl-silo-${st}" title="${_esc(tip)}">${m.emoji} ${_esc(m.label)}</span>`;
            }).join(' ') || '<span class="pl-muted">—</span>';
        }
        case 'status': return `<span class="pl-status">${_esc(r.status)}</span>`;
        case 'urgency': return r.urgency ? `<span class="pl-urg pl-urg-${r.urgency.toLowerCase()}">${_esc(r.urgency)}</span>` : '<span class="pl-muted">—</span>';
        case 'promised': {
            const p = (r.promisedDate || '').slice(0, 10); if (!p) return '<span class="pl-muted">—</span>';
            const cls = p < today ? 'pl-date-over' : (p <= _addDaysISO(3) ? 'pl-date-soon' : '');
            const diff = Math.round((new Date(p + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
            return `<span class="${cls}">${_fmtDate(p)}</span> <small class="pl-muted">${diff < 0 ? Math.abs(diff) + 'd late' : diff === 0 ? 'today' : 'in ' + diff + 'd'}</small>`;
        }
        case 'dropoff': return r.plannedDropoffDate ? _fmtDate(r.plannedDropoffDate) : '<span class="pl-muted">—</span>';
        case 'pickup': return r.pickupDate ? _fmtDate(r.pickupDate) : '<span class="pl-muted">—</span>';
        case 'days': { const d = _daysOnLot(r); if (d == null) return '<span class="pl-muted">—</span>'; const c = d > 60 ? '#f472b6' : d > 30 ? '#fb923c' : d > 14 ? '#facc15' : '#9ca3af'; return `<b style="color:${c}">${d}</b>`; }
        case 'dollars': { const bal = r._receivable?.total; return `${_fmtMoney(r.dollarValue)}${bal ? `<div class="pl-bal" title="Open balance">owes ${_fmtMoney(bal)}</div>` : ''}`; }
        case 'wo': { const p = _woPct(r); if (p == null) return '<span class="pl-muted">no WO</span>'; return `<div class="pl-bar" title="${p}% of tasks complete"><i style="width:${p}%"></i><span>${p}%</span></div>`; }
        case 'parts': { const pl = _partsLabel(r); return `<span style="color:${pl.c}">${pl.t}</span>`; }
        case 'tech': return _esc(r.technicianAssigned) || '<span class="pl-muted">—</span>';
        case 'type': return _esc((r.roType || 'standard').replace('_', '+'));
        case 'spot': return _esc(r.parkingSpot) || '<span class="pl-muted">—</span>';
        case 'score': return `<span class="pl-muted">${_score(r)}</span>`;
        case 'bucket': return `<select class="pl-select pl-bucket-sel" onchange="plannerSetBucket('${r._supabaseId}',this.value)" style="border-color:${PLANNER_BUCKETS.find(b => b.key === s.bucket)?.color || '#334155'}">
            <option value=""${!s.bucket ? ' selected' : ''}>—</option>
            ${PLANNER_BUCKETS.map(b => `<option value="${b.key}"${s.bucket === b.key ? ' selected' : ''}>${b.emoji} ${b.label}</option>`).join('')}</select>`;
        case 'note': return `<input class="pl-input pl-note" maxlength="140" placeholder="plan note…" value="${_esc(s.note || '')}" onchange="plannerSetNote('${r._supabaseId}',this.value)">`;
        default: return '';
    }
}

function _renderViewPicker() {
    const sel = document.getElementById('plannerViewPicker'); if (!sel) return;
    const me = _me();
    const mine = _savedViews.filter(v => (v.owner_email || '').toLowerCase() === me);
    const shared = _savedViews.filter(v => (v.owner_email || '').toLowerCase() !== me);
    const opt = v => `<option value="${v.id}">${_esc(v.name)}${v.shared ? ' 🔓' : ''}</option>`;
    sel.innerHTML = '<option value="">Open saved view…</option>'
        + (mine.length ? `<optgroup label="My views">${mine.map(opt).join('')}</optgroup>` : '')
        + (shared.length ? `<optgroup label="Shared by others">${shared.map(v => `<option value="${v.id}">${_esc(v.name)} — ${_esc((v.owner_email || '').split('@')[0])}</option>`).join('')}</optgroup>` : '')
        + '<option value="__new">✨ New empty planner</option>';
}

// ── Drag & drop (mouse + touch) — same dual pattern as work-list.js ────
function _wireDrag(body) {
    const rows = Array.from(body.querySelectorAll('tr.pl-row'));
    let srcIdx = null, touchDest = null;
    rows.forEach(row => {
        const grip = row.querySelector('.pl-grip');
        if (!grip) return;
        // Only the grip cell is draggable so text selection inside note inputs still works
        grip.addEventListener('dragstart', e => {
            srcIdx = parseInt(row.dataset.idx);
            if (e.dataTransfer) { e.dataTransfer.setData('text/plain', row.dataset.id || String(srcIdx)); e.dataTransfer.effectAllowed = 'move'; }
            row.classList.add('dragging');
        });
        grip.addEventListener('dragend', () => { row.classList.remove('dragging'); rows.forEach(r => r.classList.remove('over')); });
        row.addEventListener('dragover', e => { if (srcIdx === null) return; e.preventDefault(); row.classList.add('over'); });
        row.addEventListener('dragleave', () => row.classList.remove('over'));
        row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('over'); _reorder(srcIdx, parseInt(row.dataset.idx)); srcIdx = null; });

        // Touch (phones/tablets): same grip-only rule
        grip.addEventListener('touchstart', () => { srcIdx = parseInt(row.dataset.idx); touchDest = null; row.classList.add('dragging'); }, { passive: true });
        grip.addEventListener('touchmove', e => {
            if (srcIdx === null) return;
            e.preventDefault();
            const t = e.touches[0];
            const el = document.elementFromPoint(t.clientX, t.clientY);
            const over = el && el.closest ? el.closest('tr.pl-row') : null;
            rows.forEach(r => r.classList.remove('over'));
            if (over && over !== row) { over.classList.add('over'); touchDest = parseInt(over.dataset.idx); } else touchDest = null;
        }, { passive: false });
        grip.addEventListener('touchend', () => { row.classList.remove('dragging'); rows.forEach(r => r.classList.remove('over')); _reorder(srcIdx, touchDest); srcIdx = null; touchDest = null; });
    });
}

// Close on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) closePlanner(); });

// ── Window bridge (inline onclick= handlers resolve through here) ──────
Object.assign(window, {
    openPlanner, closePlanner, renderPlanner, _initPlannerBtn,
    plannerSetFilter, plannerSearch, plannerResetFilters, plannerSort, plannerToggleColumn,
    plannerSetBucketTab, plannerSetBucket, plannerSetNote, plannerBulkBucket,
    loadPlannerView, savePlannerView, deletePlannerView, togglePlannerShared, copyPlannerLink, newPlannerView,
    plannerPushToWorkList, plannerExportCSV, plannerPrint,
});
