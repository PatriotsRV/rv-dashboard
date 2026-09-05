// ═══════════════════════════════════════════════════════════════════════
// js/planner.js — 🗓 WORK PLANNER  (v1.504, Session 188, 2026-09-05)
// ───────────────────────────────────────────────────────────────────────
// Manager-facing dynamic RO report + daily/weekly work-list builder that
// lives ON index.html (full-screen overlay, #plannerOverlay).
//
// Roland's model (S188, docs/specs/WORK_PLANNER_SPEC.md):
//   • The PLAN is SHARED. planner_entries = one row per (RO, silo): bucket
//     (today / week / later / hold), planned start/end, note, owner. Every
//     manager sees every silo's entry on an RO — cross-silo awareness is the
//     point (Roof spraying Wed vs Solar installing Wed). Owner / that silo's
//     manager / Sr Manager / Admin can write it. Admins can drop an RO onto
//     ANY silo's plan as an FYI.
//   • The RO CHANNEL (planner_messages) is a Slack-style thread per RO:
//     messages, "request update from <silo>", replies, resolve, system
//     conflict notices. NOT email (Roland: email buries things). Phase 2 adds
//     a direct SMS for important ones via the Messages-board path.
//   • planner_events = audit trail, written by DB triggers on both tables.
//   • Conflicts computed live, client-side: date OVERLAP between silos,
//     PROMISE/PICKUP squeeze, UNPLANNED silo (has a WO, no plan while another
//     silo has one), OPEN REQUESTS addressed to a silo.
//   • planner_views (personal): filters / columns / sort / manual order only.
//
// Data source for ROs: the already-loaded `currentData` (no extra round trip);
// entries + messages are loaded when the planner opens and refreshed per RO
// after every write. Silo membership of an RO = union of its WO silos
// (_woSummary.silos) and its repairType text (REPAIR_TYPE_TO_SILO).
//
// Wiring: window.PRVS_Planner (js/app.js) + Object.assign(window, {...}) at
// the bottom so inline onclick= handlers resolve. Reads inline globals
// (currentData, getSB, supabaseSession, SERVICE_SILOS, REPAIR_TYPE_TO_SILO,
// _staffCache, scrollToROInBoard, showToast, escapeHtml, calculateDaysOnLot,
// calculatePriority, isTerminalStatus, isAdmin, hasRole, canSeeWorkList,
// canManageSilo, _addToWorkListWithSilo) via the shared global environment,
// exactly like js/work-list.js.
// ═══════════════════════════════════════════════════════════════════════

// ── Constants ──────────────────────────────────────────────────────────
export const PLANNER_BUCKETS = [
    { key: 'today', label: 'Today',     emoji: '🔥', color: '#ef4444' },
    { key: 'week',  label: 'This Week', emoji: '📅', color: '#f59e0b' },
    { key: 'later', label: 'Later',     emoji: '⏳', color: '#3b82f6' },
    { key: 'hold',  label: 'Hold',      emoji: '⏸', color: '#6b7280' },
];

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
    ['any', 'Any promised date'], ['overdue', 'Overdue'], ['today', 'Due today'],
    ['3d', 'Due within 3 days'], ['7d', 'Due within 7 days'], ['14d', 'Due within 14 days'],
    ['30d', 'Due within 30 days'], ['none', 'No promised date'], ['has', 'Has a promised date'],
];

const URGENCIES = ['Critical', 'High', 'Medium', 'Low'];

const MSG_KINDS = {
    message:  { label: 'Message', emoji: '💬', color: '#94a3b8' },
    request:  { label: 'Request', emoji: '📣', color: '#f59e0b' },
    reply:    { label: 'Reply',   emoji: '↩️', color: '#38bdf8' },
    conflict: { label: 'Conflict', emoji: '⚠️', color: '#ef4444' },
    fyi:      { label: 'FYI',     emoji: '📌', color: '#a78bfa' },
    system:   { label: 'System',  emoji: '⚙️', color: '#64748b' },
};

// Column catalogue. `get` returns the raw sortable value (e = MY entry for the row).
const COLUMNS = [
    { key: 'ro',       label: 'RO',        default: true,  get: r => r.roId },
    { key: 'customer', label: 'Customer',  default: true,  get: r => r.customerName },
    { key: 'rv',       label: 'RV',        default: true,  get: r => r.rv },
    { key: 'silos',    label: 'Services',  default: true,  get: r => _roSilos(r).join(',') },
    { key: 'plans',    label: 'Plans (all silos)', default: true, get: r => -(_entriesFor(r._supabaseId).length) },
    { key: 'coord',    label: 'Coordination', default: true, get: r => -(_conflicts(r).length) },
    { key: 'status',   label: 'Status',    default: true,  get: r => PLANNER_STATUSES.indexOf(r.status) },
    { key: 'urgency',  label: 'Urgency',   default: true,  get: r => ({ Critical: 0, High: 1, Medium: 2, Low: 3 })[r.urgency] ?? 9 },
    { key: 'promised', label: 'Promised',  default: true,  get: r => r.promisedDate || '9999-99-99' },
    { key: 'dropoff',  label: 'Drop-off',  default: false, get: r => r.plannedDropoffDate || '9999-99-99' },
    { key: 'pickup',   label: 'Pickup',    default: false, get: r => r.pickupDate || '9999-99-99' },
    { key: 'days',     label: 'Days',      default: true,  get: r => _daysOnLot(r) ?? -1 },
    { key: 'dollars',  label: '$ Value',   default: false, get: r => parseFloat(r.dollarValue) || 0 },
    { key: 'wo',       label: 'WO %',      default: true,  get: r => _woPct(r) ?? -1 },
    { key: 'parts',    label: 'Parts',     default: true,  get: r => _partsRank(r) },
    { key: 'tech',     label: 'Tech',      default: false, get: r => r.technicianAssigned || '' },
    { key: 'type',     label: 'Type',      default: false, get: r => r.roType || '' },
    { key: 'spot',     label: 'Spot',      default: false, get: r => r.parkingSpot || '' },
    { key: 'score',    label: 'Score',     default: false, get: r => _score(r) },
    { key: 'bucket',   label: 'My bucket', default: true,  get: (r, e) => e ? PLANNER_BUCKETS.findIndex(b => b.key === e.bucket) : 9 },
    { key: 'dates',    label: 'My start → end', default: true, get: (r, e) => e?.planned_start || '9999-99-99' },
    { key: 'note',     label: 'My plan note', default: true, get: (r, e) => e?.note || '' },
];

// ── Module state ───────────────────────────────────────────────────────
let _open = false;
let _view = null;            // { id, name, owner_email, shared } of the loaded saved view (null = unsaved draft)
let _dirty = false;
let _filters = _defaultFilters();
let _sort = { key: 'coord', dir: 'desc' };   // key 'manual' = drag order
let _columns = COLUMNS.filter(c => c.default).map(c => c.key);
let _order = {};             // ro_uuid -> manual sort order (personal, lives in planner_views.rows)
let _bucketTab = 'all';      // all | today | week | later | hold | unplanned | coord
let _savedViews = [];
let _lastRendered = [];
let _entries = {};           // ro_uuid -> [planner_entries rows]
let _msgs = {};              // ro_uuid -> [planner_messages rows]
let _events = {};            // ro_uuid -> [planner_events rows] (loaded on drawer open)
let _drawerRo = null;        // ro_uuid currently open in the drill-down drawer
let _loaded = false;

function _defaultFilters() {
    return {
        silos: [], siloMode: 'any', multiSiloOnly: false,
        statusPreset: 'active', statuses: [],
        promised: 'any', promisedFrom: '', promisedTo: '',
        urgencies: [], minDays: '', minDollars: '', roTypes: [], flags: [],
        search: '', includeShop: false,
    };
}

