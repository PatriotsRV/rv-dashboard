// js/work-orders.js - Phase 9 (ADDITIVE): work orders, tasks, WO templates, staff load.
// v1.433 (Session 86, 2026-06-01).
//
// Extracted VERBATIM from the index.html inline <script> (14 functions):
//   loadStaff, loadWorkOrdersForRO, openWorkOrderModal, renderWorkOrderView,
//   openAddServicePicker, addServiceToRO, openBuildWOForm, buildWOTaskRowHtml,
//   loadWOTemplate, applyWOTemplate, saveWOTemplate, submitWOForm,
//   updateTaskStatusWO, computeAndSaveWORollup.
//
// ADDITIVE PHASE - the inline copies of the 14 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openWorkOrderModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions (getSB, supabaseSession,
// currentData, currentFilteredData, staffList, SERVICE_SILOS, SILO_TO_REPAIR_TYPE,
// TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS, WO_STATUS_LABELS,
// WO_STATUS_COLORS, escapeHtml, renderBoard, writeAuditLog, updateFieldInSupabase,
// isAdmin, hasRole, canManageSilo, t, ...) resolves through the SHARED global
// environment to the SAME symbol the inline copy uses - module-owned helpers via their
// window bridge, inline constants/state via the global lexical environment +
// backward-compat window globals.
//
// WARNING: submitWOForm / updateTaskStatusWO / computeAndSaveWORollup / saveWOTemplate /
// applyWOTemplate / addServiceToRO WRITE to service_work_orders / service_tasks /
// wo_templates (+ audit_log via writeAuditLog). This additive build MUST be validated
// with a NON-DESTRUCTIVE write test on a $0 staff-tester RO (build a WO -> add task ->
// update task status -> rollup recomputes -> audit_log verified -> reverted) before
// promote to main.
//
// Proper ESM imports (config/state/utils/render/auth/ro-crud) + deletion of the inline
// copies are deferred to the Phase 9 delete-inline cleanup, after this additive build
// soaks. Do NOT rewrite references here until that phase.


        export async function loadStaff() {
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            try {
                const { data, error } = await sb.from('staff').select('*').eq('active', true).order('name');
                if (error) throw error;
                _staffCache = data || [];
                log('👥 Staff loaded:', _staffCache.length, 'members');
                _initWorkListBtn();
            } catch (err) {
                warn('⚠️ Could not load staff table:', err.message);
            }
        }


        export async function loadWorkOrdersForRO(supabaseId) {
            const sb = getSB();
            if (!sb || !supabaseSession) return { orders: [], tasks: [] };
            try {
                const { data: orders, error: oe } = await sb
                    .from('service_work_orders').select('*')
                    .eq('ro_id', supabaseId).order('service_silo');
                if (oe) throw oe;

                let tasks = [];
                const orderIds = (orders || []).map(o => o.id);
                if (orderIds.length > 0) {
                    const { data: td, error: te } = await sb
                        .from('service_tasks').select('*')
                        .in('work_order_id', orderIds).order('sort_order');
                    if (te) throw te;
                    tasks = td || [];
                }
                _workOrderCache[supabaseId] = { orders: orders || [], tasks };
                return { orders: orders || [], tasks };
            } catch (err) {
                console.error('❌ loadWorkOrdersForRO:', err);
                return { orders: [], tasks: [] };
            }
        }


        export async function openWorkOrderModal(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            if (!ro) return;
            // Resolve to the true currentData index (filtered view may differ from currentData order)
            const roIndex = currentData.findIndex(d => d._supabaseId && d._supabaseId === ro._supabaseId);
            if (roIndex === -1 && ro._supabaseId) return; // shouldn't happen

            const existing = document.getElementById('workOrderOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'workOrderOverlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:11000;display:flex;align-items:center;justify-content:center;padding:20px;';
            // Outside-click dismissal DISABLED on Work Order modal —
            // prevents data loss when editing WO tasks.
            // Use the ✕ button to close.
            overlay.innerHTML = `
                <div style="background:white;border-radius:16px;width:100%;max-width:640px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
                    <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:white;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
                        <div>
                            <div style="font-size:1.1rem;font-weight:700;">🔧 Work Orders</div>
                            <div style="font-size:0.85rem;opacity:0.8;">${escapeHtml(ro.customerName) || ''} — ${escapeHtml(ro.roId) || ''}</div>
                        </div>
                        <button onclick="closeWorkOrderModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;font-size:1.2rem;cursor:pointer;padding:4px 10px;border-radius:6px;">✕</button>
                    </div>
                    <div id="woModalBody" style="flex:1;overflow-y:auto;padding:16px;background:#f8fafc;">
                        <div style="text-align:center;padding:40px;color:#94a3b8;">⏳ Loading work orders…</div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            if (!ro._supabaseId) {
                document.getElementById('woModalBody').innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">RO not found in database.</p>';
                return;
            }
            const { orders, tasks } = await loadWorkOrdersForRO(ro._supabaseId);
            renderWorkOrderView(roIndex, currentData[roIndex], orders, tasks);
        }


        export function renderWorkOrderView(roIndex, ro, orders, tasks) {
            const body = document.getElementById('woModalBody');
            if (!body) return;

            const totalValue = orders.reduce((sum, o) => sum + (parseFloat(o.dollar_value) || 0), 0);
            const userEmail = (supabaseSession?.user?.email || currentUser?.email || '').toLowerCase();
            // Filter silos to those matching this RO's repairType tags
            const roTypes = (ro.repairType || '').split(',').map(t => t.trim().toLowerCase());
            const activeSiloKeys = roTypes.map(t => REPAIR_TYPE_TO_SILO[t]).filter(Boolean);
            const activeSilos = SERVICE_SILOS.filter(s => activeSiloKeys.includes(s.key));
            const addableSilos = SERVICE_SILOS.filter(s => !activeSiloKeys.includes(s.key) && canManageSilo(s.key));
            let html = '';

            if (totalValue > 0) {
                html += `<div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:white;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.9rem;opacity:0.85;">💰 Total Service Value</span>
                    <span style="font-size:1.3rem;font-weight:800;">$${totalValue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>`;
            }

            if (activeSilos.length === 0) {
                html += `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:0.9rem;">No services assigned to this RO yet.<br>Use "+ Add Service" below to get started.</div>`;
            }
            for (const silo of activeSilos) {
                const wo = orders.find(o => o.service_silo === silo.key);
                const siloTasks = wo ? tasks.filter(t => t.work_order_id === wo.id).sort((a,b) => a.sort_order - b.sort_order) : [];
                // Effective WO estimate: roll up task est_hours when the WO has a task
                // breakdown ("detailed"); otherwise fall back to the WO-level estimated_hours
                // entered on a "basic" WO. Never double-counts — tasks win when present.
                const taskEstHours = siloTasks.reduce((sum, t) => sum + (parseFloat(t.est_hours) || 0), 0);
                const totalEstHours = taskEstHours > 0 ? taskEstHours : (parseFloat(wo?.estimated_hours) || 0);
                const canManage = canManageSilo(silo.key);
                const statusColor = WO_STATUS_COLORS[wo?.status] || '#94a3b8';

                html += `<div class="wo-silo-card">
                    <div class="wo-silo-header">
                        <span class="wo-silo-title">${silo.emoji} ${silo.label}</span>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            ${wo
                                ? `<span style="background:${statusColor};color:white;border-radius:12px;padding:3px 10px;font-size:0.75rem;font-weight:600;">${WO_STATUS_LABELS[wo.status] || wo.status}</span>
                                   <span style="font-weight:700;color:#1e3a5f;">$${parseFloat(wo.dollar_value||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span>${totalEstHours > 0 ? `<span style="font-size:0.75rem;color:#475569;font-weight:600;">⏱️ ~${totalEstHours}h</span>` : ""}`
                                : `<span style="color:#94a3b8;font-size:0.8rem;font-style:italic;">No work order yet</span>`}
                            ${wo && wo.completed_at ? `<span title="QA/QC + customer informed — revenue recognized this week (Weekly P&L)" style="background:#dcfce7;color:#166534;border-radius:12px;padding:3px 10px;font-size:0.72rem;font-weight:700;">✓ Completed ${String(wo.completed_at).slice(0,10)}</span>` : ''}
                            ${wo && !wo.completed_at && wo.tech_done_at ? `<span title="Tech lead says their work is done — awaiting manager Done-Done" style="background:#dbeafe;color:#1e40af;border-radius:12px;padding:3px 10px;font-size:0.72rem;font-weight:700;">🔵 Tech done ${String(wo.tech_done_at).slice(0,10)}</span>` : ''}
                            ${wo && canManage && !(typeof isInsuranceWoWriterOnly === 'function' && isInsuranceWoWriterOnly(silo.key))
                                ? (wo.completed_at
                                    ? `<button onclick="event.stopPropagation();reopenWOCompleted(${roIndex},'${wo.id}','${silo.key}')" class="wo-action-btn" style="background:#f1f5f9;color:#475569;" title="Reopen — clears the completion; revenue moves out of the completed week">↩ Reopen</button>`
                                    : `<button onclick="event.stopPropagation();markWOCompleted(${roIndex},'${wo.id}','${silo.key}',this)" class="wo-action-btn" style="background:#16a34a;color:#fff;" title="Done-Done: QA/QC passed + customer informed. Recognizes this WO's revenue in this week's P&L.">✓ Mark Completed</button>`)
                                : ''}
                            ${canManage ? `<button onclick="event.stopPropagation();openBuildWOForm(${roIndex},'${silo.key}')" class="wo-action-btn">${wo ? '✏️ Edit' : '+ Build'}</button>` : ''}
                            ${siloTasks.length > 0 ? `<button id="wo-chev-${silo.key}-${roIndex}" onclick="event.stopPropagation();toggleWOTasks('wo-tasks-${silo.key}-${roIndex}','wo-chev-${silo.key}-${roIndex}')" class="wo-chev-btn" title="Show/hide tasks">►</button>` : ''}
                        </div>
                    </div>`;

                if (siloTasks.length > 0) {
                    html += `<div id="wo-tasks-${silo.key}-${roIndex}" style="display:none"><div class="wo-task-list">`;
                    siloTasks.forEach((task, ti) => {
                        const isMyTask = (task.assigned_tech_email || '').toLowerCase() === userEmail;
                        const canEditTask = canManage || isMyTask;
                        const tColor = TASK_STATUS_COLORS[task.status] || '#94a3b8';
                        html += `<div class="wo-task-row">
                            <span class="wo-task-num">${ti+1}</span>
                            <div class="wo-task-info">
                                <div class="wo-task-title">${task.task_title}</div>
                                ${task.description ? `<div class="wo-task-desc">${task.description}</div>` : ''}
                                <div class="wo-task-meta">👤 ${getStaffName(task.assigned_tech_email)}${task.est_hours ? ' · ⏱️ ' + task.est_hours + 'h est.' : '' }</div>
                            </div>
                            <div class="wo-task-status-wrap">
                                ${canEditTask
                                    ? `<select onchange="updateTaskStatusWO('${task.id}',this.value,${roIndex})" style="border:none;border-radius:8px;padding:4px 6px;font-size:0.75rem;font-weight:600;background:${tColor};color:white;cursor:pointer;">
                                        ${TASK_STATUSES.map(s => `<option value="${s}" ${task.status===s?'selected':''} style="background:#333;color:white;">${TASK_STATUS_LABELS[s]}</option>`).join('')}
                                       </select>`
                                    : `<span style="background:${tColor};color:white;border-radius:8px;padding:4px 8px;font-size:0.75rem;font-weight:600;">${TASK_STATUS_LABELS[task.status]||task.status}</span>`}
                            </div>
                        </div>`;
                    });
                    html += `</div></div>`;
                } else if (wo) {
                    html += `<div style="padding:10px 14px;color:#94a3b8;font-size:0.85rem;font-style:italic;">No tasks added yet.</div>`;
                }

                if (wo?.notes) {
                    html += `<div style="padding:8px 14px;border-top:1px solid #f1f5f9;font-size:0.82rem;color:#64748b;font-style:italic;">📝 ${wo.notes}</div>`;
                }
                html += `</div>`;
            }

            // + Add Service button — shown to managers when addable silos remain
            if (addableSilos.some(s => canManageSilo(s.key))) {
                html += `<div style="margin-top:14px;text-align:center;">
                    <button onclick="openAddServicePicker(${roIndex})"
                        style="background:none;border:2px dashed #2d5a8e;color:#2d5a8e;border-radius:10px;padding:10px 24px;font-size:0.9rem;font-weight:700;cursor:pointer;width:100%;">
                        + Add Service
                    </button>
                </div>`;
            }
            body.innerHTML = html;
        }


        export function openAddServicePicker(roIndex) {
            const ro = currentData[roIndex];
            if (!ro) return;
            const roTypes = (ro.repairType || '').split(',').map(t => t.trim().toLowerCase());
            const activeSiloKeys = roTypes.map(t => REPAIR_TYPE_TO_SILO[t]).filter(Boolean);
            const addableSilos = SERVICE_SILOS.filter(s => !activeSiloKeys.includes(s.key) && canManageSilo(s.key));
            if (addableSilos.length === 0) return;
            const body = document.getElementById('woModalBody');
            if (!body) return;
            let html = `<div style="margin-bottom:14px;">
                <button onclick="renderWorkOrderView(${roIndex},currentData[${roIndex}],_workOrderCache[currentData[${roIndex}]._supabaseId]?.orders||[],_workOrderCache[currentData[${roIndex}]._supabaseId]?.tasks||[])"
                    style="background:none;border:none;color:#2d5a8e;cursor:pointer;font-size:0.9rem;padding:0;font-weight:600;">← Back</button>
            </div>
            <div style="font-size:1rem;font-weight:700;color:#1e3a5f;margin-bottom:14px;">Select a Service to Add</div>
            <div style="display:flex;flex-direction:column;gap:10px;">`;
            for (const silo of addableSilos) {
                html += `<button onclick="addServiceToRO(${roIndex},'${silo.key}')"
                    style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:14px 16px;text-align:left;cursor:pointer;font-size:0.95rem;font-weight:600;color:#1e293b;display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.3rem;">${silo.emoji}</span> ${silo.label}
                </button>`;
            }
            html += `</div>`;
            body.innerHTML = html;
        }


        export async function addServiceToRO(roIndex, siloKey) {
            const ro = currentData[roIndex];
            if (!ro?._supabaseId) return;
            const sb = getSB();
            if (!sb || !supabaseSession) { showToast('Session expired — please refresh the page.', 'warning'); return; }
            // Add the new service label to repair_type on the RO
            const newLabel = SILO_TO_REPAIR_TYPE[siloKey];
            const existing = (ro.repairType || '').split(',').map(t => t.trim()).filter(Boolean);
            if (!existing.map(t => t.toLowerCase()).includes(newLabel.toLowerCase())) {
                existing.push(newLabel);
                const newRepairType = existing.join(', ');
                const { error } = await sb.from('repair_orders')
                    .update({ repair_type: newRepairType })
                    .eq('id', ro._supabaseId);
                if (error) { showToast('Failed to update service type: ' + error.message, 'error'); return; }
                currentData[roIndex].repairType = newRepairType;

                // [ER 9b823d25 S120] Notify the manager(s) of the newly-added silo that
                // another silo added a service to this RO they need to be aware of.
                // Queued as a scheduled_notifications row (sent by the every-15-min
                // process-scheduled-notifications cron). Non-fatal. Requires the
                // 'service_added_notify' source on the scheduled_notifications CHECK
                // (migration service_added_notify_source.sql).
                try {
                    const recipients = (Array.isArray(_staffCache) ? _staffCache : [])
                        .filter(s => s.active !== false && s.email
                            && (s.role === 'manager' || s.role === 'sr_manager')
                            && s.service_silo === siloKey)
                        .map(s => s.email);
                    if (recipients.length) {
                        const siloInfo = SERVICE_SILOS.find(s => s.key === siloKey);
                        const siloName = siloInfo ? `${siloInfo.emoji} ${siloInfo.label}` : newLabel;
                        const addedBy  = currentUser?.name || currentUser?.email || 'A manager';
                        const subject  = `${ro.customerName} — ${siloName} service added to their RO`;
                        const body = [
                            `${addedBy} added a ${siloName} service to ${ro.customerName}'s RO.`,
                            '',
                            `RV: ${ro.rv || 'N/A'}`,
                            `RO ID: ${ro.roId || ''}`,
                            `All services now on this RO: ${newRepairType}`,
                            '',
                            `Please review the RO and build/update your work order for this service.`,
                        ].join('\n');
                        await getSB().from('scheduled_notifications').insert({
                            ro_id:            ro._supabaseId,
                            scheduled_at:     new Date().toISOString(),
                            recipient_emails: recipients,
                            subject:          subject,
                            body:             body,
                            source:           'service_added_notify',
                            status:           'pending',
                            created_by_email: currentUser?.email || 'service-add',
                        });
                    }
                } catch(e) { warn('Cross-silo service-add notification failed (non-fatal):', e); }
            }
            // Open Build WO form for the new silo
            openBuildWOForm(roIndex, siloKey);
        }


        export async function openBuildWOForm(roIndex, silo) {
            const ro = currentData[roIndex];
            if (!ro) return;
            if (!canManageSilo(silo)) { showToast('You do not have permission to manage this silo.', 'warning'); return; }

            const siloInfo = SERVICE_SILOS.find(s => s.key === silo);
            const cached = _workOrderCache[ro._supabaseId] || { orders: [], tasks: [] };
            const existingWO = cached.orders.find(o => o.service_silo === silo) || null;
            const existingTasks = existingWO
                ? cached.tasks.filter(t => t.work_order_id === existingWO.id).sort((a,b) => a.sort_order - b.sort_order)
                : [];

            window._woExistingTasks = existingTasks;
            // Insurance WO Writer (cross-silo, restricted) — drives task-row + status + $ UI.
            // Consumed by buildWOTaskRowHtml / addWOTaskRow / applyWOTemplate / submitWOForm.
            const restricted = isInsuranceWoWriterOnly(silo);
            window._woFormRestricted = restricted;
            // Pricing is locked once a non-zero $ is on the WO (mirrors BEFORE UPDATE trigger
            // enforce_insurance_wo_writer_swo_limits — see BRANDON_INSURANCE_WO_WRITER.sql).
            const dollarLocked = restricted && Number(existingWO?.dollar_value || 0) > 0;
            // Restricted users can only move the WO header status between not_started ↔ in_progress.
            const allowedWoStatuses = restricted
                ? ['not_started','in_progress']
                : Object.keys(WO_STATUS_LABELS);

            const body = document.getElementById('woModalBody');
            if (!body) return;

            const techs = getStaffTechs();
            const techOptions = '<option value="">— Unassigned —</option>' +
                techs.map(t => `<option value="${t.email}">${t.name}</option>`).join('');

            const taskRowsHtml = existingTasks.length > 0
                ? existingTasks.map((task, i) => buildWOTaskRowHtml(i, task, techOptions, silo)).join('')
                : '<div id="woNoTasks" style="color:#94a3b8;font-size:0.85rem;font-style:italic;padding:8px 0;">No tasks yet — click "+ Add Task or Step to WO" to add one.</div>';

            body.innerHTML = `
                <div style="margin-bottom:14px;">
                    <button onclick="renderWorkOrderView(${roIndex},currentData[${roIndex}],_workOrderCache[currentData[${roIndex}]._supabaseId]?.orders||[],_workOrderCache[currentData[${roIndex}]._supabaseId]?.tasks||[])"
                        style="background:none;border:none;color:#2d5a8e;cursor:pointer;font-size:0.9rem;padding:0;font-weight:600;">← Back</button>
                </div>
                <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:white;border-radius:10px;padding:12px 16px;margin-bottom:14px;">
                    <div style="font-size:1rem;font-weight:700;">${existingWO ? "Edit" : "Create"} ${siloInfo.emoji} ${siloInfo.label} MASTER Work Order <a href="guide.html#build-wo" target="_blank" rel="noopener" title="How a Work Order drives the P&L — Employee Guide" style="text-decoration:none;color:#bfdbfe;font-weight:700;font-size:0.95rem;">&#9432;</a></div>
                    <div style="font-size:0.82rem;opacity:0.8;">${escapeHtml(ro.customerName)} — ${escapeHtml(ro.roId)}</div>
                    ${restricted ? '<div style="margin-top:6px;font-size:0.72rem;background:rgba(255,255,255,0.18);padding:4px 8px;border-radius:6px;display:inline-block;">📋 Insurance WO mode — silo manager approves, assigns techs, finalizes pricing</div>' : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Status</label>
                        <select id="woFormStatus" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;">
                            ${allowedWoStatuses.map(k => `<option value="${k}" ${(existingWO?.status||'not_started')===k?'selected':''}>${WO_STATUS_LABELS[k]}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Total Dollar Value ($)${dollarLocked ? ' <span style="font-weight:500;color:#94a3b8;">— locked</span>' : ''}</label>
                        <input id="woFormDollar" type="number" min="0" step="0.01" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:${dollarLocked ? '#f1f5f9' : '#fff'};color:#1e293b;box-sizing:border-box;${dollarLocked ? 'cursor:not-allowed;' : ''}" placeholder="0.00" value="${existingWO?.dollar_value||''}"${dollarLocked ? ' readonly title="Pricing locked — silo manager must adjust"' : ''}>
                    </div>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Estimated Hours <span style="font-weight:500;color:#94a3b8;">— basic WO fallback</span></label>
                    <input id="woFormEstHours" type="number" min="0" step="0.5" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;box-sizing:border-box;" placeholder="e.g. 4" value="${existingWO?.estimated_hours||''}">
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Used for P&amp;L labor efficiency only when this WO has no tasks. If you add tasks below, their hours are summed instead.</div>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Notes</label>
                    <textarea id="woFormNotes" rows="2" style="width:100%;resize:vertical;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;box-sizing:border-box;" placeholder="Overall work order notes...">${existingWO?.notes||''}</textarea>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
                    <span style="font-size:0.9rem;font-weight:700;color:#1e3a5f;">Tasks</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button onclick="loadWOTemplate(${roIndex},'${silo}')" style="background:#475569;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:0.78rem;font-weight:600;cursor:pointer;">&#128203; Load Template</button>
                        <button onclick="saveWOTemplate('${silo}')" style="background:#475569;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:0.78rem;font-weight:600;cursor:pointer;">&#128190; Save as Template</button>
                        <button onclick="addWOTaskRow('${silo}')" style="background:#2d5a8e;color:white;border:none;border-radius:6px;padding:6px 12px;font-size:0.82rem;font-weight:600;cursor:pointer;">+ Add Task or Step to WO</button>
                    </div>
                </div>
                <div id="woTaskRows" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">${taskRowsHtml}</div>
                <button id="woSaveBtn" onclick="submitWOForm(${roIndex},'${silo}','${existingWO?.id||''}')"
                    style="width:100%;padding:12px;background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">
                    💾 Save Work Order
                </button>`;
            _initWOTaskDrag();
        }


        export function buildWOTaskRowHtml(index, task, techOptions, silo) {
            const uid = 'wot_' + Date.now() + '_' + index;
            const selectedTech = task?.assigned_tech_email || '';
            const techOpts = techOptions.replace(`value="${selectedTech}"`, `value="${selectedTech}" selected`);
            const siloInfo = silo ? SERVICE_SILOS.find(s => s.key === silo) : null;
            const siloBadge = siloInfo ? `<span style="font-size:0.72rem;font-weight:600;background:#e0edff;color:#1e3a5f;border-radius:12px;padding:2px 8px;margin-left:8px;">${siloInfo.emoji} ${siloInfo.label}</span>` : '';
            // Insurance WO Writer restrictions (Brandon): hide ✕ on rows already saved,
            // hide tech dropdown entirely (forced unassigned), filter terminal task statuses.
            const restricted     = !!window._woFormRestricted;
            const isExistingRow  = !!task?.id;
            const allowedStatuses = restricted
                ? TASK_STATUSES.filter(s => s !== 'awaiting_approval' && s !== 'completed')
                : TASK_STATUSES;
            // Restricted users can only remove rows they themselves added in this session
            const removeBtnHtml = (restricted && isExistingRow)
                ? ''
                : `<button onclick="document.getElementById('${uid}').remove()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.85rem;">✕ Remove</button>`;
            const techBlockHtml = restricted
                ? `<input type="hidden" class="wo-task-tech" value="">
                   <div>
                     <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:3px;">Assigned Tech</label>
                     <div style="padding:10px 12px;border:1.5px dashed #cbd5e1;border-radius:8px;font-size:0.82rem;background:#f8fafc;color:#94a3b8;font-style:italic;">Silo manager assigns</div>
                   </div>`
                : `<div>
                     <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:3px;">Assigned Tech</label>
                     <select class="wo-task-tech" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;">${techOpts}</select>
                   </div>`;
            return `<div id="${uid}" class="wo-task-form-row" data-task-id="${task?.id||''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:700;color:#475569;">
                        <span class="wo-drag-handle" draggable="true" title="Drag to reorder this task" style="cursor:grab;color:#94a3b8;font-size:1rem;line-height:1;user-select:none;touch-action:none;">&#10303;</span>
                        <span class="wo-task-num">Task ${index+1}</span>${siloBadge}
                    </span>
                    ${removeBtnHtml}
                </div>
                <input type="text" placeholder="Task title *" value="${escapeHtml(task?.task_title)||''}" class="wo-task-title" style="width:100%;margin-bottom:6px;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;box-sizing:border-box;" required>
                <textarea placeholder="Description (optional)" class="wo-task-desc" rows="2" style="width:100%;resize:vertical;margin-bottom:6px;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;box-sizing:border-box;">${escapeHtml(task?.description)||''}</textarea>
                <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:8px;">
                    ${techBlockHtml}
                    <div>
                        <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:3px;">Status</label>
                        <select class="wo-task-status" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;">
                            ${allowedStatuses.map(s => `<option value="${s}" ${(task?.status||'not_started')===s?'selected':''}>${TASK_STATUS_LABELS[s]}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:3px;">Est. Hrs</label>
                        <input type="number" min="0" step="0.25" placeholder="0" value="${task?.est_hours||''}" class="wo-task-est-hours" style="width:100%;padding:10px 8px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;background:#fff;color:#1e293b;box-sizing:border-box;">
                    </div>
                </div>
            </div>`;
        }


        // [ER e27311bf v1.464 S125] Drag-and-drop reorder of WO task rows (Ryan: "edit
        // templates, drag and drop, change order at will"). DOM order IS the source of
        // truth — saveWOTemplate/submitWOForm assign sort_order from row position — so
        // moving the nodes here persists the new order on Save / Save-as-Template /
        // Overwrite. Desktop uses HTML5 drag from the grip handle; touch devices get the
        // equivalent via touchstart/move/end (HTML5 DnD does not fire on touch). Idempotent
        // via data-wo-drag-wired so it is safe to re-run after every row add.
        let _woDragRow = null, _woTouchRow = null, _woTouchOver = null;

        export function _renumberWOTaskRows() {
            const container = document.getElementById('woTaskRows');
            if (!container) return;
            container.querySelectorAll('.wo-task-form-row').forEach((row, i) => {
                const num = row.querySelector('.wo-task-num');
                if (num) num.textContent = 'Task ' + (i + 1);
            });
        }

        export function _initWOTaskDrag() {
            const container = document.getElementById('woTaskRows');
            if (!container) return;
            const clearOutlines = () => container.querySelectorAll('.wo-task-form-row')
                .forEach(r => { r.style.outline = 'none'; });
            const doMove = (srcRow, destRow) => {
                if (!srcRow || !destRow || srcRow === destRow) return;
                if (!container.contains(srcRow) || !container.contains(destRow)) return;
                const list = Array.from(container.querySelectorAll('.wo-task-form-row'));
                const before = list.indexOf(srcRow) > list.indexOf(destRow);
                container.insertBefore(srcRow, before ? destRow : destRow.nextSibling);
                _renumberWOTaskRows();
            };
            container.querySelectorAll('.wo-task-form-row').forEach(row => {
                if (row.dataset.woDragWired) return;
                row.dataset.woDragWired = '1';
                const handle = row.querySelector('.wo-drag-handle');
                if (!handle) return;
                // Desktop (mouse) — drag initiated from the grip handle
                handle.addEventListener('dragstart', e => {
                    _woDragRow = row; row.style.opacity = '0.4';
                    try { e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
                });
                handle.addEventListener('dragend', () => { row.style.opacity = '1'; clearOutlines(); _woDragRow = null; });
                row.addEventListener('dragover', e => {
                    if (!_woDragRow) return;
                    e.preventDefault();
                    row.style.outline = row === _woDragRow ? 'none' : '2px solid #3b82f6';
                });
                row.addEventListener('dragleave', () => { row.style.outline = 'none'; });
                row.addEventListener('drop', e => {
                    e.preventDefault(); row.style.outline = 'none';
                    doMove(_woDragRow, row); _woDragRow = null;
                });
                // Mobile (touch) — same gesture from the grip handle
                handle.addEventListener('touchstart', () => { _woTouchRow = row; _woTouchOver = null; row.style.opacity = '0.4'; }, { passive: true });
                handle.addEventListener('touchmove', e => {
                    if (!_woTouchRow) return;
                    e.preventDefault();
                    const t = e.touches[0];
                    const el = document.elementFromPoint(t.clientX, t.clientY);
                    const overRow = el && el.closest ? el.closest('.wo-task-form-row') : null;
                    clearOutlines();
                    if (overRow && overRow !== _woTouchRow) { overRow.style.outline = '2px solid #3b82f6'; _woTouchOver = overRow; }
                    else { _woTouchOver = null; }
                }, { passive: false });
                handle.addEventListener('touchend', () => {
                    row.style.opacity = '1'; clearOutlines();
                    doMove(_woTouchRow, _woTouchOver);
                    _woTouchRow = null; _woTouchOver = null;
                });
            });
        }


        export async function loadWOTemplate(roIndex, silo) {
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            const { data: templates, error } = await sb
                .from('wo_task_templates')
                .select('*')
                .eq('service_silo', silo)
                .order('template_name');
            if (error) { showToast('Error loading templates: ' + error.message, 'error'); return; }
            const siloInfo = SERVICE_SILOS.find(s => s.key === silo) || { emoji: '\u{1F4CB}', label: silo };
            let listHtml = '';
            if (!templates || templates.length === 0) {
                listHtml = '<div style="color:#94a3b8;font-style:italic;padding:16px;text-align:center;">' +
                    'No templates saved for ' + siloInfo.emoji + ' ' + siloInfo.label + ' yet.<br><br>' +
                    'Build a WO and click "&#128190; Save as Template" to create one.</div>';
            } else {
                listHtml = templates.map(t =>
                    '<div onclick="selectWOTemplate(\'' + t.id + '\',' + roIndex + ',\'' + silo + '\')" ' +
                    'style="padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;margin-bottom:8px;background:white;" ' +
                    'onmouseover="this.style.borderColor=\'#2d5a8e\'" onmouseout="this.style.borderColor=\'#e2e8f0\'">' +
                        '<div style="font-weight:700;color:#1e3a5f;font-size:0.9rem;">' + t.template_name + '</div>' +
                        (t.description ? '<div style="font-size:0.78rem;color:#64748b;margin-top:3px;">' + t.description + '</div>' : '') +
                        '<div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Updated ' + new Date(t.updated_at).toLocaleDateString() + '</div>' +
                    '</div>'
                ).join('');
            }
            const overlay = document.createElement('div');
            overlay.id = 'woTemplateOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;';
            overlay.innerHTML =
                '<div style="background:white;border-radius:14px;padding:20px;width:100%;max-width:420px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
                        '<span style="font-size:1rem;font-weight:700;color:#1e3a5f;">&#128203; ' + siloInfo.emoji + ' ' + siloInfo.label + ' Templates</span>' +
                        '<button onclick="document.getElementById(\'woTemplateOverlay\').remove()" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:1.1rem;">&#10005;</button>' +
                    '</div>' +
                    listHtml +
                '</div>';
            document.body.appendChild(overlay);
        }


        export async function applyWOTemplate(templateId, roIndex, silo, mode) {
            document.getElementById('woTemplateOverlay')?.remove();
            const sb = getSB();
            if (!sb) return;
            const { data: tasks, error } = await sb
                .from('wo_template_tasks')
                .select('*')
                .eq('template_id', templateId)
                .order('sort_order');
            if (error) { showToast('Error loading template tasks: ' + error.message, 'error'); return; }
            if (!tasks || tasks.length === 0) { showToast('This template has no tasks saved yet.', 'info'); return; }
            const container = document.getElementById('woTaskRows');
            if (!container) return;
            const techs = getStaffTechs();
            const techOptions = '<option value="">— Unassigned —</option>' +
                techs.map(t => `<option value="${t.email}">${t.name}</option>`).join('');
            if (mode === 'replace') {
                container.innerHTML = '';
                document.getElementById('woNoTasks')?.remove();
            }
            const startIdx = mode === 'replace' ? 0 : container.querySelectorAll('.wo-task-form-row').length;
            tasks.forEach((task, i) => {
                document.getElementById('woNoTasks')?.remove();
                container.insertAdjacentHTML('beforeend', buildWOTaskRowHtml(startIdx + i, task, techOptions, silo));
            });
            _renumberWOTaskRows();
            _initWOTaskDrag();
        }


        export async function saveWOTemplate(silo) {
          try {
            const container = document.getElementById('woTaskRows');
            const rows = container ? container.querySelectorAll('.wo-task-form-row') : [];
            const tasks = [];
            rows.forEach((row, i) => {
                const title = row.querySelector('.wo-task-title')?.value.trim();
                if (!title) return;
                tasks.push({
                    task_title: title,
                    description: row.querySelector('.wo-task-desc')?.value.trim() || null,
                    est_hours: parseFloat(row.querySelector('.wo-task-est-hours')?.value) || null,
                    sort_order: i
                });
            });
            if (tasks.length === 0) { showToast('Add at least one task before saving as a template.', 'warning'); return; }
            window._pendingTemplateTasks = tasks;
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            const siloInfo = SERVICE_SILOS.find(s => s.key === silo) || { emoji: '\u{1F4CB}', label: silo };
            const { data: existing } = await sb.from('wo_task_templates').select('id,template_name').eq('service_silo', silo).order('template_name');
            const existingOpts = (existing && existing.length > 0)
                ? existing.map(t => `<option value="${t.id}">${t.template_name}</option>`).join('') : '';
            const overlay = document.createElement('div');
            overlay.id = 'woTemplateOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;';
            overlay.innerHTML =
                '<div style="background:white;border-radius:14px;padding:20px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
                        '<span style="font-size:1rem;font-weight:700;color:#1e3a5f;">&#128190; Save as Template</span>' +
                        '<button onclick="document.getElementById(\'woTemplateOverlay\').remove()" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:1.1rem;">&#10005;</button>' +
                    '</div>' +
                    '<div style="font-size:0.8rem;color:#64748b;margin-bottom:14px;">' + siloInfo.emoji + ' ' + siloInfo.label + ' &middot; ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '</div>' +
                    '<label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">New Template Name</label>' +
                    '<input id="woTmplNameInput" type="text" placeholder="e.g. 26ft Roof Replacement" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;box-sizing:border-box;margin-bottom:12px;">' +
                    '<button onclick="commitSaveTemplate(\'' + silo + '\',null)" style="width:100%;padding:11px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;' + (existingOpts ? 'margin-bottom:14px;' : '') + '">&#128190; Save as New Template</button>' +
                    (existingOpts ?
                        '<div style="border-top:1px solid #e2e8f0;padding-top:14px;">' +
                            '<label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:6px;">&#8212; or overwrite an existing template &#8212;</label>' +
                            '<select id="woTmplOverwriteSel" style="width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.875rem;margin-bottom:10px;box-sizing:border-box;">' +
                                '<option value="">Select template to overwrite&hellip;</option>' + existingOpts +
                            '</select>' +
                            '<button onclick="commitSaveTemplate(\'' + silo + '\',document.getElementById(\'woTmplOverwriteSel\').value||null)" style="width:100%;padding:11px;background:#d97706;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;">&#128260; Overwrite Selected Template</button>' +
                        '</div>'
                    : '') +
                '</div>';
            document.body.appendChild(overlay);
            document.getElementById('woTmplNameInput')?.focus();
          } catch(err) {
            console.error('[Template] saveWOTemplate error:', err);
            showToast('Error preparing template: ' + (err.message || err), 'error');
          }
        }


        export async function submitWOForm(roIndex, silo, existingWOId) {
            const ro = currentData[roIndex];
            if (!ro?._supabaseId) return;
            const sb = getSB();
            if (!sb || !supabaseSession) { showToast('Session expired — please refresh the page.', 'warning'); return; }

            const status     = document.getElementById('woFormStatus').value;
            const dollar     = parseFloat(document.getElementById('woFormDollar').value) || 0;
            const estHours   = parseFloat(document.getElementById('woFormEstHours')?.value) || null;
            const notes      = document.getElementById('woFormNotes').value.trim();
            const userEmail  = supabaseSession.user.email;
            const btn        = document.getElementById('woSaveBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

            try {
                let workOrderId = existingWOId || null;

                if (workOrderId) {
                    const { error } = await sb.from('service_work_orders').update({
                        status, dollar_value: dollar, estimated_hours: estHours, notes, updated_at: new Date().toISOString()
                    }).eq('id', workOrderId);
                    if (error) throw error;
                } else {
                    const { data, error } = await sb.from('service_work_orders').insert({
                        ro_id: ro._supabaseId, service_silo: silo,
                        status, dollar_value: dollar, estimated_hours: estHours, notes, created_by: userEmail
                    }).select().single();
                    if (error) throw error;
                    workOrderId = data.id;
                }

                // Insurance WO Writer restrictions (Brandon): force unassigned tech +
                // never delete existing tasks (DB RLS blocks st_delete for him anyway).
                const restricted = !!window._woFormRestricted;

                // Save tasks
                const taskRows  = document.querySelectorAll('#woTaskRows .wo-task-form-row');
                const existing  = new Set((window._woExistingTasks||[]).map(t => t.id));
                const seen      = new Set();
                let sortOrder   = 0;

                for (const row of taskRows) {
                    const taskId    = row.dataset.taskId;
                    const title     = row.querySelector('.wo-task-title').value.trim();
                    if (!title) continue;
                    const desc      = row.querySelector('.wo-task-desc').value.trim();
                    const techEmail = restricted ? '' : (row.querySelector('.wo-task-tech')?.value || '');
                    const tStatus   = row.querySelector('.wo-task-status').value;
                    const estHrs    = parseFloat(row.querySelector('.wo-task-est-hours')?.value) || null;
                    const payload   = { task_title: title, description: desc, est_hours: estHrs,
                                        assigned_tech_email: techEmail || null,
                                        status: tStatus, sort_order: sortOrder,
                                        updated_at: new Date().toISOString() };

                    if (taskId && existing.has(taskId)) {
                        await sb.from('service_tasks').update(payload).eq('id', taskId);
                        seen.add(taskId);
                    } else {
                        await sb.from('service_tasks').insert({
                            ...payload, work_order_id: workOrderId,
                            ro_id: ro._supabaseId, created_by: userEmail
                        });
                    }
                    sortOrder++;
                }

                // Delete removed tasks — skipped for Insurance WO Writer (DB blocks st_delete
                // and the UI hides ✕ on existing rows so this branch can't legitimately fire)
                if (!restricted) {
                    for (const tid of existing) {
                        if (!seen.has(tid)) await sb.from('service_tasks').delete().eq('id', tid);
                    }
                }

                // Roll up total dollar value → repair_orders.dollar_value
                await computeAndSaveWORollup(ro._supabaseId, roIndex);

                // Refresh view
                const { orders, tasks } = await loadWorkOrdersForRO(ro._supabaseId);
                renderWorkOrderView(roIndex, currentData[roIndex], orders, tasks);

            } catch (err) {
                console.error('❌ submitWOForm:', err);
                showToast('Failed to save work order: ' + (err.message || err), 'error');
                if (btn) { btn.disabled = false; btn.textContent = '💾 Save Work Order'; }
            }
        }


        export async function updateTaskStatusWO(taskId, newStatus, roIndex) {
            const ro = currentData[roIndex];
            if (!ro) return;
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            try {
                const { error } = await sb.from('service_tasks').update({
                    status: newStatus, updated_at: new Date().toISOString()
                }).eq('id', taskId);
                if (error) throw error;
                const { orders, tasks } = await loadWorkOrdersForRO(ro._supabaseId);
                renderWorkOrderView(roIndex, currentData[roIndex], orders, tasks);
            } catch (err) {
                console.error('❌ updateTaskStatusWO:', err);
                showToast('Failed to update task status.', 'error');
            }
        }


        export async function computeAndSaveWORollup(supabaseId, roIndex) {
            const sb = getSB();
            if (!sb || !supabaseSession) return;
            try {
                const { data: orders } = await sb.from('service_work_orders')
                    .select('dollar_value').eq('ro_id', supabaseId);
                const total = (orders||[]).reduce((s,o) => s + (parseFloat(o.dollar_value)||0), 0);
                await sb.from('repair_orders').update({ dollar_value: total }).eq('id', supabaseId);
                if (roIndex !== undefined && currentData[roIndex]) {
                    currentData[roIndex].dollarValue = total;
                    renderBoard(); // Refresh card to show new dollar value
                }
            } catch (err) {
                console.error('❌ computeAndSaveWORollup:', err);
            }
        }

        // ════════════════════════════════════════════════════════════
        // WEEKLY P&L (Session 99) — two-stage WO completion, manager half.
        // markWOCompleted = "Done-Done": QA/QC passed, all known/requested
        // work finished, customer informed. Sets status='completed' +
        // completed_at/by — THE revenue-recognition event for weekly_pnl().
        // Two-step inline confirm (no confirm() dialog per toast-system rule).
        // RLS: swo_update allows silo manager / sr+admin; the Insurance WO
        // Writer trigger independently blocks that role from 'completed'.
        // ════════════════════════════════════════════════════════════
        export async function markWOCompleted(roIndex, woId, siloKey, btn) {
            if (btn && btn.dataset.armed !== '1') {
                btn.dataset.armed = '1';
                btn.textContent = 'Confirm: complete?';
                btn.style.background = '#d97706';
                setTimeout(() => {
                    if (btn && btn.dataset.armed === '1') {
                        btn.dataset.armed = '';
                        btn.textContent = '✓ Mark Completed';
                        btn.style.background = '#16a34a';
                    }
                }, 5000);
                return;
            }
            const ro = currentData[roIndex];
            if (!ro) return;
            const sb = getSB();
            if (!sb || !supabaseSession) { showToast('Session expired — please refresh the page.', 'warning'); return; }
            const userEmail = (supabaseSession?.user?.email || '').toLowerCase();
            try {
                const { data: prevRows } = await sb.from('service_work_orders').select('status').eq('id', woId);
                const prevStatus = prevRows?.[0]?.status || null;
                const { data, error } = await sb.from('service_work_orders').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completed_by: userEmail,
                    updated_at: new Date().toISOString()
                }).eq('id', woId).select();
                if (error) throw error;
                if (!data || data.length === 0) throw new Error('No row updated (permission?)');
                try {
                    await writeAuditLog(ro._supabaseId, [{ field: 'wo_' + siloKey + '_status', oldValue: prevStatus, newValue: 'completed (Done-Done)' }]);
                } catch (e) { console.error('audit log failed:', e); }
                showToast('✓ ' + siloKey + ' work order completed — revenue recognized this week.', 'success');
                const { orders, tasks } = await loadWorkOrdersForRO(ro._supabaseId);
                renderWorkOrderView(roIndex, currentData[roIndex], orders, tasks);
            } catch (err) {
                console.error('❌ markWOCompleted:', err);
                showToast('Failed to mark completed: ' + (err.message || err), 'error');
            }
        }

        export async function reopenWOCompleted(roIndex, woId, siloKey) {
            const ro = currentData[roIndex];
            if (!ro) return;
            const sb = getSB();
            if (!sb || !supabaseSession) { showToast('Session expired — please refresh the page.', 'warning'); return; }
            try {
                const { data, error } = await sb.from('service_work_orders').update({
                    status: 'in_progress',
                    completed_at: null,
                    completed_by: null,
                    updated_at: new Date().toISOString()
                }).eq('id', woId).select();
                if (error) throw error;
                if (!data || data.length === 0) throw new Error('No row updated (permission?)');
                try {
                    await writeAuditLog(ro._supabaseId, [{ field: 'wo_' + siloKey + '_status', oldValue: 'completed', newValue: 'in_progress (reopened)' }]);
                } catch (e) { console.error('audit log failed:', e); }
                showToast('↩ ' + siloKey + ' work order reopened — revenue recognition cleared.', 'info');
                const { orders, tasks } = await loadWorkOrdersForRO(ro._supabaseId);
                renderWorkOrderView(roIndex, currentData[roIndex], orders, tasks);
            } catch (err) {
                console.error('❌ reopenWOCompleted:', err);
                showToast('Failed to reopen: ' + (err.message || err), 'error');
            }
        }

// ---- Window bridge (Phase 9 additive) ----
Object.assign(window, {
  loadStaff,
  loadWorkOrdersForRO,
  openWorkOrderModal,
  renderWorkOrderView,
  openAddServicePicker,
  addServiceToRO,
  openBuildWOForm,
  buildWOTaskRowHtml,
  _initWOTaskDrag,
  _renumberWOTaskRows,
  loadWOTemplate,
  applyWOTemplate,
  saveWOTemplate,
  submitWOForm,
  updateTaskStatusWO,
  computeAndSaveWORollup,
  markWOCompleted,
  reopenWOCompleted,
});
