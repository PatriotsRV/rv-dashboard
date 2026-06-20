// js/scheduling.js - Phase 12 (ADDITIVE): Google Calendar scheduling.
// v1.436 (Session 87, 2026-06-02).
//
// Extracted VERBATIM from the index.html inline <script> (4 functions):
//   reauthorizeCalendar, openScheduleModal, confirmSchedule, proceedWithSchedule.
//
// ADDITIVE PHASE - the inline copies of the 4 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openScheduleModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions resolves through the SHARED
// global environment to the SAME symbol the inline copy uses:
//   - the inline sibling closeScheduleModal (index.html, stays inline) + the inline
//     openScheduleNotificationModal stay behind and are reached via the global object;
//   - inline state/helpers (currentFilteredData, getSB, supabaseSession, showToast,
//     escapeHtml, isAdmin, hasRole, gapi [window.gapi CDN client], CALENDAR_IDS,
//     DAY_BASED_SERVICES, SERVICE_SILOS, REPAIR_TYPE_TO_SILO, ...) via module scope /
//     window bridges / the global lexical environment.
//
// CROSS-MODULE: js/auth.js calls openScheduleModal as a bare ref - the bridge below
// re-points window.openScheduleModal to this byte-identical module copy, so that call
// path is unchanged. (All 4 are bridged; all 4 also have inline onclick handlers.)
//
// WARNING: confirmSchedule + proceedWithSchedule create REAL Google Calendar events via
// gapi.client.calendar (external WRITE) and update repair_orders scheduling fields;
// reauthorizeCalendar drives the Google token re-auth flow. This additive build MUST be
// validated NON-DESTRUCTIVELY: open the Schedule modal + confirm the silo-aware pickers
// render (read-only). A full create test should use a staff-tester RO and the event
// should be deleted from Google Calendar afterward. Do NOT spray test events on real ROs.
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 12
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.


        export function reauthorizeCalendar(filteredIndex) {
            _pendingScheduleIndex = filteredIndex;
            const warningEl = document.getElementById('schedCalendarWarning');
            if (warningEl) warningEl.innerHTML = '⏳ Opening Google authorization…';
            try {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } catch(e) {
                console.error('reauthorizeCalendar error:', e);
                if (warningEl) warningEl.innerHTML = '❌ Could not open Google authorization. Try refreshing the page.';
                _pendingScheduleIndex = null;
            }
        }


        export async function openScheduleModal(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            if (!ro) return;

            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );

            // Parse service types from RO
            const roServices = (ro.repairType || '').split(',').map(s => s.trim()).filter(s => getCalendarId(s) !== null);
            const hasCalendars = roServices.some(s => getCalendarId(s));
            // Check if any selected service uses day-based scheduling
            const isDayBased = roServices.some(s => DAY_BASED_SERVICES.includes(s));

            // Default start: tomorrow at 8am
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(8, 0, 0, 0);
            const defaultDate = tomorrow.toISOString().slice(0, 16);

            const modalHTML = `
                <div id="scheduleModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;">
                    <div style="background:#1a1d24;border:1px solid #2d3139;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;">
                        <h2 style="color:#e8eaed;font-family:'Barlow Condensed',sans-serif;font-size:1.5rem;margin-bottom:4px;">📅 Schedule RO</h2>
                        <p style="color:#6b7280;font-size:0.9rem;margin-bottom:20px;">${escapeHtml(ro.customerName)} — ${escapeHtml(ro.rv) || '—'}</p>

                        ${!accessToken ? `<div style="background:#fef3c7;color:#92400e;padding:12px 14px;border-radius:8px;margin-bottom:16px;font-size:0.85rem;">
                            <span id="schedCalendarWarning">⚠️ Google Calendar access has expired. Re-authorize to create events.</span>
                            <div style="margin-top:10px;">
                                <button onclick="reauthorizeCalendar(${filteredIndex})" style="padding:8px 18px;background:#92400e;color:white;border:none;border-radius:6px;font-size:0.85rem;font-weight:700;cursor:pointer;">Re-authorize Google Calendar</button>
                            </div>
                        </div>` : ''}

                        <div style="margin-bottom:16px;">
                            <label style="display:block;font-size:0.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Start Date & Time</label>
                            <input type="datetime-local" id="scheduleStart" value="${defaultDate}"
                                style="width:100%;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:1rem;">
                        </div>

                        <div style="margin-bottom:16px;">
                            <label style="display:block;font-size:0.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Duration</label>
                            ${isDayBased ? `
                            <select id="scheduleDuration" style="width:100%;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:1rem;">
                                <option value="1d">1 Day</option>
                                <option value="2d" selected>2 Days</option>
                                <option value="3d">3 Days</option>
                                <option value="5d">5 Days (1 Week)</option>
                                <option value="10d">10 Days (2 Weeks)</option>
                                <option value="customd">Custom Days...</option>
                            </select>
                            <input type="number" id="scheduleCustomDays" placeholder="Number of days" min="1" max="90"
                                style="display:none;width:100%;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:1rem;margin-top:8px;">
                            ` : `
                            <select id="scheduleDuration" style="width:100%;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:1rem;">
                                <option value="120">2 Hours</option>
                                <option value="240">4 Hours (Half Day)</option>
                                <option value="480" selected>8 Hours (Full Day)</option>
                                <option value="960">2 Days</option>
                                <option value="custom">Custom...</option>
                            </select>
                            <input type="number" id="scheduleCustomHours" placeholder="Hours" min="1" max="240"
                                style="display:none;width:100%;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:1rem;margin-top:8px;">
                            `}
                        </div>

                        <div style="margin-bottom:16px;">
                            <label style="display:block;font-size:0.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Service Calendars</label>
                            ${roServices.length === 0 ? `<p style="color:#6b7280;font-size:0.85rem;">No service types assigned to this RO.</p>` :
                            roServices.map(s => `
                                <label style="display:flex;align-items:center;gap:10px;padding:8px;background:#252930;border-radius:8px;margin-bottom:6px;cursor:pointer;">
                                    <input type="checkbox" name="schedCalendar" value="${s}" ${getCalendarId(s) ? 'checked' : 'disabled'}
                                        style="width:16px;height:16px;accent-color:#39ff6e;">
                                    <span style="color:${getCalendarId(s) ? '#e8eaed' : '#6b7280'};font-size:0.9rem;font-weight:600;">${s}</span>
                                    ${!getCalendarId(s) ? '<span style="font-size:0.75rem;color:#6b7280;">(no calendar configured)</span>' : ''}
                                </label>`).join('')}
                        </div>

                        <div style="margin-bottom:20px;">
                            <label style="display:block;font-size:0.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Notes (optional)</label>
                            <textarea id="scheduleNotes" placeholder="Additional notes for the calendar event..."
                                style="width:100%;min-height:70px;padding:10px 12px;background:#252930;border:1px solid #2d3139;border-radius:8px;color:#e8eaed;font-size:0.9rem;resize:vertical;"></textarea>
                        </div>

                        <div id="scheduleConflicts" style="display:none;"></div>
                        <div id="scheduleStatus" style="margin-bottom:12px;font-size:0.85rem;color:#9ca3af;min-height:20px;"></div>

                        <div style="display:flex;gap:8px;">
                            <button id="scheduleConfirmBtn" onclick="confirmSchedule(${filteredIndex})" ${!accessToken ? 'disabled title="Re-authorize Google Calendar above first"' : ''} style="flex:2;padding:12px;background:${accessToken ? 'linear-gradient(135deg,#39ff6e,#10b981)' : '#374151'};border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:${accessToken ? 'pointer' : 'not-allowed'};color:${accessToken ? '#0d0f12' : '#6b7280'};">
                                📅 Schedule
                            </button>
                            <button onclick="closeScheduleModal()" style="flex:1;padding:12px;background:#252930;border:1px solid #2d3139;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;color:#9ca3af;">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Custom duration toggle
            document.getElementById('scheduleDuration').addEventListener('change', function() {
                const customHours = document.getElementById('scheduleCustomHours');
                const customDays = document.getElementById('scheduleCustomDays');
                if (customHours) customHours.style.display = this.value === 'custom' ? 'block' : 'none';
                if (customDays) customDays.style.display = this.value === 'customd' ? 'block' : 'none';
            });
        }


        export async function confirmSchedule(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );

            const btn = document.getElementById('scheduleConfirmBtn');
            const statusEl = document.getElementById('scheduleStatus');
            const conflictsEl = document.getElementById('scheduleConflicts');

            const startInput = document.getElementById('scheduleStart').value;
            if (!startInput) { showToast('Please select a start date and time.', 'warning'); return; }

            const durationSel = document.getElementById('scheduleDuration').value;
            let durationMins;
            if (durationSel === 'custom') {
                durationMins = parseInt(document.getElementById('scheduleCustomHours')?.value || 8) * 60;
            } else if (durationSel === 'customd') {
                durationMins = parseInt(document.getElementById('scheduleCustomDays')?.value || 1) * 480;
            } else if (durationSel.endsWith('d')) {
                durationMins = parseInt(durationSel) * 480; // 8hr work day
            } else {
                durationMins = parseInt(durationSel);
            }

            const startDt = new Date(startInput);
            const endDt = new Date(startDt.getTime() + durationMins * 60000);

            // Which calendars selected
            const selectedCals = Array.from(document.querySelectorAll('input[name="schedCalendar"]:checked')).map(c => c.value);
            if (selectedCals.length === 0) { showToast('Please select at least one service calendar.', 'warning'); return; }

            btn.disabled = true;
            btn.textContent = '🔍 Checking conflicts...';
            conflictsEl.style.display = 'none';
            conflictsEl.innerHTML = '';

            // ── Check conflicts ────────────────────────────────────────
            const conflicts = [];
            if (accessToken) {
                for (const service of selectedCals) {
                    const calId = getCalendarId(service);
                    if (!calId) continue;
                    try {
                        const params = new URLSearchParams({
                            timeMin: startDt.toISOString(),
                            timeMax: endDt.toISOString(),
                            singleEvents: 'true',
                            orderBy: 'startTime',
                        });
                        const resp = await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
                            { headers: { Authorization: `Bearer ${accessToken}` } }
                        );
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.items?.length > 0) {
                                data.items.forEach(ev => conflicts.push({ service, title: ev.summary, start: ev.start?.dateTime || ev.start?.date }));
                            }
                        }
                    } catch(e) { warn('Conflict check failed for', service, e); }
                }
            }

            if (conflicts.length > 0) {
                conflictsEl.style.display = 'block';
                conflictsEl.innerHTML = `
                    <div style="background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.4);border-radius:8px;padding:14px;margin-bottom:14px;">
                        <div style="color:#ff9500;font-weight:700;font-size:0.9rem;margin-bottom:8px;">⚠️ Conflicts Detected</div>
                        ${conflicts.map(c => `
                            <div style="font-size:0.85rem;color:#e8eaed;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                                <strong>${c.service}:</strong> ${c.title} at ${new Date(c.start).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                            </div>`).join('')}
                        <div style="margin-top:10px;display:flex;gap:8px;">
                            <button onclick="proceedWithSchedule(${filteredIndex})" style="flex:1;padding:8px;background:#ff9500;border:none;border-radius:6px;font-size:0.85rem;font-weight:700;cursor:pointer;color:white;">
                                Schedule Anyway
                            </button>
                            <button onclick="document.getElementById('scheduleConfirmBtn').disabled=false;document.getElementById('scheduleConfirmBtn').textContent='📅 Schedule';document.getElementById('scheduleConflicts').style.display='none';"
                                style="flex:1;padding:8px;background:#252930;border:1px solid #2d3139;border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;color:#9ca3af;">
                                Pick Different Time
                            </button>
                        </div>
                    </div>`;
                btn.disabled = false;
                btn.textContent = '📅 Schedule';
                return;
            }

            await proceedWithSchedule(filteredIndex);
        }


        export async function proceedWithSchedule(filteredIndex) {
            const ro = currentFilteredData[filteredIndex];
            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );

            const btn = document.getElementById('scheduleConfirmBtn');
            const statusEl = document.getElementById('scheduleStatus');

            btn.disabled = true;
            btn.textContent = '⏳ Creating events...';

            const startInput = document.getElementById('scheduleStart').value;
            const durationSel = document.getElementById('scheduleDuration').value;
            let durationMins;
            if (durationSel === 'custom') {
                durationMins = parseInt(document.getElementById('scheduleCustomHours')?.value || 8) * 60;
            } else if (durationSel === 'customd') {
                durationMins = parseInt(document.getElementById('scheduleCustomDays')?.value || 1) * 480;
            } else if (durationSel.endsWith('d')) {
                durationMins = parseInt(durationSel) * 480; // 8hr work day
            } else {
                durationMins = parseInt(durationSel);
            }
            const notes = document.getElementById('scheduleNotes').value.trim();
            const selectedCals = Array.from(document.querySelectorAll('input[name="schedCalendar"]:checked')).map(c => c.value);

            const startDt = new Date(startInput);
            const endDt = new Date(startDt.getTime() + durationMins * 60000);

            const eventTitle = `${ro.customerName} — ${ro.rv || 'RV'}`;
            const description = [
                `Customer: ${ro.customerName}`,
                `RV: ${ro.rv || '—'}`,
                `Phone: ${ro.customerPhone || '—'}`,
                `Service: ${ro.repairType || '—'}`,
                `Tech: ${ro.technicianAssigned || '—'}`,
                `Promised: ${ro.promisedDate || '—'}`,
                `RO ID: ${ro.roId || '—'}`,
                notes ? `