// ── Small helpers ──────────────────────────────────────────────────────
function _isTerminal(s) {
    try { return typeof isTerminalStatus === 'function' ? isTerminalStatus(s) : /^(Delivered|Closed)/.test(s || ''); }
    catch (_) { return /^(Delivered|Closed)/.test(s || ''); }
}
function _me() { return (window.supabaseSession?.user?.email || '').toLowerCase(); }
function _isAdmin() { try { return isAdmin(); } catch (_) { return false; } }
function _isSr() { try { return _isAdmin() || hasRole('Sr Manager'); } catch (_) { return false; } }
function _todayISO() { return new Date().toLocaleDateString('en-CA'); }
function _addDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); }
function _fmtDate(d) {
    if (!d) return '';
    try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (_) { return String(d).slice(0, 10); }
}
function _fmtWhen(ts) { try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_) { return ts; } }
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
function _siloMeta(key) { return (SERVICE_SILOS || []).find(s => s.key === key) || { key, label: key || '—', emoji: '' }; }
function _who(email) {
    const e = (email || '').toLowerCase();
    const st = (window._staffCache || []).find(s => (s.email || '').toLowerCase() === e);
    return st?.name || e.split('@')[0] || '—';
}
function _initials(email) { return _who(email).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function _roByUuid(id) { return (Array.isArray(currentData) ? currentData : []).find(r => r._supabaseId === id) || null; }

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
/** Silos this user speaks for: silo managers = their silo; Sr Mgr/Admin = all. */
function _mySilos() { return _isSr() ? (SERVICE_SILOS || []).map(s => s.key) : (_mySilo() ? [_mySilo()] : []); }
function _canUse() { try { return canSeeWorkList(); } catch (_) { return false; } }
function _canEditView(v) { return !v || (v.owner_email || '').toLowerCase() === _me() || _isAdmin(); }
function _canEditEntry(e) {
    if (!e) return false;
    if (_isSr()) return true;
    if ((e.owner_email || '').toLowerCase() === _me()) return true;
    try { return canManageSilo(e.service_silo); } catch (_) { return false; }
}
function _canPlanSilo(silo) { if (_isSr()) return true; try { return canManageSilo(silo); } catch (_) { return false; } }

function _entriesFor(roUuid) { return _entries[roUuid] || []; }
function _msgsFor(roUuid) { return _msgs[roUuid] || []; }

/**
 * "My" entry for a row — the one the inline bucket/date/note cells edit.
 * Silo manager → their silo's entry. Sr/Admin → the single filtered silo, else
 * the RO's only silo, else the first entry they own, else null (use the drawer).
 */
function _editSiloFor(r) {
    const silos = _roSilos(r);
    if (!_isSr()) { const m = _mySilo(); return m ? m : null; }
    if (_filters.silos.length === 1) return _filters.silos[0];
    if (silos.length === 1) return silos[0];
    const mine = _entriesFor(r._supabaseId).find(e => (e.owner_email || '').toLowerCase() === _me());
    if (mine) return mine.service_silo;
    return null;
}
function _myEntry(r) { const s = _editSiloFor(r); return s ? _entriesFor(r._supabaseId).find(e => e.service_silo === s) || null : null; }

// ── Conflicts (live, client-side) ──────────────────────────────────────
function _range(e) { const a = e.planned_start || e.planned_end; const b = e.planned_end || e.planned_start; return a ? [a, b] : null; }
export function _conflicts(r) {
    const out = [];
    const es = _entriesFor(r._supabaseId).filter(e => e.status !== 'dropped' && e.status !== 'done');
    // 1. overlap between silos
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
        const a = _range(es[i]), b = _range(es[j]); if (!a || !b) continue;
        if (a[0] <= b[1] && b[0] <= a[1]) out.push({ kind: 'overlap', silos: [es[i].service_silo, es[j].service_silo], text: `${_siloMeta(es[i].service_silo).label} (${_fmtDate(a[0])}–${_fmtDate(a[1])}) overlaps ${_siloMeta(es[j].service_silo).label} (${_fmtDate(b[0])}–${_fmtDate(b[1])})` });
    }
    // 2. promise / pickup squeeze
    const deadline = (r.pickupDate || r.promisedDate || '').slice(0, 10);
    if (deadline) es.forEach(e => { const rg = _range(e); if (rg && rg[1] > deadline) out.push({ kind: 'promise', silos: [e.service_silo], text: `${_siloMeta(e.service_silo).label} plan ends ${_fmtDate(rg[1])} — after the ${r.pickupDate ? 'pickup' : 'promised'} date ${_fmtDate(deadline)}` }); });
    // 3. unplanned silo while another silo has a plan
    if (es.length) _roSilos(r).forEach(k => { if (!es.some(e => e.service_silo === k)) out.push({ kind: 'unplanned', silos: [k], text: `${_siloMeta(k).label} has work on this RO but no plan yet` }); });
    // 4. open requests
    _msgsFor(r._supabaseId).filter(m => m.kind === 'request' && !m.resolved_at).forEach(m => out.push({ kind: 'request', silos: [m.to_silo, m.from_silo].filter(Boolean), text: `Open request${m.to_silo ? ' to ' + _siloMeta(m.to_silo).label : ''} from ${_who(m.from_email)}: ${m.body.slice(0, 80)}` }));
    return out;
}
function _mineConflicts(r) { const mine = _mySilos(); return _conflicts(r).filter(c => _isSr() || c.silos.some(s => mine.includes(s))); }

// ── Filtering / sorting ────────────────────────────────────────────────
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
            if (fl === 'planned_any' && !_entriesFor(r._supabaseId).length) return false;
            if (fl === 'planned_other' && !_entriesFor(r._supabaseId).some(e => !_mySilos().includes(e.service_silo))) return false;
        }
        if (q) {
            const hay = [r.roId, r.customerName, r.rv, r.vin, r.technicianAssigned, r.parkingSpot, r.repairDescription, r.status,
                ..._entriesFor(r._supabaseId).map(e => e.note || '')].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (_bucketTab !== 'all') {
            if (_bucketTab === 'coord') { if (!_mineConflicts(r).length) return false; }
            else {
                const e = _myEntry(r); const b = e?.bucket || '';
                if (_bucketTab === 'unplanned' ? !!b : b !== _bucketTab) return false;
            }
        }
        return true;
    });
}

function _sortRows(list) {
    if (_sort.key === 'manual') {
        return list.slice().sort((a, b) => {
            const oa = _order[a._supabaseId], ob = _order[b._supabaseId];
            if (oa == null && ob == null) return _score(b) - _score(a);
            if (oa == null) return 1; if (ob == null) return -1;
            return oa - ob;
        });
    }
    const col = COLUMNS.find(c => c.key === _sort.key) || COLUMNS.find(c => c.key === 'score');
    const dir = _sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
        const va = col.get(a, _myEntry(a)), vb = col.get(b, _myEntry(b));
        if (va === vb) return _score(b) - _score(a);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
}

// ── Data: entries + messages ───────────────────────────────────────────
async function _loadPlanData() {
    const sb = getSB(); if (!sb || !window.supabaseSession) return;
    const [{ data: es, error: e1 }, { data: ms, error: e2 }] = await Promise.all([
        sb.from('planner_entries').select('*').order('created_at'),
        sb.from('planner_messages').select('*').order('created_at'),
    ]);
    if (e1) { showToast('Planner entries failed to load: ' + e1.message + ' (has planner_shared_plan_s188.sql been run?)', 'error'); return; }
    if (e2) { showToast('Planner messages failed to load: ' + e2.message, 'error'); }
    _entries = {}; (es || []).forEach(e => { (_entries[e.ro_uuid] = _entries[e.ro_uuid] || []).push(e); });
    _msgs = {}; (ms || []).forEach(m => { (_msgs[m.ro_uuid] = _msgs[m.ro_uuid] || []).push(m); });
    _loaded = true;
    _updateBadge();
}
async function _refreshRo(roUuid) {
    const sb = getSB(); if (!sb) return;
    const [{ data: es }, { data: ms }] = await Promise.all([
        sb.from('planner_entries').select('*').eq('ro_uuid', roUuid).order('created_at'),
        sb.from('planner_messages').select('*').eq('ro_uuid', roUuid).order('created_at'),
    ]);
    _entries[roUuid] = es || []; _msgs[roUuid] = ms || [];
    if (_drawerRo === roUuid) await _loadEvents(roUuid);
    _updateBadge();
    renderPlanner();
}
async function _loadEvents(roUuid) {
    const sb = getSB(); if (!sb) return;
    const { data } = await sb.from('planner_events').select('*').eq('ro_uuid', roUuid).order('created_at', { ascending: false }).limit(200);
    _events[roUuid] = data || [];
}

