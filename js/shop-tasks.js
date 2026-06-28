// ============================================================
// js/shop-tasks.js — [ER 1fe68261 S128] Internal Shop Task tracker
//
// A standalone checklist for non-customer shop tasks (swap poly barrels, prep
// roof bays, etc.) — deliberately NOT an RO/WO/silo, so it never touches the
// board, Weekly P&L, or parts attribution. Backed by the shop_tasks table
// (migration shop_tasks.sql). Tasks can optionally be assigned to a staff
// member and/or a service silo. Slide-in panel modeled on the Work List.
//
// CROSS-MODULE globals (resolved via the shared global lexical env, same as the
// other modules): getSB, supabaseSession, _staffCache, SERVICE_SILOS,
// escapeHtml, showToast, isAdmin, hasRole.
// ============================================================

        let _shopTasks     = [];
        let _shopTasksOpen = false;
        let _shopShowDone  = false;

        // Who can see + manage the Shop Tasks list (managers, sr-managers,
        // parts managers, admins). Mirrors the Work List audience + parts mgrs.
        export function canSeeShopTasks() {
            return (typeof isAdmin === 'function' && isAdmin())
                || (typeof hasRole === 'function' && (hasRole('Manager') || hasRole('Sr Manager') || hasRole('Parts Manager')));
        }

        export function _initShopTasksBtn() {
            const btn = document.getElementById('shopTasksBtn');
            if (btn && canSeeShopTasks()) btn.style.display = '';
        }

        export function toggleShopTasksPanel() {
            const panel    = document.getElementById('shopTasksPanel');
            const backdrop = document.getElementById('shopTasksBackdrop');
            if (!panel) return;
            _shopTasksOpen = !_shopTasksOpen;
            panel.style.right = _shopTasksOpen ? '0px' : '-420px';
            if (backdrop) backdrop.style.display = _shopTasksOpen ? 'block' : 'none';
            if (_shopTasksOpen) loadShopTasks();
        }

        export async function loadShopTasks() {
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            try {
                const { data, error } = await sb
                    .from('shop_tasks')
                    .select('*')
                    .order('status', { ascending: true })       // open before done
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true });
                if (error) throw error;
                _shopTasks = data || [];
                renderShopTasks();
            } catch (err) {
                console.error('[ShopTasks] load error:', err);
                showToast('Error loading Shop Tasks: ' + (err.message || err), 'error');
            }
        }

        function _staffName(email) {
            if (!email) return '';
            const s = (_staffCache || []).find(x => x.email === email);
            return s ? (s.name || email) : email;
        }
        function _siloChip(key) {
            if (!key) return '';
            const s = (SERVICE_SILOS || []).find(x => x.key === key);
            return s ? `${s.emoji} ${s.label}` : key;
        }

        export function renderShopTasks() {
            const body = document.getElementById('shopTasksBody');
            if (!body) return;

            const open = _shopTasks.filter(t => t.status !== 'done');
            const done = _shopTasks.filter(t => t.status === 'done');

            // Assignee + silo option lists for the add form
            const staffOpts = (_staffCache || [])
                .filter(s => s.active !== false && s.email)
                .map(s => `<option value="${escapeHtml(s.email)}">${escapeHtml(s.name || s.email)}</option>`)
                .join('');
            const siloOpts = (SERVICE_SILOS || [])
                .map(s => `<option value="${s.key}">${s.emoji} ${escapeHtml(s.label)}</option>`)
                .join('');

            const inputStyle = 'width:100%;padding:8px 10px;background:#1e293b;color:#e6edf7;border:1px solid #334155;border-radius:6px;font-size:0.85rem;margin-bottom:7px;';

            const addForm = `
                <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:12px;margin-bottom:14px;">
                    <div style="color:#93c5fd;font-size:0.78rem;font-weight:700;margin-bottom:8px;">+ Add a shop task</div>
                    <input id="stTitle" placeholder="Task (e.g. Swap poly barrels)" style="${inputStyle}" maxlength="200">
                    <input id="stDetails" placeholder="Details (optional)" style="${inputStyle}" maxlength="500">
                    <select id="stAssignee" style="${inputStyle}"><option value="">👤 Unassigned</option>${staffOpts}</select>
                    <select id="stSilo" style="${inputStyle}"><option value="">🏷 No silo</option>${siloOpts}</select>
                    <button onclick="addShopTask()" style="width:100%;padding:9px;background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:700;">Add Task</button>
                </div>`;

            const openRows = open.length
                ? open.map(t => _openRow(t)).join('')
                : `<div style="color:#6b7280;font-size:0.82rem;font-style:italic;padding:8px 2px;">No open shop tasks. 🎉</div>`;

            const doneToggle = `
                <div onclick="toggleShopDone()" style="margin-top:14px;color:#93c5fd;font-size:0.78rem;cursor:pointer;user-select:none;border-top:1px solid #1e3a5f;padding-top:10px;">
                    ${_shopShowDone ? '▼' : '►'} Completed (${done.length})
                </div>`;
            const doneRows = (_shopShowDone && done.length)
                ? `<div style="margin-top:8px;">${done.map(t => _doneRow(t)).join('')}</div>`
                : '';

            body.innerHTML = addForm
                + `<div style="color:#93c5fd;font-size:0.78rem;font-weight:700;margin-bottom:8px;">Open (${open.length})</div>`
                + openRows + doneToggle + doneRows;
        }

        function _chips(t) {
            const a = t.assigned_to ? `<span style="background:#1e3a5f;color:#bfdbfe;font-size:0.7rem;padding:2px 7px;border-radius:10px;">👤 ${escapeHtml(_staffName(t.assigned_to))}</span>` : '';
            const s = t.assigned_silo ? `<span style="background:#0f3a2e;color:#86efac;font-size:0.7rem;padding:2px 7px;border-radius:10px;">${escapeHtml(_siloChip(t.assigned_silo))}</span>` : '';
            return (a || s) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;">${a}${s}</div>` : '';
        }
        function _openRow(t) {
            const created = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return `
                <div style="background:#111827;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
                    <div style="color:#e6edf7;font-size:0.9rem;font-weight:600;">${escapeHtml(t.title || '')}</div>
                    ${t.details ? `<div style="color:#9aa6b8;font-size:0.8rem;margin-top:2px;">${escapeHtml(t.details)}</div>` : ''}
                    ${_chips(t)}
                    <div style="color:#6b7280;font-size:0.68rem;margin-top:6px;">added ${escapeHtml(_staffName(t.created_by) || '—')}${created ? ' · ' + created : ''}</div>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <button onclick="completeShopTask('${t.id}')" style="flex:1;padding:6px;background:#16a34a;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:700;">✓ Done</button>
                        <button onclick="deleteShopTask('${t.id}')" title="Delete" style="padding:6px 10px;background:#374151;color:#fca5a5;border:none;border-radius:5px;cursor:pointer;font-size:0.78rem;">🗑</button>
                    </div>
                </div>`;
        }
        function _doneRow(t) {
            const when = t.completed_at ? new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return `
                <div style="background:#0b1220;border:1px solid #1e293b;border-radius:8px;padding:9px 12px;margin-bottom:7px;opacity:0.85;">
                    <div style="color:#94a3b8;font-size:0.86rem;text-decoration:line-through;">${escapeHtml(t.title || '')}</div>
                    <div style="color:#64748b;font-size:0.68rem;margin-top:4px;">done ${escapeHtml(_staffName(t.completed_by) || '—')}${when ? ' · ' + when : ''}</div>
                    <div style="display:flex;gap:6px;margin-top:7px;">
                        <button onclick="reopenShopTask('${t.id}')" style="flex:1;padding:5px;background:#334155;color:#cbd5e1;border:none;border-radius:5px;cursor:pointer;font-size:0.74rem;">↩ Reopen</button>
                        <button onclick="deleteShopTask('${t.id}')" title="Delete" style="padding:5px 10px;background:#374151;color:#fca5a5;border:none;border-radius:5px;cursor:pointer;font-size:0.74rem;">🗑</button>
                    </div>
                </div>`;
        }

        export function toggleShopDone() {
            _shopShowDone = !_shopShowDone;
            renderShopTasks();
        }

        export async function addShopTask() {
            const titleEl = document.getElementById('stTitle');
            const title = (titleEl?.value || '').trim();
            if (!title) { showToast('Enter a task first.', 'warning'); return; }
            const details  = (document.getElementById('stDetails')?.value || '').trim() || null;
            const assignee = document.getElementById('stAssignee')?.value || null;
            const silo     = document.getElementById('stSilo')?.value || null;
            const myEmail  = supabaseSession?.user?.email || '';
            const nextSort = _shopTasks.length ? Math.max(..._shopTasks.map(t => t.sort_order || 0)) + 1 : 1;
            try {
                const { error } = await getSB().from('shop_tasks').insert({
                    title,
                    details,
                    assigned_to:   assignee || null,
                    assigned_silo: silo || null,
                    sort_order:    nextSort,
                    created_by:    myEmail,
                });
                if (error) throw error;
                showToast('Shop task added.', 'success');
                await loadShopTasks();
            } catch (err) {
                console.error('[ShopTasks] add error:', err);
                showToast('Error adding task: ' + (err.message || err), 'error');
            }
        }

        export async function completeShopTask(id) {
            try {
                const { error } = await getSB().from('shop_tasks')
                    .update({ status: 'done', completed_by: supabaseSession?.user?.email || '', completed_at: new Date().toISOString() })
                    .eq('id', id);
                if (error) throw error;
                await loadShopTasks();
            } catch (err) {
                console.error('[ShopTasks] complete error:', err);
                showToast('Error: ' + (err.message || err), 'error');
            }
        }

        export async function reopenShopTask(id) {
            try {
                const { error } = await getSB().from('shop_tasks')
                    .update({ status: 'open', completed_by: null, completed_at: null })
                    .eq('id', id);
                if (error) throw error;
                await loadShopTasks();
            } catch (err) {
                console.error('[ShopTasks] reopen error:', err);
                showToast('Error: ' + (err.message || err), 'error');
            }
        }

        export async function deleteShopTask(id) {
            try {
                const { error } = await getSB().from('shop_tasks').delete().eq('id', id);
                if (error) throw error;
                _shopTasks = _shopTasks.filter(t => t.id !== id);
                renderShopTasks();
            } catch (err) {
                console.error('[ShopTasks] delete error:', err);
                showToast('Error deleting task: ' + (err.message || err), 'error');
            }
        }

Object.assign(window, {
    canSeeShopTasks, _initShopTasksBtn, toggleShopTasksPanel, loadShopTasks,
    renderShopTasks, toggleShopDone, addShopTask, completeShopTask,
    reopenShopTask, deleteShopTask,
});