Notes: ${notes}` : '',
            ].filter(Boolean).join('\n');

            let created = 0;
            let failed = 0;

            for (const service of selectedCals) {
                const calId = getCalendarId(service);
                if (!calId || !accessToken) { failed++; continue; }

                try {
                    const event = {
                        summary: eventTitle,
                        description,
                        start: { dateTime: startDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                        end:   { dateTime: endDt.toISOString(),   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                        colorId: '2', // sage green
                    };

                    const resp = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
                        {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(event),
                        }
                    );

                    if (resp.ok) { created++; }
                    else { warn('Calendar event failed:', await resp.text()); failed++; }
                } catch(e) { warn('Calendar event error:', e); failed++; }
            }

            // ── Update RO status to Scheduled ─────────────────────────
            if (created > 0) {
                currentData[originalIndex].status = 'Scheduled';
                const supabaseId = currentData[originalIndex]._supabaseId;
                if (supabaseId) {
                    await getSB().from('repair_orders').update({
                        status: 'Scheduled',
                        pct_complete: 45,
                        updated_at: new Date().toISOString(),
                    }).eq('id', supabaseId);
                }

                // Write audit log entry
                await writeAuditLog(ro.roId, [{
                    field: 'status',
                    oldValue: ro.status,
                    newValue: 'Scheduled',
                }]);

                statusEl.style.color = '#39ff6e';
                statusEl.textContent = `✅ ${created} calendar event(s) created — RO marked Scheduled`;

                setTimeout(() => {
                    closeScheduleModal();
                    renderBoard();
                }, 1500);
            } else {
                statusEl.style.color = '#ff3b30';
                statusEl.textContent = `❌ Failed to create calendar events. Check Google connection.`;
                btn.disabled = false;
                btn.textContent = '📅 Retry';
            }
        }


// ── Key Dates Phase 2 (S119) ────────────────────────────────────────────────
// Create/update/delete all-day Google Calendar events for an RO's PROMISED and
// PICKUP key dates on the per-service silo calendars, idempotently. Called from
// ro-crud.js after a New RO insert or Edit RO update.
//
// AUTO-ON-SAVE: writes only when a Google Calendar access token is present
// (same constraint as the Schedule modal); silently no-ops otherwise so a save
// never fails for lack of a token. Idempotency via the repair_orders.cal_event_ids
// jsonb map { promised:{svc:eventId}, pickup:{svc:eventId} }: PATCH if we already
// have an id, POST to create, DELETE when a date is cleared or its service drops.
//
// opts = { repairType, customerName, rv, customerPhone, roId,
//          promisedDate, pickupDate, existingIds }
export async function syncKeyDateCalendars(supabaseId, opts) {
    if (!accessToken || !supabaseId || !opts) return;
    try {
        const roServices = String(opts.repairType || '')
            .split(',').map(s => s.trim()).filter(s => s && getCalendarId(s));

        const ids = (opts.existingIds && typeof opts.existingIds === 'object')
            ? JSON.parse(JSON.stringify(opts.existingIds)) : {};

        const customerName = opts.customerName || 'Customer';
        const rv = opts.rv || 'RV';
        const phone = opts.customerPhone || '';
        const roCode = opts.roId || '';

        const dateDefs = [
            { type: 'promised', label: 'Promised', colorId: '5',  date: (opts.promisedDate || '').slice(0, 10) },
            { type: 'pickup',   label: 'Pickup',   colorId: '10', date: (opts.pickupDate   || '').slice(0, 10) },
        ];

        let changed = false;

        for (const def of dateDefs) {
            ids[def.type] = ids[def.type] || {};
            const perSvc = ids[def.type];

            // Delete events for services no longer on the RO, or when the date was cleared.
            for (const svc of Object.keys(perSvc)) {
                if (!def.date || !roServices.includes(svc)) {
                    const calId = getCalendarId(svc);
                    if (calId && perSvc[svc]) await _kdCalDelete(calId, perSvc[svc]);
                    delete perSvc[svc];
                    changed = true;
                }
            }

            if (!def.date) continue;

            const endDate = _kdAddDaysISO(def.date, 1); // all-day end is exclusive
            const summary = `[${def.label}] ${customerName} — ${rv}`;
            const description = [
                `Customer: ${customerName}`,
                `RV: ${rv}`,
                phone ? `Phone: ${phone}` : '',
                `${def.label} date: ${def.date}`,
                roCode ? `RO ID: ${roCode}` : '',
            ].filter(Boolean).join('\n');

            for (const svc of roServices) {
                const calId = getCalendarId(svc);
                if (!calId) continue;
                const evt = {
                    summary, description,
                    start: { date: def.date },
                    end:   { date: endDate },
                    colorId: def.colorId,
                };
                const existing = perSvc[svc];
                try {
                    let resp = await fetch(
                        existing
                            ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(existing)}`
                            : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
                        {
                            method: existing ? 'PATCH' : 'POST',
                            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(evt),
                        }
                    );
                    // Stored event vanished (deleted in Calendar) — recreate.
                    if (existing && resp.status === 404) {
                        resp = await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
                            {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(evt),
                            }
                        );
                    }
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.id && data.id !== existing) { perSvc[svc] = data.id; changed = true; }
                    } else {
                        warn('Key-date calendar write failed', def.type, svc, await resp.text());
                    }
                } catch (e) { warn('Key-date calendar error', def.type, svc, e); }
            }
        }

        if (changed) {
            await getSB().from('repair_orders').update({ cal_event_ids: ids }).eq('id', supabaseId);
            const idx = currentData.findIndex(r => r._supabaseId === supabaseId);
            if (idx >= 0) currentData[idx].calEventIds = ids;
        }
    } catch (e) {
        warn('syncKeyDateCalendars failed (non-fatal):', e);
    }
}

function _kdAddDaysISO(isoDate, n) {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

async function _kdCalDelete(calId, eventId) {
    try {
        await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
        );
    } catch (e) { warn('Key-date calendar delete failed', e); }
}


// ---- Window bridge (Phase 12 additive) ----
Object.assign(window, {
  reauthorizeCalendar,
  openScheduleModal,
  confirmSchedule,
  proceedWithSchedule,
  syncKeyDateCalendars,
});