/** Insert-or-update the (ro, silo) entry. Audit is trigger-written. */
export async function plannerUpsertEntry(roUuid, silo, patch, opts) {
    opts = opts || {};
    const sb = getSB(); if (!sb || !window.supabaseSession) { showToast('Not signed in.', 'error'); return; }
    const ro = _roByUuid(roUuid); if (!ro) return;
    if (!silo) { showToast('Pick which service this plan is for.', 'warning'); return; }
    const existing = _entriesFor(roUuid).find(e => e.service_silo === silo);
    if (existing && !_canEditEntry(existing)) { showToast(`Only ${_who(existing.owner_email)} (or a Sr Manager/Admin) can change the ${_siloMeta(silo).label} plan.`, 'warning'); return; }
    if (!existing && !_canPlanSilo(silo) && !opts.fyi) { showToast(`You cannot plan ${_siloMeta(silo).label} work.`, 'warning'); return; }
    let res;
    if (existing) {
        res = await sb.from('planner_entries').update({ ...patch, updated_by: _me() }).eq('id', existing.id).select('id').maybeSingle();
    } else {
        const row = {
            ro_uuid: roUuid, ro_display_id: ro.roId, service_silo: silo,
            owner_email: opts.owner || _me(), bucket: '', source: opts.fyi ? 'admin_fyi' : 'manual',
            created_by: _me(), updated_by: _me(), ...patch,
        };
        res = await sb.from('planner_entries').insert(row).select('id').maybeSingle();
    }
    const { data, error } = res;
    if (error) { showToast('Plan save failed: ' + error.message, 'error'); return; }
    if (!data) { showToast('Plan save returned no row — RLS may have blocked it.', 'error'); return; }
    if (!existing && opts.fyi) {
        await _postMessage(roUuid, { kind: 'fyi', to_silo: silo, body: opts.body || `${_who(_me())} added this RO to the ${_siloMeta(silo).label} plan (FYI).` }, true);
    }
    await _refreshRo(roUuid);
}

export async function plannerDeleteEntry(entryId) {
    const all = Object.values(_entries).flat();
    const e = all.find(x => x.id === entryId); if (!e) return;
    if (!_canEditEntry(e)) { showToast('You cannot remove this plan.', 'warning'); return; }
    if (!confirm(`Remove the ${_siloMeta(e.service_silo).label} plan for ${e.ro_display_id || 'this RO'}?`)) return;
    const { error } = await getSB().from('planner_entries').delete().eq('id', entryId);
    if (error) { showToast('Remove failed: ' + error.message, 'error'); return; }
    await _refreshRo(e.ro_uuid);
}

async function _postMessage(roUuid, m, silent) {
    const sb = getSB(); if (!sb) return null;
    const ro = _roByUuid(roUuid);
    const row = {
        ro_uuid: roUuid, ro_display_id: ro?.roId || null, from_email: _me(),
        from_silo: m.from_silo !== undefined ? m.from_silo : (_isSr() ? (_filters.silos.length === 1 ? _filters.silos[0] : null) : _mySilo()),
        to_silo: m.to_silo || null, kind: m.kind || 'message', body: m.body, proposed_date: m.proposed_date || null, parent_id: m.parent_id || null,
    };
    const { data, error } = await sb.from('planner_messages').insert(row).select('id').maybeSingle();
    if (error) { showToast('Message failed: ' + error.message, 'error'); return null; }
    if (!silent) showToast(row.kind === 'request' ? `Request sent to ${_siloMeta(row.to_silo).label}` : 'Posted', 'success', { duration: 1800 });
    return data;
}

export async function plannerResolveMessage(msgId) {
    const m = Object.values(_msgs).flat().find(x => x.id === msgId); if (!m) return;
    const { error } = await getSB().from('planner_messages').update({ resolved_at: new Date().toISOString(), resolved_by: _me() }).eq('id', msgId);
    if (error) { showToast('Resolve failed: ' + error.message, 'error'); return; }
    await _refreshRo(m.ro_uuid);
}

// ── Open / close ───────────────────────────────────────────────────────
export async function openPlanner(viewId) {
    if (!_canUse()) { showToast('Work Planner is for managers and admins.', 'warning'); return; }
    const ov = document.getElementById('plannerOverlay'); if (!ov) return;
    _open = true;
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (!viewId && !_view && !_dirty) {
        _restoreDraft();
        if (!_filters.silos.length && _mySilo() && !_isSr()) _filters.silos = [_mySilo()];
    }
    renderPlanner(); // paint immediately from currentData
    await _loadPlanData();
    if (viewId) await loadPlannerView(viewId);
    _refreshSavedViews();
    renderPlanner();
}

