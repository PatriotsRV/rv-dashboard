// js/photos.js - Phase 10 (ADDITIVE): photo library, documents, lightbox, photo email, migration tool.
// v1.434 (Session 87, 2026-06-02).
//
// Extracted VERBATIM from the index.html inline <script> (13 functions):
//   uploadPhoto, openPhotoLibrary, switchLibTab, uploadDocument, closePhotoLibrary,
//   setMainPhoto, openPhotoLightbox, navigateLightbox, closePhotoLightbox,
//   openPhotoEmailModal, sendPhotosToCustomer, uploadToSupabaseStorage,
//   openPhotoMigrationTool.
//   (renderPhotosTab + renderDocsTab are INNER closures of openPhotoLibrary and move with it.)
//
// ADDITIVE PHASE - the inline copies of the 13 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openPhotoLibrary etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an `export`
// keyword was inserted after the indent; no reference rewriting), so behavior is
// unchanged. Every bare reference inside these functions resolves through the SHARED
// global environment to the SAME symbol the inline copy uses - module-owned siblings via
// module scope, inline helpers (parseLibrary, serializeLibrary, photoEntry,
// addDocToLibrary, updatePhotoLibraryInSheet, updatePhotoInSheet, uploadToGoogleDrive,
// runPhotoMigration) + inline constants/state (currentData, currentFilteredData, getSB,
// supabaseSession, escapeHtml, showToast, renderBoard, writeAuditLog, t, ...) via the
// global object / global lexical environment + backward-compat window globals.
//
// NOTE: js/parts.js calls uploadToSupabaseStorage as a bare reference (runtime, at parts-
// request submit) - the bridge below re-points window.uploadToSupabaseStorage to this
// byte-identical module copy, so that call path is unchanged.
//
// WARNING: uploadPhoto / uploadDocument / uploadToSupabaseStorage / setMainPhoto /
// sendPhotosToCustomer WRITE to Supabase Storage (rv-media bucket) + repair_orders
// (photo_url / photo_library) + audit_log (via writeAuditLog), and openPhotoMigrationTool
// drives runPhotoMigration which bulk-rewrites repair_orders.photo_url/photo_library +
// re-uploads to Storage. This additive build MUST be validated with a NON-DESTRUCTIVE
// test on a staff-tester RO (open library -> switch tabs -> upload a photo -> lightbox
// prev/next -> set main -> email photos) before promote to main. Do NOT run the migration
// tool as part of the test.
//
// Proper ESM imports (config/state/utils/render/auth/ro-crud) + deletion of the inline
// copies are deferred to the Phase 10 delete-inline cleanup, after this additive build
// soaks. Do NOT rewrite references here until that phase.


        export async function uploadPhoto(index) {
            if (!getSB() || !supabaseSession) {
                showToast('Session expired — please refresh the page and sign in again.', 'warning');
                return;
            }

            const ro = currentFilteredData[index];
            if (!ro) { showToast('Error: Could not find the repair order.', 'error'); return; }

            const input = document.createElement('input');
            input.type = 'file';
            // v1.406: add .heic/.heif explicitly — some iOS Chrome pickers won't include them under image/*
            input.accept = 'image/*,video/*,.heic,.heif';
            input.multiple = true;
            // No capture attribute — lets mobile show native picker (Camera OR Photo Library)

            // [ER BUGFIX v1.453 S114] iOS Safari drops the change event on a DETACHED
            // <input> after the camera/photo picker returns (the page is reloaded/
            // backgrounded and the orphaned element is GC'd) — the upload silently
            // never fires (ER 2c3d5633, Ryan). Attaching the input to the DOM off-screen
            // makes the picker result reliably trigger onchange; it's removed once the
            // selection is read.
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.setAttribute('aria-hidden', 'true');
            document.body.appendChild(input);

            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                if (input.parentNode) input.remove(); // [ER BUGFIX v1.453 S114] clean up the off-screen input
                if (!files.length) return;

                // Re-check session inside async callback — session may have changed since picker opened
                if (!getSB() || !supabaseSession) {
                    showToast('Session expired — please refresh the page and sign in again.', 'warning');
                    return;
                }

                const cards = document.querySelectorAll('.ro-card');
                const card = cards[index];
                const uploadBtn = card ? card.querySelector('.photo-upload-btn') : null;
                const originalText = uploadBtn ? uploadBtn.textContent : '';
                if (uploadBtn) { uploadBtn.textContent = `⏳ Uploading 0/${files.length}...`; uploadBtn.disabled = true; }

                try {
                    const originalIndex = ro._supabaseId
                        ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                        : currentData.findIndex(item =>
                            item.customerName === ro.customerName &&
                            item.dateReceived === ro.dateReceived
                        );
                    if (originalIndex === -1) throw new Error('RO not found in data');

                    // Parse existing photo library
                    let library = [];
                    const parsedLib = parseLibrary(currentData[originalIndex].photoLibrary || ''); library = parsedLib.photos;

                    let uploaded = 0;
                    let firstPhotoUrl = null;
                    const isFirstPhoto = !currentData[originalIndex].rvPhotoUrl;

                    for (const rawFile of files) {
                        const nameLower = (rawFile.name || '').toLowerCase();
                        const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif');
                        // v1.406: HEIC files may come through with empty or "image/heic" type; accept them and convert below
                        if (!isHeic && !rawFile.type.startsWith('image/') && !rawFile.type.startsWith('video/')) continue;
                        if (uploadBtn && isHeic) uploadBtn.textContent = `⏳ Converting HEIC ${uploaded + 1}/${files.length}...`;
                        const file = await convertHeicIfNeeded(rawFile);
                        const roId = currentData[originalIndex]?.roId || 'general';
                        const photoUrl = await uploadToSupabaseStorage(file, roId);
                        library.push(photoUrl);
                        uploaded++;
                        if (isFirstPhoto && !firstPhotoUrl) firstPhotoUrl = photoUrl;
                        if (uploadBtn) uploadBtn.textContent = `⏳ Uploading ${uploaded}/${files.length}...`;
                    }

                    const existingParsed = parseLibrary(currentData[originalIndex].photoLibrary || '');
                    existingParsed.photos = library;
                    const libraryJson = serializeLibrary(existingParsed);

                    if (isFirstPhoto && firstPhotoUrl) {
                        currentData[originalIndex].rvPhotoUrl = firstPhotoUrl;
                        currentData[originalIndex].photoLibrary = libraryJson;
                        await updatePhotoInSheet(firstPhotoUrl, originalIndex, libraryJson);
                        showToast(uploaded + ' photo(s) uploaded — first photo set as main RV image.', 'success');
                    } else {
                        currentData[originalIndex].photoLibrary = libraryJson;
                        await updatePhotoLibraryInSheet(libraryJson, originalIndex);
                        showToast(uploaded + ' photo(s) added to library! Use Manage Photos to set as main.', 'success');
                    }

                    renderBoard();
                } catch (error) {
                    console.error('Upload error:', error);
                    showToast('Error uploading photo: ' + error.message, 'error');
                    if (uploadBtn) { uploadBtn.textContent = originalText; uploadBtn.disabled = false; }
                }
            };
            
            input.click();
        }


        export function openPhotoLibrary(index, initialTab = 'photos') {
            const ro = currentFilteredData[index];
            if (!ro) return;

            const library = parseLibrary(ro.photoLibrary || '');
            // Sanitize: filter out any null/undefined/non-string entries that would crash url.includes()
            library.photos = library.photos.filter(url => typeof url === 'string' && url.length > 0);
            library.docs   = library.docs.filter(doc => doc && typeof doc === 'object');
            const mainUrl = ro.rvPhotoUrl || '';
            window._libPhotos = library.photos;
            window._libMainUrl = mainUrl;
            window._libRoIndex = index;
            // Helper available via photoEntry()

            const renderPhotosTab = () => {
                const thumbsHtml = library.photos.length === 0
                    ? '<p style="color:#64748b;text-align:center;padding:20px;">No photos yet.</p>'
                    : library.photos.map((url, i) => {
                        const isMain = url === mainUrl;
                        const isVid = isVideoUrl(url);
                        const mediaTile = isVid
                            ? `<div style="width:100%;height:140px;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-size:34px;pointer-events:none;">🎬<div style="font-size:11px;margin-top:5px;color:#94a3b8;letter-spacing:0.5px;">VIDEO</div></div>`
                            : `<img src="${url.includes('sz=w') ? url.replace(/sz=w\d+/, 'sz=w200') : url}" loading="lazy" style="width:100%;height:140px;object-fit:cover;display:block;background:#f1f5f9;" onerror="this.style.opacity='0.3'">`;
                        return `<div onclick="openPhotoLightbox(${i}, ${index})" style="position:relative;border-radius:10px;overflow:hidden;border:3px solid ${isMain ? '#22c55e' : '#e2e8f0'};cursor:pointer;">
                            ${mediaTile}
                            ${isMain ? '<div style="position:absolute;top:6px;left:6px;background:#22c55e;color:white;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;">⭐ MAIN</div>' : ''}
                            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.45);color:white;text-align:center;font-size:11px;padding:4px;pointer-events:none;">${isVid ? '▶ Tap to play' : '🔍 Tap to view'}</div>
                        </div>`;
                    }).join('');
                const emailBtn = ro.customerEmail && library.photos.length > 0
                    ? `<button onclick="openPhotoEmailModal(${index})" style="width:100%;padding:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;margin-top:10px;">📧 Email Photos to Customer</button>`
                    : '';
                return `
                    ${library.photos.length > 0 ? '<p style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Tap a photo to view full size. Set as main from the viewer.</p>' : ''}
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:16px;">${thumbsHtml}</div>
                    <button onclick="uploadPhoto(${index}); closePhotoLibrary();" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">📷 Add Photo / Video</button>
                    ${emailBtn}`;
            };

            const renderDocsTab = () => {
                const docsHtml = library.docs.length === 0
                    ? '<p style="color:#64748b;text-align:center;padding:20px;">No documents yet.</p>'
                    : library.docs.map((doc, i) => {
                        const isPDF = doc.type === 'pdf' || (doc.name || '').toLowerCase().endsWith('.pdf');
                        const isImg = ['jpg','jpeg','png','gif','webp'].some(ext => (doc.name || '').toLowerCase().endsWith(ext));
                        const icon = isPDF ? '📄' : isImg ? '🖼️' : '📎';
                        const preview = isImg
                            ? `<img src="${doc.url}" loading="lazy" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px;" onerror="this.style.display='none'">`
                            : `<div style="font-size:2.5rem;text-align:center;padding:16px 0;">${icon}</div>`;
                        return `<div style="background:#f8fafc;border-radius:10px;padding:10px;border:1px solid #e2e8f0;">
                            ${preview}
                            <div style="font-size:11px;font-weight:700;color:#475569;word-break:break-all;margin-bottom:4px;">${doc.name || 'Document'}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">${doc.addedDate || ''}</div>
                            <a href="${doc.url}" target="_blank" style="display:block;text-align:center;padding:5px;background:#3b82f6;color:white;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;">🔗 Open</a>
                            ${canManageFiles() ? `<div style="display:flex;gap:4px;margin-top:6px;">
                                <button onclick="renameLibraryDoc(${index},${i})" title="Rename document" style="flex:1;padding:5px;background:#e0e7ff;color:#3730a3;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">✏️</button>
                                <button onclick="openMoveFileModal(${index},'doc',${i})" title="Move to another RO" style="flex:1;padding:5px;background:#fef3c7;color:#92400e;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">➡️</button>
                                <button onclick="deleteLibraryItem(${index},'doc',${i})" title="Delete document" style="flex:1;padding:5px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🗑️</button>
                            </div>` : ''}
                        </div>`;
                    }).join('');
                return `
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:16px;">${docsHtml}</div>
                    <input type="file" id="docUploadInput_${index}" accept="*/*" style="display:none;" onchange="uploadDocument(${index}, this)">
                    <button onclick="document.getElementById('docUploadInput_${index}').click()" style="width:100%;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">📎 Upload Document</button>`;
            };

            const modalHTML = `
                <div id="photoLibraryModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="closePhotoLibrary(event)">
                    <div style="background:white;border-radius:16px;padding:30px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;">📷 Photos &amp; Docs — ${escapeHtml(ro.customerName)}</h2>
                            <button onclick="closePhotoLibrary()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;font-weight:600;">✕ Close</button>
                        </div>
                        <!-- Tab switcher -->
                        <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
                            <button id="libTabPhotos" onclick="switchLibTab('photos',${index})" style="flex:1;padding:10px;background:#3b82f6;color:white;border:none;font-weight:700;font-size:0.95rem;cursor:pointer;">📷 Photos (${library.photos.length})</button>
                            <button id="libTabDocs" onclick="switchLibTab('docs',${index})" style="flex:1;padding:10px;background:#f1f5f9;color:#475569;border:none;font-weight:700;font-size:0.95rem;cursor:pointer;">📎 Documents (${library.docs.length})</button>
                        </div>
                        <div id="libTabContent">${renderPhotosTab()}</div>
                    </div>
                </div>`;

            window._libRenderFns = { photos: renderPhotosTab, docs: renderDocsTab };
            const div = document.createElement('div');
            div.innerHTML = modalHTML;
            document.body.appendChild(div);
            setTimeout(() => loadAllDriveImages(), 50);
            // Switch to requested tab (e.g. 'docs' after a document upload)
            if (initialTab === 'docs') setTimeout(() => switchLibTab('docs', index), 10);
        }


        export function switchLibTab(tab, index) {
            const photosBtn = document.getElementById('libTabPhotos');
            const docsBtn = document.getElementById('libTabDocs');
            const content = document.getElementById('libTabContent');
            if (!content || !window._libRenderFns) return;
            if (tab === 'photos') {
                photosBtn.style.background = '#3b82f6'; photosBtn.style.color = 'white';
                docsBtn.style.background = '#f1f5f9'; docsBtn.style.color = '#475569';
            } else {
                docsBtn.style.background = '#10b981'; docsBtn.style.color = 'white';
                photosBtn.style.background = '#f1f5f9'; photosBtn.style.color = '#475569';
            }
            content.innerHTML = window._libRenderFns[tab]();
        }


        export async function uploadDocument(index, input) {
            const rawFile = input.files[0];
            if (!rawFile) return;

            if (!getSB() || !supabaseSession) {
                showToast('Session expired — please refresh the page and sign in again.', 'warning');
                input.value = '';
                return;
            }

            const ro = currentFilteredData[index];
            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );
            if (originalIndex === -1) { input.value = ''; return; }

            const uploadBtn = input.nextElementSibling;
            if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '⏳ Uploading...'; }

            try {
                // v1.406: auto-convert HEIC docs to JPEG before upload
                const heicNameLower = (rawFile.name || '').toLowerCase();
                const wasHeic = heicNameLower.endsWith('.heic') || heicNameLower.endsWith('.heif');
                if (uploadBtn && wasHeic) uploadBtn.textContent = '⏳ Converting HEIC...';
                const file = await convertHeicIfNeeded(rawFile);
                if (uploadBtn) uploadBtn.textContent = '⏳ Uploading...';

                // Upload to Supabase Storage — same rv-media bucket, docs subfolder
                // skipContentType: true so non-image MIME types are not rejected by bucket policy
                const roId = currentData[originalIndex]?.roId || 'general';
                const docUrl = await uploadToSupabaseStorage(file, roId + '/docs', { skipContentType: true });

                const ext = file.name.split('.').pop().toLowerCase();
                const docType = ext === 'pdf' ? 'pdf'
                    : ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image'
                    : 'doc';

                await addDocToLibrary(originalIndex, docUrl, file.name, docType);
                // Sync updated photoLibrary back to currentFilteredData so the modal reflects the new doc
                if (currentFilteredData[index]) {
                    currentFilteredData[index].photoLibrary = currentData[originalIndex].photoLibrary;
                }
                showToast('Document uploaded! It may take up to 60 seconds to appear in the list.', 'success', { duration: 8000 });
                closePhotoLibrary();
                // Reopen directly on the Documents tab so the new doc is immediately visible
                setTimeout(() => openPhotoLibrary(index, 'docs'), 100);
            } catch (err) {
                console.error('Document upload error:', err);
                const msg = err.message || '';
                if (msg.toLowerCase().includes('mime type') || msg.toLowerCase().includes('not supported')) {
                    showToast('Upload failed: File type blocked by storage. Go to Supabase → Storage → rv-media → remove MIME type restriction, then retry.', 'error');
                } else {
                    showToast('Upload failed: ' + msg, 'error');
                }
                if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '📎 Upload Document'; }
            }
            input.value = '';
        }


        export function closePhotoLibrary(event) {
            if (event && event.target.id !== 'photoLibraryModal') return;
            const modal = document.getElementById('photoLibraryModal');
            if (modal) modal.parentElement.remove();
        }


        export async function setMainPhoto(index, newMainUrl) {
            const ro = currentFilteredData[index];
            if (!ro) return;

            const originalIndex = ro._supabaseId
                ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
                : currentData.findIndex(item =>
                    item.customerName === ro.customerName &&
                    item.dateReceived === ro.dateReceived
                );
            if (originalIndex === -1) return;

            currentData[originalIndex].rvPhotoUrl = newMainUrl;
            await updatePhotoInSheet(newMainUrl, originalIndex, currentData[originalIndex].photoLibrary || '');
            
            closePhotoLibrary();
            renderBoard();
            showToast('Main photo updated!', 'success');
        }


        export function openPhotoLightbox(photoIdx, libIndex) {
            const photos = window._libPhotos || [];
            if (!photos.length) return;
            const url = photos[photoIdx];
            if (!url) return;
            window._lightboxIdx = photoIdx;
            window._lightboxLibIdx = libIndex;
            const existing = document.getElementById('photoLightbox');
            if (existing) existing.remove();

            const isMain = url === (window._libMainUrl || '');
            const hasMultiple = photos.length > 1;
            const isVid = isVideoUrl(url);

            // Videos cannot be set as the RO's main photo thumbnail
            const setMainHtml = isVid ? '' : (isMain
                ? `<span style="background:#22c55e;color:white;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;white-space:nowrap;">⭐ Main Photo</span>`
                : `<button onclick="setMainPhoto(${libIndex},'${url}');closePhotoLightbox();" style="background:#22c55e;color:white;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">⭐ Set as Main</button>`);

            const mediaHtml = isVid
                ? `<video src="${url}" controls autoplay style="max-width:100%;max-height:75vh;border-radius:8px;box-shadow:0 4px 40px rgba(0,0,0,0.5);margin-top:60px;"></video>`
                : `<img src="${url}" style="max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 40px rgba(0,0,0,0.5);margin-top:60px;">`;

            const overlay = document.createElement('div');
            overlay.id = 'photoLightbox';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10010;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
            overlay.onclick = (e) => { if (e.target === overlay) closePhotoLightbox(); };

            overlay.innerHTML = `
                <div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;flex-wrap:wrap;justify-content:center;z-index:1;">
                    ${setMainHtml}
                    <a href="${url}" target="_blank" style="background:#3b82f6;color:white;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">${isVid ? '💾 Download Video' : '💾 Open / Save'}</a>
                    ${canManageFiles() ? `<button onclick="openMoveFileModal(${libIndex},'photo',${photoIdx})" style="background:#f59e0b;color:white;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">➡️ Move</button>
                    <button onclick="deleteLibraryItem(${libIndex},'photo',${photoIdx})" style="background:#ef4444;color:white;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">🗑️ Delete</button>` : ''}
                    <button onclick="closePhotoLightbox()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ Close</button>
                </div>
                ${hasMultiple ? `<button onclick="navigateLightbox(-1)" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);color:white;border:none;border-radius:50%;width:48px;height:48px;font-size:26px;cursor:pointer;z-index:1;display:flex;align-items:center;justify-content:center;">&#8249;</button>` : ''}
                ${mediaHtml}
                ${hasMultiple ? `<button onclick="navigateLightbox(1)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);color:white;border:none;border-radius:50%;width:48px;height:48px;font-size:26px;cursor:pointer;z-index:1;display:flex;align-items:center;justify-content:center;">&#8250;</button>` : ''}
                ${hasMultiple ? `<div style="position:absolute;bottom:16px;color:rgba(255,255,255,0.7);font-size:13px;">${photoIdx + 1} / ${photos.length}</div>` : ''}`;

            document.body.appendChild(overlay);

            // [ER FEATURE v1.454 S117] Brandon (ER 74a33621): keyboard navigation through
            // photos. Left/Right arrows step prev/next; Escape closes. openPhotoLightbox is
            // re-invoked on every navigation, so remove any prior handler before adding a new
            // one to avoid stacking listeners. closePhotoLightbox tears the handler down.
            if (window._lightboxKeyHandler) {
                document.removeEventListener('keydown', window._lightboxKeyHandler);
            }
            window._lightboxKeyHandler = function(e) {
                if (!document.getElementById('photoLightbox')) return;
                if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateLightbox(-1); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); navigateLightbox(1); }
                else if (e.key === 'Escape') { e.preventDefault(); closePhotoLightbox(); }
            };
            document.addEventListener('keydown', window._lightboxKeyHandler);
        }


        export function navigateLightbox(dir) {
            const photos = window._libPhotos || [];
            if (!photos.length) return;
            const newIdx = (window._lightboxIdx + dir + photos.length) % photos.length;
            openPhotoLightbox(newIdx, window._lightboxLibIdx);
        }


        export function closePhotoLightbox() {
            const lb = document.getElementById('photoLightbox');
            if (lb) lb.remove();
            // [ER FEATURE v1.454 S117] tear down the arrow-key navigation handler
            if (window._lightboxKeyHandler) {
                document.removeEventListener('keydown', window._lightboxKeyHandler);
                window._lightboxKeyHandler = null;
            }
        }


        export function openPhotoEmailModal(index) {
            const ro = currentFilteredData[index];
            if (!ro) return;
            const photos = window._libPhotos || [];
            if (!photos.length) { showToast('No photos to send.', 'warning'); return; }

            const existing = document.getElementById('photoEmailModal');
            if (existing) existing.remove();

            const checkboxesHtml = photos.map((url, i) => {
                const isVid = isVideoUrl(url);
                const thumb = url.includes('sz=w') ? url.replace(/sz=w\d+/, 'sz=w120') : url;
                const thumbHtml = isVid
                    ? `<div style="width:60px;height:45px;background:#0f172a;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:white;">🎬</div>`
                    : `<img src="${thumb}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.opacity='0.3'">`;
                return `<label style="display:flex;align-items:center;gap:10px;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;${isVid ? 'opacity:0.6;' : ''}">
                    <input type="checkbox" name="emailPhoto" value="${url}" ${isVid ? 'disabled' : 'checked'} style="width:18px;height:18px;flex-shrink:0;cursor:pointer;">
                    ${thumbHtml}
                    <span style="font-size:12px;color:#475569;">${isVid ? '🎬 Video (not emailable)' : `Photo ${i + 1}`}</span>
                </label>`;
            }).join('');

            const overlay = document.createElement('div');
            overlay.id = 'photoEmailModal';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10010;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

            overlay.innerHTML = `
                <div style="background:white;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;margin:0;font-size:1.4rem;">📧 Email Photos to Customer</h2>
                        <button onclick="document.getElementById('photoEmailModal').remove()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;font-weight:600;">✕</button>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">Send To:</label>
                        <input id="photoEmailTo" type="email" value="${escapeHtml(ro.customerEmail) || ''}" placeholder="customer@email.com" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:8px;">Select Photos to Send:</label>
                        <div style="display:flex;flex-direction:column;gap:6px;">${checkboxesHtml}</div>
                    </div>
                    <div style="margin-bottom:18px;">
                        <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">Optional Message:</label>
                        <textarea id="photoEmailMsg" rows="3" placeholder="Add a personal note to the customer..." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;resize:vertical;"></textarea>
                    </div>
                    <button id="sendPhotosBtn" onclick="sendPhotosToCustomer(${index})" style="width:100%;padding:13px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;">📧 Send Photos</button>
                </div>`;

            document.body.appendChild(overlay);
        }


        export async function sendPhotosToCustomer(index) {
            const ro = currentFilteredData[index];
            if (!ro) return;

            const toEmail = document.getElementById('photoEmailTo')?.value?.trim();
            if (!toEmail) { showToast('Please enter a recipient email address.', 'warning'); return; }

            const checked = [...document.querySelectorAll('input[name="emailPhoto"]:checked')].map(cb => cb.value);
            if (!checked.length) { showToast('Please select at least one photo to send.', 'warning'); return; }

            const message = document.getElementById('photoEmailMsg')?.value?.trim() || '';

            const btn = document.getElementById('sendPhotosBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

            try {
                const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-quote-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`,
                        'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                    },
                    body: JSON.stringify({
                        type: 'photo_share',
                        to: toEmail,
                        customerName: ro.customerName,
                        roId: ro.roId,
                        rv: ro.rv,
                        message,
                        photoUrls: checked
                    })
                });

                const result = await resp.json();
                if (!resp.ok || result.error) throw new Error(result.error || result.message || `HTTP ${resp.status}`);

                document.getElementById('photoEmailModal')?.remove();
                showToast(checked.length + ' photo(s) sent to ' + toEmail + ' successfully!', 'success');
            } catch (err) {
                console.error('Email photos error:', err);
                showToast('Failed to send photos: ' + (err.message || 'Unknown error'), 'error');
                if (btn) { btn.disabled = false; btn.textContent = '📧 Send Photos'; }
            }
        }


        export async function uploadToSupabaseStorage(file, roId, options = {}) {
            log('Uploading to Supabase Storage...');

            // Pre-flight size check — warn before hitting Supabase (500 MB soft limit matches bucket config)
            const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
            if (file.size > MAX_BYTES) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(1);
                throw new Error(`File too large (${sizeMB} MB). Maximum upload size is 500 MB. Please compress the video before uploading.`);
            }

            const ext = file.name.split('.').pop() || 'jpg';
            const folder = roId || 'general';
            const filename = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

            // For document uploads (non-image), omit contentType so the bucket's
            // MIME allowlist does not reject non-image file types. For images, keep
            // the explicit type so previews render correctly.
            const uploadOpts = { upsert: false };
            if (!options.skipContentType) uploadOpts.contentType = file.type;

            const { data, error } = await getSB()
                .storage
                .from('rv-media')
                .upload(filename, file, uploadOpts);

            if (error) {
                console.error('Supabase Storage upload error:', error);
                const msg = error.message || '';
                if (msg.toLowerCase().includes('maximum allowed size') || msg.toLowerCase().includes('exceeded')) {
                    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
                    throw new Error(`Upload failed: This file is too large (${sizeMB} MB). Videos must be under the bucket size limit. Ask your admin to increase the rv-media bucket limit in Supabase Storage settings, or compress the video before uploading.`);
                }
                throw new Error('Upload failed: ' + msg);
            }

            // Get public URL
            const { data: urlData } = getSB().storage.from('rv-media').getPublicUrl(filename);
            const publicUrl = urlData?.publicUrl;

            if (!publicUrl) throw new Error('Could not get public URL after upload');

            log('✅ Uploaded to Supabase Storage:', publicUrl);
            return publicUrl;
        }


        export async function openPhotoMigrationTool() {
            closeAdminSettingsModal();

            const modalHTML = `
                <div id="photoMigrateModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;">
                    <div style="background:white;border-radius:16px;padding:28px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;">
                        <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;font-size:1.5rem;margin-bottom:8px;">🖼️ Migrate Photos to Supabase</h2>
                        <p style="color:#64748b;font-size:0.9rem;margin-bottom:20px;">This tool downloads all RV photos from Google Drive and uploads them to Supabase Storage. Photo URLs in the database will be updated automatically.</p>
                        <div id="migrateStatus" style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:16px;font-size:0.85rem;color:#475569;min-height:60px;">
                            Ready to start. Click Migrate to begin.
                        </div>
                        <div style="background:#e2e8f0;border-radius:8px;height:12px;margin-bottom:16px;overflow:hidden;">
                            <div id="migrateProgress" style="background:linear-gradient(135deg,#10b981,#059669);height:100%;width:0%;transition:width 0.3s;border-radius:8px;"></div>
                        </div>
                        <div id="migrateStats" style="display:flex;gap:16px;margin-bottom:20px;font-size:0.85rem;">
                            <span>✅ Migrated: <strong id="migratedCount">0</strong></span>
                            <span>⏭️ Skipped: <strong id="skippedCount">0</strong></span>
                            <span>❌ Failed: <strong id="failedCount">0</strong></span>
                            <span>📊 Total: <strong id="totalCount">0</strong></span>
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button id="startMigrateBtn" onclick="runPhotoMigration()" style="flex:1;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;">
                                🚀 Start Migration
                            </button>
                            <button onclick="document.getElementById('photoMigrateModal').remove()" style="padding:12px 24px;background:#64748b;color:white;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">
                                Close
                            </button>
                        </div>
                    </div>
                </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }


// ─────────────────────────────────────────────────────────────────────
// [v1.472 S136] RO FILE MANAGEMENT — delete / move / rename photos & docs
//
// Added after a data-integrity investigation (James Kirby + Sofia's ER
// 39b75fab): reused/renamed RO records left the prior customer's uploaded
// files attached (e.g. Marco DeAlba's PDFs stranded on the Rachel & Junior
// Ruiz RO), and there was NO UI to remove or relocate a wrongly-uploaded
// file. Gated to office staff (canManageFiles): Admin / Sr Manager / Manager
// / Parts Manager / Insurance Manager — techs excluded. Storage-clean MOVE:
// the file is COPIED into the target RO's rv-media folder and the source
// object is removed, so folder paths keep matching ro_id (the exact signal
// the audit scan keys off). All actions write audit_log on the affected RO(s).
// ─────────────────────────────────────────────────────────────────────

/** Office-staff gate for destructive file actions (delete/move/rename). Techs excluded. */
function canManageFiles() {
    try {
        return isAdmin() || hasRole('Sr Manager') || hasRole('Manager')
            || hasRole('Parts Manager') || hasRole('Insurance Manager');
    } catch (e) { return false; }
}

/** Resolve a currentFilteredData index to its currentData index (mirrors the upload path). */
function _resolveOrigIndex(filteredIndex) {
    const ro = currentFilteredData[filteredIndex];
    if (!ro) return -1;
    return ro._supabaseId
        ? currentData.findIndex(item => item._supabaseId === ro._supabaseId)
        : currentData.findIndex(item =>
            item.customerName === ro.customerName && item.dateReceived === ro.dateReceived);
}

/** Extract the rv-media storage path from a public URL (null for non-Supabase / Drive URLs). */
function _storagePathFromUrl(url) {
    if (typeof url !== 'string') return null;
    const marker = '/object/public/rv-media/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const raw = url.slice(idx + marker.length).split('?')[0];
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

/** Delete a photo or document from an RO's library (removes storage object best-effort). */
async function deleteLibraryItem(filteredIndex, kind, itemIdx) {
    if (!canManageFiles()) { showToast('You do not have permission to remove files.', 'warning'); return; }
    if (!getSB() || !supabaseSession) { showToast('Session expired — please refresh and sign in again.', 'warning'); return; }
    const oi = _resolveOrigIndex(filteredIndex);
    if (oi === -1) { showToast('Could not find the repair order.', 'error'); return; }

    const roId = currentData[oi].roId;
    const lib = parseLibrary(currentData[oi].photoLibrary || '');
    let removedUrl = '', label = '';
    if (kind === 'photo') {
        if (itemIdx < 0 || itemIdx >= lib.photos.length) return;
        removedUrl = lib.photos[itemIdx]; label = 'Photo';
    } else {
        if (itemIdx < 0 || itemIdx >= lib.docs.length) return;
        removedUrl = lib.docs[itemIdx]?.url || ''; label = lib.docs[itemIdx]?.name || 'Document';
    }
    if (!confirm(`Delete this ${kind === 'photo' ? 'photo' : 'document'} from ${currentData[oi].customerName}'s RO?\n\n${label}\n\nThis cannot be undone.`)) return;

    let mainReassigned = false, newMain = null;
    if (kind === 'photo') {
        lib.photos.splice(itemIdx, 1);
        if (currentData[oi].rvPhotoUrl && currentData[oi].rvPhotoUrl === removedUrl) {
            newMain = lib.photos[0] || ''; mainReassigned = true;
        }
    } else {
        lib.docs.splice(itemIdx, 1);
    }
    const libJson = serializeLibrary(lib);
    currentData[oi].photoLibrary = libJson;
    try {
        if (mainReassigned) { currentData[oi].rvPhotoUrl = newMain; await updatePhotoInSheet(newMain, oi, libJson); }
        else { await updatePhotoLibraryInSheet(libJson, oi); }
    } catch (e) { console.error('Delete DB update failed:', e); showToast('Delete failed: ' + (e.message || e), 'error'); return; }

    const path = _storagePathFromUrl(removedUrl);
    if (path) {
        try { const { error } = await getSB().storage.from('rv-media').remove([path]); if (error) console.warn('Storage remove warning:', error.message); }
        catch (e) { console.warn('Storage remove threw:', e); }
    }
    try { writeAuditLog(roId, [{ field: kind === 'photo' ? 'Photo Deleted' : 'Document Deleted', oldValue: label, newValue: '' }]); } catch (e) {}

    if (currentFilteredData[filteredIndex]) currentFilteredData[filteredIndex].photoLibrary = libJson;
    if (kind === 'photo') closePhotoLightbox();
    showToast(`${label} removed.`, 'success');
    closePhotoLibrary();
    setTimeout(() => openPhotoLibrary(filteredIndex, kind === 'photo' ? 'photos' : 'docs'), 100);
}

