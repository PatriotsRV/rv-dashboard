// js/work-list.js - Phase 14 (ADDITIVE): Manager Work List sidebar (GH#16).
// v1.439 (Session 89, 2026-06-03).
//
// Extracted VERBATIM from the index.html inline <script> (13 functions):
//   daysSinceAddedToWorkList, toggleWorkListPanel, _populateManagerPicker, loadWorkList, addToWorkList, _showSiloPickerForAdd, _addToWorkListWithSilo, removeFromWorkList, _saveWorkListOrder, _initWorkListBtn, _renderWorkListSiloTabs, _setWorkListSilo, renderWorkList.
//
// ADDITIVE PHASE - the inline copies of all 13 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.* to these byte-identical copies
// (only an `export` keyword inserted after the indent; no reference rewriting). Every
// bare reference resolves through the SHARED global environment to the SAME symbol the
// inline copy uses:
//   - inline `let` work-list state (_workListOpen, _workListData, _workListViewEmail)
//     stays inline and is read/written across the boundary via the shared global lexical
//     environment (same mechanism Phase 7 currentData + Phase 11 timeLogsData rely on);
//   - the legacy alias isSrOrAdmin stays inline (NOT extracted), reached via window.*;
//   - inline state/helpers (currentData, currentFilteredData, getSB, supabaseSession,
//     isAdmin, hasRole, canSeeWorkList, escapeHtml, showToast, renderBoard,
//     scrollToROInBoard, SERVICE_SILOS, ...) via the global env / window bridges.
//
// CROSS-MODULE: bare loadWorkList + toggleWorkListPanel call sites elsewhere resolve to
// these module copies via the window bridge below.
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 14
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.



        export function daysSinceAddedToWorkList(item) {
            if (!item || !item.created_at) return 0;
            const added = new Date(item.created_at);
            const today = new Date();
            return Math.floor(Math.abs(today - added) / (1000 * 60 * 60 * 24));
        }

        export function toggleWorkListPanel() {
            _workListOpen = !_workListOpen;
            const panel = document.getElementById('workListPanel');
            const backdrop = document.getElementById('workListBackdrop');
            if (!panel) return;
            if (_workListOpen) {
                panel.style.right = '0';
                backdrop.style.display = 'block';
                _populateManagerPicker();
                loadWorkList(null);
            } else {
                panel.style.right = '-370px';
                backdrop.style.display = 'none';
            }
        }

        export function _populateManagerPicker() {
            const bar = document.getElementById('workListManagerBar');
            const sel = document.getElementById('workListManagerSelect');
            if (!bar || !sel) return;
            if (!isSrOrAdmin()) { bar.style.display = 'none'; return; }
            bar.style.display = 'block';
            const managerStaff = (_staffCache || []).filter(s =>
                s.active && (s.role === 'manager' || s.role === 'sr_manager')
            );
            const myEmail = supabaseSession?.user?.email || '';
            sel.innerHTML = '<option value="">— My List —</option>' +
                managerStaff.filter(s => s.email !== myEmail).map(s =>
                    `<option value="${escapeHtml(s.email)}">${escapeHtml(s.name)} (${escapeHtml(s.email)})</option>`
                ).join('');
            sel.value = _workListViewEmail || '';
        }

        export async function loadWorkList(viewEmail) {
            _workListViewEmail = viewEmail || null;
            _workListActiveSilo = null; // reset silo filter when switching managers
            const myEmail = supabaseSession?.user?.email || '';
            const targetEmail = _workListViewEmail || myEmail;
            const subtitle = document.getElementById('workListSubtitle');
            if (subtitle) subtitle.textContent = _workListViewEmail ? `Viewing: ${_workListViewEmail}` : '';
            try {
                const { data, error } = await getSB()
                    .from('manager_work_lists')
                    .select('*')
                    .eq('manager_email', targetEmail)
                    .order('priority', { ascending: true });
                if (error) throw error;
                _workListData = data || [];
                _renderWorkListSiloTabs();
                renderWorkList();
            } catch (err) {
                console.error('[WorkList] load error:', err);
                const body = document.getElementById('workListBody');
                if (body) body.innerHTML = '<p style="color:#ef4444;padding:12px;">Error loading list.</p>';
            }
        }

        export async function addToWorkList(supabaseId) {
            const ro = currentData.find(r => r._supabaseId === supabaseId);
            if (!ro) { showToast('Could not find RO data. Try refreshing.', 'warning'); return; }
            const myEmail = supabaseSession?.user?.email || '';
            const roId = supabaseId;
            const roName = (ro.customerName || 'Unknown') + ' — ' + (ro.roNumber || '');

            // For Sr Managers/Admins, show silo picker; otherwise add with service_silo = null
            if (isSrOrAdmin()) {
                _showSiloPickerForAdd(roId, roName);
            } else {
                _addToWorkListWithSilo(roId, roName, null);
            }
        }

        export function _showSiloPickerForAdd(roId, roName) {
            // Identify which silos already have this RO
            const existingSilos = new Set(_workListData.filter(item => item.ro_id === roId).map(item => item.service_silo));

            // If ALL 8 silos already have this RO, nothing left to add
            if (existingSilos.size >= SERVICE_SILOS.length) {
                showToast('This RO is already on your Work List in every silo.', 'info');
                return;
            }

            // Create modal overlay
            const modal = document.createElement('div');
            modal.id = 'siloPickerModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:12500;';

            const inner = document.createElement('div');
            inner.style.cssText = 'background:#1e293b;border:2px solid #3b82f6;border-radius:12px;padding:24px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.8);';

            const title = document.createElement('div');
            title.style.cssText = 'color:white;font-size:1.1rem;font-weight:700;margin-bottom:16px;';
            title.textContent = 'Select Service Silo';
            inner.appendChild(title);

            const desc = document.createElement('div');
            desc.style.cssText = 'color:#cbd5e1;font-size:0.85rem;margin-bottom:16px;line-height:1.5;';
            desc.textContent = 'Which silo should this RO be assigned to? You can add it to multiple silos.';
            inner.appendChild(desc);

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';

            SERVICE_SILOS.forEach(silo => {
                const alreadyAdded = existingSilos.has(silo.key);
                const btn = document.createElement('button');
                if (alreadyAdded) {
                    btn.style.cssText = 'padding:12px 14px;background:#1a2e1a;border:1px solid #22c55e;color:#6b7280;border-radius:6px;font-size:0.9rem;text-align:left;cursor:default;opacity:0.7;';
                    btn.innerHTML = `<span style="font-size:1.2rem;margin-right:8px;">${silo.emoji}</span>${silo.label} <span style="color:#22c55e;font-size:0.75rem;margin-left:8px;">Already added</span>`;
                } else {
                    btn.style.cssText = 'padding:12px 14px;background:#0f172a;border:1px solid #334155;color:white;border-radius:6px;cursor:pointer;font-size:0.9rem;transition:all 0.2s;text-align:left;';
                    btn.innerHTML = `<span style="font-size:1.2rem;margin-right:8px;">${silo.emoji}</span>${silo.label}`;
                    btn.onmouseover = () => { btn.style.borderColor = '#3b82f6'; btn.style.background = '#1e2a47'; };
                    btn.onmouseout = () => { btn.style.borderColor = '#334155'; btn.style.background = '#0f172a'; };
                    btn.onclick = async () => {
                        document.body.removeChild(modal);
                        await _addToWorkListWithSilo(roId, roName, silo.key);
                    };
                }
                btnContainer.appendChild(btn);
            });
            inner.appendChild(btnContainer);

            const cancelBtn = document.createElement('button');
            cancelBtn.style.cssText = 'width:100%;padding:10px 14px;background:#334155;border:none;color:white;border-radius:6px;cursor:pointer;font-size:0.85rem;';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => {
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                }
            };
            inner.appendChild(cancelBtn);

            modal.appendChild(inner);
            document.body.appendChild(modal);
        }

        export async function _addToWorkListWithSilo(roId, roName, serviceSilo) {
            const myEmail = supabaseSession?.user?.email || '';
            const priority = _workListData.length > 0 ? Math.max(..._workListData.map(d => d.priority)) + 1 : 1;
            try {
                const insertData = {
                    manager_email: myEmail,
                    ro_id: roId,
                    ro_name: roName,
                    priority,
                    service_silo: serviceSilo  // null for regular managers, silo key for Sr Managers
                };
                const { error } = await getSB()
                    .from('manager_work_lists')
                    .insert(insertData);
                if (error) throw error;
                if (!_workListOpen) toggleWorkListPanel();
                else if (!_workListViewEmail) await loadWorkList(null);
            } catch (err) {
                console.error('[WorkList] add error:', err);
                showToast('Error adding to Work List: ' + (err.message || err), 'error');
            }
        }

        export async function removeFromWorkList(itemId) {
            try {
                const { error } = await getSB()
                    .from('manager_work_lists')
                    .delete()
                    .eq('id', itemId);
                if (error) throw error;
                _workListData = _workListData.filter(d => d.id !== itemId);
                renderWorkList();
            } catch (err) {
                console.error('[WorkList] remove error:', err);
                showToast('Error removing Work List item: ' + (err.message || err), 'error');
            }
        }

        export async function _saveWorkListOrder() {
            for (let i = 0; i < _workListData.length; i++) {
                await getSB().from('manager_work_lists')
                    .update({ priority: i + 1 })
                    .eq('id', _workListData[i].id);
            }
        }

        export function _initWorkListBtn() {
            const btn = document.getElementById('workListBtn');
            if (btn && canSeeWorkList()) btn.style.display = '';
        }

        export function _renderWorkListSiloTabs() {
            const tabsContainer = document.getElementById('workListSiloTabs');
            if (!tabsContainer) return;

            // Show tabs for Sr Manager/Admin lists (always — even when empty, so the silo structure is clear)
            const targetEmail = _workListViewEmail || supabaseSession?.user?.email || '';
            const targetStaff = (_staffCache || []).find(s => s.email === targetEmail);
            const isSrManagerList = _workListViewEmail
                ? (targetStaff && targetStaff.role === 'sr_manager')
                : isSrOrAdmin();

            if (!isSrManagerList) {
                tabsContainer.style.display = 'none';
                _workListActiveSilo = null; // reset silo filter when viewing regular manager
                return;
            }

            tabsContainer.style.display = 'flex';

            // Build tab buttons
            const tabs = [
                { key: 'all', label: 'All', emoji: '' },
                ...SERVICE_SILOS
            ];

            tabsContainer.innerHTML = tabs.map(tab => {
                const isActive = _workListActiveSilo === tab.key || (tab.key === 'all' && !_workListActiveSilo);
                const activeStyle = isActive
                    ? 'background:#3b82f6;color:white;border-color:#3b82f6;'
                    : 'background:#0f172a;color:#93c5fd;border-color:#334155;';
                const label = tab.key === 'all' ? 'All' : `${tab.emoji} ${tab.label}`;
                return `<button
                    class="wl-silo-tab"
                    onclick="_setWorkListSilo('${tab.key}')"
                    style="padding:8px 12px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#93c5fd;cursor:pointer;font-size:0.8rem;white-space:nowrap;flex-shrink:0;transition:all 0.2s;${activeStyle}"
                    title="Filter by ${label}"
                >${label}</button>`;
            }).join('');
        }

        export function _setWorkListSilo(siloKey) {
            _workListActiveSilo = siloKey === 'all' ? null : siloKey;
            renderWorkList();
            _renderWorkListSiloTabs();
        }

        export function renderWorkList() {
            const body = document.getElementById('workListBody');
            if (!body) return;

            // Filter items by active silo (if any)
            let filteredData = _workListData;
            if (_workListActiveSilo && _workListActiveSilo !== 'all') {
                filteredData = _workListData.filter(item => item.service_silo === _workListActiveSilo);
            }

            // Empty state with context-aware message
            if (filteredData.length === 0) {
                let msg = 'No ROs on your list yet.';
                if (_workListActiveSilo && _workListActiveSilo !== 'all') {
                    const silo = SERVICE_SILOS.find(s => s.key === _workListActiveSilo);
                    if (silo) msg = `No ROs in ${silo.emoji} ${silo.label} queue`;
                }
                body.innerHTML = `<p style=”color:#6b7280;padding:16px;text-align:center;font-size:0.9rem;”>${msg}<br><br>Use “&#128203; Add to My List” on any RO card.</p>`;
                return;
            }

            // Build rows from filtered data — use DOM construction to avoid inline onclick quoting issues
            body.innerHTML = '';
            filteredData.forEach((item, displayIdx) => {
                // Get silo tag if applicable
                let siloTag = '';
                if (item.service_silo) {
                    const silo = SERVICE_SILOS.find(s => s.key === item.service_silo);
                    if (silo) {
                        siloTag = `<span style=”display:inline-block;background:#0f172a;border:1px solid #334155;color:#93c5fd;padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-right:6px;white-space:nowrap;”>${silo.emoji} ${silo.label}</span>`;
                    }
                }

                const row = document.createElement('div');
                row.className = 'wl-row';
                row.draggable = true;
                row.dataset.idx = displayIdx;
                row.dataset.id = item.id;
                row.dataset.roId = item.ro_id;
                row.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;margin-bottom:8px;padding:10px 12px;cursor:grab;display:flex;align-items:center;gap:8px;';

                // Priority number
                const numSpan = document.createElement('span');
                numSpan.style.cssText = 'color:#6b7280;font-size:0.8rem;min-width:20px;font-weight:700;';
                numSpan.textContent = (displayIdx + 1) + '.';
                row.appendChild(numSpan);

                // Silo tag (if any)
                if (siloTag) {
                    const siloEl = document.createElement('span');
                    siloEl.innerHTML = siloTag;
                    row.appendChild(siloEl.firstChild);
                }

                // RO name (clickable to scroll)
                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = 'flex:1;color:white;font-size:0.85rem;cursor:pointer;line-height:1.3;';
                nameSpan.title = 'Click to scroll to this RO';
                nameSpan.textContent = item.ro_name;
                nameSpan.addEventListener('click', () => scrollToROInBoard(item.ro_id));
                row.appendChild(nameSpan);

                // v1.414 Phase A1: missing-WO pill — escalates with days-since-added-to-list
                const linkedRo = currentData.find(r => r._supabaseId === item.ro_id);
                if (linkedRo) {
                    const daysOnList = daysSinceAddedToWorkList(item);
                    const pillHtml = woMissingPill(linkedRo, daysOnList);
                    if (pillHtml) {
                        const pillWrap = document.createElement('span');
                        pillWrap.innerHTML = pillHtml;
                        if (pillWrap.firstChild) row.appendChild(pillWrap.firstChild);
                    }
                }

                // Remove button
                const removeBtn = document.createElement('button');
                removeBtn.style.cssText = 'background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.1rem;padding:2px 6px;line-height:1;';
                removeBtn.title = 'Remove from list';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', () => removeFromWorkList(item.id));
                row.appendChild(removeBtn);

                body.appendChild(row);
            });

            // Drag-and-drop reorder (within filtered view).
            // [ER fd6c122d S120] Desktop uses HTML5 drag events; phones/tablets get the
            // equivalent via touchstart/move/end (HTML5 DnD does not fire on touch, which
            // is why drag-drop "didn't work on the phone"). Both paths funnel into the
            // shared _reorderWorkList() so behavior stays identical.
            const rows = body.querySelectorAll('.wl-row');
            let dragSrcIdx = null;
            let dragSrcId = null;
            let touchDestIdx = null;

            // Map a display index (within the current silo filter) to its index in
            // _workListData, then move the item and persist. Shared by mouse + touch.
            const _reorderWorkList = (srcDisplayIdx, destDisplayIdx) => {
                if (srcDisplayIdx === null || destDisplayIdx === null || srcDisplayIdx === destDisplayIdx) return;
                const filteredIndices = _workListData
                    .map((item, idx) => ({
                        idx,
                        matches: _workListActiveSilo && _workListActiveSilo !== 'all'
                            ? item.service_silo === _workListActiveSilo
                            : true
                    }))
                    .filter(x => x.matches)
                    .map(x => x.idx);
                const srcOriginalIdx = filteredIndices[srcDisplayIdx];
                const destOriginalIdx = filteredIndices[destDisplayIdx];
                if (srcOriginalIdx !== undefined && destOriginalIdx !== undefined) {
                    const moved = _workListData.splice(srcOriginalIdx, 1)[0];
                    _workListData.splice(destOriginalIdx, 0, moved);
                    renderWorkList();
                    _saveWorkListOrder();
                }
            };

            rows.forEach(row => {
                // ── Desktop (mouse) ──
                row.addEventListener('dragstart', () => {
                    dragSrcIdx = parseInt(row.dataset.idx);
                    dragSrcId = row.dataset.id;
                    row.style.opacity = '0.4';
                });
                row.addEventListener('dragend', () => { row.style.opacity = '1'; });
                row.addEventListener('dragover', e => { e.preventDefault(); row.style.borderColor = '#3b82f6'; });
                row.addEventListener('dragleave', () => { row.style.borderColor = '#334155'; });
                row.addEventListener('drop', e => {
                    e.preventDefault();
                    row.style.borderColor = '#334155';
                    _reorderWorkList(dragSrcIdx, parseInt(row.dataset.idx));
                });

                // ── Mobile (touch) ──
                row.addEventListener('touchstart', () => {
                    dragSrcIdx = parseInt(row.dataset.idx);
                    dragSrcId = row.dataset.id;
                    touchDestIdx = null;
                    row.style.opacity = '0.4';
                }, { passive: true });
                row.addEventListener('touchmove', e => {
                    if (dragSrcIdx === null) return;
                    e.preventDefault(); // suppress page scroll while reordering a row
                    const t = e.touches[0];
                    const el = document.elementFromPoint(t.clientX, t.clientY);
                    const overRow = el && el.closest ? el.closest('.wl-row') : null;
                    rows.forEach(r => { if (r !== row) r.style.borderColor = '#334155'; });
                    if (overRow && overRow !== row) {
                        overRow.style.borderColor = '#3b82f6';
                        touchDestIdx = parseInt(overRow.dataset.idx);
                    } else {
                        touchDestIdx = null;
                    }
                }, { passive: false });
                row.addEventListener('touchend', () => {
                    row.style.opacity = '1';
                    rows.forEach(r => { r.style.borderColor = '#334155'; });
                    _reorderWorkList(dragSrcIdx, touchDestIdx);
                    dragSrcIdx = null; dragSrcId = null; touchDestIdx = null;
                });
            });
        }

Object.assign(window, { daysSinceAddedToWorkList, toggleWorkListPanel, _populateManagerPicker, loadWorkList, addToWorkList, _showSiloPickerForAdd, _addToWorkListWithSilo, removeFromWorkList, _saveWorkListOrder, _initWorkListBtn, _renderWorkListSiloTabs, _setWorkListSilo, renderWorkList });
