// js/qr.js - Phase 13 (ADDITIVE): QR codes + deep links.
// v1.438 (Session 89, 2026-06-03).
//
// Extracted VERBATIM from the index.html inline <script> (3 functions):
//   openQRModal, printQRLabel, handleDeepLink.
//
// ADDITIVE PHASE - the inline copies of the 3 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openQRModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions resolves through the SHARED
// global environment to the SAME symbol the inline copy uses:
//   - window.QRCode (CDN-loaded QR library);
//   - inline state/helpers (currentFilteredData, currentData, escapeHtml,
//     calculateDaysOnLot, renderBoard, _deepLinkRoId, ...) via the global lexical
//     environment / window bridges.
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 13
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.



        export function openQRModal(index) {
            const ro = currentFilteredData[index];
            if (!ro) return;
            
            const roId = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
            const checkInURL = `https://patriotsrv.github.io/rv-dashboard/?ro=${encodeURIComponent(roId)}`;
            
            // Create modal overlay
            const modalHTML = `
                <div id="qrModalOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;" onclick="closeQRModal(event)">
                    <div style="background: white; border-radius: 16px; padding: 40px; max-width: 500px; width: 100%; text-align: center;" onclick="event.stopPropagation()">
                        <h2 style="margin-bottom: 20px; color: #1e293b; font-family: 'Barlow Condensed', sans-serif;">QR Code — Scan to Open RO</h2>
                        <div style="background: white; padding: 20px; border-radius: 12px; display: inline-block; border: 2px solid #e2e8f0;">
                            <canvas id="qrModalCanvas" width="300" height="300"></canvas>
                        </div>
                        <div style="margin-top: 20px; font-size: 1.2rem; font-weight: 700; color: #1e293b;">${escapeHtml(ro.customerName)}</div>
                        <div style="margin-top: 8px; font-size: 1rem; font-weight: 600; color: #475569;">${escapeHtml(ro.rv) || 'RV Not Specified'}</div>
                        <div style="margin-top: 8px; font-size: 0.9rem; color: #64748b; font-family: 'JetBrains Mono', monospace;">${roId}</div>
                        <div style="margin-top: 20px; padding: 12px; background: #f1f5f9; border-radius: 8px; font-size: 0.85rem; color: #475569;">
                            Scan to open this RO on the dashboard — use 🚪 Tech Check In from there
                        </div>
                        <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
                            <button onclick="printQRLabel(${index}); closeQRModal();" style="padding: 12px 24px; background: #0A84FF; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 1rem;">
                                🖨️ Print Label
                            </button>
                            <button onclick="closeQRModal()" style="padding: 12px 24px; background: #64748b; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 1rem;">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Add modal to page
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = modalHTML;
            document.body.appendChild(modalDiv);
            
            // Draw QR code on modal canvas
            setTimeout(() => {
                const modalCanvas = document.getElementById('qrModalCanvas');
                const smallCanvas = document.getElementById(`qr-${index}`);
                
                if (modalCanvas && smallCanvas) {
                    // Wait for logo to load if not ready yet
                    const copyCanvas = () => {
                        const ctx = modalCanvas.getContext('2d');
                        ctx.drawImage(smallCanvas, 0, 0, 300, 300);
                    };
                    
                    if (smallCanvas.dataset.ready === 'true') {
                        copyCanvas();
                    } else {
                        // Wait for logo to load
                        const checkReady = setInterval(() => {
                            if (smallCanvas.dataset.ready === 'true') {
                                clearInterval(checkReady);
                                copyCanvas();
                            }
                        }, 100);
                        
                        // Timeout after 2 seconds
                        setTimeout(() => {
                            clearInterval(checkReady);
                            copyCanvas(); // Copy anyway
                        }, 2000);
                    }
                }
            }, 100);
        }

        export function printQRLabel(index) {
            const ro = currentFilteredData[index];
            if (!ro) return;

            const roId = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
            const checkInURL = 'https://patriotsrv.github.io/rv-dashboard/?ro=' + encodeURIComponent(roId);
            const customerName = (ro.customerName || 'Unknown').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const rvMake = (ro.rv || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const spotText = (ro.parkingSpot || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const roIdSafe = roId.replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const urlJson = JSON.stringify(checkInURL);

            const printWindow = window.open('', '_blank', 'width=750,height=700');
            printWindow.document.write('<!DOCTYPE html><html><head>' +
                '<title>QR Print Sheet \u2014 ' + customerName + '<\/title>' +
                '<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>' +
                '<style>' +
                '* { box-sizing: border-box; margin: 0; padding: 0; }' +
                'body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 24px; }' +
                'h2 { text-align:center; font-size:14px; color:#555; margin-bottom:20px; font-weight:normal; }' +
                '.sheet { display:flex; gap:40px; align-items:flex-start; justify-content:center; flex-wrap:wrap; }' +
                '.stickerbox { display:flex; flex-direction:column; align-items:center; gap:6px; }' +
                '.cut-label { font-size:11px; color:#888; }' +

                /* ── 3"×3" windshield sticker ── */
                '.sticker-lg {' +
                '  width:3in; height:3in;' +
                '  border:2px dashed #aaa;' +
                '  background:white;' +
                '  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;' +
                '  padding:6px;' +
                '}' +
                '#qr-lg { width:2.28in; height:2.28in; }' +
                '#qr-lg img, #qr-lg canvas { width:100% !important; height:100% !important; }' +
                '.name { font-size:11.5px; font-weight:bold; text-align:center; line-height:1.2; }' +
                '.rv   { font-size:10px; color:#444; text-align:center; }' +
                '.roid { font-size:9px;  color:#666; text-align:center; font-family:monospace; }' +
                '.spot { font-size:10px; font-weight:bold; color:#854d0e; background:#fef9c3;' +
                '        border:1px solid #fde047; border-radius:3px; padding:1px 7px; text-align:center; }' +

                /* ── 1"×1" key tag ── */
                '.sticker-sm {' +
                '  width:1in; height:1in;' +
                '  border:2px dashed #aaa;' +
                '  background:white;' +
                '  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;' +
                '  padding:3px;' +
                '}' +
                '#qr-sm { width:0.72in; height:0.72in; }' +
                '#qr-sm img, #qr-sm canvas { width:100% !important; height:100% !important; }' +
                '.sm-ro { font-size:5.5px; color:#333; text-align:center; font-family:monospace;' +
                '         overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; }' +

                /* print rules */
                '@media print {' +
                '  body { background:white; padding:0.3in; }' +
                '  .print-btn { display:none !important; }' +
                '}' +
                '@page { size:auto; margin:0.4in; }' +

                /* print button */
                '.print-btn { display:block; margin:22px auto 0; padding:9px 28px;' +
                '  background:#0A84FF; color:white; border:none; border-radius:8px;' +
                '  font-size:13px; font-weight:bold; cursor:pointer; }' +
                '<\/style><\/head><body>' +

                '<h2>PRVS QR Print Sheet &mdash; ' + customerName + '<\/h2>' +
                '<div class="sheet">' +

                  /* large sticker */
                  '<div class="stickerbox">' +
                    '<div class="sticker-lg">' +
                      '<div id="qr-lg"><\/div>' +
                      '<div class="name">' + customerName + '<\/div>' +
                      (rvMake ? '<div class="rv">' + rvMake + '<\/div>' : '') +
                      '<div class="roid">' + roIdSafe + '<\/div>' +
                      (spotText ? '<div class="spot">&#128205; ' + spotText + '<\/div>' : '') +
                    '<\/div>' +
                    '<div class="cut-label">&#9988; 3&Prime; &times; 3&Prime; &mdash; Windshield Sticker<\/div>' +
                  '<\/div>' +

                  /* small sticker */
                  '<div class="stickerbox">' +
                    '<div class="sticker-sm">' +
                      '<div id="qr-sm"><\/div>' +
                      '<div class="sm-ro">' + roIdSafe + '<\/div>' +
                    '<\/div>' +
                    '<div class="cut-label">&#9988; 1&Prime; &times; 1&Prime; &mdash; Key Tag<\/div>' +
                  '<\/div>' +

                '<\/div>' +
                '<button class="print-btn" onclick="window.print()">&#128424; Print Sheet<\/button>' +

                '<script>' +
                '(function init(){' +
                '  if(typeof QRCode==="undefined"){setTimeout(init,80);return;}' +
                '  var url=' + urlJson + ';' +
                '  new QRCode(document.getElementById("qr-lg"),{text:url,width:219,height:219,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});' +
                '  new QRCode(document.getElementById("qr-sm"),{text:url,width:69,height:69,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});' +
                '})();' +
                '<\/script><\/body><\/html>');
            printWindow.document.close();
        }

        export function handleDeepLink() {
            if (!_deepLinkRoId) return;
            const target = _deepLinkRoId;

            // Find the RO card whose roId matches the URL param
            const idx = currentFilteredData.findIndex(ro => {
                const id = ro.roId || generateROId(ro.customerName, ro.rv || '', ro.dateReceived);
                return id === target;
            });
            if (idx === -1) return;          // not in current filter view — wait for next render

            const card = document.querySelector(`[data-ro-index="${idx}"]`);
            if (!card) return;

            // Clear the flag so we don't re-highlight on every subsequent renderBoard()
            _deepLinkRoId = null;

            // Scroll the card into view
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Pulse a blue highlight ring 3× to draw the eye
                let pulses = 0;
                const pulse = () => {
                    card.style.transition = 'box-shadow 0.35s ease, outline 0.35s ease';
                    card.style.outline = '3px solid #0A84FF';
                    card.style.boxShadow = '0 0 0 6px rgba(10,132,255,0.35), 0 0 40px rgba(10,132,255,0.2)';
                    setTimeout(() => {
                        card.style.outline = '';
                        card.style.boxShadow = '';
                        pulses++;
                        if (pulses < 3) setTimeout(pulse, 450);
                        else card.style.transition = '';
                    }, 400);
                };
                setTimeout(pulse, 300); // small delay to let scroll settle
            }, 80);
        }

Object.assign(window, { openQRModal, printQRLabel, handleDeepLink });