export function closePlanner() {
    const ov = document.getElementById('plannerOverlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
    _open = false; _drawerRo = null;
    _saveDraft();
}

export function _initPlannerBtn() {
    const btn = document.getElementById('plannerBtn');
    if (btn) btn.style.display = _canUse() ? 'inline-block' : 'none';
    if (_canUse() && !_loaded && window.supabaseSession) _loadPlanData().catch(() => {});
    try {
        const id = new URLSearchParams(location.search).get('planner');
        if (id && !window._plannerDeepLinked) {
            window._plannerDeepLinked = true;
            let tries = 0;
            const t = setInterval(() => {
                tries++;
                if (window.supabaseSession && Array.isArray(currentData) && currentData.length) { clearInterval(t); openPlanner(id); }
                else if (tries > 120) clearInterval(t);
            }, 500);
        }
    } catch (_) { /* no-op */ }
}

/** Badge on the header button: open requests to my silos + conflicts touching my silos. */
function _updateBadge() {
    const btn = document.getElementById('plannerBtn'); if (!btn) return;
    let n = 0;
    (Array.isArray(currentData) ? currentData : []).forEach(r => { if (!_isTerminal(r.status)) n += _mineConflicts(r).length; });
    let b = btn.querySelector('.pl-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'pl-badge'; btn.appendChild(b); }
    b.textContent = n;
}

// ── Draft persistence (localStorage) — personal view state only ────────
function _saveDraft() {
    try { localStorage.setItem('prvs_planner_draft', JSON.stringify({ view: _view, filters: _filters, sort: _sort, columns: _columns, order: _order, bucketTab: _bucketTab, dirty: _dirty })); }
    catch (_) { /* storage may be unavailable */ }
}
function _restoreDraft() {
    try {
        const d = JSON.parse(localStorage.getItem('prvs_planner_draft') || 'null'); if (!d) return;
        _view = d.view || null; _filters = Object.assign(_defaultFilters(), d.filters || {});
        _sort = d.sort || _sort; _columns = (d.columns || _columns).filter(k => COLUMNS.some(c => c.key === k)); if (_columns.length < 2) _columns = COLUMNS.filter(c => c.default).map(c => c.key);
        _order = d.order || {}; _bucketTab = d.bucketTab || 'all'; _dirty = !!d.dirty;
    } catch (_) { /* ignore */ }
}
function _touch() { _dirty = true; _saveDraft(); }

// ── Filter/sort/column mutators (inline handlers) ──────────────────────
export function plannerSetFilter(key, value) {
    if (['silos', 'urgencies', 'roTypes', 'flags', 'statuses'].includes(key)) {
        const arr = _filters[key].slice(); const i = arr.indexOf(value);
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
    else _sort = { key, dir: ['ro', 'customer', 'rv', 'status', 'urgency', 'promised', 'dropoff', 'pickup', 'parts', 'tech', 'type', 'spot', 'bucket', 'dates', 'note', 'silos'].includes(key) ? 'asc' : 'desc' };
    _touch(); renderPlanner();
}
export function plannerToggleColumn(key) {
    const i = _columns.indexOf(key);
    if (i >= 0) { if (_columns.length > 2) _columns.splice(i, 1); } else _columns.push(key);
    _columns = COLUMNS.map(c => c.key).filter(k => _columns.includes(k));
    _touch(); renderPlanner();
}
export function plannerSetBucketTab(tab) { _bucketTab = tab; _saveDraft(); renderPlanner(); }

// Inline cell writes → planner_entries
export function plannerSetBucket(roUuid, bucket) {
    const r = _roByUuid(roUuid); if (!r) return;
    const silo = _editSiloFor(r);
    if (!silo) { openPlannerDrawer(roUuid); showToast('This RO spans several services — pick which plan to set in the drawer.', 'info'); return; }
    plannerUpsertEntry(roUuid, silo, { bucket: bucket || '' });
}
export function plannerSetDates(roUuid, start, end) {
    const r = _roByUuid(roUuid); if (!r) return;
    const silo = _editSiloFor(r);
    if (!silo) { openPlannerDrawer(roUuid); return; }
    plannerUpsertEntry(roUuid, silo, { planned_start: start || null, planned_end: end || null });
}
export function plannerSetNote(roUuid, note) {
    const r = _roByUuid(roUuid); if (!r) return;
    const silo = _editSiloFor(r);
    if (!silo) { openPlannerDrawer(roUuid); return; }
    plannerUpsertEntry(roUuid, silo, { note: note || '' });
}
export async function plannerBulkBucket(bucket) {
    const targets = _lastRendered.filter(r => _editSiloFor(r));
    if (!targets.length) return;
    if (!confirm(`Set ${targets.length} RO(s) → ${bucket ? PLANNER_BUCKETS.find(b => b.key === bucket).label : 'no bucket'} on your plan?`)) return;
    for (const r of targets) await plannerUpsertEntry(r._supabaseId, _editSiloFor(r), { bucket: bucket || '' });
}
function _freezeManualOrder() { _lastRendered.forEach((r, i) => { _order[r._supabaseId] = i; }); }
function _reorder(srcIdx, destIdx) {
    if (srcIdx == null || destIdx == null || srcIdx === destIdx) return;
    if (_sort.key !== 'manual') { _sort = { key: 'manual', dir: 'asc' }; }
    if (_lastRendered.some(r => _order[r._supabaseId] == null)) _freezeManualOrder();
    const list = _lastRendered.slice();
    const [moved] = list.splice(srcIdx, 1); list.splice(destIdx, 0, moved);
    const slots = _lastRendered.map(r => _order[r._supabaseId]).sort((a, b) => a - b);
    list.forEach((r, i) => { _order[r._supabaseId] = slots[i]; });
    _touch(); renderPlanner();
}

// ── Saved views (planner_views: personal report config) ────────────────
async function _refreshSavedViews() {
    const sb = getSB(); if (!sb || !window.supabaseSession) return;
    const { data, error } = await sb.from('planner_views').select('id,name,owner_email,shared,updated_at').order('updated_at', { ascending: false });
    if (error) { console.warn('[Planner] views load failed', error); return; }
    _savedViews = data || []; _renderViewPicker();
}
export async function loadPlannerView(id) {
    const sb = getSB(); if (!sb || !window.supabaseSession) return;
    const { data, error } = await sb.from('planner_views').select('*').eq('id', id).maybeSingle();
    if (error) { showToast('Could not load view: ' + error.message, 'error'); return; }
    if (!data) { showToast('That planner view no longer exists (or is not shared with you).', 'warning'); return; }
    _view = { id: data.id, name: data.name, owner_email: data.owner_email, shared: !!data.shared };
    const cfg = data.config || {};
    _filters = Object.assign(_defaultFilters(), cfg.filters || {});
    _sort = cfg.sort || { key: 'coord', dir: 'desc' };
    _columns = Array.isArray(cfg.columns) && cfg.columns.length ? cfg.columns.filter(k => COLUMNS.some(c => c.key === k)) : COLUMNS.filter(c => c.default).map(c => c.key);
    _order = {}; Object.entries(data.rows || {}).forEach(([k, v]) => { if (v && v.order != null) _order[k] = v.order; });
    _bucketTab = 'all'; _dirty = false; _saveDraft();
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
    const rows = {}; Object.entries(_order).forEach(([k, o]) => { rows[k] = { order: o }; });
    const payload = { name: name.trim(), owner_email: _me(), shared: mustName ? false : _view.shared, config: { filters: _filters, sort: _sort, columns: _columns }, rows, updated_at: new Date().toISOString() };
    const res = mustName
        ? await sb.from('planner_views').insert(payload).select('id,name,owner_email,shared').maybeSingle()
        : await sb.from('planner_views').update(payload).eq('id', _view.id).select('id,name,owner_email,shared').maybeSingle();
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
    if (!confirm(`Delete planner view "${_view.name}"? (Plans and messages are NOT affected — only this saved filter set.)`)) return;
    const { error } = await getSB().from('planner_views').delete().eq('id', _view.id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('View deleted', 'success', { duration: 2000 });
    newPlannerView(true); _refreshSavedViews();
}
export async function togglePlannerShared() {
    if (!_view) { showToast('Save the view first, then share it.', 'info'); return; }
    if (!_canEditView(_view)) { showToast('Only the owner can change sharing.', 'warning'); return; }
    const next = !_view.shared;
    const { data, error } = await getSB().from('planner_views').update({ shared: next, updated_at: new Date().toISOString() }).eq('id', _view.id).select('id').maybeSingle();
    if (error || !data) { showToast('Could not update sharing' + (error ? ': ' + error.message : ''), 'error'); return; }
    _view.shared = next; _saveDraft();
    showToast(next ? 'View is now SHARED with all managers' : 'View is now private', 'success', { duration: 2500 });
    _refreshSavedViews(); renderPlanner();
}
export function copyPlannerLink() {
    if (!_view) { showToast('Save the view first — the link points at the saved view.', 'info'); return; }
    const url = `${location.origin}${location.pathname}?planner=${_view.id}`;
    const done = () => showToast((_view.shared ? '' : '⚠️ View is PRIVATE — others will not see it. ') + 'Link copied: ' + url, _view.shared ? 'success' : 'warning', { duration: 6000 });
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url)); else prompt('Copy this link:', url);
}
export function newPlannerView(silent) {
    if (!silent && _dirty && !confirm('Discard unsaved view changes? (Plans and messages are already saved.)')) return;
    _view = null; _order = {}; _dirty = false; _sort = { key: 'coord', dir: 'desc' }; _bucketTab = 'all';
    _filters = _defaultFilters();
    if (_mySilo() && !_isSr()) _filters.silos = [_mySilo()];
    _saveDraft(); renderPlanner();
}
function _suggestName() {
    const silo = _filters.silos.length === 1 ? _siloMeta(_filters.silos[0]).label : (_filters.silos.length ? _filters.silos.length + ' silos' : 'All silos');
    return `${silo} — week of ${_fmtDate(_todayISO())}`;
}

// ── Push TODAY bucket → Manager Work List ──────────────────────────────
export async function plannerPushToWorkList(bucket) {
    bucket = bucket || 'today';
    if (typeof _addToWorkListWithSilo !== 'function') { showToast('Work List module not loaded.', 'error'); return; }
    const targets = (Array.isArray(currentData) ? currentData : []).filter(r => (_myEntry(r)?.bucket || '') === bucket);
    if (!targets.length) { showToast(`Nothing in your ${bucket.toUpperCase()} bucket.`, 'info'); return; }
    if (!confirm(`Add ${targets.length} RO(s) from your ${bucket.toUpperCase()} bucket to YOUR Manager Work List?\n(ROs already on your list are skipped.)`)) return;
    const { data: existing } = await getSB().from('manager_work_lists').select('ro_id').eq('manager_email', _me());
    const have = new Set((existing || []).map(x => String(x.ro_id)));
    let added = 0;
    for (const r of targets) {
        if (have.has(String(r._supabaseId))) continue;
        try { await _addToWorkListWithSilo(r._supabaseId, `${r.customerName} — ${r.roId}`, _editSiloFor(r)); added++; }
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `work-planner-${(_view?.name || 'draft').replace(/[^\w-]+/g, '_')}-${_todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
}
export function plannerPrint() {
    const cols = COLUMNS.filter(c => _columns.includes(c.key));
    const title = _esc(_view?.name || 'Work Planner');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}tr:nth-child(even) td{background:#fafafa}
.b-today td:first-child{border-left:4px solid #ef4444}.b-week td:first-child{border-left:4px solid #f59e0b}</style></head><body>
<h1>${title}</h1><p>${_lastRendered.length} ROs · printed ${new Date().toLocaleString()} · ${_esc(_who(_me()))}</p>
<table><thead><tr>${cols.map(c => `<th>${_esc(c.label)}</th>`).join('')}</tr></thead><tbody>
${_lastRendered.map(r => `<tr class="b-${_myEntry(r)?.bucket || ''}">${cols.map(c => `<td>${_esc(_cellText(c.key, r))}</td>`).join('')}</tr>`).join('')}
</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('Pop-up blocked — allow pop-ups to print.', 'warning'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
function _cellText(key, r) {
    const e = _myEntry(r);
    switch (key) {
        case 'ro': return r.roId;
        case 'customer': return r.customerName;
        case 'rv': return r.rv;
        case 'silos': return _roSilos(r).map(k => _siloMeta(k).label).join(', ');
        case 'plans': return _entriesFor(r._supabaseId).map(x => `${_siloMeta(x.service_silo).label}: ${x.bucket || 'no bucket'}${x.planned_start ? ' ' + x.planned_start : ''}${x.planned_end ? '→' + x.planned_end : ''} (${_who(x.owner_email)})`).join(' | ');
        case 'coord': return _conflicts(r).map(c => c.text).join(' | ');
        case 'status': return r.status;
        case 'urgency': return r.urgency || '';
        case 'promised': return (r.promisedDate || '').slice(0, 10);
        case 'dropoff': return (r.plannedDropoffDate || '').slice(0, 10);
        case 'pickup': return (r.pickupDate || '').slice(0, 10);
        case 'days': { const d = _daysOnLot(r); return d == null ? '' : d; }
        case 'dollars': return parseFloat(r.dollarValue) || 0;
        case 'wo': { const p = _woPct(r); return p == null ? '' : p + '%'; }
        case 'parts': return _partsLabel(r).t.replace(/^[^\w]+/, '');
        case 'tech': return r.technicianAssigned || '';
        case 'type': return r.roType || 'standard';
        case 'spot': return r.parkingSpot || '';
        case 'score': return _score(r);
        case 'bucket': { const b = PLANNER_BUCKETS.find(x => x.key === e?.bucket); return b ? b.label : ''; }
        case 'dates': return e ? [e.planned_start, e.planned_end].filter(Boolean).join(' → ') : '';
        case 'note': return e?.note || '';
        default: return '';
    }
}

// ── Rendering ──────────────────────────────────────────────────────────
export function renderPlanner(opts) {
    if (!_open) return;
    const bodyOnly = !!(opts && opts.bodyOnly);
    const body = document.getElementById('plannerBody'), head = document.getElementById('plannerHead');
    if (!body || !head) return;
    const all = (Array.isArray(currentData) ? currentData : []);
    const list = _sortRows(_applyFilters(all));
    _lastRendered = list;
    if (!bodyOnly) head.innerHTML = _headerHtml(all);
    body.innerHTML = _tableHtml(list);
    _wireDrag(body);
    if (!bodyOnly) _renderViewPicker();
    if (_drawerRo) _renderDrawer();
}

function _headerHtml(all) {
    const f = _filters;
    const chip = (on, label, onclick, color) => `<button type="button" class="pl-chip${on ? ' on' : ''}" onclick="${onclick}" ${color ? `style="--chip:${color}"` : ''}>${label}</button>`;
    const counts = { all: 0, today: 0, week: 0, later: 0, hold: 0, unplanned: 0, coord: 0 };
    const savedTab = _bucketTab; _bucketTab = 'all'; const base = _applyFilters(all); _bucketTab = savedTab;
    base.forEach(r => { counts.all++; const b = _myEntry(r)?.bucket || ''; if (b) counts[b]++; else counts.unplanned++; if (_mineConflicts(r).length) counts.coord++; });
    const totalDollars = base.reduce((s, r) => s + (parseFloat(r.dollarValue) || 0), 0);
    const planAs = _isSr() ? (f.silos.length === 1 ? `planning as <b>${_siloMeta(f.silos[0]).emoji} ${_esc(_siloMeta(f.silos[0]).label)}</b>` : 'planning: <b>pick ONE service filter</b> to edit inline, or use the drawer') : `planning as <b>${_siloMeta(_mySilo()).emoji} ${_esc(_siloMeta(_mySilo()).label)}</b>`;
    const viewTitle = _view ? `${_esc(_view.name)}${_view.shared ? ' <span class="pl-tag pl-tag-shared">SHARED</span>' : ' <span class="pl-tag">private</span>'}${_canEditView(_view) ? '' : ' <span class="pl-tag">read-only · ' + _esc(_who(_view.owner_email)) + '</span>'}` : '<em>Unsaved view</em>';
    return `
    <div class="pl-toolbar">
        <div class="pl-title">
            <span class="pl-viewname">${viewTitle}${_dirty ? ' <span class="pl-dirty" title="Unsaved view changes">●</span>' : ''}</span>
            <select id="plannerViewPicker" class="pl-select" onchange="if(this.value==='__new'){newPlannerView()}else if(this.value){loadPlannerView(this.value)};this.value=''"><option value="">Open saved view…</option></select>
            <span class="pl-planas">${planAs}</span>
        </div>
        <div class="pl-actions">
            <button class="pl-btn pl-btn-primary" onclick="savePlannerView(false)" title="Save this view (filters, columns, sort, manual order). Plans + messages save themselves.">💾 Save view</button>
            <button class="pl-btn" onclick="savePlannerView(true)">Save As</button>
            <button class="pl-btn" onclick="togglePlannerShared()">${_view?.shared ? '🔓 Shared' : '🔒 Share'}</button>
            <button class="pl-btn" onclick="copyPlannerLink()">🔗 Link</button>
            <button class="pl-btn" onclick="plannerPushToWorkList('today')" title="Add every RO in YOUR Today bucket to your Manager Work List">➕ Today → Work List</button>
            <button class="pl-btn" onclick="plannerExportCSV()">⬇ CSV</button>
            <button class="pl-btn" onclick="plannerPrint()">🖨 Print</button>
            ${_view && _canEditView(_view) ? '<button class="pl-btn pl-btn-danger" onclick="deletePlannerView()" title="Delete this saved view">🗑</button>' : ''}
            <button class="pl-btn" onclick="newPlannerView()">✨ New</button>
        </div>
    </div>
    <div class="pl-filters">
        <div class="pl-frow">
            <span class="pl-flabel">Services</span>
            ${(SERVICE_SILOS || []).map(s => chip(f.silos.includes(s.key), `${s.emoji} ${_esc(s.label)}`, `plannerSetFilter('silos','${s.key}')`)).join('')}
            <select class="pl-select" onchange="plannerSetFilter('siloMode',this.value)">
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
                <div class="pl-popover">${PLANNER_STATUSES.map(s => chip(f.statuses.includes(s), _esc(s), `plannerSetFilter('statuses','${s}')`)).join('')}</div>
            </details>
            <span class="pl-flabel">Promised</span>
            <select class="pl-select" onchange="plannerSetFilter('promised',this.value)">${PROMISED_PRESETS.map(([k, l]) => `<option value="${k}"${f.promised === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
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
            ${[['parts_open', '🔩 Parts pending'], ['urgent', '🚨 Urgent update'], ['receivable', '💵 Open balance'], ['no_wo', '📭 No WO'], ['wo_open', '🛠 WO in progress'], ['vip', '⭐ VIP'], ['no_promised', '📆 No promise'], ['planned_any', '🗓 Has a plan'], ['planned_other', '👀 Planned by another silo']]
                .map(([k, l]) => chip(f.flags.includes(k), l, `plannerSetFilter('flags','${k}')`)).join('')}
        </div>
        <div class="pl-frow">
            <span class="pl-flabel">Days on lot ≥</span><input type="number" min="0" class="pl-input pl-num" value="${_esc(f.minDays)}" onchange="plannerSetFilter('minDays',this.value)">
            <span class="pl-flabel">$ ≥</span><input type="number" min="0" step="100" class="pl-input pl-num" value="${_esc(f.minDollars)}" onchange="plannerSetFilter('minDollars',this.value)">
            <span class="pl-flabel">Search</span><input type="search" class="pl-input" style="min-width:200px" placeholder="RO, customer, RV, VIN, tech, plan note…" value="${_esc(f.search)}" oninput="plannerSearch(this.value)">
            <details class="pl-details"><summary>columns — what else do you need to see?</summary>
                <div class="pl-popover">${COLUMNS.map(c => chip(_columns.includes(c.key), _esc(c.label), `plannerToggleColumn('${c.key}')`)).join('')}</div>
            </details>
            <button class="pl-btn pl-btn-sm" onclick="plannerResetFilters()">Reset filters</button>
        </div>
    </div>
    <div class="pl-buckets">
        ${[['all', 'All', '#94a3b8'], ...PLANNER_BUCKETS.map(b => [b.key, b.emoji + ' ' + b.label, b.color]), ['unplanned', 'Unplanned', '#64748b'], ['coord', '🤝 Needs coordination', '#f472b6']]
            .map(([k, l, c]) => `<button type="button" class="pl-tab${_bucketTab === k ? ' on' : ''}" style="--tab:${c}" onclick="plannerSetBucketTab('${k}')">${l} <b>${counts[k] || 0}</b></button>`).join('')}
        <span class="pl-summary">${counts.all} ROs · ${_fmtMoney(totalDollars)} · sort: <b>${_sort.key === 'manual' ? '✋ manual (drag rows)' : (COLUMNS.find(c => c.key === _sort.key)?.label || _sort.key) + (_sort.dir === 'asc' ? ' ↑' : ' ↓')}</b></span>
        <span class="pl-bulk">Set all shown → ${PLANNER_BUCKETS.map(b => `<button class="pl-btn pl-btn-sm" style="border-color:${b.color}" onclick="plannerBulkBucket('${b.key}')">${b.emoji} ${b.label}</button>`).join('')}<button class="pl-btn pl-btn-sm" onclick="plannerBulkBucket('')">clear</button></span>
    </div>`;
}

function _tableHtml(list) {
    if (!list.length) return '<div class="pl-empty">No ROs match these filters.<br><small>Loosen a filter, change the status preset, or check the bucket tab.</small></div>';
    const cols = COLUMNS.filter(c => _columns.includes(c.key));
    const th = cols.map(c => { const on = _sort.key === c.key; return `<th class="pl-th${on ? ' on' : ''}" onclick="plannerSort('${c.key}')">${_esc(c.label)}${on ? (_sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`; }).join('');
    return `<table class="pl-table"><thead><tr><th class="pl-th pl-th-grip${_sort.key === 'manual' ? ' on' : ''}" onclick="plannerSort('manual')" title="Manual order — drag rows">#</th>${th}<th></th></tr></thead>
        <tbody>${list.map((r, i) => _rowHtml(r, i, cols)).join('')}</tbody></table>`;
}

function _rowHtml(r, i, cols) {
    const e = _myEntry(r);
    const b = PLANNER_BUCKETS.find(x => x.key === e?.bucket);
    const tds = cols.map(c => `<td class="pl-td pl-td-${c.key}">${_cellHtml(c.key, r, e)}</td>`).join('');
    return `<tr class="pl-row${b ? ' pl-b-' + b.key : ''}${r.urgentUpdate ? ' pl-urgent' : ''}${_drawerRo === r._supabaseId ? ' pl-row-open' : ''}" data-idx="${i}" data-id="${r._supabaseId}" style="--bucket:${b ? b.color : 'transparent'}">
        <td class="pl-td pl-grip" draggable="true" title="Drag to reorder">⋮⋮ <span class="pl-num-cell">${i + 1}</span></td>${tds}
        <td class="pl-td pl-td-go"><button class="pl-btn pl-btn-sm" onclick="openPlannerDrawer('${r._supabaseId}')" title="All silos' plans, RO channel, audit">🔎 Plan</button> <button class="pl-btn pl-btn-sm" onclick="closePlanner();scrollToROInBoard('${r._supabaseId}')" title="Jump to this RO on the board">→ card</button></td></tr>`;
}

function _planChip(x) {
    const b = PLANNER_BUCKETS.find(y => y.key === x.bucket);
    const m = _siloMeta(x.service_silo);
    const dates = x.planned_start || x.planned_end ? ` ${_fmtDate(x.planned_start || x.planned_end)}${x.planned_end && x.planned_end !== x.planned_start ? '→' + _fmtDate(x.planned_end) : ''}` : '';
    const mine = _mySilos().includes(x.service_silo);
    return `<span class="pl-plan${mine ? ' mine' : ''}" style="--pc:${b ? b.color : '#475569'}" title="${_esc(m.label)} · ${b ? b.label : 'no bucket'}${dates} · ${_esc(_who(x.owner_email))}${x.source === 'admin_fyi' ? ' · FYI from admin' : ''}${x.note ? '\n' + _esc(x.note) : ''}">${m.emoji} ${b ? b.emoji : '·'}${dates} <i>${_initials(x.owner_email)}</i></span>`;
}

function _cellHtml(key, r, e) {
    const today = _todayISO();
    const id = r._supabaseId;
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
        case 'plans': { const es = _entriesFor(id); return es.length ? es.map(_planChip).join(' ') : '<span class="pl-muted">no plans</span>'; }
        case 'coord': {
            const cs = _conflicts(r); if (!cs.length) return '<span class="pl-muted">—</span>';
            const icon = { overlap: '⚠️', promise: '🔴', unplanned: '📭', request: '📣' };
            return `<span class="pl-coord" onclick="openPlannerDrawer('${id}')" title="${_esc(cs.map(c => c.text).join('\n'))}">${cs.map(c => `<span class="pl-cf pl-cf-${c.kind}">${icon[c.kind]} ${c.kind}</span>`).join(' ')}</span>`;
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
        case 'bucket': {
            if (!_editSiloFor(r)) return `<button class="pl-btn pl-btn-sm" onclick="openPlannerDrawer('${id}')" title="Multi-service RO — choose the service in the drawer">pick service…</button>`;
            const ro = e && !_canEditEntry(e);
            return `<select class="pl-select pl-bucket-sel" ${ro ? 'disabled' : ''} onchange="plannerSetBucket('${id}',this.value)" style="border-color:${PLANNER_BUCKETS.find(b => b.key === e?.bucket)?.color || '#334155'}">
                <option value=""${!e?.bucket ? ' selected' : ''}>—</option>
                ${PLANNER_BUCKETS.map(b => `<option value="${b.key}"${e?.bucket === b.key ? ' selected' : ''}>${b.emoji} ${b.label}</option>`).join('')}</select>`;
        }
        case 'dates': {
            if (!_editSiloFor(r)) return '<span class="pl-muted">—</span>';
            const ro = e && !_canEditEntry(e);
            return `<span class="pl-dates"><input type="date" class="pl-input pl-date" ${ro ? 'disabled' : ''} value="${_esc(e?.planned_start || '')}" onchange="plannerSetDates('${id}',this.value,this.nextElementSibling.nextElementSibling.value)"><span>→</span><input type="date" class="pl-input pl-date" ${ro ? 'disabled' : ''} value="${_esc(e?.planned_end || '')}" onchange="plannerSetDates('${id}',this.previousElementSibling.previousElementSibling.value,this.value)"></span>`;
        }
        case 'note': {
            if (!_editSiloFor(r)) return '<span class="pl-muted">—</span>';
            const ro = e && !_canEditEntry(e);
            return `<input class="pl-input pl-note" ${ro ? 'disabled' : ''} maxlength="200" placeholder="plan note…" value="${_esc(e?.note || '')}" onchange="plannerSetNote('${id}',this.value)">`;
        }
        default: return '';
    }
}

function _renderViewPicker() {
    const sel = document.getElementById('plannerViewPicker'); if (!sel) return;
    const me = _me();
    const mine = _savedViews.filter(v => (v.owner_email || '').toLowerCase() === me);
    const shared = _savedViews.filter(v => (v.owner_email || '').toLowerCase() !== me);
    sel.innerHTML = '<option value="">Open saved view…</option>'
        + (mine.length ? `<optgroup label="My views">${mine.map(v => `<option value="${v.id}">${_esc(v.name)}${v.shared ? ' 🔓' : ''}</option>`).join('')}</optgroup>` : '')
        + (shared.length ? `<optgroup label="Shared by others">${shared.map(v => `<option value="${v.id}">${_esc(v.name)} — ${_esc(_who(v.owner_email))}</option>`).join('')}</optgroup>` : '')
        + '<option value="__new">✨ New empty view</option>';
}

// ── Drill-down drawer: all silos' plans + RO channel + audit ───────────
export async function openPlannerDrawer(roUuid) {
    _drawerRo = roUuid;
    _renderDrawer();
    await _loadEvents(roUuid);
    _renderDrawer();
}
export function closePlannerDrawer() { _drawerRo = null; const d = document.getElementById('plannerDrawer'); if (d) d.classList.remove('open'); renderPlanner({ bodyOnly: true }); }

function _renderDrawer() {
    let d = document.getElementById('plannerDrawer');
    if (!d) { d = document.createElement('div'); d.id = 'plannerDrawer'; d.className = 'pl-drawer'; document.querySelector('#plannerOverlay .pl-shell')?.appendChild(d); }
    const r = _roByUuid(_drawerRo);
    if (!r) { d.classList.remove('open'); return; }
    d.classList.add('open');
    const es = _entriesFor(r._supabaseId), ms = _msgsFor(r._supabaseId), evs = _events[r._supabaseId] || [];
    const silos = _roSilos(r);
    const allSilos = (SERVICE_SILOS || []).map(s => s.key);
    const cs = _conflicts(r);
    const deadline = r.pickupDate || r.promisedDate;

    const entryCard = e => {
        const m = _siloMeta(e.service_silo); const b = PLANNER_BUCKETS.find(x => x.key === e.bucket);
        const can = _canEditEntry(e);
        return `<div class="pl-ecard" style="--pc:${b ? b.color : '#475569'}">
            <div class="pl-ecard-h"><b>${m.emoji} ${_esc(m.label)}</b> <span class="pl-muted">${_esc(_who(e.owner_email))}${e.source === 'admin_fyi' ? ' · 📌 FYI from admin' : ''} · ${e.status}</span>
                ${can ? `<button class="pl-btn pl-btn-sm pl-btn-danger" onclick="plannerDeleteEntry('${e.id}')" title="Remove this plan">✕</button>` : ''}</div>
            <div class="pl-ecard-b">
                <select class="pl-select pl-bucket-sel" ${can ? '' : 'disabled'} onchange="plannerUpsertEntry('${e.ro_uuid}','${e.service_silo}',{bucket:this.value})">
                    <option value=""${!e.bucket ? ' selected' : ''}>— bucket —</option>${PLANNER_BUCKETS.map(x => `<option value="${x.key}"${e.bucket === x.key ? ' selected' : ''}>${x.emoji} ${x.label}</option>`).join('')}</select>
                <input type="date" class="pl-input pl-date" ${can ? '' : 'disabled'} value="${_esc(e.planned_start || '')}" onchange="plannerUpsertEntry('${e.ro_uuid}','${e.service_silo}',{planned_start:this.value||null})"> →
                <input type="date" class="pl-input pl-date" ${can ? '' : 'disabled'} value="${_esc(e.planned_end || '')}" onchange="plannerUpsertEntry('${e.ro_uuid}','${e.service_silo}',{planned_end:this.value||null})">
                <select class="pl-select" ${can ? '' : 'disabled'} onchange="plannerUpsertEntry('${e.ro_uuid}','${e.service_silo}',{status:this.value})">${['planned', 'active', 'done', 'dropped'].map(s => `<option value="${s}"${e.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
            </div>
            <input class="pl-input pl-note" ${can ? '' : 'disabled'} maxlength="200" placeholder="plan note…" value="${_esc(e.note || '')}" onchange="plannerUpsertEntry('${e.ro_uuid}','${e.service_silo}',{note:this.value})">
        </div>`;
    };
    const missing = silos.filter(k => !es.some(e => e.service_silo === k));
    const addable = _isAdmin() ? allSilos.filter(k => !es.some(e => e.service_silo === k)) : missing.filter(_canPlanSilo);
    const msgHtml = m => {
        const k = MSG_KINDS[m.kind] || MSG_KINDS.message;
        const open = m.kind === 'request' && !m.resolved_at;
        const canResolve = open && (_isSr() || _mySilos().includes(m.to_silo) || (m.from_email || '').toLowerCase() === _me());
        return `<div class="pl-msg pl-msg-${m.kind}${open ? ' open' : ''}" style="--mc:${k.color}">
            <div class="pl-msg-h"><span class="pl-msg-kind">${k.emoji} ${k.label}</span> <b>${_esc(_who(m.from_email))}</b>${m.from_silo ? ` <span class="pl-muted">(${_esc(_siloMeta(m.from_silo).label)})</span>` : ''}${m.to_silo ? ` → <b>${_siloMeta(m.to_silo).emoji} ${_esc(_siloMeta(m.to_silo).label)}</b>` : ''} <span class="pl-muted">${_fmtWhen(m.created_at)}</span>
                ${m.resolved_at ? `<span class="pl-tag pl-tag-shared">resolved by ${_esc(_who(m.resolved_by))}</span>` : ''}</div>
            <div class="pl-msg-b">${_esc(m.body)}${m.proposed_date ? ` <span class="pl-msg-date">📅 ${_fmtDate(m.proposed_date)}</span>` : ''}</div>
            <div class="pl-msg-a">
                <button class="pl-btn pl-btn-sm" onclick="plannerReplyTo('${m.id}')">↩ Reply</button>
                ${canResolve ? `<button class="pl-btn pl-btn-sm" onclick="plannerResolveMessage('${m.id}')">✓ Resolve</button>` : ''}
            </div></div>`;
    };
    const evHtml = ev => {
        const who = _who(ev.actor_email); const t = ev.table_name === 'planner_entries' ? 'plan' : 'message';
        let what = ev.action.toLowerCase();
        if (ev.action === 'UPDATE' && ev.old_row && ev.new_row) {
            const diffs = Object.keys(ev.new_row).filter(k => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(ev.old_row[k]) !== JSON.stringify(ev.new_row[k]))
                .map(k => `${k}: ${_esc(String(ev.old_row[k] ?? '—')).slice(0, 40)} → ${_esc(String(ev.new_row[k] ?? '—')).slice(0, 40)}`);
            what = diffs.length ? diffs.join('; ') : 'touched';
        } else if (ev.action === 'INSERT' && ev.new_row) what = `created ${t}${ev.new_row.kind ? ' (' + ev.new_row.kind + ')' : ''}${ev.new_row.bucket ? ' bucket=' + ev.new_row.bucket : ''}`;
        else if (ev.action === 'DELETE') what = `removed ${t}`;
        return `<div class="pl-ev"><span class="pl-muted">${_fmtWhen(ev.created_at)}</span> <b>${_esc(who)}</b> <span class="pl-tag">${_esc(_siloMeta(ev.service_silo).label)}</span> ${what}</div>`;
    };
    const fromSilo = _isSr() ? (_filters.silos.length === 1 ? _filters.silos[0] : '') : (_mySilo() || '');

    d.innerHTML = `
    <div class="pl-drawer-h">
        <div><span class="pl-ro">${_esc(r.roId)}</span> <b>${_esc(r.customerName)}</b> <span class="pl-muted">${_esc(r.rv)}</span><br>
            <small class="pl-muted">${_esc(r.status)} · promised ${r.promisedDate ? _fmtDate(r.promisedDate) : '—'} · pickup ${r.pickupDate ? _fmtDate(r.pickupDate) : '—'} · ${silos.map(k => _siloMeta(k).emoji + ' ' + _esc(_siloMeta(k).label)).join(', ') || 'no services'}</small></div>
        <div><button class="pl-btn pl-btn-sm" onclick="closePlanner();scrollToROInBoard('${r._supabaseId}')">→ card</button> <button class="pl-close" onclick="closePlannerDrawer()">&times;</button></div>
    </div>
    <div class="pl-drawer-b">
        ${cs.length ? `<div class="pl-sec"><h4>🤝 Needs coordination</h4>${cs.map(c => `<div class="pl-cf-line pl-cf-${c.kind}">${{ overlap: '⚠️', promise: '🔴', unplanned: '📭', request: '📣' }[c.kind]} ${_esc(c.text)}</div>`).join('')}</div>` : ''}
        <div class="pl-sec"><h4>🗓 Plans by service <span class="pl-muted">(every manager sees all of these)</span></h4>
            ${es.length ? es.map(entryCard).join('') : '<div class="pl-muted">No silo has planned this RO yet.</div>'}
            ${addable.length ? `<div class="pl-addplan">Add plan for: ${addable.map(k => `<button class="pl-btn pl-btn-sm" onclick="plannerUpsertEntry('${r._supabaseId}','${k}',{},{fyi:${_isAdmin() && !silos.includes(k)}})">${_siloMeta(k).emoji} ${_esc(_siloMeta(k).label)}${_isAdmin() && !silos.includes(k) ? ' (FYI)' : ''}</button>`).join(' ')}</div>` : ''}
            ${_isAdmin() && es.length ? `<div class="pl-addplan">📌 Admin FYI to: ${allSilos.filter(k => !es.some(e => e.service_silo === k)).map(k => `<button class="pl-btn pl-btn-sm" onclick="plannerAdminFyi('${r._supabaseId}','${k}')">${_siloMeta(k).emoji} ${_esc(_siloMeta(k).label)}</button>`).join(' ')}</div>` : ''}
        </div>
        <div class="pl-sec"><h4>💬 RO channel <span class="pl-muted">${ms.length} message${ms.length === 1 ? '' : 's'}</span></h4>
            <div class="pl-thread">${ms.length ? ms.map(msgHtml).join('') : '<div class="pl-muted">No messages yet. Ask another silo for a date, or post an update.</div>'}</div>
            <div class="pl-compose" id="plannerCompose">
                <input type="hidden" id="plComposeParent" value="">
                <div class="pl-frow">
                    <select id="plComposeKind" class="pl-select" onchange="document.getElementById('plComposeTo').style.display=this.value==='request'?'':'none'">
                        <option value="message">💬 Message</option><option value="request">📣 Request update from…</option></select>
                    <select id="plComposeTo" class="pl-select" style="display:none">${allSilos.filter(k => k !== fromSilo).map(k => `<option value="${k}"${silos.includes(k) ? '' : ' style="color:#64748b"'}>${_siloMeta(k).emoji} ${_esc(_siloMeta(k).label)}</option>`).join('')}</select>
                    <input type="date" id="plComposeDate" class="pl-input pl-date" title="Proposed / requested date">
                    <span class="pl-muted" style="font-size:0.72rem">as ${fromSilo ? _siloMeta(fromSilo).emoji + ' ' + _esc(_siloMeta(fromSilo).label) : (_isAdmin() ? 'Admin' : 'Sr Manager')}</span>
                </div>
                <div class="pl-frow"><input id="plComposeBody" class="pl-input" style="flex:1" maxlength="600" placeholder="e.g. Roof — what day can Solar have the roof for panel install?" onkeydown="if(event.key==='Enter'){plannerSend('${r._supabaseId}')}">
                    <button class="pl-btn pl-btn-primary" onclick="plannerSend('${r._supabaseId}')">Send</button></div>
                <div id="plComposeReplyTo" class="pl-muted" style="font-size:0.72rem"></div>
            </div>
        </div>
        <details class="pl-sec"><summary>📜 Audit trail (${evs.length})</summary>${evs.length ? evs.map(evHtml).join('') : '<div class="pl-muted">Nothing yet.</div>'}</details>
    </div>`;
}

export function plannerReplyTo(msgId) {
    const m = Object.values(_msgs).flat().find(x => x.id === msgId); if (!m) return;
    const p = document.getElementById('plComposeParent'), k = document.getElementById('plComposeKind'), t = document.getElementById('plComposeTo'), b = document.getElementById('plComposeBody'), lbl = document.getElementById('plComposeReplyTo');
    if (!p) return;
    p.value = msgId; k.value = 'message'; t.style.display = 'none';
    lbl.textContent = `Replying to ${_who(m.from_email)}: "${m.body.slice(0, 60)}"`;
    b.focus();
}
export async function plannerSend(roUuid) {
    const kind = document.getElementById('plComposeKind')?.value || 'message';
    const to = document.getElementById('plComposeTo')?.value || null;
    const date = document.getElementById('plComposeDate')?.value || null;
    const body = (document.getElementById('plComposeBody')?.value || '').trim();
    const parent = document.getElementById('plComposeParent')?.value || null;
    if (!body) { showToast('Type a message first.', 'info'); return; }
    const m = { kind: parent ? 'reply' : kind, to_silo: kind === 'request' ? to : null, proposed_date: date, body, parent_id: parent };
    if (parent) { const pm = Object.values(_msgs).flat().find(x => x.id === parent); if (pm) m.to_silo = pm.from_silo || null; }
    const ok = await _postMessage(roUuid, m);
    if (ok) await _refreshRo(roUuid);
}
export async function plannerAdminFyi(roUuid, silo) {
    if (!_isAdmin()) return;
    const body = prompt(`FYI note for the ${_siloMeta(silo).label} manager (why this RO needs their attention):`, '');
    if (body === null) return;
    const lead = (window._staffCache || []).find(s => s.active && (s.role === 'manager' || s.role === 'sr_manager') && s.service_silo === silo);
    await plannerUpsertEntry(roUuid, silo, {}, { fyi: true, owner: lead?.email || _me(), body: body || `${_who(_me())} flagged this RO for ${_siloMeta(silo).label} (FYI).` });
}

// ── Drag & drop (mouse + touch on the grip cell) ───────────────────────
function _wireDrag(body) {
    const rows = Array.from(body.querySelectorAll('tr.pl-row'));
    let srcIdx = null, touchDest = null;
    rows.forEach(row => {
        const grip = row.querySelector('.pl-grip'); if (!grip) return;
        grip.addEventListener('dragstart', e => {
            srcIdx = parseInt(row.dataset.idx);
            if (e.dataTransfer) { e.dataTransfer.setData('text/plain', row.dataset.id || String(srcIdx)); e.dataTransfer.effectAllowed = 'move'; }
            row.classList.add('dragging');
        });
        grip.addEventListener('dragend', () => { row.classList.remove('dragging'); rows.forEach(r => r.classList.remove('over')); });
        row.addEventListener('dragover', e => { if (srcIdx === null) return; e.preventDefault(); row.classList.add('over'); });
        row.addEventListener('dragleave', () => row.classList.remove('over'));
        row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('over'); _reorder(srcIdx, parseInt(row.dataset.idx)); srcIdx = null; });
        grip.addEventListener('touchstart', () => { srcIdx = parseInt(row.dataset.idx); touchDest = null; row.classList.add('dragging'); }, { passive: true });
        grip.addEventListener('touchmove', e => {
            if (srcIdx === null) return; e.preventDefault();
            const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY);
            const over = el && el.closest ? el.closest('tr.pl-row') : null;
            rows.forEach(r => r.classList.remove('over'));
            if (over && over !== row) { over.classList.add('over'); touchDest = parseInt(over.dataset.idx); } else touchDest = null;
        }, { passive: false });
        grip.addEventListener('touchend', () => { row.classList.remove('dragging'); rows.forEach(r => r.classList.remove('over')); _reorder(srcIdx, touchDest); srcIdx = null; touchDest = null; });
    });
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) { if (_drawerRo) closePlannerDrawer(); else closePlanner(); } });

// ── Window bridge ──────────────────────────────────────────────────────
Object.assign(window, {
    openPlanner, closePlanner, renderPlanner, _initPlannerBtn,
    plannerSetFilter, plannerSearch, plannerResetFilters, plannerSort, plannerToggleColumn, plannerSetBucketTab,
    plannerSetBucket, plannerSetDates, plannerSetNote, plannerBulkBucket,
    plannerUpsertEntry, plannerDeleteEntry, plannerResolveMessage, plannerReplyTo, plannerSend, plannerAdminFyi,
    openPlannerDrawer, closePlannerDrawer,
    loadPlannerView, savePlannerView, deletePlannerView, togglePlannerShared, copyPlannerLink, newPlannerView,
    plannerPushToWorkList, plannerExportCSV, plannerPrint,
});
