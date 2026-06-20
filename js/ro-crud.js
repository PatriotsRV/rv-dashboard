// js/ro-crud.js — Phase 7 (ADDITIVE): repair-order CRUD + Supabase read/write layer.
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
            try {
                // Load repair orders — GH#30: exclude soft-deleted rows
                const { data: ros, error } = await getSB()
                    .from('repair_orders')
                    .select('*')
                    .is('deleted_at', null)
                    .order('date_received', { ascending: false });

                if (error) throw error;

                // Load notes for all ROs in one query
                const roIds = ros.map(r => r.id);
                const { data: notes } = await getSB()
                    .from('notes')
                    .select('ro_id, type, body, created_at')
                    .in('ro_id', roIds)
                    .order('created_at', { ascending: true });

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

                currentData = data;
                log('✅ Loaded', data.length, 'repair orders from Supabase');
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

            // [Key Dates P2 S119] Create silo calendar events for promised/pickup
            // (auto-on-save only when a Google Calendar token is present; non-fatal).
            try {
                await window.syncKeyDateCalendars?.(data.id, {
                    repairType:    formData.repairType || '',
                    customerName:  formData.customerName,
                    rv:            formData.rv || '',
                    customerPhone: formData.customerPhone || '',
                    roId:          data.ro_id,
                    promisedDate:  formData.promisedDate || '',
                    pickupDate:    formData.pickupDate || '',
                    existingIds:   null,
                });
            } catch (e) { warn('Key-date calendar sync (new RO) failed:', e); }

            // [Key Dates P3 S119] Enqueue promised/pickup email reminders for the new RO.
            const _kdInfo = { customerName: formData.customerName, rv: formData.rv, repairType: formData.repairType };
            if (formData.promisedDate) await _syncOneKeyDateReminder(data.id, data.ro_id, 'promised', { ..._kdInfo, newDate: formData.promisedDate, oldDate: null });
            if (formData.pickupDate)   await _syncOneKeyDateReminder(data.id, data.ro_id, 'pickup',   { ..._kdInfo, newDate: formData.pickupDate,   oldDate: null });

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
                updated_at:     new Date().toISOString(),
            }).eq('id', supabaseId);

            if (error) throw error;

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

            // Write audit log — build array of changed fields
            const auditChanges = Object.entries(formData).map(([field, value]) => ({
                field,
                oldValue: ro[field] || '',
                newValue: value || '',
            }));
            await writeAuditLog(ro.roId, auditChanges);

            // [Key Dates P2 S119] Sync silo calendar events for promised/pickup on edit
            // (auto-on-save only when a Google Calendar token is present; non-fatal).
            try {
                await window.syncKeyDateCalendars?.(supabaseId, {
                    repairType:    formData.repairType || ro.repairType || '',
                    customerName:  formData.customerName || ro.customerName,
                    rv:            formData.rv || ro.rv || '',
                    customerPhone: formData.customerPhone || ro.customerPhone || '',
                    roId:          ro.roId,
                    promisedDate:  formData.promisedDate || '',
                    pickupDate:    formData.pickupDate || '',
                    existingIds:   ro.calEventIds || null,
                });
            } catch (e) { warn('Key-date calendar sync (edit RO) failed:', e); }

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
            const ro = currentData[originalIndex];
            const supabaseId = ro._supabaseId;
            if (!supabaseId) throw new Error('No Supabase ID for RO');

            const daysOnLot = calculateDaysOnLot(ro) || 0;

            // Insert into cashiered
            const { error: cashErr } = await getSB().from('cashiered').insert({
                original_ro_id: supabaseId,
                ro_id:          ro.roId,
                customer_name:  ro.customerName,
                phone:          ro.customerPhone,
                email:          ro.customerEmail,
                address:        ro.customerAddress,
                rv:             ro.rv,
                vin:            ro.vin,
                repair_type:    ro.repairType,
                description:    ro.repairDescription,
                technician:     ro.technicianAssigned,
                date_received:  ro.dateReceived || null,
                date_arrived:   ro.dateArrived || null,
                promised_date:  ro.promisedDate || null,
                pct_complete:   ro.percentComplete || 0,
                dollar_value:   ro.dollarValue || null,
                status:         ro.status,
                urgency:        ro.urgency,
                customer_type:  ro.customerType,
                ro_type:        ro.roType || 'standard',
                photo_url:      ro.rvPhotoUrl,
                insurance_data: ro.insuranceData ? JSON.parse(ro.insuranceData) : null,
                days_on_lot:    daysOnLot,
                date_closed:    new Date().toISOString().slice(0,10),
                week_label:     getWeekLabel(),
                archived_at:    new Date().toISOString(),
            });
            if (cashErr) throw cashErr;

            // Delete from repair_orders
            const { error: delErr } = await getSB().from('repair_orders').delete().eq('id', supabaseId);
            if (delErr) throw delErr;

            log('✅ RO archived to cashiered in Supabase');
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
                    await writeAuditLog(ro.roId, auditChanges);
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

                    // Capture old value BEFORE mutation (ro still points to unmodified object)
                    const oldValue = ro.repairDescription || '';

                    // Update local data
                    currentData[originalIndex].repairDescription = newValue;

                    // Write to Supabase (full replace of description column)
                    await updateFieldInSupabase(originalIndex, 'repairDescription', newValue);

                    // Audit log — before & after
                    await writeAuditLog(ro.roId, [{ field: 'Repair Description', oldValue, newValue }]);

                    log('✓ Repair Description updated in Supabase');
                    renderBoard();
                    return;
                }

                // ── STATUS NOTES & COMM NOTES — append-only with timestamp ──
                const newUpdate = await showVoiceNotesModal(`Add update to ${field.name}:`);
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

                currentData[originalIndex][fieldName] = updatedValue;
                log('Updated', fieldName, 'for:', ro.customerName);

                const noteText = '[' + new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' - ' + (currentUser?.name || 'Unknown') + '] ' + newUpdate.trim();
                await updateFieldInSupabase(originalIndex, fieldName, noteText);

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
                document.getElementById('editDateArrived').value = ro.dateArrived || '';
                document.getElementById('editParkingSpot').value = ro.parkingSpot || '';
                document.getElementById('editVin').value = ro.vin || '';
                document.getElementById('editRepairDescription').value = ro.repairDescription || '';

                // Restore RO type and insurance fields from Column W JSON
                let savedInsData = null;
                try { savedInsData = ro.insuranceData ? JSON.parse(ro.insuranceData) : null; } catch(e) {}
                if (ro.roType === 'shop') {
                    setROType('shop', 'edit');
                } else if (ro.roType === 'warranty') {
                    setROType('warranty', 'edit');
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

                // GH#30: Delete RO block — admin only
                const edw = document.getElementById('editDeleteWrap');
                if (edw) edw.style.display = isAdmin() ? '' : 'none';

                document.getElementById('editROOverlay').classList.add('active');
            } catch (error) {
                console.error('Error in openEditRO:', error);
                showToast('Error opening edit form: ' + error.message, 'error');
            }
        }

        export function closeEditModal() {
            document.getElementById('editROOverlay').classList.remove('active');
            editingROIndex = null;
            setROType('standard', 'edit');
            // Keep _lastEstimateScan — so adding new fields and reopening still
            // auto-populates from the scan. Cleared only on save or new scan.
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
  openEditRO,
  closeEditModal,
  writeAuditLog,
});
