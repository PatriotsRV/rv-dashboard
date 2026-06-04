// js/insurance.js - Phase 15 (ADDITIVE): Claude Vision insurance estimate scanner.
// v1.440 (Session 90, 2026-06-04).
//
// Extracted VERBATIM from the index.html inline <script> (8 functions):
//   renderCustomFields, openEstimateScanner, handleEstimateFile, callClaudeVision,
//   renderSuggestions, applyChip, applyChipConflict, writeInsuranceData.
//   (applyChipConflict is not in the stale MODULARIZATION_ROADMAP Phase 15 list -
//   it was added after the roadmap was written and is the conflict-chip sibling of
//   applyChip, called from renderConflictChip's generated onclick HTML.)
//
// ADDITIVE PHASE - the inline copies of the 8 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openEstimateScanner etc. to
// these copies, but the bodies are byte-identical to the inline versions (only an
// `export` keyword was inserted after the indent; no reference rewriting), so
// behavior is unchanged. Every bare reference inside these functions resolves
// through the SHARED global environment to the SAME symbol the inline copy uses:
//   - inline state: currentData, customInsuranceFields, currentROType,
//     editingROIndex (top-level let), supabaseSession (var);
//   - inline constants: ESTIMATE_FIELD_MAP, INSURANCE_FIELD_MAP, SUPABASE_URL,
//     SUPABASE_ANON_KEY;
//   - inline helpers: uploadEstimateToDrive, fileToBase64, checkScanMilestone,
//     clearAllSuggestions, renderSimpleChip, renderConflictChip,
//     normalizeExtractedValue, addExtraFieldToRO, getSB, showToast, log, warn,
//     generateROId, addDocToLibrary;
//   - scanner scratch state is ALWAYS accessed via explicit window. prefix
//     (window._lastEstimateScan / window._pendingEstimateDoc) - strict-mode safe.
// Session 89 pre-scan for undeclared implicit globals: PASSED (zero bare
// assignments to undeclared identifiers in all 8 bodies).
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 15
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.


        export function renderCustomFields(mode, savedValues) {
            const grid = document.getElementById('customFieldsGrid_' + mode);
            if (!grid) return;
            if (customInsuranceFields.length === 0) {
                grid.innerHTML = '<div class="form-field full-width" style="color:var(--text-muted);font-size:0.85rem;padding:4px 0;">No custom fields yet. Click + Add Field to create one.</div>';
                return;
            }

            // Auto-populate from last scan if available and mode matches
            const scanVals = (window._lastEstimateScan && window._lastEstimateScan.mode === mode)
                ? window._lastEstimateScan.extracted : null;

            grid.innerHTML = customInsuranceFields.map(field => {
                const id = mode + '_custom_' + field.key;
                // Priority: explicit savedValues > scan extracted > empty
                const savedVal = savedValues
                    ? (savedValues[field.key] || '')
                    : (scanVals ? (scanVals[field.key] || '') : '');
                let input = '';
                if (field.type === 'toggle') {
                    input = `<select class="form-select" id="${id}">
                        <option value="">Select</option>
                        <option value="Yes" ${savedVal === 'Yes' ? 'selected' : ''}>Yes</option>
                        <option value="No" ${savedVal === 'No' ? 'selected' : ''}>No</option>
                    </select>`;
                } else if (field.type === 'select' && field.options) {
                    const opts = field.options.map(o =>
                        `<option value="${o}" ${savedVal === o ? 'selected' : ''}>${o}</option>`
                    ).join('');
                    input = `<select class="form-select" id="${id}"><option value="">Select</option>${opts}</select>`;
                } else {
                    input = `<input type="${field.type}" class="form-input" id="${id}" value="${savedVal}">`;
                }
                return `<div class="form-field custom-field-item">
                    <label class="form-label">${field.label}</label>
                    ${input}
                </div>`;
            }).join('');
        }

        export function openEstimateScanner(mode) {
            document.getElementById(mode === 'new' ? 'newEstimateFile' : 'editEstimateFile').click();
        }

        export async function handleEstimateFile(input, mode) {
            const file = input.files[0];
            if (!file) return;

            const MAX_ESTIMATE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB — Edge Function proxy limit
            if (file.size > MAX_ESTIMATE_SIZE) {
                console.error('Estimate file too large:', (file.size / 1024 / 1024).toFixed(1), 'MB (max 4.5 MB)');
                showToast('File too large for estimate scanner (max 4.5 MB). Compress the PDF or use a smaller scan.', 'warning');
                return;
            }

            const btn = document.getElementById(mode === 'new' ? 'newScanBtn' : 'editScanBtn');

            btn.disabled = true;
            btn.textContent = '⏳ Uploading to Drive...';

            try {
                // Step 1: Upload file to Google Drive (same folder as RV photos)
                let driveUrl = null;
                try {
                    driveUrl = await uploadEstimateToDrive(file);
                    btn.textContent = '🔍 Scanning with Claude...';
                } catch (driveErr) {
                    warn('Drive upload failed (non-fatal):', driveErr);
                    btn.textContent = '🔍 Scanning with Claude...';
                }

                // Step 2: Convert file to base64 for Claude API
                const base64 = await fileToBase64(file);
                const isPDF = file.type === 'application/pdf';
                const mediaType = isPDF ? 'application/pdf' : file.type;

                // Step 3: Call Claude API
                const extracted = await callClaudeVision(base64, mediaType, isPDF);

                // Step 4: Render suggestion chips
                clearAllSuggestions(mode);
                renderSuggestions(mode, extracted);

                // Step 5: Store extracted data for saving when RO is submitted
                window._lastEstimateScan = { mode, extracted, timestamp: new Date().toISOString() };

                // Step 6: If in Edit mode and we have an RO index, write insurance data now
                if (mode === 'edit' && editingROIndex !== null) {
                    const ro = currentData[editingROIndex];
                    const roId = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
                    writeInsuranceData(roId, extracted, editingROIndex);
                }

                btn.textContent = '✅ Scan Complete — Review Suggestions Below';
                btn.disabled = false;

                // Check scan count milestone — remind admin to review prompt at 30
                checkScanMilestone();

                // Add scanned estimate to RO document library if we're in edit mode
                if (driveUrl) {
                    log('✅ Estimate stored in Drive:', driveUrl);
                    if (mode === 'edit' && editingROIndex !== null) {
                        const docName = 'Insurance_Estimate_' + new Date().toISOString().slice(0,10) + '.pdf';
                        await addDocToLibrary(editingROIndex, driveUrl, docName, 'pdf');
                        log('✅ Estimate added to document library');
                    } else if (mode === 'new') {
                        // Store for later — will be added after RO is saved
                        window._pendingEstimateDoc = { url: driveUrl, name: 'Insurance_Estimate_' + new Date().toISOString().slice(0,10) + '.pdf', type: 'pdf' };
                    }
                }

            } catch (err) {
                console.error('Scan error:', err);
                btn.textContent = '❌ Scan Failed — Try Again';
                btn.disabled = false;
                showToast('Scan failed: ' + (err.message || 'Unknown error — check console.'), 'error');
            }

            // Reset file input so same file can be re-selected
            input.value = '';
        }

        export async function callClaudeVision(base64Data, mediaType, isPDF) {
            // Refresh session to ensure a fresh access_token (prevents 401 on expired JWT)
            const { data: { session: freshSession } } = await getSB().auth.getSession();
            if (freshSession) supabaseSession = freshSession;
            if (!supabaseSession) throw new Error('You must be signed in to use the estimate scanner.');
            const systemPrompt = `You are an insurance estimate data extractor for an RV repair shop.
Extract all field/value pairs from the provided insurance estimate document.
Respond ONLY with a valid JSON object. No markdown, no explanation, no backticks.
If a field is not found, omit it entirely. Do not include null or empty string values.

CRITICAL: Always normalize field names to the standard keys below, regardless of how each insurance carrier labels them. Different carriers use different terminology for the same data — always map to the standard key.

── CUSTOMER & VEHICLE ──────────────────────────────────────────
customerName: Owner/insured/claimant full name
  (Progressive: "Owner", State Farm: "Insured", Allstate: "Claimant Name", GEICO: "Vehicle Owner")
customerPhone: Any phone for the vehicle owner
customerEmail: Any email for the vehicle owner
customerAddress: Full mailing address of the owner
rv: Year + Make + Model of the RV/vehicle (e.g. "2024 Venture Sporttrek 353VIK")
vin: 17-character Vehicle Identification Number
  (may appear as "VIN", "Vehicle ID", "Serial Number")
exteriorColor: Color of the vehicle
  (may appear as "Color", "Vehicle Color", "Ext. Color")
drivable: Whether vehicle is drivable (Yes/No)
  (may appear as "Drivable?", "Operable", "Driveable")

── CLAIM INFO ───────────────────────────────────────────────────
claimNumber: The primary claim or file number
  (Progressive: "Claim No.", State Farm: "Claim Number", Allstate: "Claim #", GEICO: "Claim Number", Farmers: "File Number")
estimateId: Estimate or appraisal ID number
  (Progressive: "Estimate No.", State Farm: "Estimate Number", may appear as "Assignment #", "Appraisal ID")
policyNumber: Insured's policy number
  (may appear as "Policy No.", "Policy #", "Certificate Number")
insuranceCompany: Name of the insurance carrier
  (may appear as "Insurance Company", "Carrier", "Insurer", "Written By")
coverageType: Type of coverage (Comprehensive, Collision, etc.)
  (may appear as "Coverage", "Loss Coverage", "Type of Loss", "Peril")
lossType: Type/cause of loss
  (Progressive: "Type of Loss", State Farm: "Cause of Loss", Allstate: "Loss Type", may appear as "Peril", "Loss Cause")
lossDate: Date the loss/damage occurred
  (may appear as "Date of Loss", "Loss Date", "Accident Date", "Date of Accident", "Occurrence Date")
reportedDate: Date claim was reported
  (may appear as "Date Reported", "Reported Date", "Claim Reported")
claimStatus: Current status of the claim
  (may appear as "Status", "Claim Status", "Assignment Status")
deductible: Deductible amount (number only, no $ sign)
  (may appear as "Deductible", "Deductible Amount", "Owner Responsibility", "Customer Pays")
approvedAmount: Total approved/authorized repair amount
  (may appear as "Net Claim", "Insurance Pays", "Amount Approved", "Net Amount", "Authorized Amount")

── FINANCIAL TOTALS ─────────────────────────────────────────────
dollarValue: TOTAL estimate amount — the grand total the shop will be paid (number only, no $ sign)
  (may appear as "Total", "Grand Total", "Estimate Total", "Total Amount", "RO Total")
laborTotal: Total labor charges (number only)
  (may appear as "Labor Total", "Total Labor", "Body Labor Total")
laborRate: Labor rate per hour (number only)
  (may appear as "Labor Rate", "Rate", "$/hr", "Hourly Rate")
laborHours: Total labor hours (number only)
  (may appear as "Labor Hours", "Total Hours", "Hours")
partsTotal: Total parts cost (number only)
  (may appear as "Parts Total", "Total Parts", "Parts Amount")
shopMaterials: Shop supplies / materials charge (number only)
  (may appear as "Shop Materials", "Shop Supplies", "Supplies", "Materials")
grossTotal: Total before deductible/adjustments (number only)
  (may appear as "Gross Total", "Subtotal", "Total Before Deductible")
taxAmount: Sales tax amount (number only)
  (may appear as "Tax", "Sales Tax", "Tax Amount")

── APPRAISER / INSPECTOR ────────────────────────────────────────
appraiserName: Name of the person who wrote/inspected the estimate
  (Progressive: "Appraiser", State Farm: "Estimator", Allstate: "Field Appraiser", GEICO: "Inspector", Farmers: "Adjuster")
appraiserPhone: Appraiser/estimator phone number
appraiserEmail: Appraiser/estimator email address
inspectionSite: Location where inspection occurred
  (may appear as "Inspection Location", "Inspected At", "Shop Address", "Facility")
inspectionDate: Date of inspection
  (may appear as "Inspection Date", "Date Inspected", "Date of Inspection", "Survey Date")

── ADJUSTER ──────────────────────────────────────────────────────
adjusterName: Handling adjuster name
  (may appear as "Adjuster", "Claim Adjuster", "Handler", "Claim Handler", "Assigned To")
adjusterPhone: Adjuster phone
adjusterFax: Adjuster fax number
adjusterEmail: Adjuster email

── SUPPLEMENT ────────────────────────────────────────────────────
supplementedBy: Person who wrote/approved a supplement
  (may appear as "Supplement By", "Supplemented By", "Re-Inspected By")
supplementedByPhone: Supplement contact phone
supplementedByEmail: Supplement contact email

── REPAIR FACILITY ───────────────────────────────────────────────
repairFacility: Name of the repair shop
  (may appear as "Repair Facility", "Shop Name", "Repairer", "Body Shop")
repairFacilityAddress: Address of the repair shop
repairFacilityPhone: Phone of the repair shop

── REPAIR DETAILS ────────────────────────────────────────────────
repairDescription: Concatenate ALL repair line items into a single descriptive string listing all parts and labor operations
estimatedCompletionDate: Expected completion/ready date
  (may appear as "Completion Date", "Ready Date", "Est. Completion", "Promised Date")
arrivedAtShop: Date vehicle arrived at the repair facility
  (may appear as "Arrived", "Date In", "Check-In Date", "Received Date")

── OTHER ──────────────────────────────────────────────────────────
referenceNumber: Any secondary reference number not captured above
estimateDate: Date the estimate was written
  (may appear as "Date Written", "Estimate Date", "Written Date")

For any field in the document that genuinely does not fit any of the above categories, include it using camelCase keys.
Always prefer mapping to a standard key over creating a new one.`;

            const contentBlock = isPDF
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
                : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };

            const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-vision-proxy`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseSession.access_token}`,
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    system: systemPrompt,
                    messages: [{ role: 'user', content: [
                        contentBlock,
                        { type: 'text', text: 'Extract all field/value pairs from this insurance estimate document.' }
                    ]}],
                    model: 'claude-opus-4-5',
                    max_tokens: 2048,
                }),
            });

            if (!response.ok) {
                let msg = `Proxy error ${response.status}`;
                try {
                    const err = await response.json();
                    msg = err.error?.message || err.error || err.msg || msg;
                } catch (_) { /* non-JSON response from gateway */ }
                throw new Error(msg);
            }

            const data = await response.json();
            const text = data.content?.[0]?.text || '{}';
            try {
                return JSON.parse(text.replace(/```json|```/g, '').trim());
            } catch (e) {
                console.error('Could not parse Claude response:', text);
                throw new Error('Claude returned invalid JSON. Check console for raw response.');
            }
        }

        export function renderSuggestions(mode, extracted) {
            // Auto-switch or prompt to switch to insurance mode if insurance fields detected
            const hasInsuranceFields = Object.keys(extracted).some(k => INSURANCE_FIELD_MAP[k]);
            if (hasInsuranceFields) {
                if (mode === 'new' && currentROType === 'standard') {
                    setROType('insurance');
                } else if (mode === 'edit' && currentROType === 'standard') {
                    showToast('Insurance fields detected. Convert this RO to an Insurance Claim?', 'info', {
                        persistent: true,
                        actionLabel: 'Convert to Insurance',
                        actionCallback: function() { setROType('insurance', 'edit'); }
                    });
                }
            }

            const knownKeys = Object.keys(ESTIMATE_FIELD_MAP);
            // Also handle insurance-specific fields
            const insuranceKeys = Object.keys(INSURANCE_FIELD_MAP);
            const extraFields = {};

            Object.entries(extracted).forEach(([key, value]) => {
                if (!value && value !== 0) return;
                const strVal = String(value).trim();
                if (!strVal) return;

                if (knownKeys.includes(key)) {
                    const mapping = ESTIMATE_FIELD_MAP[key];
                    const inputId = mapping[mode];
                    if (!inputId) return; // field not available in this mode
                    const input = document.getElementById(inputId);
                    const container = document.getElementById(`sug_${mode}_${key}`);
                    if (!input || !container) return;

                    const existingVal = input.value.trim();

                    if (!existingVal) {
                        // Field is empty — show simple "tap to use" chip
                        container.innerHTML = renderSimpleChip(inputId, strVal, mapping.label, mode, key);
                    } else if (existingVal.toLowerCase() !== strVal.toLowerCase()) {
                        // Conflict — show keep vs use
                        container.innerHTML = renderConflictChip(inputId, existingVal, strVal, mapping.label, mode, key);
                    }
                    // If values match exactly, show nothing
                } else {
                    extraFields[key] = strVal;
                }
            });

            // Render insurance-specific fields (new and edit mode)
            Object.entries(extracted).forEach(([key, value]) => {
                if (!insuranceKeys.includes(key)) return;
                if (!value && value !== 0) return;
                const strVal = String(value).trim();
                if (!strVal) return;

                const mapping = INSURANCE_FIELD_MAP[key];
                const inputId = mapping[mode] || mapping.new;
                const input = document.getElementById(inputId);
                const container = document.getElementById(`sug_${mode}_${key}`);
                if (!input || !container) return;

                const existingVal = input.value.trim();
                if (!existingVal) {
                    container.innerHTML = renderSimpleChip(inputId, strVal, mapping.label, mode, key);
                } else if (existingVal.toLowerCase() !== strVal.toLowerCase()) {
                    container.innerHTML = renderConflictChip(inputId, existingVal, strVal, mapping.label, mode, key);
                }
                delete extraFields[key];
            });

            // Render extra fields section
            const extraEl = document.getElementById(`sug_${mode}_extra`);
            if (extraEl && Object.keys(extraFields).length > 0) {
                const rows = Object.entries(extraFields).map(([k, v]) => {
                    const safeKey = k.replace(/'/g, "\'");
                    const safeVal = v.replace(/'/g, "\'").replace(/"/g, '&quot;');
                    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    return `<div class="extra-field-row" id="extra-row-${mode}-${k}">
                        <span class="extra-field-key">${label}:</span>
                        <span class="extra-field-val">${v}</span>
                        <button class="extra-field-add-btn" onclick="addExtraFieldToRO('${safeKey}', '${safeVal}', '${mode}', this)">
                            + Add to RO
                        </button>
                    </div>`;
                }).join('');
                extraEl.innerHTML = `
                    <div class="extra-fields-section">
                        <div class="extra-fields-toggle" onclick="toggleExtraFields(this)">
                            📋 Additional Extracted Fields (${Object.keys(extraFields).length})
                            <span style="transform:rotate(180deg);display:inline-block;">▼</span>
                        </div>
                        <div class="extra-fields-body open">${rows}</div>
                    </div>`;
            }
        }

        export function applyChip(inputId, value, mode, key, chipEl) {
            const input = document.getElementById(inputId);
            if (input) {
                const normalized = normalizeExtractedValue(key, value);
                // For number inputs, round to 2 decimal places to avoid step validation errors
                if (input.type === 'number') {
                    const num = parseFloat(normalized);
                    input.value = isNaN(num) ? normalized : Math.round(num * 100) / 100;
                } else {
                    input.value = normalized;
                }
            }
            if (chipEl) chipEl.remove();
        }

        export function applyChipConflict(inputId, value, mode, key, conflictEl) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = normalizeExtractedValue(key, value);
            }
            if (conflictEl) conflictEl.remove();
        }

        export async function writeInsuranceData(roId, extractedData, dataIndex) {
            if (!roId) return;
            const json = JSON.stringify(extractedData);

            // Write to insurance_scans table in Supabase
            try {
                const ro = dataIndex !== null && dataIndex !== undefined ? currentData[dataIndex] : currentData.find(d => d.roId === roId);
                const supabaseId = ro?._supabaseId;
                await getSB().from('insurance_scans').insert({
                    ro_id:      supabaseId || null,
                    user_id:    supabaseSession?.user?.id || null,
                    raw_data:   extractedData,
                    scanned_at: new Date().toISOString(),
                });
                log('✅ Insurance scan written to Supabase for', roId);
            } catch (err) {
                warn('Insurance scan write failed (non-fatal):', err);
            }

            // Also update insurance_data on the repair_orders row
            if (dataIndex !== null && dataIndex !== undefined) {
                try {
                    const ro = currentData[dataIndex];
                    if (ro?._supabaseId) {
                        let parsed = extractedData;
                        try { if (typeof extractedData === 'string') parsed = JSON.parse(extractedData); } catch(e) {}
                        await getSB().from('repair_orders').update({
                            insurance_data: parsed,
                            updated_at: new Date().toISOString(),
                        }).eq('id', ro._supabaseId);
                        currentData[dataIndex].insuranceData = json;
                        log('✅ Insurance data written to repair_orders in Supabase');
                    }
                } catch (err) {
                    warn('Insurance data RO update failed (non-fatal):', err);
                }
            }
        }

Object.assign(window, { renderCustomFields, openEstimateScanner, handleEstimateFile, callClaudeVision, renderSuggestions, applyChip, applyChipConflict, writeInsuranceData });
