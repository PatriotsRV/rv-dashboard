// js/render.js — Phase 6 (ADDITIVE): board rendering engine.
// v1.430 (Session 83, 2026-05-31).
//
// Extracted VERBATIM from the index.html inline <script>:
//   shouldShow, renderBoard, updateStats, renderERAdminList.
//
// ADDITIVE PHASE — the inline copies REMAIN in index.html. This module is
// loaded by app.js and its window bridge re-points window.renderBoard etc.
// to these copies, but the bodies are byte-identical to the inline versions
// (no reference rewriting), so behavior is unchanged. Every bare reference
// inside these functions (escapeHtml, t, SERVICE_SILOS, STATUS_PROGRESS_MAP,
// currentData, currentFilteredData, tileVisibility, isAdmin, canSeeWorkList,
// woSummaryChips, woMissingBadge, getDaysHeatColor, calculateDaysOnLot, ...)
// resolves through the shared global environment to the SAME symbol the inline
// copy uses — module-owned helpers via their window bridge, inline constants/
// state via their backward-compat globals.
//
// Proper ESM imports (config/state/utils/i18n/auth) + deletion of the inline
// copies are deferred to the Phase 6 delete-inline cleanup, after this additive
// build soaks. Do NOT rewrite references here until that phase.

        export function shouldShow(element) {
            return tileVisibility[element] === true;
        }

        export function renderBoard() {
            const grid = document.getElementById('boardGrid');
            
            // Sort by priority
            const sorted = [...currentData].map(ro => ({
                ...ro,
                priorityScore: calculatePriority(ro)
            })).sort((a, b) => b.priorityScore - a.priorityScore);

            // Apply all filters
            let filtered = sorted;
            
            // Unified multi-field search filter
            if (currentSearchFilter) {
                const needle = currentSearchFilter.toLowerCase();
                filtered = filtered.filter(ro => {
                    const haystack = [
                        ro.customerName,
                        ro.roId,
                        ro.rv,
                        ro.vin,
                        ro.technicianAssigned,
                        ro.repairDescription,
                        ro.parkingSpot,
                        ro.customerPhone,
                        ro.customerEmail,
                        ro.repairType,
                    ].filter(Boolean).join(' ').toLowerCase();
                    return haystack.includes(needle);
                });
            }
            
            // Multi-select status filter
            if (currentStatusFilters.length > 0) {
                filtered = filtered.filter(ro => {
                    // Standard status match
                    if (currentStatusFilters.includes(ro.status)) return true;
                    // "Awaiting parts" also matches any RO with outstanding parts
                    // (ordered/in transit/backordered/lost) regardless of RO status
                    if (currentStatusFilters.includes('Awaiting parts') && ro.partsJson) {
                        try {
                            const parts = JSON.parse(ro.partsJson);
                            return parts.some(p => ['Ordered','In Transit','Backordered','Lost'].includes(p.status));
                        } catch(e) {}
                    }
                    return false;
                });
            }
            
            // Single-select repair filter
            if (currentRepairFilter !== 'all') {
                filtered = filtered.filter(ro => {
                    // Handle multiple repair types (comma-separated)
                    const types = (ro.repairType || '').split(',').map(t => t.trim());
                    return types.includes(currentRepairFilter);
                });
            }

            // Days on Lot filter
            if (currentDaysFilter !== null && currentDaysFilter >= 0) {
                filtered = filtered.filter(ro => {
                    const days = calculateDaysOnLot(ro);
                    return days !== null && days >= currentDaysFilter;
                });
            }

            // GH#24: Training RO visibility — hidden by default unless filter is 'training' or toggle is on
            if (currentROTypeFilter === 'training') {
                filtered = filtered.filter(ro => ro.isTraining);
            } else if (!showTrainingROs) {
                filtered = filtered.filter(ro => !ro.isTraining);
            }

            // RO Type filter
            if (currentROTypeFilter !== 'all' && currentROTypeFilter !== 'training') {
                filtered = filtered.filter(ro => {
                    let roType = ro.roType || 'standard';
                    if (roType === 'standard' && ro.insuranceData) {
                        try {
                            const d = JSON.parse(ro.insuranceData);
                            if (d.isInsuranceClaim) roType = d.roType || 'insurance';
                        } catch(e) {}
                    }
                    if (currentROTypeFilter === 'insurance') return roType === 'insurance';
                    if (currentROTypeFilter === 'hybrid') return roType === 'hybrid';
                    if (currentROTypeFilter === 'standard') return roType === 'standard';
                    if (currentROTypeFilter === 'warranty') return roType === 'warranty';
                    if (currentROTypeFilter === 'shop') return roType === 'shop';
                    return true;
                });
            }

            // Parts filter
            if (currentPartsFilter !== 'all') {
                filtered = filtered.filter(ro => {
                    // Parts status chip filters (RO-level parts_status field)
                    if (currentPartsFilter === 'ps-requested')   return ro.partsStatus === 'requested' || (!ro.partsStatus && ro.hasOpenPartsRequest);
                    if (currentPartsFilter === 'ps-sourcing')    return ro.partsStatus === 'sourcing';
                    if (currentPartsFilter === 'ps-ordered')     return ro.partsStatus === 'ordered' || ro.partsStatus === 'outstanding';
                    if (currentPartsFilter === 'ps-received')    return ro.partsStatus === 'received';
                    if (currentPartsFilter === 'ps-estimate')    return ro.partsStatus === 'estimate';
                    // Parts row-level filters (individual parts statuses)
                    if (!ro.partsJson) return false;
                    try {
                        const parts = JSON.parse(ro.partsJson);
                        if (currentPartsFilter === 'backordered') {
                            return parts.some(p => p.status === 'Backordered' || p.status === 'Lost');
                        }
                    } catch(e) {}
                    return false;
                });
            }

            // Store filtered data globally for functions to access
            currentFilteredData = filtered;
            setTimeout(updateFilterActiveDots, 50);
            
            // Update stats with both sorted (all data) and filtered data
            updateStats(sorted, filtered);

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <div class="empty-text">${t('No RVs match the current filters')}</div>
                    </div>
                `;
                return;
            }

            // Toggle grid layout for compact view
            grid.classList.toggle('compact-grid', currentViewMode === 'compact');

            // Compact header row
            const compactHeader = currentViewMode === 'compact' ? `<div class="compact-grid-header"><span></span><span>Customer / RO</span><span>Status</span><span>Days / Tech</span><span>Parts / Tags</span><span>Actions</span></div>` : '';

            grid.innerHTML = compactHeader + filtered.map((ro, index) => {
                const priorityLevel = getPriorityLevel(ro.priorityScore);
                const statusClass = ro.status.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');

                /* ── Compact Manager View ──────────────────────────────── */
                if (currentViewMode === 'compact') {
                    const urgency = ro.urgency || 'Medium';
                    const urgencyLc = urgency.toLowerCase();
                    const days = calculateDaysOnLot(ro);
                    const daysColor = getDaysHeatColor(days);

                    // Build chips
                    let chips = '';
                    if (ro.partsStatus === 'requested' || (!ro.partsStatus && ro.hasOpenPartsRequest)) chips += '<span class="compact-chip ch-requested" data-action="parts-status" data-idx="' + index + '">Requested</span>';
                    else if (ro.partsStatus === 'sourcing') chips += '<span class="compact-chip ch-sourcing" data-action="parts-status" data-idx="' + index + '">Sourcing</span>';
                    else if (ro.partsStatus === 'ordered' || ro.partsStatus === 'outstanding') chips += '<span class="compact-chip ch-ordered" data-action="parts-status" data-idx="' + index + '">Ordered</span>';
                    else if (ro.partsStatus === 'estimate') chips += '<span class="compact-chip ch-estimate" data-action="parts-status" data-idx="' + index + '">Estimate</span>';
                    else if (ro.partsStatus === 'received') chips += '<span class="compact-chip ch-received" data-action="parts-status" data-idx="' + index + '">Received</span>';

                    try {
                        const ins = ro.insuranceData ? JSON.parse(ro.insuranceData) : null;
                        if (ins && ins.isInsuranceClaim) chips += '<span class="compact-chip ch-insurance">Insurance</span>';
                    } catch(e) {}
                    if (ro.roType === 'warranty') chips += '<span class="compact-chip ch-warranty">Warranty</span>';
                    if (ro.roType === 'hybrid') chips += '<span class="compact-chip ch-hybrid">🔧🛡️ Hybrid</span>';
                    if (ro.roType === 'shop') chips += '<span class="compact-chip ch-shop">🏪 Shop</span>';
                    if (ro.isTraining) chips += '<span class="compact-chip ch-training">🎓 Training</span>';
                    chips += woMissingPill(ro); // v1.414 Phase A1: tiny inline missing-WO pill

                    try {
                        const parts = ro.partsJson ? JSON.parse(ro.partsJson) : [];
                        if (parts.length > 0) {
                            const ct = parts.length;
                            chips += '<span class="compact-chip ch-parts-badge" data-action="parts-badge" data-idx="' + index + '">' + ct + ' part' + (ct !== 1 ? 's' : '') + '</span>';
                        }
                    } catch(e) {}

                    return `
                    <div class="ro-card-compact ro-card-status-${statusClass}${ro.hasOpenPartsRequest ? ' has-parts-request' : ''}" data-ro-index="${index}" data-compact-row="1">
                        <div class="compact-col-photo">${ro.rvPhotoUrl ? '<img src="' + ro.rvPhotoUrl + '" alt="RV" onerror="this.style.opacity=\'0.3\'">' : '<span class="compact-no-photo">No Photo</span>'}</div>
                        <div class="compact-col-id">
                            <span class="compact-customer">${escapeHtml(ro.customerName) || t('Unknown')}</span>
                            ${ro.roId ? '<span class="compact-ro-id">' + escapeHtml(ro.roId) + '</span>' : ''}
                            <span class="compact-rv">${escapeHtml(ro.rv) || t('RV not specified')}</span>
                        </div>
                        <div class="compact-col-status">
                            <span class="compact-stage" style="color: var(--text-primary);">${escapeHtml(ro.status)}</span>
                            <span class="compact-urgency u-${urgencyLc}">${urgency}</span>
                        </div>
                        <div class="compact-col-meta">
                            ${days !== null ? '<span class="compact-days" style="color:' + daysColor + ';">' + days + ' <span class="compact-days-label">days</span></span>' : '<span class="compact-days-label">Not on lot</span>'}
                            <span class="compact-tech">${escapeHtml(ro.technicianAssigned) || 'Unassigned'}</span>
                            ${ro.parkingSpot ? '<span class="compact-spot">📍 ' + escapeHtml(ro.parkingSpot) + '</span>' : ''}
                        </div>
                        <div class="compact-col-chips">${chips || '<span style="color:var(--text-secondary);font-size:0.7rem;">—</span>'}</div>
                        <div class="compact-col-actions">
                            <button class="compact-action-btn" data-action="edit-ro" data-idx="${index}" title="Edit RO">✏️</button>
                            <button class="compact-action-btn" data-action="manage-parts" data-idx="${index}" title="Manage Parts">🔩</button>
                            <button class="compact-action-btn" data-action="work-orders" data-idx="${index}" title="Work Orders">🔧</button>
                            <button class="compact-action-btn" data-action="schedule-notification" data-idx="${index}" title="Schedule Notification">🔔</button>
                            ${(isAdmin() || hasRole('Manager') || hasRole('Sr Manager')) && ro.status !== 'Delivered/Cashed Out' ? '<button class="compact-action-btn" data-action="schedule" data-idx="' + index + '" title="Schedule">📅</button>' : ''}
                        </div>
                        <div class="compact-mobile-summary">
                            <span class="compact-mobile-name">${escapeHtml(ro.customerName) || t('Unknown')}</span>
                            <span class="compact-mobile-sub">${escapeHtml(ro.rv) || t('RV not specified')}${ro.roId ? ' &middot; ' + escapeHtml(ro.roId) : ''}</span>
                            <span class="compact-mobile-sub" style="color:var(--text-primary);font-weight:600;">${escapeHtml(ro.status)} &middot; <span class="compact-urgency u-${urgencyLc}">${urgency}</span></span>
                            <div class="compact-mobile-badges">${chips || ''}</div>
                        </div>
                        <span class="compact-chevron">&#8250;</span>
                    </div>
                    <div class="compact-expand-panel" data-expand-for="${index}">
                        <div class="compact-expand-inner">
                            <div class="cep-fields">
                                <div class="cep-row">
                                    <span class="cep-label">Status</span>
                                    <select class="cep-status-dropdown status-dropdown status-${statusClass}" data-ro-index="${index}">
                                        <option value="Not On Lot" ${ro.status === 'Not On Lot' ? 'selected' : ''}>Not On Lot</option>
                                        <option value="On Lot" ${ro.status === 'On Lot' ? 'selected' : ''}>On Lot</option>
                                        <option value="Awaiting Approval" ${ro.status === 'Awaiting Approval' ? 'selected' : ''}>Awaiting Approval</option>
                                        <option value="Awaiting parts" ${ro.status === 'Awaiting parts' ? 'selected' : ''}>Awaiting Parts</option>
                                        <option value="Scheduled" ${ro.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                        <option value="Ready to Work" ${ro.status === 'Ready to Work' ? 'selected' : ''}>Ready to Work</option>
                                        <option value="In progress" ${ro.status === 'In progress' ? 'selected' : ''}>In Progress</option>
                                        <option value="Repairs Completed" ${ro.status === 'Repairs Completed' ? 'selected' : ''}>Repairs Completed</option>
                                        <option value="Waiting for QA/QC" ${ro.status === 'Waiting for QA/QC' ? 'selected' : ''}>Waiting for QA/QC</option>
                                        <option value="Ready for pickup" ${ro.status === 'Ready for pickup' ? 'selected' : ''}>Ready for Pickup</option>
                                        <option value="Delivered/Cashed Out" ${ro.status === 'Delivered/Cashed Out' ? 'selected' : ''}>Delivered/Cashed Out</option>
                                    </select>
                                </div>
                                <div class="cep-row">
                                    <span class="cep-label">Urgency</span>
                                    <select class="cep-urgency-dropdown urgency-dropdown urgency-${urgencyLc}" data-ro-index="${index}">
                                        <option value="Critical" ${urgency === 'Critical' ? 'selected' : ''}>Critical</option>
                                        <option value="High" ${urgency === 'High' ? 'selected' : ''}>High</option>
                                        <option value="Medium" ${urgency === 'Medium' ? 'selected' : ''}>Medium</option>
                                        <option value="Low" ${urgency === 'Low' ? 'selected' : ''}>Low</option>
                                    </select>
                                </div>
                            </div>
                            <div class="cep-fields">
                                <div class="cep-row">
                                    <span class="cep-label">Technician</span>
                                    <span class="cep-value">${escapeHtml(ro.technicianAssigned) || 'Unassigned'}</span>
                                </div>
                                <div class="cep-row">
                                    <span class="cep-label">Parking Spot</span>
                                    <span class="cep-value">${ro.parkingSpot ? '📍 ' + escapeHtml(ro.parkingSpot) : '—'}</span>
                                </div>
                            </div>
                            <div class="cep-actions">
                                <button class="cep-action-btn" data-action="edit-ro" data-idx="${index}">✏️ Edit RO</button>
                                <button class="cep-action-btn" data-action="manage-parts" data-idx="${index}">🔩 Parts</button>
                                <button class="cep-action-btn" data-action="work-orders" data-idx="${index}">🔧 WO</button>
                                ${(isAdmin() || hasRole('Manager') || hasRole('Sr Manager')) && ro.status !== 'Delivered/Cashed Out' ? '<button class="cep-action-btn" data-action="schedule" data-idx="' + index + '">📅 Schedule</button>' : ''}
                            </div>
                        </div>
                    </div>`;
                }

                /* ── Standard Card View (condensed / regular / expanded) ─ */
                // v1.414 Phase A1+A2: stash index on ro for woMissingBadge fallback
                ro._idx = index;
                return `
                    <div class="ro-card ro-card-status-${statusClass}${ro.hasOpenPartsRequest ? ' has-parts-request' : ''}" data-ro-index="${index}">
                        <button class="schedule-notif-banner-btn" data-action="schedule-notification" data-idx="${index}"
                                title="Schedule a future email reminder for this RO"
                                style="display:block;width:calc(100% - 20px);margin:8px 10px 14px 10px;padding:10px 12px;border:2px solid #dc2626;background:rgba(220,38,38,0.08);color:#dc2626;font-weight:700;font-size:0.82rem;line-height:1.25;border-radius:8px;cursor:pointer;text-align:center;letter-spacing:0.02em;text-transform:uppercase;">
                            🔔 ${t('Schedule Important Tasks or Update Notifications')}
                        </button>
                        ${woMissingBadge(ro)}
                        ${shouldShow('urgencySelector') && ro.roType !== 'shop' ? `
                        <div class="urgency-selector-badge">
                            <select class="urgency-dropdown urgency-${(ro.urgency || 'Medium').toLowerCase()}"
                                    title="Change urgency level">
                                <option value="Critical" ${ro.urgency === 'Critical' ? 'selected' : ''}>${t('CRITICAL')}</option>
                                <option value="High" ${ro.urgency === 'High' ? 'selected' : ''}>${t('HIGH')}</option>
                                <option value="Medium" ${ro.urgency === 'Medium' ? 'selected' : ''}>${t('MEDIUM')}</option>
                                <option value="Low" ${ro.urgency === 'Low' ? 'selected' : ''}>${t('LOW')}</option>
                            </select>
                        </div>
                        ` : ''}
                        
                        ${shouldShow('rvPhoto') && ro.rvPhotoUrl ? `
                        <div class="rv-photo">
                            <img src="${ro.rvPhotoUrl}" alt="RV Photo" onerror="this.style.opacity='0.3'" />
                        </div>
                        ` : ''}
                        
                        ${shouldShow('daysOnLot') || shouldShow('dollarValue') ? `
                        <div class="card-header-row">
                            ${shouldShow('daysOnLot') ? `
                            <div class="days-on-lot" style="color: ${getDaysHeatColor(calculateDaysOnLot(ro))};">
                                ${calculateDaysOnLot(ro) !== null ? calculateDaysOnLot(ro) + ' <span class=\"days-label\">' + t('Days') + '</span>' : '<span class=\"days-label\">' + t('Not On Lot') + '</span>'}
                            </div>
                            ` : ''}
                            ${shouldShow('dollarValue') && ro.dollarValue !== undefined && ro.dollarValue !== null ? `
                            <div class="dollar-value">
                                $${ro.dollarValue.toLocaleString()}
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        
                        ${shouldShow('customerName') ? `
                        <div class="customer-name">${escapeHtml(ro.customerName) || t('Unknown Customer')}</div>
                        ${ro.roId ? `<div class="card-ro-id">${escapeHtml(ro.roId)}</div>` : ''}
                        ${ro.parkingSpot ? `<div class="card-parking-badge" data-action="parking-spot" data-idx="${index}" title="Click Edit RO to change parking spot">📍 ${escapeHtml(ro.parkingSpot)}</div>` : ''}
                        ${ro.insuranceData ? (() => { try { const d = JSON.parse(ro.insuranceData); if (!d.isInsuranceClaim) return ''; const badges = '<div class="insurance-badge">🛡️ ' + t('Insurance Claim') + '</div>'; const hybrid = d.roType === 'hybrid' ? '<div class="customer-pay-badge">💵 ' + t('Customer Pay') + '</div>' : ''; return badges + hybrid; } catch(e) { return ''; } })() : ''}
                        ${ro.roType === 'warranty' ? '<div class="warranty-badge">🔄 Warranty</div><div class="warranty-badge" style="background:rgba(0,0,0,0.08);border-color:rgba(0,0,0,0.15);color:#6b7280;margin-top:2px;">$0 — No Charge</div>' : ''}
                        ${ro.roType === 'hybrid' ? '<div class="hybrid-badge">🔧🛡️ New + Warranty</div>' : ''}
                        ${ro.roType === 'shop' ? '<div class="shop-badge">🏪 Shop Operations</div>' : ''}
                        ${ro.isTraining ? '<div class="training-badge">🎓 Training</div>' : ''}
                        ${ro.partsJson ? (() => { try { const parts = JSON.parse(ro.partsJson); if (!parts.length) return ''; const hasBackordered = parts.some(p => p.status === 'Backordered' || p.status === 'Lost'); const hasSourcing = parts.some(p => p.status === 'Sourcing'); const hasOutstanding = parts.some(p => p.status === 'Ordered' || p.status === 'In Transit'); const allDone = parts.every(p => p.status === 'Received' || p.status === 'Installed' || p.status === 'Returned'); const color = hasBackordered ? 'red' : hasOutstanding ? 'yellow' : hasSourcing ? 'yellow' : 'green'; const worstLabel = hasBackordered ? (parts.filter(p => p.status==='Backordered'||p.status==='Lost').length + ' ' + t('Backordered')) : hasOutstanding ? (parts.filter(p => p.status==='Ordered'||p.status==='In Transit').length + ' ' + t('Outstanding')) : hasSourcing ? (parts.filter(p => p.status==='Sourcing').length + ' ' + t('Requested')) : t('All Received'); return '<div class="parts-badge ' + color + '" data-action="parts-badge" data-idx="' + index + '">🔩 ' + parts.length + ' Parts • ' + worstLabel + '</div>'; } catch(e) { return ''; } })() : ''}
                        ${ro.partsStatus ? `
                        <div class="parts-status-chip ${escapeHtml(ro.partsStatus === 'outstanding' ? 'ordered' : ro.partsStatus)}" data-action="parts-status" data-idx="${index}" title="Parts status — click to update">
                            ${ ro.partsStatus === 'requested' ? `🙋 ${t('PARTS REQUESTED')}` : ro.partsStatus === 'sourcing' ? `🔍 ${t('PART SOURCING')}` : (ro.partsStatus === 'ordered' || ro.partsStatus === 'outstanding') ? `📦 ${t('PARTS ORDERED')}` : ro.partsStatus === 'estimate' ? `📋 ${t('PARTS ESTIMATE')}` : `✅ ${t('PARTS RECEIVED')}` }
                        </div>
                        ` : ro.hasOpenPartsRequest ? `
                        <div class="parts-status-chip requested" data-action="parts-status" data-idx="${index}" title="Parts requested — click to update status">
                            🙋 ${t('PARTS REQUESTED')}
                        </div>
                        ` : ''}
                        ` : ''}

                        ${woSummaryChips(ro, index)}

                        <!-- QR Code — collapsible toggle always shown, content hidden by default in Regular view -->
                        <div class="qr-collapsible-wrapper">
                            <button class="qr-toggle-btn" data-action="toggle-qr" data-idx="${index}" title="Show/Hide QR Code">
                                📱 ${t('QR Code')} <span class="qr-chevron">▼</span>
                            </button>
                            <div class="qr-collapsible" style="display:none;">
                                <div class="qr-code-section">
                                    <div class="qr-code-container" data-action="open-qr" data-idx="${index}">
                                        <canvas id="qr-${index}" class="qr-canvas"></canvas>
                                    </div>
                                    <div class="qr-label">${escapeHtml(ro.customerName) || t('Unknown')}</div>
                                    ${shouldShow('rvDetails') ? `
                                    <div class="qr-label" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: -4px;">${escapeHtml(ro.rv) || t('RV Not Specified')}</div>
                                    ` : ''}
                                    <button class="print-qr-btn" data-action="print-qr" data-idx="${index}" title="Print QR Label">
                                        ${t('🖨️ Print Label')}
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <button class="checkin-btn" data-action="checkin" data-idx="${index}" title="Check in to this RO">
                            ${t('🚪 Tech Check In')}
                        </button>
                        
                        ${shouldShow('photoUpload') ? `
                        <button class="photo-upload-btn" data-action="photo-library" data-idx="${index}" title="Manage Photos & Docs">
                            📷 ${ro.rvPhotoUrl ? t('Manage Photos & Docs') : t('Add Photo / Docs')}
                        </button>
                        ` : ''}
                        
                        ${shouldShow('statusDropdown') ? `
                        <div class="status-selector-container">
                            <select class="status-dropdown status-${statusClass}"
                                    data-original-status="${escapeHtml(ro.status)}">
                                <option value="Not On Lot" ${ro.status === 'Not On Lot' ? 'selected' : ''}>${t('Not On Lot')}</option>
                                <option value="On Lot" ${ro.status === 'On Lot' ? 'selected' : ''}>${t('On Lot')}</option>
                                <option value="Awaiting Approval" ${ro.status === 'Awaiting Approval' ? 'selected' : ''}>${t('Awaiting Approval')}</option>
                                <option value="Awaiting parts" ${ro.status === 'Awaiting parts' ? 'selected' : ''}>${t('Awaiting Parts')}</option>
                                <option value="Scheduled" ${ro.status === 'Scheduled' ? 'selected' : ''}>${t('Scheduled')}</option>
                                <option value="Ready to Work" ${ro.status === 'Ready to Work' ? 'selected' : ''}>${t('Ready to Work')}</option>
                                <option value="In progress" ${ro.status === 'In progress' ? 'selected' : ''}>${t('In Progress')}</option>
                                <option value="Repairs Completed" ${ro.status === 'Repairs Completed' ? 'selected' : ''}>${t('Repairs Completed')}</option>
                                <option value="Waiting for QA/QC" ${ro.status === 'Waiting for QA/QC' ? 'selected' : ''}>${t('Waiting for QA/QC')}</option>
                                <option value="Ready for pickup" ${ro.status === 'Ready for pickup' ? 'selected' : ''}>${t('Ready for Pickup')}</option>
                                <option value="Delivered/Cashed Out" ${ro.status === 'Delivered/Cashed Out' ? 'selected' : ''}>${t('Delivered/Cashed Out')}</option>
                            </select>
                        </div>
                        ` : ''}
                        
                        ${shouldShow('repairTypeTags') || shouldShow('rvDetails') || shouldShow('technicianAssigned') || shouldShow('contactInfo') ? `
                        <div class="rv-info">
                            ${shouldShow('repairTypeTags') ? `
                            <div class="info-row">
                                <span class="info-label">${t('Type:')}</span>
                                <span class="info-value repair-types-container">
                                    ${(ro.repairType || 'General').split(',').map(type => 
                                        `<span class="repair-type-tag">${type.trim()}</span>`
                                    ).join('')}
                                </span>
                            </div>
                            ` : ''}
                            ${shouldShow('rvDetails') ? `
                            <div class="info-row">
                                <span class="info-label">${t('RV:')}</span>
                                <span class="info-value">${escapeHtml(ro.rv) || t('Not specified')}</span>
                            </div>
                            ${ro.vin ? `
                            <div class="info-row">
                                <span class="info-label">${t('VIN:')}</span>
                                <span class="info-value" style="font-family:'JetBrains Mono',monospace; font-size:0.8rem; letter-spacing:0.04em;">${escapeHtml(ro.vin)}</span>
                            </div>
                            ` : ''}
                            ` : ''}
                            ${shouldShow('technicianAssigned') ? `
                            <div class="info-row">
                                <span class="info-label">${t('Tech:')}</span>
                                <span class="info-value">${escapeHtml(ro.technicianAssigned) || t('Unassigned')}</span>
                            </div>
                            ` : ''}
                            ${shouldShow('contactInfo') && ro.customerPhone ? `
                            <div class="info-row">
                                <span class="info-label">${t('Phone:')}</span>
                                <span class="info-value"><a href="tel:${escapeHtml(ro.customerPhone)}" class="contact-link">${escapeHtml(ro.customerPhone)}</a></span>
                            </div>
                            ` : ''}
                            ${shouldShow('contactInfo') && ro.customerEmail ? `
                            <div class="info-row">
                                <span class="info-label">${t('Email:')}</span>
                                <span class="info-value"><a href="mailto:${escapeHtml(ro.customerEmail)}" class="contact-link">${escapeHtml(ro.customerEmail)}</a></span>
                            </div>
                            ` : ''}
                            ${shouldShow('contactInfo') && ro.customerAddress ? `
                            <div class="info-row">
                                <span class="info-label">${t('Address:')}</span>
                                <span class="info-value">${escapeHtml(ro.customerAddress)}</span>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        
                        ${shouldShow('repairDescription') ? `
                        <div class="note-item editable-field" data-action="edit-field" data-idx="${index}" data-field="repairDescription">
                            <div class="note-header">
                                <span class="note-icon">🔩</span>
                                <span class="note-title">${t('Repair Description')}</span>
                            </div>
                            <div class="note-content repair-desc">${ro.repairDescription ? escapeHtml(ro.repairDescription) : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>
                        </div>
                        ` : ''}
                        
                        ${shouldShow('progressBar') && ro.percentComplete !== undefined && ro.percentComplete !== null ? `
                        <div class="progress-section">
                            <div class="progress-header">
                                <span class="progress-label">${t('Progress')}</span>
                                <input type="number" 
                                       class="progress-input" 
                                       value="${ro.percentComplete}" 
                                       min="0" 
                                       max="100" 
                                       step="5"
                                       title="Manual adjustment">
                                <span class="progress-value">${ro.percentComplete}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${ro.percentComplete}%"></div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${shouldShow('roStatusNotes') || shouldShow('customerCommNotes') ? `
                        <div class="notes-section">
                            ${shouldShow('roStatusNotes') ? `
                            <div class="note-item editable-field" data-action="edit-field" data-idx="${index}" data-field="roStatusNotes">
                                <div class="note-header">
                                    <span class="note-icon">🔧</span>
                                    <span class="note-title">${t('RO Status')}</span>
                                </div>
                                <div class="note-content">${ro.roStatusNotes ? ro.roStatusNotes.split('\n').map(escapeHtml).reverse().join('\n') : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>
                            </div>
                            ` : ''}
                            ${shouldShow('customerCommNotes') ? `
                            <div class="note-item editable-field" data-action="edit-field" data-idx="${index}" data-field="customerCommunicationNotes">
                                <div class="note-header">
                                    <span class="note-icon">💬</span>
                                    <span class="note-title">${t('Customer Comm')}</span>
                                </div>
                                <div class="note-content">${ro.customerCommunicationNotes ? ro.customerCommunicationNotes.split('\n').map(escapeHtml).reverse().join('\n') : '<span class="placeholder-text">' + t('Click Here To Update') + '</span>'}</div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        
                        ${shouldShow('timeLogs') ? (() => {
                            const roId = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
                            const timeStats = calculateTotalHours(roId);
                            if (timeStats.sessionCount > 0) {
                                return `
                                <div class="time-logs-section">
                                    <div class="time-logs-header">
                                        <span class="time-icon">⏱️</span>
                                        <span class="time-total">${formatHours(timeStats.totalSeconds)}</span>
                                        <span class="time-sessions">(${timeStats.sessionCount} ${timeStats.sessionCount !== 1 ? t('sessions') : t('session')})</span>
                                    </div>
                                    <button class="view-time-logs-btn" data-action="time-logs" data-idx="${index}" title="View detailed time logs">
                                        ${t('View Time Logs')}
                                    </button>
                                    ${isAdmin() ? `
                                    <button class="view-time-logs-btn" data-action="refresh-logs" data-idx="${index}" title="Admin: Force refresh time logs from Google Sheets" style="margin-top: 8px;">
                                        ${t('🔄 Refresh Time Logs')}
                                    </button>
                                    ` : ''}
                                </div>
                                `;
                            }
                            return '';
                        })() : ''}
                        
                        <div class="card-actions-primary">
                        ${shouldShow('editButton') ? `
                        <button class="edit-ro-btn" data-action="edit-ro" data-idx="${index}">
                            ${t('✏️ Edit RO')}
                        </button>
                        <button class="parts-btn" data-action="manage-parts" data-idx="${index}">
                            ${t('🔩 Manage Parts')}
                        </button>
                        ` : ''}
                        <button class="request-parts-btn" data-action="request-parts" data-idx="${index}" title="Submit a parts request for this RO">
                            ${t('🔩 Request Parts')}
                        </button>
                        <button class="work-order-btn" data-action="work-orders" data-idx="${index}">
                            🔧 ${t('Work Orders')}
                        </button>
                        </div>
                        <div class="card-actions-secondary">
                        ${canSeeWorkList() ? `<button class="card-secondary-btn" data-action="add-to-list" data-idx="${index}" data-sid="${ro._supabaseId}" title="Add this RO to your personal work list">&#128203; Add to My List</button>` : ''}
                        ${''/* [KENECT TEARDOWN v1.445 S92] Messages button removed — kenect-proxy edge fn was deleted 2026-04-11; clicking threw CORS/ERR_FAILED */}
                        ${(isAdmin() || hasRole('Manager') || hasRole('Sr Manager')) && (ro.partsStatus || ro.hasOpenPartsRequest) ? `
                        <button class="mark-ordered-btn" data-action="set-parts-status" data-idx="${index}" title="Update parts status for this RO">
                            ${t('🔩 Set Parts Status')}
                        </button>
                        ` : ''}
                        ${(isAdmin() || hasRole('Manager') || hasRole('Sr Manager')) && ro.status !== 'Delivered/Cashed Out' ? `
                        <button class="schedule-ro-btn" data-action="schedule" data-idx="${index}">
                            📅 ${ro.status === 'Scheduled' ? t('Reschedule') : t('Schedule')}
                        </button>` : ''}
                        ${isAdmin() && (ro.status === 'Delivered/Cashed Out') ? `
                        <button class="archive-ro-btn visible" data-action="archive" data-idx="${index}">
                            ${t('📦 Archive to Cashiered')}
                        </button>
                        ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Highlight search matches in rendered cards
            if (currentSearchFilter) {
                highlightSearchMatches(grid, currentSearchFilter);
            }

            // QR codes now render on-demand when toggle is clicked
            // Just load Drive images for RV photos
            if (accessToken) {
                setTimeout(() => loadAllDriveImages(), 100);
            }

            // Deep-link: scroll to and highlight the target RO if ?ro= is in the URL
            if (_deepLinkRoId) handleDeepLink();
        }

        export function updateStats(data, filteredData) {
            const total = data.length;
            const filtered = filteredData ? filteredData.length : total;
            const inProgress = data.filter(ro => ro.status === 'In progress').length;
            const awaitingParts = data.filter(ro => {
                if (ro.status === 'Awaiting parts') return true;
                if (ro.partsJson) {
                    try {
                        const parts = JSON.parse(ro.partsJson);
                        return parts.some(p => ['Ordered','In Transit','Backordered','Lost'].includes(p.status));
                    } catch(e) {}
                }
                return false;
            }).length;
            // Exclude "Not On Lot" RVs (with no arrival date) from days-on-lot stats
            const onLotROs = data.filter(ro => !(ro.status === 'Not On Lot' && !ro.dateArrived));
            const avgDays = onLotROs.length > 0
                ? Math.round(onLotROs.reduce((sum, ro) => sum + (calculateDaysOnLot(ro) || 0), 0) / onLotROs.length)
                : 0;
            
            // Calculate longest wait (max days on lot, excluding Not On Lot)
            const longestWait = onLotROs.length > 0
                ? Math.max(...onLotROs.map(ro => calculateDaysOnLot(ro) || 0))
                : 0;
            
            const totalValue = data.reduce((sum, ro) => sum + (ro.dollarValue || 0), 0);
            
            // Calculate filtered value
            const filteredValue = filteredData 
                ? filteredData.reduce((sum, ro) => sum + (ro.dollarValue || 0), 0)
                : totalValue;

            document.getElementById('statTotal').textContent = filtered;
            document.getElementById('statTotalValue').textContent = '$' + totalValue.toLocaleString();
            document.getElementById('statFilteredValue').textContent = '$' + filteredValue.toLocaleString();
            document.getElementById('statProgress').textContent = inProgress;
            document.getElementById('statParts').textContent = awaitingParts;
            document.getElementById('statAvgDays').textContent = avgDays;
            
            // Apply heat color to longest wait
            const longestWaitEl = document.getElementById('statLongestWait');
            longestWaitEl.textContent = longestWait;
            longestWaitEl.style.color = getDaysHeatColor(longestWait);
            
            document.getElementById('totalRVs').textContent = `${filtered} ${t('RVs on Lot')}`;
            
            // Status color map for the left border accent on dynamic cards
            const statusColorMap = {
                'Not On Lot':        '#9ca3af',
                'On Lot':            '#34c759',
                'Awaiting Approval': '#ffcc00',
                'Awaiting parts':    '#ff9500',
                'Ready to Work':     '#84cc16',
                'In progress':       '#0a84ff',
                'Repairs Completed': '#5e5ce6',
                'Waiting for QA/QC': '#FF1493',
                'Ready for pickup':  '#34c759',
                'Delivered/Cashed Out': '#6b7280'
            };

            const ALL_STATUSES = [
                'Not On Lot', 'On Lot', 'Awaiting Approval', 'Awaiting parts',
                'Ready to Work', 'In progress', 'Repairs Completed', 'Waiting for QA/QC',
                'Ready for pickup', 'Delivered/Cashed Out'
            ];

            const isCondensedOrRegular = (currentViewMode === 'condensed' || currentViewMode === 'regular');
            const progressCard = document.getElementById('statProgressCard');
            const partsCard = document.getElementById('statPartsCard');
            const dynamicCard = document.getElementById('statDynamicStatusCard');
            const dynamicContent = document.getElementById('statDynamicStatusContent');
            const repairCardsContainer = document.getElementById('statDynamicRepairCards');

            // --- Case 1: A repair type filter is active ---
            if (currentRepairFilter !== 'all' && filteredData) {
                // Hide default static cards
                if (progressCard) progressCard.style.display = 'none';
                if (partsCard) partsCard.style.display = 'none';
                if (dynamicCard) dynamicCard.style.display = 'none';

                // Build one card per status that has count > 0
                const cards = ALL_STATUSES.map(status => {
                    const count = filteredData.filter(ro => ro.status === status).length;
                    if (count === 0) return '';
                    const color = statusColorMap[status] || 'var(--accent-info)';
                    return `
                        <div class="stat-card" style="--card-accent: ${color}; border-left: 4px solid ${color};">
                            <div class="stat-label">${status}</div>
                            <div class="stat-value" style="color: ${color};">${count}</div>
                        </div>`;
                }).join('');

                if (repairCardsContainer) repairCardsContainer.innerHTML = cards;

            // --- Case 2: Condensed/Regular with status filters active ---
            } else if (isCondensedOrRegular) {
                // Clear repair cards
                if (repairCardsContainer) repairCardsContainer.innerHTML = '';
                if (progressCard) progressCard.style.display = 'none';
                if (partsCard) partsCard.style.display = 'none';

                if (currentStatusFilters.length > 0 && filteredData) {
                    const statusCounts = currentStatusFilters.map(status => {
                        const count = filteredData.filter(ro => ro.status === status).length;
                        return { status, count };
                    });
                    const statusHTML = statusCounts.map(({ status, count }) => {
                        return `<div style="margin-bottom: 6px;"><span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">${status}</span><div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${count}</div></div>`;
                    }).join('');
                    dynamicContent.innerHTML = statusHTML;
                    dynamicCard.style.display = 'block';
                } else {
                    dynamicCard.style.display = 'none';
                }

            // --- Case 3: Default / Expanded view ---
            } else {
                if (repairCardsContainer) repairCardsContainer.innerHTML = '';
                if (progressCard) progressCard.style.display = 'block';
                if (partsCard) partsCard.style.display = 'block';
                if (dynamicCard) dynamicCard.style.display = 'none';
            }
        }

export function renderERAdminList() {
    const body = document.getElementById('erAdminBody');
    if (!_erData.length) {
        body.innerHTML = '<div style="text-align:center;color:#6b7280;padding:40px;font-style:italic;">No enhancement requests found.</div>';
        return;
    }
    const statusColors = { unreviewed:'#f59e0b', reviewed:'#3b82f6', planned:'#8b5cf6', 'in-progress':'#10b981', done:'#22c55e', declined:'#6b7280' };
    body.innerHTML = _erData.map(er => {
        const date = new Date(er.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Chicago' });
        const sc = statusColors[er.status] || '#6b7280';
        return '<div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:10px;padding:14px 16px;margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:200px;">' +
                    '<div style="font-weight:700;color:white;font-size:0.95rem;margin-bottom:4px;">' + (er.description.length > 120 ? er.description.substring(0,120) + '...' : er.description) + '</div>' +
                    '<div style="font-size:0.78rem;color:#94a3b8;">' + (er.submitted_by_name || er.submitted_by) + ' &middot; ' + date + ' &middot; from <strong>' + er.source_page + '</strong></div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">' +
                    '<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:3px 10px;border-radius:8px;font-size:0.75rem;font-weight:600;">' + er.category + '</span>' +
                    '<select onchange="updateERStatus(\'' + er.id + '\',this.value)" style="background:#1e293b;color:' + sc + ';border:1px solid #334155;border-radius:6px;padding:4px 8px;font-size:0.78rem;font-weight:600;cursor:pointer;">' +
                        ['unreviewed','reviewed','planned','in-progress','done','declined'].map(s => '<option value="' + s + '"' + (s === er.status ? ' selected' : '') + ' style="color:' + (statusColors[s]||'#6b7280') + '">' + s + '</option>').join('') +
                    '</select>' +
                '</div>' +
            '</div>' +
            (er.admin_notes ? '<div style="margin-top:8px;padding:8px 10px;background:#1e293b;border-radius:6px;font-size:0.8rem;color:#93c5fd;"><strong>Admin:</strong> ' + er.admin_notes + '</div>' : '') +
            '<div style="margin-top:8px;display:flex;gap:8px;">' +
                '<input id="erNote_' + er.id + '" placeholder="Add admin note..." value="' + (er.admin_notes || '').replace(/"/g, '&quot;') + '" style="flex:1;padding:6px 10px;background:#1e293b;color:white;border:1px solid #334155;border-radius:6px;font-size:0.8rem;" />' +
                '<button onclick="saveERNote(\'' + er.id + '\')" style="background:#1e3a5f;color:#93c5fd;border:1px solid #334155;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:0.78rem;font-weight:600;">Save Note</button>' +
            '</div>' +
        '</div>';
    }).join('');
}


// ---- Window bridge (Phase 6 additive) ----
Object.assign(window, {
  shouldShow,
  renderBoard,
  updateStats,
  renderERAdminList,
});
