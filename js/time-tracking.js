// js/time-tracking.js - Phase 11 (ADDITIVE): time logs load, auto-refresh, totals, modal.
// v1.435 (Session 87, 2026-06-02).
//
// Extracted VERBATIM from the index.html inline <script> (7 functions):
//   loadTimeLogsFromSupabase, loadTimeLogsFromSheets, startTimeLogsAutoRefresh,
//   manualRefreshTimeLogs, getTimeLogsForRO, calculateTotalHours, openTimeLogsModal.
//
// ADDITIVE PHASE - the inline copies of the 7 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openTimeLogsModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions resolves through the SHARED
// global environment to the SAME symbol the inline copy uses:
//   - inline `let` globals timeLogsData (index.html:4205) + timeLogsRefreshInterval
//     (index.html:4206) are read AND written via the shared global lexical environment,
//     so the module's loadTimeLogsFromSupabase reassignment and startTimeLogsAutoRefresh
//     interval handle are seen by the inline siblings (stopTimeLogsAutoRefresh,
//     closeTimeLogsModal, refreshAndReopenTimeLogsModal stay inline) and vice versa;
//   - module-owned helpers (getSB, isAdmin, hasRole, escapeHtml, formatHours, log,
//     showToast, renderBoard, ...) via module scope / their own window bridges.
//
// CROSS-MODULE: js/auth.js calls loadTimeLogsFromSupabase + startTimeLogsAutoRefresh and
// js/render.js calls calculateTotalHours, all as bare refs - the bridge below re-points
// those window.* names to these byte-identical module copies, so those call paths are
// unchanged. (This is why ALL 7 are bridged, not the 5 in the draft roadmap.)
//
// WARNING: loadTimeLogsFromSupabase READS time_logs from Supabase and reassigns the
// timeLogsData global; manualRefreshTimeLogs re-triggers that load. No WRITE to Supabase
// here, but auto-refresh fires on a 60s interval - validate the interval fires cleanly
// (no console error after 60s) on a staff-tester session before promote to main.
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 11
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.


        export async function loadTimeLogsFromSupabase() {
            try {
                const { data: logs, error } = await getSB()
                    .from('time_logs')
                    .select('*, repair_orders(ro_id)')
                    .order('clock_in', { ascending: false });

                if (error) throw error;

                timeLogsData = (logs || []).map(row => ({
                    logId:        row.id,
                    roId:         row.repair_orders?.ro_id || '',
                    techEmail:    row.user_id || '',
                    techName:     row.tech_name || '',
                    checkIn:      row.clock_in || '',
                    checkOut:     row.clock_out || '',
                    duration:     row.duration_seconds || 0,
                    workNotes:    row.work_notes || '',
                    serviceTypes: row.service_type || '',
                }));

                log('✅ Loaded', timeLogsData.length, 'time logs from Supabase');
            } catch(err) {
                console.error('Error loading time logs from Supabase:', err);
                timeLogsData = [];
            }
        }


        export async function loadTimeLogsFromSheets() {
            try {
                // Time logs now load from Supabase
            return loadTimeLogsFromSupabase();
                const response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
                    range: GOOGLE_CONFIG.TIME_LOGS_RANGE,
                });

                const rows = response.result.values;
                if (!rows || rows.length <= 1) {
                    log('No time logs found');
                    timeLogsData = [];
                    return;
                }

                // Convert rows to objects (skip header)
                const logs = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    logs.push({
                        logId: row[0],          // A: Log ID
                        roId: row[1],           // B: RO ID
                        techEmail: row[2],      // C: Tech Email
                        techName: row[3],       // D: Tech Name
                        checkIn: row[4],        // E: Check In
                        checkOut: row[5],       // F: Check Out
                        duration: row[6] ? parseInt(row[6]) : 0,  // G: Duration (sec)
                        date: row[7],           // H: Date
                        workNotes: row[8] || '', // I: Work Notes
                        serviceTypes: row[9] || '' // J: Service Types
                    });
                }

                timeLogsData = logs;
                log(`✅ Loaded ${logs.length} time log entries`);
                
                // Re-render board to show time data
                renderBoard();
                
            } catch (err) {
                console.error('Error loading time logs:', err);
                timeLogsData = [];
            }
        }


        export function startTimeLogsAutoRefresh() {
            // Clear any existing interval
            if (timeLogsRefreshInterval) {
                clearInterval(timeLogsRefreshInterval);
            }
            
            // Only refresh when tab is visible
            timeLogsRefreshInterval = setInterval(async () => {
                if (!document.hidden && accessToken) {
                    log('🔄 Auto-refreshing time logs...');
                    await loadTimeLogsFromSheets();
                }
            }, 30000); // 30 seconds
            
            log('✅ Time logs auto-refresh started (30s interval)');
        }


        export async function manualRefreshTimeLogs() {
            log('🔄 Manual refresh triggered by admin');
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '⏳ Refreshing...';
            btn.disabled = true;
            
            try {
                await loadTimeLogsFromSupabase();
                btn.textContent = '✅ Refreshed!';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            } catch (error) {
                console.error('Error refreshing:', error);
                btn.textContent = '❌ Error';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            }
        }


        export function getTimeLogsForRO(roId) {
            return timeLogsData.filter(log => log.roId === roId && log.checkOut);
        }


        export function calculateTotalHours(roId) {
            const logs = getTimeLogsForRO(roId);
            const totalSeconds = logs.reduce((sum, log) => sum + log.duration, 0);
            const hours = (totalSeconds / 3600).toFixed(1);
            return {
                hours: parseFloat(hours),
                sessionCount: logs.length,
                totalSeconds: totalSeconds
            };
        }


        export async function openTimeLogsModal(index) {
            const ro = getROFromFilteredView(index);
            const roId = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
            
            // Refresh time logs from Google Sheets first
            if (accessToken) {
                await loadTimeLogsFromSheets();
            }
            
            const logs = getTimeLogsForRO(roId);
            const timeStats = calculateTotalHours(roId);
            
            if (logs.length === 0) {
                showToast('No time logs found for this RO.', 'info');
                return;
            }
            
            // Reverse to show newest first
            const logsHtml = logs.reverse().map(log => {
                const checkInDate = new Date(log.checkIn);
                const checkOutDate = log.checkOut ? new Date(log.checkOut) : null;
                const duration = formatHours(log.duration);
                
                return `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                            <span style="font-weight: 600; color: #1e293b;">👤 ${log.techName}</span>
                            <span style="font-size: 1.1rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #667eea;">${duration}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="font-size: 0.85rem; color: #64748b;">
                                ▶️ Check In: ${checkInDate.toLocaleString()}
                            </div>
                            ${checkOutDate ? `
                            <div style="font-size: 0.85rem; color: #64748b;">
                                ⏹️ Check Out: ${checkOutDate.toLocaleString()}
                            </div>
                            ` : '<div style="font-size: 0.85rem; color: #f59e0b; font-weight: 600;">⚠️ Active Session</div>'}
                            ${log.serviceTypes ? `
                            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
                                ${log.serviceTypes.split(',').map(s => `<span style="padding: 3px 8px; background: #dbeafe; color: #1d4ed8; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">${s.trim()}</span>`).join('')}
                            </div>
                            ` : ''}
                            ${log.workNotes ? `
                            <div style="margin-top: 6px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #667eea; border-radius: 4px; font-size: 0.85rem; color: #334155; font-style: italic;">
                                💬 ${log.workNotes}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            const modalHTML = `
                <div id="timeLogsModalOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;" onclick="closeTimeLogsModal(event)">
                    <div style="background: white; border-radius: 16px; padding: 40px; max-width: 700px; width: 100%; max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
                        <h2 style="margin-bottom: 20px; color: #1e293b; font-family: 'Barlow Condensed', sans-serif;">⏱️ Time Logs - ${escapeHtml(ro.customerName)}</h2>
                        <div style="display: flex; gap: 20px; margin-bottom: 16px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white;">
                            <div style="flex: 1; text-align: center;">
                                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9; margin-bottom: 4px;">Total Time</div>
                                <div style="font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${formatHours(timeStats.totalSeconds)}</div>
                            </div>
                            <div style="flex: 1; text-align: center;">
                                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9; margin-bottom: 4px;">Sessions</div>
                                <div style="font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${timeStats.sessionCount}</div>
                            </div>
                            <div style="flex: 1; text-align: center;">
                                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9; margin-bottom: 4px;">Hours</div>
                                <div style="font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${timeStats.hours}h</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
                            <button onclick="refreshAndReopenTimeLogsModal(${index})" style="flex: 1; padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600;">
                                🔄 Refresh
                            </button>
                            <button onclick="closeTimeLogsModal()" style="flex: 1; padding: 12px 24px; background: #64748b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600;">
                                Close
                            </button>
                        </div>
                        <div style="margin-bottom: 24px;">
                            ${logsHtml}
                        </div>
                    </div>
                </div>
            `;
            
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = modalHTML;
            document.body.appendChild(modalDiv);
        }


// ---- Window bridge (Phase 11 additive) ----
Object.assign(window, {
  loadTimeLogsFromSupabase,
  loadTimeLogsFromSheets,
  startTimeLogsAutoRefresh,
  manualRefreshTimeLogs,
  getTimeLogsForRO,
  calculateTotalHours,
  openTimeLogsModal,
});