/** Rename a document's display name. */
async function renameLibraryDoc(filteredIndex, docIdx) {
    if (!canManageFiles()) { showToast('You do not have permission to edit files.', 'warning'); return; }
    if (!getSB() || !supabaseSession) { showToast('Session expired — please refresh and sign in again.', 'warning'); return; }
    const oi = _resolveOrigIndex(filteredIndex);
    if (oi === -1) return;
    const lib = parseLibrary(currentData[oi].photoLibrary || '');
    if (docIdx < 0 || docIdx >= lib.docs.length) return;
    const current = lib.docs[docIdx].name || 'Document';
    const next = prompt('Rename document:', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    lib.docs[docIdx].name = trimmed;
    const libJson = serializeLibrary(lib);
    currentData[oi].photoLibrary = libJson;
    try { await updatePhotoLibraryInSheet(libJson, oi); }
    catch (e) { showToast('Rename failed: ' + (e.message || e), 'error'); return; }
    try { writeAuditLog(currentData[oi].roId, [{ field: 'Document Renamed', oldValue: current, newValue: trimmed }]); } catch (e) {}
    if (currentFilteredData[filteredIndex]) currentFilteredData[filteredIndex].photoLibrary = libJson;
    showToast('Document renamed.', 'success');
    closePhotoLibrary();
    setTimeout(() => openPhotoLibrary(filteredIndex, 'docs'), 100);
}

/** Open the "move to another RO" target picker. */
function openMoveFileModal(filteredIndex, kind, itemIdx) {
    if (!canManageFiles()) { showToast('You do not have permission to move files.', 'warning'); return; }
    const oi = _resolveOrigIndex(filteredIndex);
    if (oi === -1) return;
    const srcRoId = currentData[oi].roId;
    window._moveCtx = { filteredIndex, kind, itemIdx, srcRoId };

    const candidates = currentData
        .map(d => ({ roId: d.roId, name: d.customerName || '(no name)', rv: d.rv || '', status: d.status || '', deleted: !!d.deletedAt }))
        .filter(c => c.roId && c.roId !== srcRoId && !c.deleted)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const rowsHtml = candidates.map(c => {
        const search = `${c.name} ${c.roId} ${c.rv}`.toLowerCase().replace(/"/g, '');
        return `<button class="move-ro-row" data-search="${escapeHtml(search)}" onclick="moveLibraryItem('${c.roId}')" style="display:block;width:100%;text-align:left;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;">
            <div style="font-weight:700;color:#1e293b;font-size:13px;">${escapeHtml(c.name)}</div>
            <div style="font-size:11px;color:#64748b;">${escapeHtml(c.roId)} · ${escapeHtml(c.rv)} · ${escapeHtml(c.status)}</div>
        </button>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'moveFileModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10012;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div style="background:white;border-radius:16px;padding:24px;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h2 style="color:#1e293b;font-family:'Barlow Condensed',sans-serif;margin:0;font-size:1.3rem;">➡️ Move ${kind === 'photo' ? 'photo' : 'document'} to another RO</h2>
                <button onclick="document.getElementById('moveFileModal').remove()" style="background:#64748b;color:white;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600;">✕</button>
            </div>
            <input id="moveRoSearch" type="text" placeholder="Search customer or RO#..." oninput="_filterMoveList(this.value)" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
            <div id="moveRoList" style="overflow-y:auto;flex:1;">${rowsHtml || '<p style="color:#64748b;text-align:center;padding:20px;">No other ROs available.</p>'}</div>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => { const s = document.getElementById('moveRoSearch'); if (s) s.focus(); }, 60);
}

/** Client-side filter for the move-target list. */
function _filterMoveList(q) {
    const query = (q || '').toLowerCase().trim();
    document.querySelectorAll('#moveRoList .move-ro-row').forEach(row => {
        const s = row.getAttribute('data-search') || '';
        row.style.display = (!query || s.includes(query)) ? 'block' : 'none';
    });
}

/** Move the file selected in window._moveCtx to the chosen target RO (storage copy + relink). */
async function moveLibraryItem(targetRoId) {
    const ctx = window._moveCtx;
    if (!ctx) return;
    if (!canManageFiles()) { showToast('You do not have permission to move files.', 'warning'); return; }
    if (!getSB() || !supabaseSession) { showToast('Session expired — please refresh and sign in again.', 'warning'); return; }
    const { filteredIndex, kind, itemIdx, srcRoId } = ctx;
    if (targetRoId === srcRoId) { showToast('That is the same RO.', 'warning'); return; }

    const srcOi = _resolveOrigIndex(filteredIndex);
    const tgtOi = currentData.findIndex(d => d.roId === targetRoId);
    if (srcOi === -1 || tgtOi === -1) { showToast('Could not resolve source or target RO.', 'error'); return; }

    const isDoc = kind === 'doc';
    const srcLib = parseLibrary(currentData[srcOi].photoLibrary || '');
    let item = null, url = '';
    if (isDoc) {
        if (itemIdx < 0 || itemIdx >= srcLib.docs.length) return;
        item = srcLib.docs[itemIdx]; url = item.url;
    } else {
        if (itemIdx < 0 || itemIdx >= srcLib.photos.length) return;
        url = srcLib.photos[itemIdx];
    }
    const label = isDoc ? (item.name || 'Document') : 'Photo';
    if (!confirm(`Move this ${isDoc ? 'document' : 'photo'} to ${currentData[tgtOi].customerName} (${targetRoId})?\n\n${label}`)) return;

    // 1) Copy the file into the target RO's folder so paths stay clean (rv-media only).
    let newUrl = url;
    const srcPath = _storagePathFromUrl(url);
    if (srcPath) {
        try {
            const base = srcPath.split('/').pop();
            const destPath = isDoc ? `${targetRoId}/docs/${Date.now()}_${base}` : `${targetRoId}/${Date.now()}_${base}`;
            const { error: copyErr } = await getSB().storage.from('rv-media').copy(srcPath, destPath);
            if (copyErr) throw new Error('Storage copy failed: ' + copyErr.message);
            const { data: urlData } = getSB().storage.from('rv-media').getPublicUrl(destPath);
            newUrl = urlData?.publicUrl || url;
        } catch (e) { console.error(e); showToast(e.message || 'Move failed during file copy.', 'error'); return; }
    }

    // 2) Add to target library.
    const tgtLib = parseLibrary(currentData[tgtOi].photoLibrary || '');
    if (isDoc) tgtLib.docs.push({ url: newUrl, name: item.name || 'Document', type: item.type || 'doc', addedDate: item.addedDate || new Date().toISOString().slice(0, 10) });
    else tgtLib.photos.push(newUrl);
    const tgtJson = serializeLibrary(tgtLib);
    currentData[tgtOi].photoLibrary = tgtJson;

    // 3) Remove from source library (+ reassign source main photo if needed).
    let srcMainReassigned = false, srcNewMain = null;
    if (isDoc) { srcLib.docs.splice(itemIdx, 1); }
    else {
        srcLib.photos.splice(itemIdx, 1);
        if (currentData[srcOi].rvPhotoUrl && currentData[srcOi].rvPhotoUrl === url) { srcNewMain = srcLib.photos[0] || ''; srcMainReassigned = true; }
    }
    const srcJson = serializeLibrary(srcLib);
    currentData[srcOi].photoLibrary = srcJson;

    try {
        await updatePhotoLibraryInSheet(tgtJson, tgtOi);
        if (srcMainReassigned) { currentData[srcOi].rvPhotoUrl = srcNewMain; await updatePhotoInSheet(srcNewMain, srcOi, srcJson); }
        else { await updatePhotoLibraryInSheet(srcJson, srcOi); }
    } catch (e) { console.error('Move DB update failed:', e); showToast('Move failed while saving: ' + (e.message || e), 'error'); return; }

    // 4) Delete the source storage object now that the copy + relink succeeded (best-effort).
    if (srcPath) {
        try { const { error } = await getSB().storage.from('rv-media').remove([srcPath]); if (error) console.warn('Source storage remove warning:', error.message); }
        catch (e) { console.warn('Source storage remove threw:', e); }
    }
    try {
        writeAuditLog(srcRoId, [{ field: isDoc ? 'Document Moved Out' : 'Photo Moved Out', oldValue: `${label} → ${targetRoId}`, newValue: '' }]);
        writeAuditLog(targetRoId, [{ field: isDoc ? 'Document Moved In' : 'Photo Moved In', oldValue: '', newValue: `${label} ← ${srcRoId}` }]);
    } catch (e) {}

    if (currentFilteredData[filteredIndex]) currentFilteredData[filteredIndex].photoLibrary = srcJson;
    document.getElementById('moveFileModal')?.remove();
    if (!isDoc) closePhotoLightbox();
    showToast(`${label} moved to ${currentData[tgtOi].customerName}.`, 'success');
    closePhotoLibrary();
    setTimeout(() => openPhotoLibrary(filteredIndex, isDoc ? 'docs' : 'photos'), 100);
}


// ---- Window bridge (Phase 10 additive) ----
Object.assign(window, {
  uploadPhoto,
  openPhotoLibrary,
  switchLibTab,
  uploadDocument,
  closePhotoLibrary,
  setMainPhoto,
  openPhotoLightbox,
  navigateLightbox,
  closePhotoLightbox,
  openPhotoEmailModal,
  sendPhotosToCustomer,
  uploadToSupabaseStorage,
  openPhotoMigrationTool,
  // [v1.472 S136] RO file management
  canManageFiles,
  deleteLibraryItem,
  renameLibraryDoc,
  openMoveFileModal,
  _filterMoveList,
  moveLibraryItem,
});
