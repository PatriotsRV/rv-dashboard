// js/ro-crud.js — Phase 7 (ADDITIVE): repair-order CRUD + Supabase read/write layer.
// v1.492 (Session 170, 2026-08-07): GH#36 Phase 1 auto-refresh — focus/visibility
//   + periodic board re-load with _uiBusy modal/typing guard. See block at the
//   bottom of this file (above the window bridge).
// v1.431 (Session 84, 2026-05-31).
//
// Extracted VERBATIM from the index.html inline <script>:
//   loadDataFromSupabase, loadDataFromSheets, appendToSupabase, updateROInSupabase,
//   updateFieldInSupabase, archiveROInSupabase, loadCustomFieldConfigFromSupabase,
//   updateROStatus, updateROUrgency, updateROProgress, editField, openEditRO,
//   closeEditModal, writeAuditLog.
//
// ADDITIVE PHASE — the inline copies REMAIN in index.html. This module is loaded
// by app.js and its window bridge re-points window.loadDataFromSupabase etc. to
// these copies, but the bodies are byte-identical to the inline versions (no
// reference rewriting), so behavior is unchanged. Every bare reference inside
// these functions (getSB, supabaseSession, currentData, currentFilteredData,
// rowToRO, escapeHtml, renderBoard, writeAuditLog, generateROId, isAdmin, t, ...)
// resolves through the shared global environment to the SAME symbol the inline
// copy uses — module-owned helpers via their window bridge, inline constants/state
// via their backward-compat globals.
//
// WARNING: these functions WRITE to repair_orders + audit_log. This additive build
// MUST be validated with a NON-DESTRUCTIVE write test on a $0 staff-tester RO
// (status + urgency change -> audit_log entry verified -> reverted) before promote.
//
// Proper ESM imports (config/state/utils/render/auth) + deletion of the inline
// copies are deferred to the Phase 7 delete-inline cleanup, after this additive
// build soaks. Do NOT rewrite references here until that phase.

        export async function loadDataFromSupabase() {
            log('=== loadDataFromSupabase called ===');
            // [v1.496 S176] Snapshot UI-busy state at load START. If a modal opens
            // while this load is in flight, committing the new (possibly reordered)
            // array under it would break index-based modal writes — the exact
            // mechanism of the Kain/Ivins wrong-RO overwrite (2026-08-21). The
            // _uiBusy guard only stops loads from STARTING; this closes the
            // in-flight window: started-idle + finished-busy = discard, retry later.
            const _busyAtLoadStart = _uiBusy();
            try {
                // Load repair orders — GH#30: exclude soft-deleted rows
                const { data: ros, error } = await getSB()
                    .from('repair_orders')
                    .select('*')
                    .is('deleted_at', null)
                    .order('date_received', { ascending: false })
                    .order('id', { ascending: true }); // [v1.496 S176] stable tie-break — equal date_received rows must NOT swap positions between loads (index-based modal writes; Kain/Ivins incident 2026-08-21)

                if (error) throw error;

                // Load notes for all ROs — PAGINATED (S158).
                // PostgREST silently caps un-limited selects at 1000 rows; ordered
                // ascending, that would drop the NEWEST notes once active-RO notes
                // pass 1000 (624 as of S158, growing ~165/wk). The loop below makes
                // the SAME single request as before, and only fetches another page
                // when the previous page came back full (i.e. more rows exist).
                const roIds = ros.map(r => r.id);
                const NOTES_PAGE = 1000;
                let notes = [];
                for (let from = 0; ; from += NOTES_PAGE) {
                    const { data: page, error: notesErr } = await getSB()
                        .from('notes')
                        .select('ro_id, type, body, created_at')
                        .in('ro_id', roIds)
                        .order('created_at', { ascending: true })
                        .order('id', { ascending: true }) // stable tie-break so page boundaries never skip/dup rows
                        .range(from, from + NOTES_PAGE - 1);
                    if (notesErr) { warn('notes page load failed at offset', from, notesErr); break; }
                    notes = notes.concat(page || []);
                    if (!page || page.length < NOTES_PAGE) break;
                }

                // Load parts summary for badges
                const { data: parts } = await getSB()
                    .from('parts')
                    .select('ro_id, status')
                    .in('ro_id', roIds);

                // v1.414 WO Redesign Phase A1+A2 — Load WO + task summary per RO.
                // Single round-trip extension. Wrapped in try/catch so a failure here
                // never blocks the rest of the load (default-safe to "no badge / no chip").
                let woSummaryMap = {};
                try {
                    const { data: wos, error: wosErr } = await getSB()
                        .from('service_work_orders')
                        .select('id, ro_id, service_silo, tech_done_at, completed_at')
                        .in('ro_id', roIds);
                    if (wosErr) throw wosErr;
                    const woIds = (wos || []).map(w => w.id);
                    let tasksByWo = {};
                    if (woIds.length > 0) {
                        const { data: tasks, error: taskErr } = await getSB()
                            .from('service_tasks')
                            .select('id, work_order_id, status, est_hours')
                            .in('work_order_id', woIds);
                        if (taskErr) throw taskErr;
                        (tasks || []).forEach(tk => {
                            if (!tasksByWo[tk.work_order_id]) tasksByWo[tk.work_order_id] = [];
                            tasksByWo[tk.work_order_id].push(tk);
                        });
                    }
                    (wos || []).forEach(wo => {
                        if (!woSummaryMap[wo.ro_id]) {
                            woSummaryMap[wo.ro_id] = { total_wos: 0, total_tasks: 0, completed_tasks: 0, silos: [] };
                        }
                        const sm = woSummaryMap[wo.ro_id];
                        const woTasks = tasksByWo[wo.id] || [];
                        const completed = woTasks.filter(t => t.status === 'completed').length;
                        const estHours = woTasks.reduce((s, t) => s + (parseFloat(t.est_hours) || 0), 0);
                        sm.total_wos += 1;
                        sm.total_tasks += woTasks.length;
                        sm.completed_tasks += completed;
                        sm.silos.push({
                            silo: wo.service_silo,
                            wo_id: wo.id,
                            task_count: woTasks.length,
                            completed: completed,
                            est_hours: estHours,
                            wo_completed: !!wo.completed_at,   // S99 Weekly P&L: manager Done-Done
                            tech_done: !!wo.tech_done_at       // S99 Weekly P&L: tech-lead flag
                        });
                    });
                } catch (woErr) {
                    warn('WO summary load failed (Phase A1+A2 — non-fatal):', woErr);
                    woSummaryMap = {};
                }
                // End v1.414 WO summary load

                // Build notes map
                const notesMap = {};
                if (notes) {
                    notes.forEach(n => {
                        if (!notesMap[n.ro_id]) notesMap[n.ro_id] = { ro_status: [], customer_comm: [] };
                        if (n.type === 'ro_status') notesMap[n.ro_id].ro_status.push(n.body);
                        if (n.type === 'customer_comm') notesMap[n.ro_id].customer_comm.push(n.body);
                    });
                }

                // Build parts map for badge
                const partsMap = {};
                if (parts) {
                    parts.forEach(p => {
                        if (!partsMap[p.ro_id]) partsMap[p.ro_id] = [];
                        partsMap[p.ro_id].push({ status: p.status });
                    });
                }

                // Map to app format
                const data = ros.map(row => {
                    const nm = notesMap[row.id] || {};
                    row._ro_notes   = (nm.ro_status   || []).join('\n');
                    row._comm_notes = (nm.customer_comm || []).join('\n');
                    row._parts_json = partsMap[row.id] ? JSON.stringify(partsMap[row.id]) : '';
                    row._wo_summary = woSummaryMap[row.id] || null; // v1.414 Phase A1+A2
                    return rowToRO(row);
                });

                // [v1.496 S176] Commit guard — see note at function top.
                if (!_busyAtLoadStart && _uiBusy()) {
                    log('⏸ Board load DISCARDED — a modal/form opened while the load was in flight (retry on next eligible trigger)');
                    return;
                }
                currentData = data;
                log('✅ Loaded', data.length, 'repair orders from Supabase');
                _lastBoardLoadAt = Date.now(); // v1.492 GH#36 Phase 1: staleness clock
                renderBoard();

                // Load custom fields config
                loadCustomFieldConfig();
                // Load parts detail
                loadPartsFromSupabase();

            } catch(err) {
                console.error('Error loading from Supabase:', err);
                showToast('Error loading data from database: ' + err.message, 'error');
            }
        }

        export async function loadDataFromSheets() {
            log('=== loadDataFromSheets called ===');
            try {
                log('Fetching data from spreadsheet:', GOOGLE_CONFIG.SPREADSHEET_ID);
                const response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
                    range: 'Sheet1!A1:X1000',  // Now includes column X (PartsJSON)
                });

                log('Response received:', response);
                const rows = response.result.values;
                if (!rows || rows.length === 0) {
                    log('No data found.');
                    return;
                }

                // Convert rows to data objects (skip header row)
                const headers = rows[0];
                log('Sheet headers:', headers);
                const data = [];
                
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    
                    // Debug: Show the raw row data
                    if (i === 1) {
                        log('=== First row detailed debug ===');
                        log('Row array length:', row.length);
                        log('Headers array length:', headers.length);
                        log('Row[5] (RV Photo URL position):', row[5]);
                        log('Full row:', row);
                    }
                    
                    const obj = {};
                    headers.forEach((header, index) => {
                        const key = toCamelCase(header);
                        const value = row[index];
                        obj[key] = value !== undefined ? value : '';
                        
                        // Debug column F specifically
                        if (index === 5 && i === 1) {
                            log('Processing column F (index 5):');
                            log('  Header:', header);
                            log('  Key:', key);
                            log('  Value from row[5]:', value);
                            log('  Final obj.rvPhotoUrl:', obj.rvPhotoUrl);
                        }
                    });
                    
                    // Convert numeric fields
                    if (obj.dollarValue) obj.dollarValue = parseFloat(obj.dollarValue);
                    if (obj.percentComplete) obj.percentComplete = parseInt(obj.percentComplete);

                    // Assign roId — use stored value from column U, or generate if missing
                    if (!obj.roId && obj.customerName && obj.dateReceived) {
                        obj.roId = generateROId(obj.customerName, obj.rv || '', obj.dateReceived);
                    }
                    
                    // Log the entire object to see what we got
                    log('Row', i, 'Customer:', obj.customerName, 'Photo URL:', obj.rvPhotoUrl);
                    
                    // Log photo URLs to debug
                    if (obj.rvPhotoUrl) {
                        log('✓ Loaded photo URL for', obj.customerName, ':', obj.rvPhotoUrl);
                    }
                    
                    data.push(obj);
                }

                currentData = data;
                log('Loaded', data.length, 'records from sheet');
                renderBoard();
            } catch (err) {
                console.error('Error loading from Sheets:', err);
                showToast('Error loading data. Check console for details.', 'error');
            }
        }

        // [Key Dates P3 S119] Recipients for promised/pickup reminders:
        // silo manager(s) for the RO's service(s) + the admin report recipients
        // (Roland + Lynn from app_config). Falls back to repair@ if none resolve.
        function _keyDateRecipients(repairType) {
            const silos = String(repairType || '').split(',')
                .map(s => REPAIR_TYPE_TO_SILO[s.trim().toLowerCase()]).filter(Boolean);
            let recipients = [];
            if (silos.length && Array.isArray(_staffCache)) {
                recipients = _staffCache
                    .filter(s => s.active !== false && s.email
                        && (s.role === 'manager' || s.role === 'sr_manager')
                        && (silos.includes(s.service_silo) || (s.service_silo == null && s.role === 'sr_manager')))
                    .map(s => s.email);
            }
            const adminCsv = (typeof _appConfig === 'object' && _appConfig && _appConfig['admin_report_recipients']) || '';
            const admins = String(adminCsv).split(',').map(e => e.trim()).filter(Boolean);
            const all = [...new Set([...recipients, ...admins])];
            return all.length ? all : ['repair@patriotsrvservices.com'];
        }

        // [ER cb7742a8 S129] Server-side calendar sync. Replaces the client-side
        // window.syncKeyDateCalendars (which only ran when the saver had a Google
        // Calendar token). This POSTs the RO id to the sync-ro-calendar edge fn,
        // which authenticates with a service account and creates/updates/deletes the
        // drop-off + promised + pickup all-day events on the team silo calendars,
        // idempotently via repair_orders.cal_event_ids. Non-fatal: a save never fails
        // because of the calendar. Works regardless of who is signed in.
        async function _syncROCalendarServer(supabaseId) {
            if (!supabaseId) return;
            try {
                await fetch(`${SUPABASE_URL}/functions/v1/sync-ro-calendar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`,
                        'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                    },
                    body: JSON.stringify({ ro_id: supabaseId }),
                });
            } catch (e) { warn('sync-ro-calendar call failed (non-fatal):', e); }
        }

        // [Key Dates P3 S119] Cancel any pending reminder rows for ONE key-date type and
        // recreate day-before + morning-of rows (8 AM CDT) if a date is set. Mirrors the
        // GH#ER1 auto_dropoff_reminder cascade. Sources: auto_promised_reminder /
        // auto_pickup_reminder. Skips reminder times already in the past. Non-fatal.
        async function _syncOneKeyDateReminder(supabaseId, roId, dateType, opts) {
            const source = dateType === 'promised' ? 'auto_promised_reminder' : 'auto_pickup_reminder';
            const label  = dateType === 'promised' ? 'Promised/Completion' : 'Pickup';
            try {
                await getSB().from('scheduled_notifications')
                    .update({ status: 'cancelled' })
                    .eq('ro_id', supabaseId).eq('source', source).eq('status', 'pending');

                const date = (opts.newDate || '').slice(0, 10);
                if (!date) {
                    if (opts.oldDate) {
                        const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                        await getSB().from('notes').insert({
                            ro_id: supabaseId, type: 'ro_status',
                            body: `[${ts} - ${currentUser?.name || 'Edit RO'}] 🔔 ${label.toUpperCase()} REMINDERS CANCELLED: date was cleared`,
                        });
                    }
                    return;
                }

                const recipients = _keyDateRecipients(opts.repairType);
                const niceDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
                const morningOf = new Date(date + 'T13:00:00Z');             // 8 AM CDT on the date
                const dayBefore = new Date(morningOf.getTime() - 86400000);  // 8 AM CDT the day before
                const nowMs = Date.now();

                const fires = [];
                if (dayBefore.getTime() > nowMs) fires.push({ when: dayBefore, rel: 'tomorrow' });
                if (morningOf.getTime() > nowMs) fires.push({ when: morningOf, rel: 'today' });

                for (const f of fires) {
                    const subject = `${opts.customerName} — ${label} ${f.rel} (${niceDate})`;
                    const body = [
                        `${opts.customerName}'s ${label.toLowerCase()} date for ${opts.rv || 'their RV'} is ${niceDate}.`,
                        '',
                        `Service: ${opts.repairType || 'TBD'}`,
                        `RO ID: ${roId}`,
                        '',
                        `This reminder fires the day before and the morning of the ${label.toLowerCase()} date.`,
                    ].join('\n');
                    await getSB().from('scheduled_notifications').insert({
                        ro_id:            supabaseId,
                        scheduled_at:     f.when.toISOString(),
                        recipient_emails: recipients,
                        subject:          subject,
                        body:             body,
                        source:           source,
                        status:           'pending',
                        created_by_email: currentUser?.email || 'key-dates',
                    });
                }

                if (fires.length) {
                    const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                    await getSB().from('notes').insert({
                        ro_id: supabaseId, type: 'ro_status',
                        body: `[${ts} - ${currentUser?.name || 'Edit RO'}] 🔔 ${label.toUpperCase()} REMINDERS SCHEDULED: ${niceDate} → ${fires.length} reminder(s) to ${recipients.length} recipient(s)`,
                    });
                }
            } catch (e) { warn('Key-date reminder sync failed (non-fatal):', dateType, e); }
        }

        // [ER a7d1474e v1.466 S127] Notify silo manager(s) + admins when an RO's urgent-update
        // note is set or changed. Enqueues an immediate scheduled_notifications row (sent by the
        // every-15-min process-scheduled-notifications cron) + drops an RO timeline note. Non-fatal.
        async function _notifyUrgentUpdate(supabaseId, roId, opts) {
            try {
                const recipients = _keyDateRecipients(opts.repairType);
                const subject = `🚨 Urgent update — ${opts.customerName} (${roId})`;
                const body = [
                    `An urgent update was set on ${opts.customerName}'s RO (${opts.rv || 'RV'}).`,
                    '',
                    `"${opts.text}"`,
                    '',
                    `Service: ${opts.repairType || 'TBD'}`,
                    `RO ID: ${roId}`,
                    `Set by: ${currentUser?.name || currentUser?.email || 'staff'}`,
                ].join('\n');
                await getSB().from('scheduled_notifications').insert({
                    ro_id:            supabaseId,
                    scheduled_at:     new Date().toISOString(),
                    recipient_emails: recipients,
                    subject:          subject,
                    body:             body,
                    source:           'urgent_update_notify',
                    status:           'pending',
                    created_by_email: currentUser?.email || 'urgent-update',
                });
                const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                await getSB().from('notes').insert({
                    ro_id: supabaseId, type: 'ro_status',
                    body: `[${ts} - ${currentUser?.name || 'Edit RO'}] 🚨 URGENT UPDATE SET: ${opts.text} (notified ${recipients.length} recipient(s))`,
                });
            } catch (e) { warn('Urgent-update notify failed (non-fatal):', e); }
        }

        // [ER 50175fce v1.498 S178, Lynn] Edit the urgent update DIRECTLY FROM THE TILE
        // (banner click, or the 🚨 card action) instead of digging into Edit RO.
        // Reuses the exact Edit-RO semantics: UUID-resolved write (v1.496 discipline),
        // audit row, and _notifyUrgentUpdate on set/change to a non-empty value
        // (never on clear) — which also drops the RO timeline note.
        export async function editUrgentUpdate(index) {
            if (!getSB() || !supabaseSession) {
                showToast('Please connect to the PRVS database first.', 'warning');
                return;
            }
            const ro = currentFilteredData[index];
            if (!ro || !ro._supabaseId) { showToast('Error: Could not find the repair order.', 'error'); return; }
            const supabaseId = ro._supabaseId;
            const oldVal = (ro.urgentUpdate || '').trim();
            const entered = await showVoiceNotesModal('🚨 Urgent Update — shown on the card and notifies silo managers. Save empty to clear it:', oldVal);
            if (entered === null) return; // cancelled
            const newVal = entered.trim() || null;
            if ((newVal || '') === oldVal) return; // no change

            const { error } = await getSB().from('repair_orders')
                .update({ urgent_update: newVal })
                .eq('id', supabaseId);
            if (error) { showToast('Failed to save urgent update: ' + error.message, 'error'); return; }

            // Audit — oldVal captured BEFORE the local mutation below.
            await writeAuditLog(ro.roId, [{ field: 'Urgent Update', oldValue: oldVal, newValue: newVal || '' }]);

            if (newVal && newVal !== oldVal) {
                await _notifyUrgentUpdate(supabaseId, ro.roId, {
                    customerName: ro.customerName,
                    rv:           ro.rv,
                    repairType:   ro.repairType,
                    text:         newVal,
                });
            }

            const origIdx = currentData.findIndex(d => d._supabaseId === supabaseId);
            if (origIdx !== -1) currentData[origIdx].urgentUpdate = newVal || '';
            renderBoard();
            showToast(newVal ? 'Urgent update saved — silo managers notified.' : 'Urgent update cleared.', 'success');
        }

        // [S175] Approved-status notification (Roland directive S175): when an RO
        // enters any 'Approved …' status, notify (1) the manager(s) of the RO's
        // service silo(s) and (2) every tech who has logged time on the RO —
        // approval means they are clear to move forward with the repairs.
        // Email queues as a scheduled_notifications row (source 'approval_notify'
        // — migration approval_notify_source_s175.sql; delivered by the every-15-min
        // process-scheduled-notifications cron). Staff SMS goes direct through
        // textly-send with the suppression-exempt 'staff_notify' context (same
        // context textly-webhook + send-unreplied-reminder use for staff texts —
        // no customer conversations row created). Non-fatal throughout:
        // a status flip never fails because of notifications.
        async function _notifyApprovalStatus(supabaseId, ro, newStatus) {
            try {
                // Fresh staff fetch — never depend on the lazily-loaded _staffCache
                const { data: staff, error: staffErr } = await getSB()
                    .from('staff')
                    .select('email, name, role, service_silo, phone_number, active')
                    .eq('active', true);
                if (staffErr) throw staffErr;

                // (1) Managers of the RO's silo(s) — null-silo sr_managers included
                //     (same catch-all as _keyDateRecipients)
                const silos = String(ro.repairType || '').split(',')
                    .map(s => REPAIR_TYPE_TO_SILO[s.trim().toLowerCase()]).filter(Boolean);
                const managers = (staff || []).filter(s => s.email
                    && (s.role === 'manager' || s.role === 'sr_manager')
                    && (silos.includes(s.service_silo) || (s.service_silo == null && s.role === 'sr_manager')));

                // (2) Techs with time logged on this RO
                const { data: logs, error: logErr } = await getSB()
                    .from('time_logs').select('tech_email').eq('ro_id', supabaseId);
                if (logErr) throw logErr;
                const techEmails = [...new Set((logs || []).map(l => (l.tech_email || '').toLowerCase()).filter(Boolean))];
                const techs = (staff || []).filter(s => s.email && techEmails.includes(s.email.toLowerCase()));

                // Dedupe (a silo manager may also have time on the RO)
                const byEmail = new Map();
                [...managers, ...techs].forEach(s => byEmail.set(s.email.toLowerCase(), s));
                const recipients = [...byEmail.values()];
                if (!recipients.length) {
                    warn('Approval notify: no recipients resolved for', ro.roId, '— silos:', silos);
                    return;
                }

                const who = currentUser?.name || currentUser?.email || 'staff';

                // Email — queued, delivered by the 15-min cron
                const subject = `✅ Approved — ${ro.customerName} (${ro.roId}): ${newStatus}`;
                const body = [
                    `${ro.customerName}'s RO has been approved: ${newStatus}.`,
                    '',
                    `You are clear to move forward with the repairs.`,
                    '',
                    `RV: ${ro.rv || 'N/A'}`,
                    `RO ID: ${ro.roId || ''}`,
                    `Services: ${ro.repairType || 'TBD'}`,
                    `Status set by: ${who}`,
                    '',
                    `You're receiving this as a silo manager or as a tech with time logged on this RO.`,
                ].join('\n');
                const { error: qErr } = await getSB().from('scheduled_notifications').insert({
                    ro_id:            supabaseId,
                    scheduled_at:     new Date().toISOString(),
                    recipient_emails: recipients.map(s => s.email),
                    subject:          subject,
                    body:             body,
                    source:           'approval_notify',
                    status:           'pending',
                    created_by_email: currentUser?.email || 'approval-notify',
                });
                if (qErr) throw qErr;

                // Staff SMS — direct, one per staff phone (skip rows without a number)
                const smsBody = `✅ PRVS: ${ro.customerName}'s RO ${ro.roId} is APPROVED (${newStatus}). You're clear to move forward with the repairs.`;
                let smsCount = 0;
                for (const s of recipients) {
                    const phone = String(s.phone_number || '').trim();
                    if (!phone) continue;
                    try {
                        const res = await fetch(`${SUPABASE_URL}/functions/v1/textly-send`, {
                            method: 'POST',
                            headers: {
                                'Authorization': supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`,
                                'Content-Type': 'application/json',
                                'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                            },
                            body: JSON.stringify({
                                action:  'send',
                                to:      phone,
                                body:    smsBody,
                                ro_id:   supabaseId,
                                ro_code: ro.roId || null,
                                sent_by: currentUser?.email || null,
                                context: 'staff_notify',
                            }),
                        });
                        if (res.ok) smsCount++;
                        else warn('Approval notify SMS non-OK (non-fatal):', s.email, res.status);
                    } catch (smsErr) { warn('Approval notify SMS failed (non-fatal):', s.email, smsErr); }
                }

                // RO timeline note
                const ts = new Date().toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                const { error: noteErr } = await getSB().from('notes').insert({
                    ro_id: supabaseId, type: 'ro_status',
                    body: `[${ts} - ${who}] ✅ APPROVAL NOTICE SENT (${newStatus}): ${recipients.length} recipient(s) — ${managers.length} manager(s), ${techs.length} tech(s) with time on the RO; ${smsCount} SMS sent + email queued. Clear to move forward with repairs.`,
                });
                if (noteErr) warn('Approval notify note failed (non-fatal):', noteErr);
                log(`✅ Approval notify: ${recipients.length} recipient(s), ${smsCount} SMS`);
            } catch (e) { warn('Approval notification failed (non-fatal):', e); }
        }

        export async function appendToSupabase(formData) {
            const today = new Date().toISOString().slice(0, 10);
            const candidates = generateROIdCandidates(formData.customerName, formData.rv || '', today);

            let data = null;
            for (const roId of candidates) {
                const { data: inserted, error } = await getSB().from('repair_orders').insert({
                    ro_id:          roId,
                    customer_name:  formData.customerName,
                    phone:          formData.customerPhone || null,
                    email:          formData.customerEmail || null,
                    address:        formData.customerAddress || null,
                    rv:             formData.rv || null,
                    vin:            formData.vin || null,
                mileage:        formData.mileage || null, // [ER ac8265c8 v1.498 S178]
                    mileage:        formData.mileage || null, // [ER ac8265c8 v1.498 S178]
                    repair_type:    formData.repairType || null,
                    description:    formData.repairDescription || null,
                    technician:     formData.technicianAssigned || null,
                    date_received:  today,
                    promised_date:  formData.promisedDate || null,
                    pct_complete:   0,
                    dollar_value:   formData.dollarValue ? parseFloat(formData.dollarValue) : null,
                    parking_spot:   formData.parkingSpot || null,
                    status:         formData.status || 'Not On Lot',
                    urgency:        formData.urgency || null,
                    customer_type:  formData.customerType || null,
                    ro_type:        currentROType || 'standard',
                    is_training:    !!formData.isTraining,
                    planned_dropoff_date: formData.plannedDropoffDate || null,
                    pickup_date:    formData.pickupDate || null, // [Key Dates P1 S117] ER d2561e11
                    key_status:     formData.keyStatus || null,      // [ER BUGFIX v1.458 S118] keys/power (ERs 34fc03c2 + b87eb2fb)
                    keypad_code:    formData.keypadCode || null,     // [ER BUGFIX v1.458 S118]
                    keep_plugged_in: !!formData.keepPluggedIn,       // [ER BUGFIX v1.458 S118]
                    urgent_update:  formData.urgentUpdate || null,   // [ER a7d1474e v1.466 S127]
                    photo_library:  { photos: [], docs: [] },
                }).select().single();

                if (!error) { data = inserted; break; }        // ✅ Success
                if (error.code !== '23505') throw error;       // ❌ Real error — surface it
                // error.code === '23505' → duplicate key → try next candidate
            }

            if (!data) throw new Error('Could not generate a unique RO ID after all retries.');


            // Add initial notes if present
            if (formData.roStatusNotes) {
                await getSB().from('notes').insert({
                    ro_id: data.id, type: 'ro_status',
                    body: formData.roStatusNotes,
                });
            }
            if (formData.customerCommunicationNotes) {
                await getSB().from('notes').insert({
                    ro_id: data.id, type: 'customer_comm',
                    body: formData.customerCommunicationNotes,
                });
            }

            // [ER cb7742a8 S129] Server-side calendar sync (drop-off + promised + pickup),
            // via the service-account edge fn — no Google token needed on the client.
            // Replaces the old client-side window.syncKeyDateCalendars path.
            await _syncROCalendarServer(data.id);

            // [Key Dates P3 S119] Enqueue promised/pickup email reminders for the new RO.
            const _kdInfo = { customerName: formData.customerName, rv: formData.rv, repairType: formData.repairType };
            if (formData.promisedDate) await _syncOneKeyDateReminder(data.id, data.ro_id, 'promised', { ..._kdInfo, newDate: formData.promisedDate, oldDate: null });
            if (formData.pickupDate)   await _syncOneKeyDateReminder(data.id, data.ro_id, 'pickup',   { ..._kdInfo, newDate: formData.pickupDate,   oldDate: null });

            // [ER a7d1474e v1.466 S127] Notify on an urgent update entered at creation time.
            if (formData.urgentUpdate) await _notifyUrgentUpdate(data.id, data.ro_id, { ..._kdInfo, text: formData.urgentUpdate });

            log('✅ New RO saved to Supabase:', data.ro_id);
            return data;
        }

        export async function updateROInSupabase(originalIndex, formData) {
            const ro = currentData[originalIndex];
            const supabaseId = ro._supabaseId;
            if (!supabaseId) {
                warn('No Supabase ID found for RO, trying to find by ro_id');
                return;
            }

            const newPlannedDropoff = formData.plannedDropoffDate || null;
            const oldPlannedDropoff = ro.plannedDropoffDate || null;
            const newUrgentUpdate = (formData.urgentUpdate || '').trim() || null; // [ER a7d1474e v1.466 S127]
            const oldUrgentUpdate = (ro.urgentUpdate || '').trim() || null;

            const { error } = await getSB().from('repair_orders').update({
                customer_name:  formData.customerName,
                phone:          formData.customerPhone || null,
                email:          formData.customerEmail || null,
                address:        formData.customerAddress || null,
                rv:             formData.rv || null,
                vin:            formData.vin || null,
                repair_type:    formData.repairType || null,
                description:    formData.repairDescription !== undefined ? (formData.repairDescription || null) : (ro.repairDescription || null),
                technician:     formData.technicianAssigned || null,
                promised_date:  formData.promisedDate || null,
                date_arrived:   formData.dateArrived || null,
                dollar_value:   formData.dollarValue ? parseFloat(formData.dollarValue) : null,
                parking_spot:   formData.parkingSpot || null,
                ro_type:        currentROType || 'standard',
                is_training:    !!formData.isTraining,
                planned_dropoff_date: newPlannedDropoff,
                pickup_date:    formData.pickupDate || null, // [Key Dates P1 S117] ER d2561e11
                key_status:     formData.keyStatus || null,      // [ER BUGFIX v1.458 S118] keys/power (ERs 34fc03c2 + b87eb2fb)
                keypad_code:    formData.keypadCode || null,     // [ER BUGFIX v1.458 S118]
                keep_plugged_in: !!formData.keepPluggedIn,       // [ER BUGFIX v1.458 S118]
                urgent_update:  newUrgentUpdate,                 // [ER a7d1474e v1.466 S127]
                updated_at:     new Date().toISOString(),
            }).eq('id', supabaseId);

            if (error) throw error;

            // [ER a7d1474e v1.466 S127] Notify silo manager(s) + admins when the urgent update
            // is set or changed to a non-empty value (not when cleared). Non-fatal.
            if (newUrgentUpdate && newUrgentUpdate !== oldUrgentUpdate) {
                await _notifyUrgentUpdate(supabaseId, ro.roId, {
                    customerName: formData.customerName,
                    rv:           formData.rv,
                    repairType:   formData.repairType,
                    text:         newUrgentUpdate,
                });
            }

            // GH#ER1 — cascade planned_dropoff_date change to auto-reminder row.
            // If the date changed (or was cleared/added), cancel any pending
            // auto_dropoff_reminder rows for this RO and recreate one with the
            // new date if applicable.
            if (newPlannedDropoff !== oldPlannedDropoff) {
                try {
                    // Cancel existing pending auto rows for this RO
                    await getSB().from('scheduled_notifications')
                        .update({ status: 'cancelled' })
                        .eq('ro_id', supabaseId)
                        .eq('source', 'auto_dropoff_reminder')
                        .eq('status', 'pending');

                    // Insert fresh if a date is now set
                    if (newPlannedDropoff) {
                        const dropD = new Date(newPlannedDropoff + 'T13:00:00Z');  // 8 AM CDT
                        dropD.setUTCDate(dropD.getUTCDate() - 1);
                        const reminderAtIso = dropD.toISOString();

                        // Recipients: silo manager(s) for repair_type, fall back to repair@
                        const siloKey = formData.repairType ? REPAIR_TYPE_TO_SILO[String(formData.repairType).toLowerCase()] : null;
                        let recipients = [];
                        if (siloKey && Array.isArray(_staffCache)) {
                            recipients = _staffCache
                                .filter(s => s.active !== false && s.email
                                    && (s.role === 'manager' || s.role === 'sr_manager')
                                    && (s.service_silo === siloKey || s.service_silo == null && s.role === 'sr_manager'))
                                .map(s => s.email);
                        }
                        if (recipients.length === 0) recipients = ['repair@patriotsrvservices.com'];

                        const niceDate = new Date(newPlannedDropoff + 'T12:00:00').toLocaleDateString(
                            'en-US', { weekday:'long', month:'long', day:'numeric' });
                        const subject = `${formData.customerName} drop-off tomorrow (${niceDate})`;
                        const body = [
                            `${formData.customerName} is scheduled to drop off ${formData.rv || 'their RV'} on ${niceDate}.`,
                            '',
                            `Service: ${formData.repairType || 'TBD'}`,
                            `RO ID: ${ro.roId}`,
                            '',
                            `Reminder fires the morning before the planned drop-off so you can prep parking, intake, and any pre-arrival prep.`,
                        ].join('\n');

                        await getSB().from('scheduled_notifications').insert({
                            ro_id:            supabaseId,
                            scheduled_at:     reminderAtIso,
                            recipient_emails: recipients,
                            subject:          subject,
                            body:             body,
                            source:           'auto_dropoff_reminder',
                            status:           'pending',
                            created_by_email: currentUser?.email || 'edit-ro',
                        });

                        // Audit trail
                        const ts = new Date().toLocaleString('en-US', {
                            month: '2-digit', day: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                        });
                        await getSB().from('notes').insert({
                            ro_id: supabaseId,
                            type:  'ro_status',
                            body:  `[${ts} - ${currentUser?.name || 'Edit RO'}] 🔔 AUTO DROP-OFF REMINDER SCHEDULED: planned drop-off ${niceDate}, reminder fires morning before to ${recipients.length} recipient(s)`,
                        });
                    } else if (oldPlannedDropoff) {
                        // Date was cleared — log the cancellation
                        const ts = new Date().toLocaleString('en-US', {
                            month: '2-digit', day: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                        });
                        await getSB().from('notes').insert({
                            ro_id: supabaseId,
                            type:  'ro_status',
                            body:  `[${ts} - ${currentUser?.name || 'Edit RO'}] 🔔 AUTO DROP-OFF REMINDER CANCELLED: planned drop-off date was cleared`,
                        });
                    }
                } catch (cascadeErr) {
                    warn('Auto-reminder cascade failed (non-fatal):', cascadeErr);
                }
            }

            // [S159 FIX — Edit RO no-op audit rows] Audit writing REMOVED from this function.
            // This block used to log EVERY formData field unconditionally (old==new no-op rows
            // for unchanged fields, plus a duplicate raw-key row for every real change). The
            // Edit RO save handler in index.html is the single audit writer: it diffs old vs
            // new (numeric-aware as of S159) and calls writeAuditLog with friendly labels.

            // [ER cb7742a8 S129] Server-side calendar sync on edit (drop-off + promised +
            // pickup) via the service-account edge fn — no Google token needed on the
            // client. Replaces the old client-side window.syncKeyDateCalendars path.
            await _syncROCalendarServer(supabaseId);

            // [Key Dates P3 S119] Cascade promised/pickup reminders on date change/clear
            // (mirrors the GH#ER1 drop-off cascade above). Normalize falsy -> '' so an
            // unchanged empty date does no work.
            const _kdEditInfo = { customerName: formData.customerName || ro.customerName, rv: formData.rv || ro.rv, repairType: formData.repairType || ro.repairType };
            if ((formData.promisedDate || '') !== (ro.promisedDate || '')) {
                await _syncOneKeyDateReminder(supabaseId, ro.roId, 'promised', { ..._kdEditInfo, newDate: formData.promisedDate || null, oldDate: ro.promisedDate || null });
            }
            if ((formData.pickupDate || '') !== (ro.pickupDate || '')) {
                await _syncOneKeyDateReminder(supabaseId, ro.roId, 'pickup', { ..._kdEditInfo, newDate: formData.pickupDate || null, oldDate: ro.pickupDate || null });
            }

            log('✅ RO updated in Supabase');
        }

        export async function updateFieldInSupabase(originalIndex, fieldName, newValue) {
            const ro = currentData[originalIndex];
            const supabaseId = ro._supabaseId;
            if (!supabaseId) return;

            const fieldMap = {
                status:            'status',
                urgency:           'urgency',
                percentComplete:   'pct_complete',
                dollarValue:       'dollar_value',
                dateArrived:       'date_arrived',
                repairDescription: 'description',
            };

            const dbField = fieldMap[fieldName];
            if (dbField) {
                const { error: fieldErr } = await getSB().from('repair_orders').update({
                    [dbField]: newValue,
                    updated_at: new Date().toISOString(),
                }).eq('id', supabaseId);
                if (fieldErr) throw fieldErr;
            }

            // Notes fields go to notes table
            if (fieldName === 'roStatusNotes') {
                const { error: notesErr } = await getSB().from('notes').insert({
                    ro_id: supabaseId,
                    type: 'ro_status',
                    body: newValue,
                    created_at: new Date().toISOString(),
                });
                if (notesErr) throw notesErr;
            }
            if (fieldName === 'customerCommunicationNotes') {
                const { error: commErr } = await getSB().from('notes').insert({
                    ro_id: supabaseId,
                    type: 'customer_comm',
                    body: newValue,
                    created_at: new Date().toISOString(),
                });
                if (commErr) throw commErr;
            }
        }

        export async function archiveROInSupabase(originalIndex) {
            // v1.494 (S171, ER 09084bc5): the old client-side insert+delete pair
            // duplicated the cron's cashiered allowlist — and BOTH dropped 7
            // columns (photo_library, planned_dropoff_date, pickup_date,
            // key_status, keypad_code, keep_plugged_in, urgent_update). Worse,
            // this client path never wrote the cashiered_* child mirrors at all
            // (those lived only in archive_cashiered_ros()), so a manual
            // ⚙️ Archive silently lost parts / time logs / notes / audit / WOs.
            // Now ONE server-side body (archive_one_ro, migration
            // cashiered_full_detail_s171.sql) serves both paths; the client
            // calls the manager-gated archive_single_ro RPC. Full column set +
            // child mirrors, transactionally.
            const ro = currentData[originalIndex];
            const supabaseId = ro._supabaseId;
            if (!supabaseId) throw new Error('No Supabase ID for RO');

            const { data: archived, error } = await getSB()
                .rpc('archive_single_ro', { p_ro_id: supabaseId });
            if (error) throw error;
            if (!archived) throw new Error('RO not found or already archived');

            log('✅ RO archived to cashiered in Supabase (full detail + child mirrors)');
        }

        export async function loadCustomFieldConfigFromSupabase() {
            try {
                const { data } = await getSB()
                    .from('config')
                    .select('value')
                    .eq('key', 'insurance_custom_fields')
                    .maybeSingle();
                if (data?.value) {
                    customInsuranceFields = Array.isArray(data.value) ? data.value : [];
                    log('✅ Loaded', customInsuranceFields.length, 'custom insurance fields from Supabase');
                }
            } catch(e) {
                warn('Could not load custom fields from Supabase:', e);
                customInsuranceFields = [];
            }
            renderCustomFields('new');
            renderCustomFields('edit');
        }

        // ── [S183] CASH-OUT DOLLAR GATE ──────────────────────────────────────
        // An RO must carry a total dollar value to be cashed out — otherwise what
        // was done? ROs closed with nothing billed (totaled-out insurance paying
        // an admin fee, warranty closes) belong in 'Closed - No Charge', which
        // archives identically but never asks the customer for a review.
        //
        // 🔶 SOFT LAUNCH (Roland call S183): this WARNS and still lets the RO
        // through. 47% of active ROs had no dollar value the day this shipped, so
        // a hard block on day one would have walled off every other cash-out.
        // Every bypass is written to audit_log as field 'cashout_no_dollar_bypass'
        // so the soft period is MEASURABLE — count them before flipping to hard:
        //
        //   select count(*), max(changed_at) from audit_log
        //    where field_changed = 'cashout_no_dollar_bypass';
        //
        // TO GO HARD LATER: delete the 'anyway' button from the markup below and
        // drop its branch in the caller. Nothing else changes.
        function _confirmCashOutNoDollars(ro, woCount) {
            return new Promise(resolve => {
                const wrap = document.createElement('div');
                wrap.id = 'cashOutGateModal';
                wrap.className = 'modal-overlay';
                wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

                const msg = woCount > 0
                    ? 'This RO has ' + woCount + ' work order' + (woCount === 1 ? '' : 's') + ' but no total dollar value. Enter the total before cashing out.'
                    : 'There are no dollar values or work orders tied to this RO. Did you mean to use Closed - No Charge?';

                wrap.innerHTML =
                    '<div style="background:#1a1d24;border:1px solid #3a3f4b;border-radius:14px;max-width:520px;width:100%;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,0.55);">'
                  +   '<div style="font-size:1.05rem;font-weight:800;color:#f59e0b;margin-bottom:10px;">⚠️ No dollar value on this RO</div>'
                  +   '<div style="color:#cbd5e1;font-size:0.93rem;line-height:1.5;margin-bottom:6px;">' + escapeHtml(msg) + '</div>'
                  +   '<div style="color:#94a3b8;font-size:0.82rem;line-height:1.45;margin-bottom:18px;">'
                  +     escapeHtml(ro.customerName || '(no name)') + ' &middot; ' + escapeHtml(ro.roId || '') + '</div>'
                  +   '<div style="display:flex;flex-direction:column;gap:8px;">'
                  +     '<button data-choice="enter" style="padding:11px 14px;border-radius:9px;border:none;background:#0a84ff;color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;">💵 Enter dollar value</button>'
                  +     '<button data-choice="no-charge" style="padding:11px 14px;border-radius:9px;border:1px solid #94a3b8;background:transparent;color:#cbd5e1;font-weight:700;font-size:0.9rem;cursor:pointer;">📋 Switch to Closed - No Charge</button>'
                  +     '<button data-choice="anyway" style="padding:11px 14px;border-radius:9px;border:1px solid #f59e0b55;background:transparent;color:#f59e0b;font-weight:600;font-size:0.86rem;cursor:pointer;">Cash out anyway</button>'
                  +     '<button data-choice="cancel" style="padding:9px 14px;border-radius:9px;border:none;background:transparent;color:#64748b;font-weight:600;font-size:0.84rem;cursor:pointer;">Cancel</button>'
                  +   '</div>'
                  + '</div>';

                const done = (choice) => { wrap.remove(); resolve(choice); };
                wrap.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-choice]');
                    if (btn) { done(btn.getAttribute('data-choice')); return; }
                    if (e.target === wrap) done('cancel');   // click the backdrop = cancel
                });
                document.body.appendChild(wrap);
            });
        }

        export async function updateROStatus(index, newStatus) {
            if (!getSB()) {
                showToast('Please connect to the PRVS database first.', 'warning');
                return;
            }

            log('Updating status for index:', index, 'to:', newStatus);

            // Show loading indicator
            const dropdown = event.target;
            const originalBg = dropdown.style.background;
            dropdown.style.opacity = '0.6';
            dropdown.disabled = true;

            try {
                const ro = currentFilteredData[index];
                if (!ro) {
                    console.error('Could not find RO at index:', index);
                    showToast('Error: Could not find the repair order.', 'error');
                    dropdown.style.opacity = '1';
                    dropdown.disabled = false;
                    return;
                }

                const userName = currentUser ? currentUser.name : 'Unknown User';

                // [S183] CASH-OUT DOLLAR GATE — fires only on the TRANSITION into
                // 'Delivered/Cashed Out', never on a re-save of a row already there.
                // This is the single status writer for existing ROs, so one hook
                // covers both card dropdowns (see index.html delegation ~L4053).
                let _bypassedNoDollar = false;
                if (newStatus === 'Delivered/Cashed Out' && ro.status !== 'Delivered/Cashed Out') {
                    const dollars = parseFloat(ro.dollarValue) || 0;
                    if (dollars <= 0) {
                        const woCount = (ro._woSummary && ro._woSummary.total_wos) || 0;
                        const choice = await _confirmCashOutNoDollars(ro, woCount);

                        if (choice === 'cancel') {
                            dropdown.value = ro.status;      // put the dropdown back
                            dropdown.style.opacity = '1';
                            dropdown.disabled = false;
                            return;
                        }
                        if (choice === 'enter') {
                            dropdown.value = ro.status;
                            dropdown.style.opacity = '1';
                            dropdown.disabled = false;
                            openEditRO(index);               // land them on the $ field
                            return;
                        }
                        if (choice === 'no-charge') {
                            newStatus = 'Closed - No Charge';
                            dropdown.value = newStatus;
                        }
                        if (choice === 'anyway') {
                            _bypassedNoDollar = true;        // audit-logged after the write
                        }
                    }
                }

                log('Updating status for:', ro.customerName, 'from', ro.status, 'to', newStatus, 'by', userName);

                // Get automatic progress for this status
                const autoProgress = STATUS_PROGRESS_MAP[newStatus] || 0;
                log('Auto-setting progress to:', autoProgress + '%');

                // Update in currentData
                const originalIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : currentData.findIndex(item =>
                        item.customerName === ro.customerName &&
                        item.dateReceived === ro.dateReceived
                    );

                // Auto-set dateArrived if transitioning off "Not On Lot" and no date set yet
                const today = new Date().toISOString().split('T')[0];
                let autoDateArrived = null;
                if (originalIndex !== -1) {
                    const wasNotOnLot = currentData[originalIndex].status === 'Not On Lot';
                    const hasArrivalDate = !!currentData[originalIndex].dateArrived;
                    if (wasNotOnLot && newStatus !== 'Not On Lot' && !hasArrivalDate) {
                        autoDateArrived = today;
                        currentData[originalIndex].dateArrived = today;
                        log('Auto-setting dateArrived to today:', today);
                    }
                    currentData[originalIndex].status = newStatus;
                    currentData[originalIndex].percentComplete = autoProgress;
                    log('Updated currentData at index:', originalIndex, 'by', userName);
                }

                // Update Supabase — status, progress, and dateArrived if set
                const supabaseId = currentData[originalIndex]?._supabaseId;
                if (supabaseId) {
                    const updatePayload = {
                        status: newStatus,
                        pct_complete: autoProgress,
                        updated_at: new Date().toISOString(),
                    };
                    if (autoDateArrived) updatePayload.date_arrived = autoDateArrived;
                    const { error: statusErr } = await getSB().from('repair_orders').update(updatePayload).eq('id', supabaseId);
                    if (statusErr) throw statusErr;

                    // Audit log
                    const auditChanges = [{ field: 'status', oldValue: ro.status, newValue: newStatus }];
                    if (autoProgress !== ro.percentComplete) auditChanges.push({ field: 'percentComplete', oldValue: ro.percentComplete, newValue: autoProgress });
                    if (autoDateArrived) auditChanges.push({ field: 'dateArrived', oldValue: '', newValue: autoDateArrived });
                    // [S183] Soft-launch telemetry — one row per "Cash out anyway".
                    // This is the ONLY record that the gate was overridden; without
                    // it the soft period is unmeasurable and we can never justify
                    // flipping it to a hard stop. Do not remove when hardening.
                    if (_bypassedNoDollar) {
                        auditChanges.push({
                            field: 'cashout_no_dollar_bypass',
                            oldValue: '',
                            newValue: 'cashed out with no dollar value by ' + userName,
                        });
                    }
                    await writeAuditLog(ro.roId, auditChanges);

                    // [S175] Entering any Approved status (from a non-Approved one)
                    // notifies silo managers + techs with time on the RO that they're
                    // clear to move forward. Fire-and-forget; never blocks the flip.
                    if (newStatus.startsWith('Approved ')
                            && !String(ro.status || '').startsWith('Approved ')) {
                        _notifyApprovalStatus(supabaseId, ro, newStatus);
                    }
                }
                log('✓ Status and progress updated in Supabase');

                // [SLACK TEARDOWN v1.445 S92] ro_ready_pickup notifySlack call site deleted

                // Show success feedback
                dropdown.style.opacity = '1';
                dropdown.disabled = false;

                // Brief flash to show success
                dropdown.style.boxShadow = '0 0 0 3px rgba(52, 199, 89, 0.5)';
                setTimeout(() => {
                    dropdown.style.boxShadow = '';
                }, 500);

                // Refresh the board
                renderBoard();

            } catch (error) {
                console.error('Error updating status:', error);
                showToast('Error updating status: ' + error.message, 'error');
                dropdown.style.opacity = '1';
                dropdown.disabled = false;
                // Reload from sheets to revert
                await loadDataFromSupabase();
            }
        }

        export async function updateROUrgency(index, newUrgency) {
            if (!getSB()) {
                showToast('Please connect to the PRVS database first.', 'warning');
                return;
            }

            log('Updating urgency for index:', index, 'to:', newUrgency);

            // Show loading indicator
            const dropdown = event.target;
            dropdown.style.opacity = '0.6';
            dropdown.disabled = true;

            try {
                const ro = currentFilteredData[index];
                
                if (!ro) {
                    console.error('Could not find RO at index:', index);
                    showToast('Error: Could not find the repair order.', 'error');
                    dropdown.style.opacity = '1';
                    dropdown.disabled = false;
                    return;
                }

                const userName = currentUser ? currentUser.name : 'Unknown User';
                log('Updating urgency for:', ro.customerName, 'from', ro.urgency, 'to', newUrgency, 'by', userName);

                // Update in currentData
                const originalIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : currentData.findIndex(item =>
                        item.customerName === ro.customerName &&
                        item.dateReceived === ro.dateReceived
                    );

                if (originalIndex !== -1) {
                    currentData[originalIndex].urgency = newUrgency;
                    log('Updated currentData at index:', originalIndex, 'by', userName);
                }

                // Update Supabase
                await updateFieldInSupabase(originalIndex, 'urgency', newUrgency);
                await writeAuditLog(ro.roId, [{ field: 'urgency', oldValue: ro.urgency, newValue: newUrgency }]);
                log('✓ Urgency updated in Supabase');

                // [SLACK TEARDOWN v1.445 S92] ro_urgency_critical notifySlack call site deleted

                // Show success feedback
                dropdown.style.opacity = '1';
                dropdown.disabled = false;

                // Brief flash to show success
                dropdown.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.5)';
                setTimeout(() => {
                    dropdown.style.boxShadow = '';
                }, 500);

                // Refresh the board (this will re-sort by new priority)
                renderBoard();

            } catch (error) {
                console.error('Error updating urgency:', error);
                showToast('Error updating urgency: ' + error.message, 'error');
                dropdown.style.opacity = '1';
                dropdown.disabled = false;
                // Reload from sheets to revert
                await loadDataFromSupabase();
            }
        }

        export async function updateROProgress(index, newProgress) {
            if (!getSB()) {
                showToast('Please connect to the PRVS database first.', 'warning');
                return;
            }

            // Validate progress
            if (newProgress < 0) newProgress = 0;
            if (newProgress > 100) newProgress = 100;

            log('Manually updating progress for index:', index, 'to:', newProgress + '%');

            try {
                const ro = currentFilteredData[index];
                if (!ro) {
                    console.error('Could not find RO at index:', index);
                    showToast('Error: Could not find the repair order.', 'error');
                    return;
                }

                const userName = currentUser ? currentUser.name : 'Unknown User';
                log('Updating progress for:', ro.customerName, 'to', newProgress + '%', 'by', userName);

                // Update in currentData
                const originalIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : currentData.findIndex(item =>
                        item.customerName === ro.customerName &&
                        item.dateReceived === ro.dateReceived
                    );

                if (originalIndex !== -1) {
                    currentData[originalIndex].percentComplete = newProgress;
                    log('Updated currentData at index:', originalIndex, 'by', userName);
                }

                // Update Supabase
                await updateFieldInSupabase(originalIndex, 'percentComplete', newProgress);
                await writeAuditLog(ro.roId, [{ field: 'percentComplete', oldValue: ro.percentComplete, newValue: newProgress }]);
                log('✓ Progress updated in Supabase');
                renderBoard();

            } catch (error) {
                console.error('Error updating progress:', error);
                showToast('Error updating progress: ' + error.message, 'error');
                await loadDataFromSupabase();
            }
        }

        // [S159 Roland] RO STATUS click → READ + ADD modal: full scrollable history
        // (newest first) plus an add box. Replaces the add-only prompt for roStatusNotes;
        // the card box stays as a preview, this is the full reader. Reuses the
        // #voiceNotesInput/#voiceNotesStatus ids so 🎤 startVoiceDictationForModal works.
        // No backdrop-click close (S30 modal outside-click lock convention).
        function showStatusHistoryModal(existingText) {
            return new Promise((resolve) => {
                const entries = (existingText || '')
                    .split(/\n---\n|\n(?=\[\d{2}\/\d{2}\/\d{2})/)
                    .map(s => s.trim()).filter(Boolean).reverse();
                const historyHtml = entries.length
                    ? entries.map(e =>
                        `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:0.9rem;line-height:1.45;color:#1e293b;white-space:pre-wrap;word-break:break-word;">${escapeHtml(e)}</div>`
                      ).join('')
                    : `<div style="color:#94a3b8;font-style:italic;padding:8px 0;">${t('No status notes yet.')}</div>`;
                const wrap = document.createElement('div');
                wrap.id = 'roStatusHistoryModal';
                wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
                wrap.innerHTML = `
                    <div style="background:white;border-radius:16px;padding:26px 30px;max-width:640px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                        <h3 style="margin:0 0 14px 0;color:#1e293b;font-size:1.25rem;">🔧 ${t('RO Status Updates')} <span style="font-size:0.8rem;font-weight:400;color:#94a3b8;">(${entries.length})</span></h3>
                        <div style="flex:1;overflow-y:auto;min-height:60px;max-height:45vh;margin-bottom:14px;">${historyHtml}</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <div style="font-size:0.85rem;font-weight:700;color:#334155;">${t('Add update')}</div>
                            <button type="button" onclick="startVoiceDictationForModal()" style="padding:6px 14px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">🎤 ${t('Dictate')}</button>
                        </div>
                        <textarea id="voiceNotesInput" placeholder="Type or use voice..." style="width:100%;min-height:90px;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-size:1rem;font-family:inherit;resize:vertical;margin-bottom:6px;box-sizing:border-box;"></textarea>
                        <div id="voiceNotesStatus" style="margin-bottom:10px;font-size:0.9rem;color:#64748b;min-height:18px;"></div>
                        <div style="display:flex;gap:12px;justify-content:flex-end;">
                            <button type="button" data-act="close" style="padding:11px 22px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;">${t('Close')}</button>
                            <button type="button" data-act="save" style="padding:11px 22px;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;">💾 ${t('Add Note')}</button>
                        </div>
                    </div>`;
                document.body.appendChild(wrap);
                const done = (val) => { wrap.remove(); resolve(val); };
                wrap.querySelector('[data-act="close"]').addEventListener('click', () => done(null));
                wrap.querySelector('[data-act="save"]').addEventListener('click', () => done(document.getElementById('voiceNotesInput').value));
            });
        }

        export async function editField(index, fieldName) {
            if (!getSB()) {
                showToast('Please connect to the PRVS database first.', 'warning');
                return;
            }

            // Map field names to column letters and friendly names
            const fieldMapping = {
                'repairDescription': { column: 'H', name: 'Repair Description', row: 8 },
                'roStatusNotes': { column: 'Q', name: 'RO Status Notes', row: 17 },
                'customerCommunicationNotes': { column: 'R', name: 'Customer Communication Notes', row: 18 }
            };

            const field = fieldMapping[fieldName];
            if (!field) return;

            // Read current value directly from data — never embed raw text in onclick attributes
            // (apostrophes, quotes, newlines, backticks all break inline JS string literals)
            const ro = currentFilteredData[index];
            if (!ro) { showToast('Error: Could not find the repair order.', 'error'); return; }
            const decodedValue = ro[fieldName] || '';

            try {

                // Find original index in currentData
                const originalIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : currentData.findIndex(item =>
                        item.customerName === ro.customerName &&
                        item.dateReceived === ro.dateReceived
                    );
                if (originalIndex === -1) { showToast('Error: Could not find the repair order in data.', 'error'); return; }

                // ── REPAIR DESCRIPTION — full edit (pre-filled, full replace, audited) ──
                if (fieldName === 'repairDescription') {
                    const edited = await showVoiceNotesModal(`Edit ${field.name}:`, decodedValue);
                    if (edited === null) return; // cancelled
                    const newValue = edited.trim();

                    // [v1.496 S176] Re-resolve the index AFTER the modal await — the user
                    // may have sat in the modal across a board reload; a stale index
                    // writes to the WRONG RO (Kain/Ivins incident, 2026-08-21).
                    const liveIndex = ro._supabaseId
                        ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                        : originalIndex;
                    if (liveIndex === -1) { showToast('This repair order is no longer on the board — refresh and try again. Nothing was saved.', 'error'); return; }

                    // Capture old value BEFORE mutation (ro still points to unmodified object)
                    const oldValue = ro.repairDescription || '';

                    // Update local data
                    currentData[liveIndex].repairDescription = newValue;

                    // Write to Supabase (full replace of description column)
                    await updateFieldInSupabase(liveIndex, 'repairDescription', newValue);

                    // Audit log — before & after
                    await writeAuditLog(ro.roId, [{ field: 'Repair Description', oldValue, newValue }]);

                    log('✓ Repair Description updated in Supabase');
                    renderBoard();
                    return;
                }

                // ── STATUS NOTES & COMM NOTES — append-only with timestamp ──
                // [S159] roStatusNotes opens the READ + ADD history modal instead of
                // the add-only prompt; comm notes keep the original flow.
                const newUpdate = (fieldName === 'roStatusNotes')
                    ? await showStatusHistoryModal(decodedValue)
                    : await showVoiceNotesModal(`Add update to ${field.name}:`);
                if (newUpdate === null || newUpdate.trim() === '') return;

                const timestamp = new Date().toLocaleString('en-US', {
                    month: '2-digit', day: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
                const userName = currentUser ? currentUser.name : 'Unknown User';

                let updatedValue;
                if (!decodedValue || decodedValue === '') {
                    updatedValue = '[' + timestamp + ' - ' + userName + '] ' + newUpdate.trim();
                } else {
                    updatedValue = decodedValue + '\n---\n[' + timestamp + ' - ' + userName + '] ' + newUpdate.trim();
                }

                // [v1.496 S176] Re-resolve the index AFTER the modal await (see repairDescription note above).
                const liveIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : originalIndex;
                if (liveIndex === -1) { showToast('This repair order is no longer on the board — refresh and try again. Nothing was saved.', 'error'); return; }

                currentData[liveIndex][fieldName] = updatedValue;
                log('Updated', fieldName, 'for:', ro.customerName);

                const noteText = '[' + new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' - ' + (currentUser?.name || 'Unknown') + '] ' + newUpdate.trim();
                await updateFieldInSupabase(liveIndex, fieldName, noteText);

                log('✓ Field updated in Supabase');
                renderBoard();

            } catch (error) {
                console.error('Error updating field:', error);
                showToast('Error updating field: ' + error.message, 'error');
                await loadDataFromSupabase();
            }
        }

        export function openEditRO(index) {
            try {
                const ro = currentFilteredData[index];
                if (!ro) { showToast('Error: Could not find the repair order.', 'error'); return; }

                editingROIndex = ro._supabaseId
                    ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                    : currentData.findIndex(item =>
                        item.customerName === ro.customerName &&
                        item.dateReceived === ro.dateReceived
                    );
                // [v1.496 S176] UUID captured at open = the save-time source of truth.
                // Array indexes can go stale under an open modal; the uuid cannot.
                editingROSupabaseId = ro._supabaseId || null;

                // [ER BUGFIX v1.497 S178, ER 225a2535] A prior RO's scan chips must not
                // survive into this modal — clear any stale suggestion chips at open.
                // (The scan CACHE itself is now roKey-gated at every consumer.)
                clearAllSuggestions('edit');

                document.getElementById('editRoId').textContent = ro.roId || '';
                document.getElementById('editCustomerName').value = ro.customerName || '';
                document.getElementById('editCustomerPhone').value = ro.customerPhone || '';
                document.getElementById('editCustomerEmail').value = ro.customerEmail || '';
                document.getElementById('editCustomerAddress').value = ro.customerAddress || '';
                document.getElementById('editRv').value = ro.rv || '';
                document.getElementById('editTechnicianAssigned').value = ro.technicianAssigned || '';
                document.getElementById('editDollarValue').value = (ro.dollarValue != null && ro.dollarValue !== '' && !isNaN(parseFloat(ro.dollarValue))) ? parseFloat(ro.dollarValue).toFixed(2) : ''; // [ER BUGFIX v1.447 S94] n33: show 2 decimals
                document.getElementById('editPromisedDate').value = ro.promisedDate || '';
                // [Key Dates P1 S117] populate the two added key-date fields
                const _epd = document.getElementById('editPlannedDropoffDate');
                if (_epd) _epd.value = ro.plannedDropoffDate || '';
                const _epu = document.getElementById('editPickupDate');
                if (_epu) _epu.value = ro.pickupDate || '';
                // [ER BUGFIX v1.458 S118] keys/power (ERs 34fc03c2 + b87eb2fb)
                const _eks = document.getElementById('editKeyStatus');
                if (_eks) _eks.value = ro.keyStatus || '';
                const _ekc = document.getElementById('editKeypadCode');
                if (_ekc) _ekc.value = ro.keypadCode || '';
                const _ekp = document.getElementById('editKeepPluggedIn');
                if (_ekp) _ekp.checked = !!ro.keepPluggedIn;
                const _euu = document.getElementById('editUrgentUpdate'); // [ER a7d1474e v1.466 S127]
                if (_euu) _euu.value = ro.urgentUpdate || '';
                document.getElementById('editDateArrived').value = ro.dateArrived || '';
                document.getElementById('editParkingSpot').value = ro.parkingSpot || '';
                document.getElementById('editVin').value = ro.vin || '';
                document.getElementById('editMileage').value = ro.mileage || ''; // [ER ac8265c8 v1.498 S178]
                document.getElementById('editRepairDescription').value = ro.repairDescription || '';

                // Restore RO type and insurance fields from Column W JSON
                let savedInsData = null;
                try { savedInsData = ro.insuranceData ? JSON.parse(ro.insuranceData) : null; } catch(e) {}
                if (ro.roType === 'shop') {
                    setROType('shop', 'edit');
                } else if (ro.roType === 'warranty' || ro.roType === 'warranty_repair') {
                    // [ER a5ff3e2d v1.465 S127] warranty_repair reuses the Warranty Details fields
                    setROType(ro.roType, 'edit');
                    // Restore warranty fields from notes prefix
                    const notes = ro.roStatusNotes || '';
                    const warMatch = notes.match(/\[WARRANTY: Original RO: ([^\|]*)\| Reason: ([^\]]*)\]/);
                    if (warMatch) {
                        const origEl = document.getElementById('editWarrantyOriginalRO');
                        const reasonEl = document.getElementById('editWarrantyReason');
                        if (origEl) origEl.value = warMatch[1].trim();
                        if (reasonEl) reasonEl.value = warMatch[2].trim();
                    }
                } else if (savedInsData && savedInsData.roType) {
                    setROType(savedInsData.roType, 'edit');
                    // Populate insurance fields
                    const insFields = ['claimNumber','policyNumber','insuranceCompany','coverageType',
                        'dateOfLoss','claimStatus','deductibleAmount','approvedAmount','adjusterName',
                        'adjusterPhone','adjusterEmail','carrier','referenceNumber','estimateDate',
                        'inspectedDate','estimatedBy','inspectedAt','color','style','plateState',
                        'bodyLabor','paintLabor','partsTotal','miscTotal','salesTax','subtotal',
                        'deductible','repairFacility','repairFacilityAddress','repairFacilityPhone'];
                    insFields.forEach(f => {
                        const el = document.getElementById('editIns_' + f);
                        if (el && savedInsData[f]) el.value = savedInsData[f];
                    });
                    // Populate customer pay fields for hybrid
                    if (savedInsData.roType === 'hybrid') {
                        const cpFields = ['customerPayAmount','customerBalanceDue','customerPayStatus',
                            'paymentMethod','customerInvoiceNumber','datePaid','customerPayDescription'];
                        cpFields.forEach(f => {
                            const el = document.getElementById('editCp_' + f);
                            if (el && savedInsData[f]) el.value = savedInsData[f];
                        });
                    }
                    // Restore custom field values
                    const customVals = {};
                    customInsuranceFields.forEach(f => { if (savedInsData[f.key]) customVals[f.key] = savedInsData[f.key]; });
                    renderCustomFields('edit', customVals);
                } else {
                    setROType('standard', 'edit');
                    renderCustomFields('edit');
                }

                const repairTypes = (ro.repairType || '').split(',').map(t => t.trim());
                document.querySelectorAll('#editROForm input[name="editRepairType"]').forEach(cb => {
                    cb.checked = repairTypes.includes(cb.value);
                });

                // GH#24: Training RO toggle — admin/sr_manager only
                const etw = document.getElementById('editTrainingWrap');
                if (etw) etw.style.display = isSrOrAdmin() ? '' : 'none';
                const etc = document.getElementById('editIsTraining');
                if (etc) etc.checked = !!ro.isTraining;

                // GH#30: Delete RO block — admin only.
                // [S159] Sidebar layout: hidden here — Delete RO lives in the card's
                // ⚙️ ADMIN dropdown instead (layout.js builds it, same softDeleteCurrentRO).
                // Classic keeps the in-modal block so no capability is lost there.
                const edw = document.getElementById('editDeleteWrap');
                const _sbLayout = document.documentElement.classList.contains('layout-sidebar');
                if (edw) edw.style.display = (isAdmin() && !_sbLayout) ? '' : 'none';

                document.getElementById('editROOverlay').classList.add('active');
            } catch (error) {
                console.error('Error in openEditRO:', error);
                showToast('Error opening edit form: ' + error.message, 'error');
            }
        }

        export function closeEditModal() {
            document.getElementById('editROOverlay').classList.remove('active');
            editingROIndex = null;
            editingROSupabaseId = null; // [v1.496 S176]
            setROType('standard', 'edit');
            // Keep _lastEstimateScan — so adding new fields and reopening still
            // auto-populates from the scan. Cleared only on save or new scan.
            // [ER BUGFIX v1.497 S178, ER 225a2535] Keeping it is now SAFE: the cache
            // carries roKey and every consumer checks it, so it can only ever apply
            // to the same RO it was scanned for.
        }

        export async function writeAuditLog(roId, changes) {
            if (!changes || changes.length === 0) return;
            try {
                const now = new Date().toISOString();
                const userEmail = currentUser ? currentUser.email : 'Unknown';
                const userName = currentUser ? currentUser.name : 'Unknown';

                // Find RO uuid
                const ro = currentData.find(d => d.roId === roId);
                const supabaseId = ro?._supabaseId;

                const rows = changes.map(({ field, oldValue, newValue }) => ({
                    ro_id:         supabaseId || null,
                    user_id:       supabaseSession?.user?.id || null,
                    user_email:    userEmail,
                    user_name:     userName,
                    field_changed: field,
                    old_value:     oldValue !== undefined && oldValue !== null ? String(oldValue) : '',
                    new_value:     newValue !== undefined && newValue !== null ? String(newValue) : '',
                    changed_at:    now,
                }));

                await getSB().from('audit_log').insert(rows);
                log(`✅ Audit log written to Supabase: ${changes.length} change(s) for ${roId}`);
            } catch (err) {
                warn('Audit log write failed (non-fatal):', err);
            }
        }


// ════════════════════════════════════════════════════════════════════
// GH#36 Phase 1 — AUTO-REFRESH (v1.492, Session 170, 2026-08-07)
// ════════════════════════════════════════════════════════════════════
// Bobby's report: techs upload photos/docs/updates and other staff's open
// tabs never see them without a manual reload — the board loaded once at
// boot and only re-loaded after the CURRENT user's own writes. Two fixes:
//   (1) FOCUS/VISIBILITY refresh — switching back to the dashboard tab
//       re-loads if the data is >30s old (Bobby's exact workflow).
//   (2) PERIODIC refresh — a 30s tick re-loads when data is >2.5 min old
//       and the tab is visible.
// GUARD (_uiBusy): NEVER auto-reload while any modal/overlay/slide-in
// panel is open or the user is focused in a form control — several modals
// (Edit RO, editField) reference currentData/currentFilteredData by INDEX,
// and a reload that reorders currentData under an open modal could write
// to the WRONG RO. Skipped refreshes are not queued; the next eligible
// trigger picks it up.
// rAF deliberately NOT used (S147 gotcha: paused in background tabs).
// Phase 2 (Supabase Realtime, per the GH#36 spec) supersedes this later.

let _lastBoardLoadAt = 0;     // ms epoch of last successful board load (0 = boot load not done)
let _autoRefreshBusy = false;

const AUTO_REFRESH_TICK_MS   = 30_000;   // tick cadence
const AUTO_REFRESH_STALE_MS  = 150_000;  // interval trigger: reload if older than 2.5 min
const FOCUS_REFRESH_STALE_MS = 30_000;   // focus/visible trigger: reload if older than 30s

/** True when a modal, overlay, slide-in panel, or focused form control means a reload could disrupt (or corrupt) user work. */
function _uiBusy() {
    // Classed modal overlays: New RO, Edit RO, Recently Deleted, parts/messaging dynamic modals
    if (document.querySelector('.modal-overlay.active')) return true;
    // Known modal roots — dynamic ones exist in the DOM only while open;
    // static ones (ER modals) flip display. Present + not display:none = open.
    const MODAL_IDS = ['partsModal', 'photoLibraryModal', 'photoMigrateModal',
        'manageFieldsModal', 'voiceNotesModal', 'customViewModalOverlay',
        'adminSettingsModalOverlay', 'codeExportModalOverlay',
        'erModalOverlay', 'erAdminOverlay'];
    for (const id of MODAL_IDS) {
        const el = document.getElementById(id);
        if (el && el.style.display !== 'none') return true;
    }
    // Slide-in panels (work list / shop tasks): backdrop visible = open
    for (const id of ['workListBackdrop', 'shopTasksBackdrop']) {
        const el = document.getElementById(id);
        if (el && el.style.display !== 'none') return true;
    }
    // Anonymous body-child overlays (WO modals, photo viewer, confirms):
    // appended on open / removed on close; inline position:fixed, z >= 10000.
    // (workListPanel/shopTasksPanel are persistent but HAVE ids — not matched.)
    for (const el of document.body.children) {
        if (el.tagName !== 'DIV' || el.id) continue;
        if (el.style.position === 'fixed' && (parseInt(el.style.zIndex, 10) || 0) >= 10000) return true;
    }
    // Typing in any form control except the board search box (search state
    // survives a re-render; modal inputs are covered above anyway)
    const ae = document.activeElement;
    if (ae && ae.id !== 'customerSearch' &&
        (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return true;
    return false;
}

async function _autoRefreshBoard(trigger) {
    try {
        if (document.hidden) return;
        if (_autoRefreshBusy) return;
        if (_lastBoardLoadAt === 0) return;                       // boot load hasn't run — never preempt it
        if (typeof getSB !== 'function' || !getSB() || !supabaseSession) return; // auth guard (canonical pattern)
        const staleMs = trigger === 'interval' ? AUTO_REFRESH_STALE_MS : FOCUS_REFRESH_STALE_MS;
        if (Date.now() - _lastBoardLoadAt < staleMs) return;
        if (_uiBusy()) return;                                    // skipped, not queued — next trigger retries
        _autoRefreshBusy = true;
        log('🔄 Auto-refresh (' + trigger + ') — reloading board data');
        await loadDataFromSupabase();
    } catch (e) {
        warn('Auto-refresh failed (non-fatal):', e);
    } finally {
        _autoRefreshBusy = false;
    }
}

// Install once at module load (app.js imports this module exactly once).
// All triggers self-guard on auth + boot-load, so early installation is safe.
document.addEventListener('visibilitychange', () => { _checkAppVersion(); if (!document.hidden) _autoRefreshBoard('visible'); });
window.addEventListener('focus', () => _autoRefreshBoard('focus'));
setInterval(() => { _checkAppVersion(); _autoRefreshBoard('interval'); }, AUTO_REFRESH_TICK_MS);

// ── [v1.496 S176] NEW-VERSION DETECTION ──────────────────────────────────
// Polls version.json (bumped with every release) and compares it to the
// version this tab is RUNNING. Visible tab: pinned banner + Refresh button —
// never a forced reload, which could destroy in-progress form work. Hidden
// tab: silent location.reload() when idle (_uiBusy false), so stale
// overnight tabs self-heal (S171 gotcha: auto-refresh reloads data, not code).
// [v1.500 S182] NOT a bump site any more. A module-local APP_VERSION constant
// used to be declared here, pinned at 1.496, hand-edited alongside
// version.json and index.html. It was missed on v1.497, v1.498 AND v1.499,
// so every client compared version.json's 1.499 against a baked-in 1.496:
// the banner could never be satisfied by refreshing (the reload served the
// same stale constant), and the hidden-tab branch below reloaded every idle
// tab in the shop every 5 minutes for two days. The running version now
// comes from the ONE declaration in index.html; there is nothing to forget.
const VERSION_CHECK_EVERY_MS = 5 * 60_000; // poll cadence (rides the 30s tick)
let _lastVersionCheckAt = 0;

async function _checkAppVersion() {
    try {
        if (Date.now() - _lastVersionCheckAt < VERSION_CHECK_EVERY_MS) return;
        _lastVersionCheckAt = Date.now();
        // FAIL SAFE: if we cannot establish what version this tab is running,
        // do nothing at all. An unknown running version must never be allowed
        // to banner or — far worse — force a reload; that is the exact loop
        // this block caused S176-S181. Silence is the safe failure mode.
        const running = window.APP_VERSION;
        if (!running) return;
        // Relative path (GitHub Pages project path — S146 gotcha) + cache-bust
        // query param (S102 gotcha: hard refresh alone may not beat the CDN).
        const resp = await fetch('version.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return;
        const j = await resp.json();
        const latest = j && j.version;
        if (!latest || String(latest) === String(running)) return;
        if (document.hidden && !_uiBusy()) {
            // [v1.500 S182] RELOAD ONCE PER TARGET VERSION, not once per tick.
            // Reloading is only useful if it actually changes the running code.
            // If it does not — CDN skew serving old HTML beside a new
            // version.json, a bad deploy, a cache that will not turn over — the
            // unguarded version of this line reloaded the tab every 5 minutes
            // indefinitely. One attempt per target version is enough to
            // self-heal an honestly stale tab; the banner covers the rest.
            try {
                const k = 'prvs_reloaded_for_' + latest;
                if (sessionStorage.getItem(k)) { _showUpdateBanner(latest); return; }
                sessionStorage.setItem(k, '1');
            } catch (e) { /* private mode / storage blocked — fall through to one reload */ }
            log('🔄 New version ' + latest + ' detected in hidden tab — reloading');
            location.reload();
            return;
        }
        _showUpdateBanner(latest);
    } catch (e) { /* non-fatal — offline lot signal, CDN hiccup; next poll retries */ }
}

function _showUpdateBanner(latest) {
    if (document.getElementById('appUpdateBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'appUpdateBanner'; // has an id → _uiBusy()'s anonymous-overlay check ignores it
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:20000;background:#1d4ed8;color:#fff;padding:10px 16px;text-align:center;font-weight:700;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.35);';
    bar.innerHTML = '🔄 A new version of the dashboard is available (v' + String(latest).replace(/[^0-9.]/g, '') + ').' +
        '<button onclick="location.reload()" style="margin-left:12px;padding:6px 14px;border:none;border-radius:8px;background:#fff;color:#1d4ed8;font-weight:800;cursor:pointer;">Refresh now</button>';
    document.body.appendChild(bar);
}

// ---- Window bridge (Phase 7 additive) ----
Object.assign(window, {
  loadDataFromSupabase,
  loadDataFromSheets,
  appendToSupabase,
  updateROInSupabase,
  updateFieldInSupabase,
  archiveROInSupabase,
  loadCustomFieldConfigFromSupabase,
  updateROStatus,
  updateROUrgency,
  updateROProgress,
  editField,
  editUrgentUpdate, // [ER 50175fce v1.498 S178]
  openEditRO,
  closeEditModal,
  writeAuditLog,
});
