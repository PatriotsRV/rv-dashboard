// js/duplicates.js - Phase 17 (ADDITIVE): Duplicate RO detection + merging.
// v1.441 (Session 90, 2026-06-04).
//
// Extracted VERBATIM from the index.html inline <script> (5 functions):
//   getBaseROId, findDuplicateGroups, openDuplicateManager, highlightDupeRows,
//   executeDupeMerge.
//   The stale MODULARIZATION_ROADMAP Phase 17 list names only 3; two more belong
//   here: getBaseROId (explicitly deferred to Phase 17 by the js/utils.js Phase 2
//   header note) and highlightDupeRows (post-roadmap helper, called from the
//   master-picker radio onchange in openDuplicateManager's generated HTML - same
//   class as Phase 15's applyChipConflict).
//
// ADDITIVE PHASE - the inline copies of the 5 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openDuplicateManager etc. to
// these copies, but the bodies are byte-identical to the inline versions (only an
// `export` keyword was inserted after the indent; no reference rewriting), so
// behavior is unchanged. Every bare reference inside these functions resolves
// through the SHARED global environment to the SAME symbol the inline copy uses:
//   - inline state: currentData (top-level let);
//   - helpers/bridged modules: escapeHtml, showToast, getSB, isAdmin,
//     loadDataFromSupabase;
//   - dupe-manager scratch state is ALWAYS accessed via explicit window. prefix
//     (window._dupeGroups) - strict-mode safe.
// Session 89 pre-scan for undeclared implicit globals: PASSED (zero bare
// assignments to undeclared identifiers in all 5 bodies).
//
// executeDupeMerge is a DESTRUCTIVE write path (merges + deletes ROs). Test plan
// is READ-ONLY: open Manage Dupes, verify the list renders; never execute a merge
// against production data during regression.
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 17
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.


        export function getBaseROId(roId) {
            const match = (roId || '').match(/^(PRVS-[0-9A-F]{4}-[0-9A-F]{4})/);
            return match ? match[1] : roId;
        }

        export function findDuplicateGroups() {
            const groups = {};
            for (const ro of currentData) {
                if (!ro.roId) continue;
                const base = getBaseROId(ro.roId);
                if (!groups[base]) groups[base] = [];
                groups[base].push(ro);
            }
            return Object.values(groups).filter(g => g.length > 1);
        }

        export function openDuplicateManager() {
            if (!isAdmin()) { showToast('Admin access required.', 'warning'); return; }
            const groups = findDuplicateGroups();
            if (!groups.length) {
                showToast('No duplicate ROs found.', 'info');
                const btn = document.getElementById('manageDupesBtn');
                if (btn) btn.style.display = 'none';
                return;
            }

            const existing = document.getElementById('dupeMgrOverlay');
            if (existing) existing.remove();

            const groupsHtml = groups.map((group, gi) => {
                // Default master = the one whose roId IS the base (no suffix), or first if none
                const baseId = getBaseROId(group[0].roId);
                const defaultMasterIdx = group.findIndex(ro => ro.roId === baseId);
                const masterIdx = defaultMasterIdx >= 0 ? defaultMasterIdx : 0;

                const rowsHtml = group.map((ro, ri) => {
                    const partCount = currentData.filter(d => d._supabaseId === ro._supabaseId).length; // always 1, use parts
                    const checked = ri === masterIdx ? 'checked' : '';
                    const dateStr = ro.dateReceived || '—';
                    const statusBadge = `<span style="background:#1e293b;color:#94a3b8;border-radius:6px;padding:2px 8px;font-size:11px;">${escapeHtml(ro.status) || '—'}</span>`;
                    return `
                        <label style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:8px;border:2px solid ${checked ? '#3b82f6' : '#e2e8f0'};cursor:pointer;margin-bottom:8px;transition:border 0.15s;" id="dupeRow_${gi}_${ri}">
                            <input type="radio" name="master_${gi}" value="${ri}" ${checked} onchange="highlightDupeRows(${gi},${ri})" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;accent-color:#3b82f6;">
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:700;color:#1e293b;font-size:14px;">${escapeHtml(ro.roId)}</div>
                                <div style="color:#475569;font-size:12px;margin-top:2px;">${escapeHtml(ro.customerName)} · ${escapeHtml(ro.rv) || 'No RV'} · Received ${dateStr}</div>
                                <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">
                                    ${statusBadge}
                                    ${checked ? '<span style="background:#3b82f6;color:white;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">⭐ MASTER</span>' : '<span style="background:#fef2f2;color:#ef4444;border-radius:6px;padding:2px 8px;font-size:11px;">Will be deleted</span>'}
                                </div>
                            </div>
                        </label>`;
                }).join('');

                return `
                    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #e2e8f0;">
                        <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                            Group ${gi + 1} — Base ID: ${baseId} (${group.length} ROs)
                        </div>
                        <div id="dupeGroup_${gi}">${rowsHtml}</div>
                    </div>`;
            }).join('');

            const totalDupes = groups.reduce((sum, g) => sum + g.length - 1, 0);

            const overlay = document.createElement('div');
            overlay.id = 'dupeMgrOverlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
            overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
            overlay.innerHTML = `
                <div style="background:white;border-radius:16px;padding:28px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);" onclick="event.stopPropagation()">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;margin:0;font-size:1.5rem;">🔗 Merge Duplicate ROs</h2>
                        <button onclick="document.getElementById('dupeMgrOverlay').remove()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;font-weight:600;">✕</button>
                    </div>
                    <p style="color:#64748b;font-size:13px;margin:0 0 20px;">Select the <strong>master RO</strong> for each group. All parts, notes, time logs, and photos from the other ROs will be merged into the master, then the duplicates will be permanently deleted.</p>
                    ${groupsHtml}
                    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin-bottom:20px;">
                        <strong style="color:#991b1b;">⚠️ ${totalDupes} duplicate RO${totalDupes !== 1 ? 's' : ''} will be permanently deleted after merging.</strong>
                        <div style="color:#7f1d1d;font-size:12px;margin-top:4px;">This cannot be undone. Make sure the correct master is selected for each group.</div>
                    </div>
                    <button onclick="executeDupeMerge()" style="width:100%;padding:14px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">
                        🔗 Merge &amp; Delete Duplicates
                    </button>
                </div>`;
            document.body.appendChild(overlay);

            // Store groups data on window for access by executeDupeMerge
            window._dupeGroups = groups;
        }

        export function highlightDupeRows(gi, masterRi) {
            const group = (window._dupeGroups || [])[gi];
            if (!group) return;
            group.forEach((_, ri) => {
                const row = document.getElementById(`dupeRow_${gi}_${ri}`);
                if (!row) return;
                const isMaster = ri === masterRi;
                row.style.borderColor = isMaster ? '#3b82f6' : '#e2e8f0';
                const badges = row.querySelectorAll('span');
                // Remove master/delete badge (last span)
                const lastBadge = badges[badges.length - 1];
                if (lastBadge) {
                    if (isMaster) {
                        lastBadge.style.background = '#3b82f6'; lastBadge.style.color = 'white';
                        lastBadge.textContent = '⭐ MASTER';
                    } else {
                        lastBadge.style.background = '#fef2f2'; lastBadge.style.color = '#ef4444';
                        lastBadge.textContent = 'Will be deleted';
                    }
                }
            });
        }


        export async function executeDupeMerge() {
            const groups = window._dupeGroups || [];
            if (!groups.length) return;

            const btn = document.querySelector('#dupeMgrOverlay button:last-of-type');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Merging...'; }

            let totalDeleted = 0;
            try {
                for (let gi = 0; gi < groups.length; gi++) {
                    const group = groups[gi];
                    const radios = document.querySelectorAll(`input[name="master_${gi}"]`);
                    let masterRi = 0;
                    radios.forEach(r => { if (r.checked) masterRi = parseInt(r.value); });

                    const master = group[masterRi];
                    const masterUUID = master._supabaseId;
                    const dupes = group.filter((_, i) => i !== masterRi);

                    for (const dupe of dupes) {
                        const dupeUUID = dupe._supabaseId;

                        // 1. Reassign notes
                        await getSB().from('notes').update({ ro_id: masterUUID }).eq('ro_id', dupeUUID);
                        // 2. Reassign parts
                        await getSB().from('parts').update({ ro_id: masterUUID }).eq('ro_id', dupeUUID);
                        // 3. Reassign time_logs
                        await getSB().from('time_logs').update({ ro_id: masterUUID }).eq('ro_id', dupeUUID);
                        // 4. Reassign insurance_scans
                        await getSB().from('insurance_scans').update({ ro_id: masterUUID }).eq('ro_id', dupeUUID);
                        // 5. Reassign audit_log
                        await getSB().from('audit_log').update({ ro_id: masterUUID }).eq('ro_id', dupeUUID);

                        // 6. Merge photo_library: combine photos[] and docs[] arrays
                        const masterLib = parseLibrary(master.photoLibrary || '');
                        const dupeLib  = parseLibrary(dupe.photoLibrary  || '');
                        const merged = {
                            photos: [...new Set([...masterLib.photos, ...dupeLib.photos])],
                            docs:   [...masterLib.docs, ...dupeLib.docs],
                        };
                        // Preserve master's rvPhotoUrl; if master has none, take dupe's
                        const mergedMainPhoto = master.rvPhotoUrl || dupe.rvPhotoUrl || null;
                        await getSB().from('repair_orders').update({
                            photo_library: merged,
                            rv_photo_url:  mergedMainPhoto,
                            updated_at:    new Date().toISOString(),
                        }).eq('id', masterUUID);

                        // 7. Delete the duplicate
                        await getSB().from('repair_orders').delete().eq('id', dupeUUID);
                        totalDeleted++;
                    }
                }

                document.getElementById('dupeMgrOverlay')?.remove();
                showToast('Done! Merged and deleted ' + totalDeleted + ' duplicate RO' + (totalDeleted !== 1 ? 's' : '') + '. Reloading…', 'success', { duration: 6000 });
                await loadDataFromSupabase();

                // Hide the Merge Dupes button if no more duplicates
                const remaining = findDuplicateGroups();
                const dupesBtn = document.getElementById('manageDupesBtn');
                if (dupesBtn) dupesBtn.style.display = remaining.length ? 'inline-block' : 'none';

            } catch (err) {
                console.error('Merge error:', err);
                showToast('Error during merge: ' + (err.message || 'Unknown error'), 'error');
                if (btn) { btn.disabled = false; btn.textContent = '🔗 Merge & Delete Duplicates'; }
            }
        }

Object.assign(window, { getBaseROId, findDuplicateGroups, openDuplicateManager, highlightDupeRows, executeDupeMerge });
