// js/parts.js — Phase 8 (ADDITIVE): parts management, parts requests, parts notifications.
// v1.432 (Session 85, 2026-06-01).
//
// Extracted VERBATIM from the index.html inline <script> (17 live functions):
//   loadPartsFromSupabase, openPartsModal, showAddPartForm, savePartForm, editPartRow,
//   deletePartRow, markPartReceived, appendPartToSupabase, updatePartInSupabase,
//   deletePartFromSupabase, openPartsRequestModal, submitPartsRequest,
//   openPartsStatusModal, setPartsStatus, notifyPartsRequester, notifyPartsEtaUpdate,
//   renderPartsPhotoPreview.
//
// DELIBERATELY NOT EXTRACTED: markPartsOrdered() + its helper _doMarkPartsOrdered().
//   These are orphaned (no live call site since the "Mark Parts Ordered" button was
//   removed). They are being repurposed by the upcoming Requested/Ordered parts-status
//   feature, so they stay inline in index.html and untouched here. Do NOT add them to
//   this module until that feature lands.
//
// ADDITIVE PHASE — the inline copies of the 17 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openPartsModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions (getSB, supabaseSession,
// currentData, currentFilteredData, partsData, _partsRequestFiles, PART_STATUSES,
// PART_STATUS_COLORS, ALL_PART_FIELDS, escapeHtml, renderBoard, writeAuditLog, isAdmin,
// hasRole, t, ...) resolves through the SHARED global environment to the SAME symbol the
// inline copy uses — module-owned helpers via their window bridge, inline constants/state
// via the global lexical environment + backward-compat window globals.
//
// WARNING: savePartForm / markPartReceived / setPartsStatus / appendPartToSupabase /
// updatePartInSupabase / deletePartFromSupabase WRITE to the parts table (+ audit_log via
// writeAuditLog). This additive build MUST be validated with a NON-DESTRUCTIVE write test
// on a $0 staff-tester RO (add part -> mark received -> set status -> audit_log verified
// -> reverted) before promote to main.
//
// Proper ESM imports (config/state/utils/render/auth/ro-crud) + deletion of the inline
// copies are deferred to the Phase 8 delete-inline cleanup, after this additive build
// soaks. Do NOT rewrite references here until that phase.

        export async function loadPartsFromSupabase() {
            try {
                const { data: rows, error } = await getSB()
                    .from('parts')
                    .select('*, repair_orders(ro_id)')
                    .order('created_at', { ascending: true });

                if (error) throw error;

                partsData = {};
                (rows || []).forEach((row, i) => {
                    const roId = row.repair_orders?.ro_id;
                    if (!roId) return;
                    if (!partsData[roId]) partsData[roId] = [];
                    partsData[roId].push({
                        _supabaseId:     row.id,
                        roId:            roId,
                        partName:        row.part_name || '',
                        partNumber:      row.part_number || '',
                        condition:       row.condition || '',
                        qty:             row.qty || 1,
                        status:          row.status || 'Ordered',
                        partsSource:     row.parts_source || '',
                        poNumber:        row.po_number || '',
                        orderedBy:       row.ordered_by || '',
                        dateOrdered:     row.date_ordered || '',
                        eta:             row.eta || '',
                        trackingNumber:  row.tracking_number || '',
                        partUrl:         row.part_url || '',
                        returnDeadline:  row.return_deadline || '',
                        wholesalePrice:  row.wholesale_price || '',
                        retailPrice:     row.retail_price || '',
                        coreCharge:      row.core_charge || '',
                        laborHours:      row.labor_hours || '',
                        supplier:        row.supplier || '',
                        salesAssocName:  row.sales_assoc_name || '',
                        salesAssocPhone: row.sales_assoc_phone || '',
                        salesAssocEmail: row.sales_assoc_email || '',
                        dateReceived:    row.date_received || '',
                        receivedBy:      row.received_by || '',
                        warrantyPeriod:  row.warranty_period || '',
                        notes:           row.notes || '',
                    });
                });

                log('✅ Parts loaded for', Object.keys(partsData).length, 'ROs');
                updatePartsJsonOnData();
                renderBoard();

                // Refresh Merge Dupes button — isAdmin() may return false here if currentUser
                // was set to 'unknown@user.com' before the Supabase session email arrived,
                // so also check supabaseSession.user.email directly as a reliable fallback.
                const _sessionEmail = (supabaseSession?.user?.email || '').toLowerCase();
                const _isAdminNow = isAdmin();
                if (_isAdminNow) {
                    const dupeGroups = findDuplicateGroups();
                    const dupeCount = dupeGroups.reduce((sum, g) => sum + g.length - 1, 0);
                    const dupesBtn = document.getElementById('manageDupesBtn');
                    const badge = document.getElementById('dupesCount');
                    if (dupesBtn) dupesBtn.style.display = dupeCount > 0 ? 'inline-block' : 'none';
                    if (badge) badge.textContent = dupeCount;
                    log(`🔗 Dupe check: ${dupeCount} duplicate(s) found, button ${dupeCount > 0 ? 'shown' : 'hidden'}`);
                }
            } catch(e) {
                warn('Could not load parts from Supabase:', e);
            }
        }

        export function openPartsModal(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            if (!ro) return;
            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );
            const roId = ro.roId;
            const parts = (roId && partsData[roId]) ? partsData[roId] : [];

            const renderPartsRows = (parts) => parts.length === 0
                ? '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8;">No parts yet. Click + Add Part to get started.</td></tr>'
                : parts.map((p, i) => {
                    const color = PART_STATUS_COLORS[p.status] || '#9ca3af';
                    return `<tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:10px 8px;font-weight:600;color:#1e293b;">${escapeHtml(p.partName) || '—'}</td>
                        <td style="padding:10px 8px;color:#64748b;font-size:0.85rem;">${escapeHtml(p.partNumber) || '—'}</td>
                        <td style="padding:10px 8px;color:#64748b;font-size:0.85rem;">${escapeHtml(p.supplier) || '—'}</td>
                        <td style="padding:10px 8px;text-align:center;">
                            <span style="padding:3px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}66;">${escapeHtml(p.status)}</span>
                        </td>
                        <td style="padding:10px 8px;text-align:center;color:#64748b;font-size:0.85rem;">${p.qty || 1}</td>
                        <td style="padding:10px 8px;text-align:right;color:#1e293b;font-size:0.85rem;font-weight:600;">${p.wholesalePrice ? '$' + parseFloat(p.wholesalePrice).toFixed(2) : '—'}</td>
                        <td style="padding:10px 8px;text-align:right;color:#16a34a;font-size:0.85rem;font-weight:600;">${p.retailPrice ? '$' + parseFloat(p.retailPrice).toFixed(2) : '—'}</td>
                        <td style="padding:10px 8px;text-align:center;">
                            ${p.status !== 'Received' && p.status !== 'Installed'
                                ? `<button onclick="markPartReceived(${filteredIndex},${i})" style="padding:4px 10px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;white-space:nowrap;">✓ Received</button>`
                                : '<span style="color:#86efac;font-size:0.8rem;">✓</span>'}
                        </td>
                        <td style="padding:10px 8px;text-align:center;">
                            <div style="display:flex;gap:4px;justify-content:center;">
                                <button onclick="editPartRow(${filteredIndex},${i})" style="padding:4px 8px;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">✏️</button>
                                <button onclick="deletePartRow(${filteredIndex},${i})" style="padding:4px 8px;background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">✕</button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');

            const modalHTML = `
                <div id="partsModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="closePartsModal(event)">
                    <div style="background:white;border-radius:16px;padding:28px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;font-size:1.5rem;">🔩 Parts — ${escapeHtml(ro.customerName)}</h2>
                            <button onclick="closePartsModal()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;font-weight:600;">✕ Close</button>
                        </div>
                        <div style="color:#64748b;font-size:0.85rem;margin-bottom:16px;">${escapeHtml(ro.rv) || ''} &nbsp;•&nbsp; RO: ${escapeHtml(roId) || '—'}</div>

                        <!-- Add Part Form (hidden by default) -->
                        <div id="addPartForm" style="display:none;background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid #e2e8f0;">
                            <div style="font-weight:700;color:#1e293b;margin-bottom:14px;font-size:1rem;" id="addPartFormTitle">+ Add New Part</div>

                            <!-- Section: Supplier Contact -->
                            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#8b5cf6;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #ddd6fe;">🏢 Supplier Contact</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Supplier</label><input type="text" id="pf_supplier" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Sales Associate</label><input type="text" id="pf_salesAssocName" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Assoc. Phone</label><input type="tel" id="pf_salesAssocPhone" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Assoc. Email</label><input type="email" id="pf_salesAssocEmail" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>

                            <!-- Section: Core Info -->
                            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff9500;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #fed7aa;">🔩 Core Info</div>
                            <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Part Name *</label><input type="text" id="pf_partName" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Part Number</label><input type="text" id="pf_partNumber" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Condition</label>
                                    <select id="pf_condition" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;">
                                        <option value="">Select</option>
                                        <option value="New">New</option>
                                        <option value="Remanufactured">Remanufactured</option>
                                        <option value="Used">Used</option>
                                        <option value="OEM">OEM</option>
                                    </select></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Qty</label><input type="number" id="pf_qty" value="1" min="1" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 3fr;gap:10px;margin-bottom:16px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Work Order Master Status</label>
                                    <select id="pf_status" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;">
                                        ${PART_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
                                    </select></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Overall WO Notes</label><input type="text" id="pf_notes" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>

                            <!-- Section: Order Info -->
                            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#3b82f6;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #bfdbfe;">📦 Order Info</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Parts Source</label><input type="text" id="pf_partsSource" placeholder="Amazon, NTP, UnitedRV..." style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">PO Number</label><input type="text" id="pf_poNumber" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Ordered By</label><input type="text" id="pf_orderedBy" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Date Ordered</label><input type="date" id="pf_dateOrdered" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">ETA</label><input type="date" id="pf_eta" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Tracking Number</label><input type="text" id="pf_trackingNumber" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Return Deadline</label><input type="date" id="pf_returnDeadline" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Part URL</label><input type="url" id="pf_partUrl" placeholder="https://..." style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>

                            <!-- Section: Pricing -->
                            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#10b981;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #a7f3d0;">💰 Pricing</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Wholesale Price ($)</label><input type="number" id="pf_wholesalePrice" min="0" step="0.01" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Retail Price ($)</label><input type="number" id="pf_retailPrice" min="0" step="0.01" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Freight Charge ($)</label><input type="number" id="pf_coreCharge" min="0" step="0.01" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Install Labor Hrs</label><input type="number" id="pf_laborHours" min="0" step="0.25" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>

                            <!-- Section: Receipt -->
                            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ef4444;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #fecaca;">✅ Receipt</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Date Received</label><input type="date" id="pf_dateReceived" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Received By</label><input type="text" id="pf_receivedBy" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                                <div><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:3px;">Warranty Period</label><input type="text" id="pf_warrantyPeriod" placeholder="e.g. 90 days, 1 year" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;"></div>
                            </div>

                            <input type="hidden" id="pf_editIndex" value="">
                            <div style="display:flex;gap:8px;justify-content:flex-end;">
                                <button onclick="cancelPartForm()" style="padding:8px 16px;background:#64748b;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
                                <button onclick="savePartForm(${filteredIndex})" style="padding:8px 16px;background:linear-gradient(135deg,#ff9500,#e67e00);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700;">💾 Save Part</button>
                            </div>
                        </div>

                        <!-- Parts Table -->
                        <div style="overflow-x:auto;">
                            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;" id="partsTable">
                                <thead>
                                    <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                                        <th style="text-align:left;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Part Name</th>
                                        <th style="text-align:left;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Part #</th>
                                        <th style="text-align:left;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Supplier</th>
                                        <th style="text-align:center;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Status</th>
                                        <th style="text-align:center;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
                                        <th style="text-align:right;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Wholesale</th>
                                        <th style="text-align:right;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Retail</th>
                                        <th style="text-align:center;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Quick</th>
                                        <th style="text-align:center;padding:10px 8px;color:#475569;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="partsTableBody">${renderPartsRows(parts)}</tbody>
                            </table>
                        </div>
                        <button onclick="showAddPartForm()" style="width:100%;margin-top:16px;padding:12px;background:linear-gradient(135deg,#ff9500,#e67e00);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">+ Add Part</button>
                    </div>
                </div>`;

            // Store context for sub-functions
            window._partsModalContext = { filteredIndex, originalIndex, roId };
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        export function showAddPartForm(editIndex) {
            const form = document.getElementById('addPartForm');
            if (!form) return;
            form.style.display = 'block';
            // Clear all fields
            ALL_PART_FIELDS.forEach(f => {
                const el = document.getElementById('pf_' + f);
                if (el) el.value = '';
            });
            document.getElementById('pf_qty').value = '1';
            document.getElementById('pf_status').value = 'Ordered';
            document.getElementById('pf_dateOrdered').value = new Date().toISOString().slice(0,10);
            document.getElementById('pf_editIndex').value = editIndex !== undefined ? editIndex : '';
            document.getElementById('addPartFormTitle').textContent = editIndex !== undefined ? '✏️ Edit Part' : '+ Add New Part';

            // If editing, populate all fields
            if (editIndex !== undefined) {
                const ctx = window._partsModalContext;
                const parts = partsData[ctx.roId] || [];
                const part = parts[editIndex];
                if (part) {
                    ALL_PART_FIELDS.forEach(f => {
                        const el = document.getElementById('pf_' + f);
                        if (el && part[f]) el.value = part[f];
                    });
                }
            }
            document.getElementById('pf_partName').focus();
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        export async function savePartForm(filteredIndex) {
            const partName = document.getElementById('pf_partName').value.trim();
            if (!partName) { showToast('Part Name is required.', 'warning'); return; }

            const ctx = window._partsModalContext;
            const roId = ctx.roId;
            const editIndex = document.getElementById('pf_editIndex').value;
            const isEdit = editIndex !== '';

            const gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
            const part = {
                roId,
                partName,
                partNumber:      gv('pf_partNumber'),
                condition:       gv('pf_condition'),
                qty:             gv('pf_qty') || '1',
                status:          gv('pf_status'),
                notes:           gv('pf_notes'),
                partsSource:     gv('pf_partsSource'),
                poNumber:        gv('pf_poNumber'),
                orderedBy:       gv('pf_orderedBy'),
                dateOrdered:     gv('pf_dateOrdered'),
                eta:             gv('pf_eta'),
                trackingNumber:  gv('pf_trackingNumber'),
                partUrl:         gv('pf_partUrl'),
                returnDeadline:  gv('pf_returnDeadline'),
                wholesalePrice:  gv('pf_wholesalePrice'),
                retailPrice:     gv('pf_retailPrice'),
                coreCharge:      gv('pf_coreCharge'),
                laborHours:      gv('pf_laborHours'),
                supplier:        gv('pf_supplier'),
                salesAssocName:  gv('pf_salesAssocName'),
                salesAssocPhone: gv('pf_salesAssocPhone'),
                salesAssocEmail: gv('pf_salesAssocEmail'),
                dateReceived:    gv('pf_dateReceived'),
                receivedBy:      gv('pf_receivedBy'),
                warrantyPeriod:  gv('pf_warrantyPeriod'),
            };

            const saveBtn = document.querySelector('#addPartForm button[onclick*="savePartForm"]');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving...'; }

            try {
                if (!partsData[roId]) partsData[roId] = [];

                if (isEdit) {
                    const existingPart = partsData[roId][parseInt(editIndex)];
                    const _oldEta = (existingPart.eta || '').trim();
                    const _newEta = (part.eta || '').trim();
                    part._supabaseId = existingPart._supabaseId;
                    partsData[roId][parseInt(editIndex)] = part;
                    await updatePartInSheet(part);
                    // GH#18: Fire ETA notification if eta was set or changed
                    if (_newEta && _newEta !== _oldEta) {
                        const _etaRo = currentData.find(d => d.roId === roId);
                        if (_etaRo?.requestedByEmail) {
                            notifyPartsEtaUpdate(_etaRo, part.partName, _newEta)
                                .catch(e => warn('ETA notify non-blocking fail:', e));
                        }
                    }
                } else {
                    // Get RO _sb ID
                    const roRecord = currentData.find(d => d.roId === roId);
                    const roSupabaseId = roRecord?._supabaseId;
                    const newPart = await appendPartToSheet(part, roSupabaseId);
                    if (newPart) part._supabaseId = newPart.id;
                    if (!partsData[roId]) partsData[roId] = [];
                    partsData[roId].push(part);
                    // GH#18: Fire ETA notification if eta is set on a newly-added part
                    if (part.eta && roRecord?.requestedByEmail) {
                        notifyPartsEtaUpdate(roRecord, part.partName, part.eta)
                            .catch(e => warn('ETA notify non-blocking fail:', e));
                    }
                }

                // Update partsJson in Sheet1
                await updatePartsJsonInSheet(ctx.originalIndex);

                // Auto-flip parts_status to 'received' if ALL parts are now Received or Installed
                // (Same logic as markPartReceived — closes the gap when parts are edited via the form)
                const allParts = partsData[roId] || [];
                const allDone = allParts.length > 0 && allParts.every(p => p.status === 'Received' || p.status === 'Installed');
                const roForFlip = currentFilteredData[filteredIndex];
                if (allDone && roForFlip && roForFlip.partsStatus && roForFlip.partsStatus !== 'received') {
                    log('🔩 savePartForm: All parts received — auto-flipping parts_status to received');
                    await setPartsStatus(filteredIndex, 'received');
                    return; // setPartsStatus calls renderBoard()
                }

                // Re-render the parts table
                const parts = partsData[roId] || [];
                const tbody = document.getElementById('partsTableBody');
                if (tbody) {
                    // Rebuild rows (need to re-call openPartsModal's renderPartsRows)
                    closePartsModal();
                    renderBoard();
                    setTimeout(() => openPartsModal(filteredIndex), 50);
                }
            } catch(e) {
                console.error('Error saving part:', e);
                showToast('Error saving part: ' + e.message, 'error');
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Part'; }
            }
        }

        export function editPartRow(filteredIndex, partIndex) {
            showAddPartForm(partIndex);
        }

        export async function deletePartRow(filteredIndex, partIndex) {
            const ctx = window._partsModalContext;
            const parts = partsData[ctx.roId] || [];
            const part = parts[partIndex];
            if (!part) return;
            if (!confirm('Delete part "' + part.partName + '"?')) return;

            try {
                await deletePartFromSheet(part.rowIndex, part._supabaseId);
                // Remove from local partsData
                partsData[ctx.roId].splice(partIndex, 1);
                await updatePartsJsonInSheet(ctx.originalIndex);
                closePartsModal();
                renderBoard();
                setTimeout(() => openPartsModal(filteredIndex), 50);
            } catch(e) {
                console.error('Error deleting part:', e);
                showToast('Error deleting part: ' + e.message, 'error');
            }
        }

        export async function markPartReceived(filteredIndex, partIndex) {
            const ctx = window._partsModalContext;
            const parts = partsData[ctx.roId] || [];
            const part = parts[partIndex];
            if (!part) return;
            part.status = 'Received';
            try {
                await updatePartInSheet(part);
                await updatePartsJsonInSheet(ctx.originalIndex);

                // [SLACK TEARDOWN v1.445 S92] part_received notifySlack call site deleted; ro lookup retained for the auto-flip below
                const ro = currentFilteredData[filteredIndex];

                // Auto-flip parts_status to 'received' if ALL parts are now Received or Installed
                const allDone = parts.every(p => p.status === 'Received' || p.status === 'Installed');
                if (allDone && ro && ro.partsStatus !== 'received') {
                    log('🔩 All parts received — auto-flipping parts_status to received');
                    await setPartsStatus(filteredIndex, 'received');
                    // setPartsStatus calls renderBoard() so no need to re-render or reopen modal
                    return;
                }

                closePartsModal();
                renderBoard();
                setTimeout(() => openPartsModal(filteredIndex), 50);
            } catch(e) {
                console.error('Error marking received:', e);
                showToast('Error marking part received: ' + e.message, 'error');
            }
        }

        export async function appendPartToSupabase(part, roSupabaseId) {
            const { data, error } = await getSB().from('parts').insert({
                ro_id:            roSupabaseId,
                part_name:        part.partName,
                part_number:      part.partNumber || null,
                condition:        part.condition || null,
                qty:              parseInt(part.qty) || 1,
                status:           part.status || 'Ordered',
                parts_source:     part.partsSource || null,
                po_number:        part.poNumber || null,
                ordered_by:       part.orderedBy || null,
                date_ordered:     part.dateOrdered || null,
                eta:              part.eta || null,
                tracking_number:  part.trackingNumber || null,
                part_url:         part.partUrl || null,
                return_deadline:  part.returnDeadline || null,
                wholesale_price:  part.wholesalePrice ? parseFloat(part.wholesalePrice) : null,
                retail_price:     part.retailPrice ? parseFloat(part.retailPrice) : null,
                core_charge:      part.coreCharge ? parseFloat(part.coreCharge) : null,
                labor_hours:      part.laborHours ? parseFloat(part.laborHours) : null,
                supplier:         part.supplier || null,
                sales_assoc_name: part.salesAssocName || null,
                sales_assoc_phone:part.salesAssocPhone || null,
                sales_assoc_email:part.salesAssocEmail || null,
                date_received:    part.dateReceived || null,
                received_by:      part.receivedBy || null,
                warranty_period:  part.warrantyPeriod || null,
                notes:            part.notes || null,
            }).select().single();
            if (error) throw error;
            return data;
        }

        export async function updatePartInSupabase(part) {
            if (!part._supabaseId) return;
            const { error } = await getSB().from('parts').update({
                part_name:        part.partName,
                part_number:      part.partNumber || null,
                condition:        part.condition || null,
                qty:              parseInt(part.qty) || 1,
                status:           part.status || 'Ordered',
                parts_source:     part.partsSource || null,
                po_number:        part.poNumber || null,
                ordered_by:       part.orderedBy || null,
                date_ordered:     part.dateOrdered || null,
                eta:              part.eta || null,
                tracking_number:  part.trackingNumber || null,
                part_url:         part.partUrl || null,
                return_deadline:  part.returnDeadline || null,
                wholesale_price:  part.wholesalePrice ? parseFloat(part.wholesalePrice) : null,
                retail_price:     part.retailPrice ? parseFloat(part.retailPrice) : null,
                core_charge:      part.coreCharge ? parseFloat(part.coreCharge) : null,
                labor_hours:      part.laborHours ? parseFloat(part.laborHours) : null,
                supplier:         part.supplier || null,
                sales_assoc_name: part.salesAssocName || null,
                sales_assoc_phone:part.salesAssocPhone || null,
                sales_assoc_email:part.salesAssocEmail || null,
                date_received:    part.dateReceived || null,
                received_by:      part.receivedBy || null,
                warranty_period:  part.warrantyPeriod || null,
                notes:            part.notes || null,
                updated_at:       new Date().toISOString(),
            }).eq('id', part._supabaseId);
            if (error) throw error;
        }

        export async function deletePartFromSupabase(supabaseId) {
            const { error } = await getSB().from('parts').delete().eq('id', supabaseId);
            if (error) throw error;
        }

        export function openPartsRequestModal(filteredIndex) {
            if (!getSB()) { showToast('Please connect to the PRVS database first.', 'warning'); return; }
            const ro = currentFilteredData[filteredIndex];
            if (!ro) { showToast('Error: RO not found.', 'error'); return; }

            // Reset photo list and remove any existing modal
            _partsRequestFiles = [];
            document.getElementById('partsRequestModal')?.remove();

            const modal = document.createElement('div');
            modal.id = 'partsRequestModal';
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:520px;">
                    <div class="modal-header">
                        <h2 class="modal-title">🔩 Request Parts</h2>
                        <button class="modal-close" onclick="_partsRequestFiles=[]; document.getElementById('partsRequestModal').remove()">×</button>
                    </div>
                    <div style="padding:0 0 14px; color:var(--text-secondary); font-size:0.85rem; border-bottom:1px solid var(--border-color); margin-bottom:16px;">
                        <strong style="color:var(--text-primary); font-size:0.95rem;">${escapeHtml(ro.customerName)}</strong>
                        &nbsp;·&nbsp; ${escapeHtml(ro.rv) || 'RV'}
                        ${ro.roId ? `&nbsp;·&nbsp; <span style="font-family:'JetBrains Mono',monospace; color:var(--accent-info); font-size:0.8rem;">${escapeHtml(ro.roId)}</span>` : ''}
                    </div>

                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:6px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Describe the part(s) needed:</label>
                        <textarea id="partsRequestText" rows="4"
                            style="width:100%; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:8px; color:var(--text-primary); padding:10px; font-size:0.9rem; resize:vertical; box-sizing:border-box; line-height:1.5;"
                            placeholder="e.g. 12V water pump for 2019 Coachmen Freelander, part #WP-12V-001&#10;Also need 3/4&quot; PVC elbow fittings x4"></textarea>
                    </div>

                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <button onclick="partsRequestDictate()"
                            style="flex:1; padding:9px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-tertiary); color:var(--text-primary); cursor:pointer; font-size:0.85rem; font-weight:600;">
                            🎙 Dictate
                        </button>
                        <button onclick="document.getElementById('partsPhotoInput').click()"
                            style="flex:1; padding:9px 12px; border-radius:8px; border:1px solid rgba(255,149,0,0.4); background:rgba(255,149,0,0.08); color:#ff9500; cursor:pointer; font-size:0.85rem; font-weight:600;">
                            📷 Attach / Take Photo(s)
                        </button>
                    </div>

                    <!-- Hidden file input — accept images, multiple, allow camera on mobile -->
                    <input type="file" id="partsPhotoInput" accept="image/*" multiple
                        style="display:none;" onchange="previewPartsPhotos(this)">

                    <!-- Photo thumbnail preview strip -->
                    <div id="partsPhotoPreview"
                        style="display:none; flex-wrap:wrap; gap:8px; margin-bottom:12px; padding:10px; background:var(--bg-tertiary); border-radius:8px; border:1px solid var(--border-color);">
                    </div>
                    <div id="partsPhotoCount" style="font-size:0.75rem; color:#ff9500; margin-bottom:12px; min-height:1em;"></div>

                    <!-- Estimate-only toggle -->
                    <label style="display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:10px; border:2px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.07); cursor:pointer; margin-bottom:14px; user-select:none;" onclick="var c=document.getElementById('estimateOnlyCheck'); c.checked=!c.checked; syncEstimateToggle();">
                        <div style="position:relative; width:44px; height:24px; flex-shrink:0; pointer-events:none;">
                            <input type="checkbox" id="estimateOnlyCheck" style="opacity:0; width:0; height:0; position:absolute;" onchange="syncEstimateToggle()">
                            <span id="estimateOnlyTrack" style="position:absolute; inset:0; border-radius:12px; background:#4b5563; transition:background 0.2s;"></span>
                            <span id="estimateOnlyThumb" style="position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:white; transition:transform 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
                        </div>
                        <div style="pointer-events:none;">
                            <div style="font-size:0.85rem; font-weight:700; color:#3b82f6; letter-spacing:0.02em;">📋 For Estimate Only</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Parts pricing &amp; labor time needed — no order placed yet. Manager can convert to order once customer approves.</div>
                        </div>
                    </label>

                    <button id="partsRequestSubmitBtn" onclick="submitPartsRequest(${filteredIndex})"
                        style="width:100%; padding:12px; border-radius:8px; border:none; background:linear-gradient(135deg,#FF1493,#c0006e); color:white; font-weight:700; cursor:pointer; font-size:0.95rem; letter-spacing:0.02em; margin-bottom:12px;">
                        📤 Send Parts Request
                    </button>

                    <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.6;">
                        Request + photos will be emailed to management, photos saved to RO library, and the request logged in RO Status notes. The RO card will pulse until parts are marked as ordered.
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => document.getElementById('partsRequestText')?.focus(), 120);
        }

        export async function submitPartsRequest(filteredIndex) {
            if (!getSB() || !supabaseSession) { showToast('Session expired — please refresh the page and try again.', 'warning'); return; }

            const description = (document.getElementById('partsRequestText')?.value || '').trim();
            if (!description) { showToast('Please describe the parts needed before sending.', 'warning'); return; }

            const ro = currentFilteredData[filteredIndex];
            if (!ro || !ro._supabaseId) { showToast('Error: RO not found.', 'error'); return; }

            const btn = document.getElementById('partsRequestSubmitBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

            try {
                const userName  = currentUser?.name  || 'Unknown Tech';
                const userEmail = currentUser?.email || '';
                const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                const isEstimateOnly = !!(document.getElementById('estimateOnlyCheck')?.checked);
                const notePrefix = isEstimateOnly ? '📋 PARTS ESTIMATE (for estimate only):' : '🔩 PARTS REQUESTED:';
                const noteText   = `[${ts} - ${userName}] ${notePrefix} ${description}`;
                const newPartsStatus = isEstimateOnly ? 'estimate' : 'requested';

                // 1. Write a single ro_status note
                const { error: prErr } = await getSB().from('notes').insert({
                    ro_id:      ro._supabaseId,
                    type:       'ro_status',
                    body:       noteText,
                    created_at: new Date().toISOString(),
                });
                if (prErr) throw prErr;

                // 2b. Insert a part row so the request appears in the Parts modal
                if (!isEstimateOnly) {
                    const { error: partInsertErr } = await getSB().from('parts').insert({
                        ro_id:       ro._supabaseId,
                        part_name:   description,
                        status:      'Sourcing',
                        ordered_by:  userName,
                        notes:       `Requested by ${userName} on ${ts}`,
                        qty:         1,
                    });
                    if (partInsertErr) {
                        warn('Parts row insert failed (non-blocking):', partInsertErr.message, partInsertErr);
                    } else {
                        log('✅ Parts Sourcing row created for:', description);
                    }
                }

                // 3. Set has_open_parts_request = true and parts_status on the RO
                const { error: updErr } = await getSB().from('repair_orders').update({
                    has_open_parts_request: true,
                    parts_status: newPartsStatus,
                    requested_by_email: userEmail || null,
                    updated_at: new Date().toISOString(),
                }).eq('id', ro._supabaseId);
                if (updErr) throw updErr;

                // 4. Upload any attached photos → Supabase Storage → add to RO photo_library
                const photoUrls = [];
                if (_partsRequestFiles.length > 0) {
                    if (btn) btn.textContent = `⏳ Uploading ${_partsRequestFiles.length} photo(s)...`;
                    for (let pi = 0; pi < _partsRequestFiles.length; pi++) {
                        try {
                            const pUrl = await uploadToSupabaseStorage(_partsRequestFiles[pi], ro.roId || 'general');
                            photoUrls.push(pUrl);
                        } catch(pe) {
                            warn(`Photo ${pi + 1} upload failed (non-blocking):`, pe);
                        }
                    }
                    // Add uploaded URLs to the RO's photo_library
                    if (photoUrls.length > 0) {
                        const origIdx = currentData.findIndex(d => d._supabaseId === ro._supabaseId);
                        if (origIdx !== -1) {
                            const lib = parseLibrary(currentData[origIdx].photoLibrary || '');
                            lib.photos = [...lib.photos, ...photoUrls];
                            const libJson = serializeLibrary(lib);
                            currentData[origIdx].photoLibrary = libJson;
                            await updatePhotoLibraryInSheet(libJson, origIdx);
                        }
                    }
                    _partsRequestFiles = []; // clear after upload
                }

                // 5. Email management (non-blocking — failure does not stop the request)
                if (btn) btn.textContent = '⏳ Sending email...';
                try {
                    await fetch(`${SUPABASE_URL}/functions/v1/send-quote-email`, {
                        method: 'POST',
                        headers: {
                            'Authorization': supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`,
                            'Content-Type':  'application/json',
                            'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                        },
                        body: JSON.stringify({
                            type:         'parts_request',
                            to:           'parts@patriotsrvservices.com',
                            techName:     userName,
                            techEmail:    userEmail,
                            customerName: ro.customerName,
                            roId:         ro.roId || '',
                            rv:           ro.rv   || 'N/A',
                            vin:          ro.vin  || '',
                            timestamp:    new Date().toLocaleString('en-US', { dateStyle:'full', timeStyle:'short' }),
                            description,
                            photoUrls,
                        }),
                    });
                } catch(emailErr) {
                    warn('Parts request email notification failed (non-blocking):', emailErr);
                }

                // 6. Audit log
                await writeAuditLog(ro.roId, [{ field: 'partsRequest', oldValue: '', newValue: `PARTS REQUESTED: ${description}${photoUrls.length ? ` (+${photoUrls.length} photo(s))` : ''}` }]);

                // 7. Update local data so the card re-renders immediately
                const origIdx = currentData.findIndex(d => d._supabaseId === ro._supabaseId);
                if (origIdx !== -1) {
                    currentData[origIdx].hasOpenPartsRequest = true;
                    currentData[origIdx].partsStatus = 'requested';
                    currentData[origIdx].requestedByEmail = userEmail || null;
                    currentData[origIdx].roStatusNotes = (currentData[origIdx].roStatusNotes ? currentData[origIdx].roStatusNotes + '\n' : '') + noteText;
                }

                document.getElementById('partsRequestModal')?.remove();
                renderBoard();
                const photoMsg = photoUrls.length ? ` ${photoUrls.length} photo(s) saved to RO library.` : '';
                showToast('Parts request sent! Management has been notified.' + (photoMsg ? ' ' + photoMsg.trim() : ''), 'success', { duration: 6000 });

            } catch(err) {
                console.error('Parts request submission error:', err);
                showToast('Error sending parts request: ' + err.message, 'error');
                if (btn) { btn.disabled = false; btn.textContent = '📤 Send Parts Request'; }
            }
        }

        export function openPartsStatusModal(filteredIndex) {
            if (!isAdmin() && !hasRole('Manager') && !hasRole('Sr Manager')) {
                showToast('Only Managers and Admins can change parts status.', 'warning');
                return;
            }
            const ro = currentFilteredData[filteredIndex];
            if (!ro) return;

            document.getElementById('partsStatusModal')?.remove();
            const modal = document.createElement('div');
            modal.id = 'partsStatusModal';
            modal.className = 'modal-overlay active';
            const _psLabel = (s) => s === 'requested' ? '🙋 PARTS REQUESTED' : s === 'sourcing' ? '🔍 PART SOURCING' : (s === 'ordered' || s === 'outstanding') ? '📦 PARTS ORDERED' : s === 'estimate' ? '📋 PARTS ESTIMATE' : '✅ PARTS RECEIVED';
            const currentChip = ro.partsStatus
                ? `<span class="parts-status-chip ${ro.partsStatus === 'outstanding' ? 'ordered' : ro.partsStatus}" style="display:inline-flex; width:auto; margin:0 0 0 8px; padding:3px 10px; font-size:0.65rem;">${_psLabel(ro.partsStatus)}</span>`
                : ro.hasOpenPartsRequest ? `<span class="parts-status-chip requested" style="display:inline-flex; width:auto; margin:0 0 0 8px; padding:3px 10px; font-size:0.65rem;">🙋 PARTS REQUESTED</span>` : '<em style="color:var(--text-secondary); font-size:0.85rem;">None set</em>';

            modal.innerHTML = `
                <div class="modal-content" style="max-width:460px;">
                    <div class="modal-header">
                        <h2 class="modal-title">🔩 Set Parts Status</h2>
                        <button class="modal-close" onclick="document.getElementById('partsStatusModal').remove()">×</button>
                    </div>
                    <div style="padding-bottom:14px; margin-bottom:16px; border-bottom:1px solid var(--border-color); font-size:0.85rem; color:var(--text-secondary);">
                        <strong style="color:var(--text-primary);">${escapeHtml(ro.customerName)}</strong> · ${escapeHtml(ro.rv) || ''}
                        ${ro.roId ? `· <span style="font-family:'JetBrains Mono',monospace; color:var(--accent-info); font-size:0.78rem;">${escapeHtml(ro.roId)}</span>` : ''}
                    </div>
                    <div style="margin-bottom:16px; font-size:0.82rem; color:var(--text-secondary);">
                        Current: ${currentChip}
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                        <button class="parts-status-modal-btn requested" onclick="setPartsStatus(${filteredIndex},'requested')">
                            🙋 Requested<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">Tech asked — not yet ordered</span>
                        </button>
                        <button class="parts-status-modal-btn sourcing" onclick="setPartsStatus(${filteredIndex},'sourcing')">
                            🔍 Part Sourcing<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">Actively hunting for parts</span>
                        </button>
                        <button class="parts-status-modal-btn ordered" onclick="setPartsStatus(${filteredIndex},'ordered')">
                            📦 Parts Ordered<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">Order placed — awaiting delivery</span>
                        </button>
                        <button class="parts-status-modal-btn received" onclick="setPartsStatus(${filteredIndex},'received')">
                            ✅ Parts Received<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">All parts have arrived</span>
                        </button>
                        <button class="parts-status-modal-btn estimate" onclick="setPartsStatus(${filteredIndex},'estimate')" style="grid-column:1/-1;">
                            📋 Parts Estimate<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">Pricing/labor needed, no order yet</span>
                        </button>
                        <button class="parts-status-modal-btn clear" onclick="setPartsStatus(${filteredIndex},null)" style="grid-column:1/-1;">
                            ✕ Clear Status<br><span style="font-size:0.72rem; font-weight:400; opacity:0.8;">Remove chip from RO</span>
                        </button>
                    </div>
                    ${ro.requestedByEmail ? `<button onclick="notifyPartsRequester(` + filteredIndex + `)" style="width:100%; padding:10px; border-radius:8px; border:1.5px solid rgba(34,197,94,0.5); background:rgba(34,197,94,0.09); color:#22c55e; cursor:pointer; font-size:0.85rem; font-weight:700; margin-bottom:10px;">&#128230; Notify Requester — Parts Ordered</button>` : ''}
                    <button onclick="document.getElementById('partsStatusModal').remove()" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.85rem;">
                        Cancel
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        export async function setPartsStatus(filteredIndex, newStatus) {
            if (!getSB()) { showToast('Please connect to the PRVS database first.', 'warning'); return; }
            const ro = currentFilteredData[filteredIndex];
            if (!ro || !ro._supabaseId) { showToast('Error: RO not found.', 'error'); return; }

            const oldStatus = ro.partsStatus || (ro.hasOpenPartsRequest ? 'requested' : null);
            const userName = currentUser?.name || 'Unknown';
            const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });

            const labels = { requested: '🙋 PARTS REQUESTED', sourcing: '🔍 PART SOURCING', ordered: '📦 PARTS ORDERED', outstanding: '📦 PARTS ORDERED', received: '✅ PARTS RECEIVED', estimate: '📋 PARTS ESTIMATE' };
            const noteText = newStatus
                ? `[${ts} - ${userName}] Parts status set to: ${labels[newStatus]}`
                : `[${ts} - ${userName}] Parts status cleared`;

            try {
                document.getElementById('partsStatusModal')?.remove();

                // Update Supabase
                const updatePayload = {
                    parts_status: newStatus,
                    updated_at: new Date().toISOString(),
                };
                // When clearing or setting received, also clear the legacy flag
                if (!newStatus || newStatus === 'received') {
                    updatePayload.has_open_parts_request = false;
                }
                const { error: updErr } = await getSB().from('repair_orders').update(updatePayload).eq('id', ro._supabaseId);
                if (updErr) throw updErr;

                // Write status note
                const { error: noteErr } = await getSB().from('notes').insert({
                    ro_id:      ro._supabaseId,
                    type:       'ro_status',
                    body:       noteText,
                    created_at: new Date().toISOString(),
                });
                if (noteErr) throw noteErr;

                // Audit log
                await writeAuditLog(ro.roId, [{ field: 'partsStatus', oldValue: oldStatus || 'none', newValue: newStatus || 'cleared' }]);

                // Update local data
                const origIdx = currentData.findIndex(d => d._supabaseId === ro._supabaseId);
                if (origIdx !== -1) {
                    currentData[origIdx].partsStatus = newStatus;
                    if (!newStatus || newStatus === 'received') currentData[origIdx].hasOpenPartsRequest = false;
                    currentData[origIdx].roStatusNotes = (currentData[origIdx].roStatusNotes ? currentData[origIdx].roStatusNotes + '\n' : '') + noteText;
                }

                renderBoard();
                log(`✅ Parts status set to: ${newStatus || 'cleared'} for ${ro.roId}`);

            } catch(err) {
                console.error('Set parts status error:', err);
                showToast('Error updating parts status: ' + err.message, 'error');
            }
        }

        export async function notifyPartsRequester(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            if (!ro || !ro.requestedByEmail) {
                showToast('No requester email on file. Parts must be requested via the “Request Parts” button to capture the requester.', 'warning', { duration: 10000 });
                return;
            }
            const roPartsData = partsData[ro.roId] || [];
            const orderedParts = roPartsData.filter(p => ['Ordered','In Transit','Backordered'].includes(p.status));
            const partsPreview = orderedParts.length
                ? '\n\nParts being ordered:\n' + orderedParts.map(p => '\u2022 ' + p.partName + (p.eta ? ' (ETA: ' + p.eta + ')' : '')).join('\n')
                : '\n\n(No parts in Ordered/In Transit/Backordered status — sending general notification)';
            showToast('Send “Parts Ordered” notification to ' + ro.requestedByEmail + '?', 'info', {
                persistent: true,
                actionLabel: 'Send Notification',
                actionCallback: function() { _doNotifyPartsRequester(filteredIndex); }
            });
        }

        export async function notifyPartsEtaUpdate(ro, partName, eta) {
            if (!ro?.requestedByEmail) return;
            try {
                await fetch(SUPABASE_URL + '/functions/v1/send-quote-email', {
                    method: 'POST',
                    headers: { 'Authorization': supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'X-PRVS-Secret': PRVS_FUNCTION_SECRET },
                    body: JSON.stringify({
                        type:         'parts_eta_update',
                        to:           ro.requestedByEmail,
                        cc:           'info@patriotsrvservices.com',
                        customerName: ro.customerName,
                        roId:         ro.roId || '',
                        rv:           ro.rv   || 'N/A',
                        partName,
                        eta,
                        updatedBy: currentUser?.name || 'Parts Department',
                    }),
                });
                log('ETA notification sent to', ro.requestedByEmail, 'for part:', partName, 'ETA:', eta);
            } catch(err) {
                warn('ETA notification failed (non-blocking):', err);
            }
        }

        export function renderPartsPhotoPreview() {
            const strip = document.getElementById('partsPhotoPreview');
            const countEl = document.getElementById('partsPhotoCount');
            if (!strip) return;
            strip.innerHTML = '';
            _partsRequestFiles.forEach((file, i) => {
                const url = URL.createObjectURL(file);
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative; width:76px; height:76px; flex-shrink:0;';
                wrap.innerHTML = `
                    <img src="${url}" style="width:76px; height:76px; object-fit:cover; border-radius:8px; border:1.5px solid var(--border-color);">
                    <button onclick="removePartsPhoto(${i})"
                        style="position:absolute; top:-7px; right:-7px; background:#ff3b30; color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:13px; line-height:22px; text-align:center; cursor:pointer; padding:0; font-weight:700;">×</button>
                `;
                strip.appendChild(wrap);
            });
            strip.style.display = _partsRequestFiles.length ? 'flex' : 'none';
            if (countEl) countEl.textContent = _partsRequestFiles.length
                ? `${_partsRequestFiles.length} photo${_partsRequestFiles.length !== 1 ? 's' : ''} attached`
                : '';
        }

// ---- Window bridge (Phase 8 additive) ----
Object.assign(window, {
  loadPartsFromSupabase,
  openPartsModal,
  showAddPartForm,
  savePartForm,
  editPartRow,
  deletePartRow,
  markPartReceived,
  appendPartToSupabase,
  updatePartInSupabase,
  deletePartFromSupabase,
  openPartsRequestModal,
  submitPartsRequest,
  openPartsStatusModal,
  setPartsStatus,
  notifyPartsRequester,
  notifyPartsEtaUpdate,
  renderPartsPhotoPreview,
});
