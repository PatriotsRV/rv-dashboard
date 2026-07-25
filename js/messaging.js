// js/messaging.js — PRVS Dashboard customer messaging (GH#39, Textly)
// Session 131, 2026-07-04 (Project Blue). S151, 2026-07-21: TEXTLY PIVOT —
// sends now go through the `textly-send` edge function (Textly = Vested
// Networks' white-label of Textable), from 940-488-5047, the same line all
// the imported Kenect history lives on. Same request/response contract as
// projectblue-send, so this swap is endpoint-name + provider-copy only.
// Inbound is captured by the `textly-webhook` edge fn (relayWebhook ingest).
//
// Thread model unchanged — LOCKED threading decision from
// docs/specs/MESSAGING_AUTOMATION_SPEC.md §3: **customer-inbox, RO-tagged** —
// one conversation per customer phone. loadMessages pulls rows matching the
// RO id OR the customer's phone (both directions), merged chronologically.
//
// RETIRED S151: the PB engagement warning (S144). Textly sends from the line
// the customers have been texting for years, so the "may never arrive" trap
// is gone. pbEngagement()/pbEngagementBannerHtml() are kept as no-op exports
// so both render surfaces (modal + messages.html) drop the banner without a
// coordinated markup change; delete them in a later cleanup pass.
//
// Conventions: window-bridge pattern (Object.assign at bottom) like the other
// modules; reads bare globals getSB / currentUser / showToast / escapeHtml /
// log / supabaseSession that app.js + the inline bootstrap attach to window.

import { SUPABASE_URL, SUPABASE_ANON_KEY, PRVS_FUNCTION_SECRET, PB_LINE_E164, KENECT_LINE_E164 } from './config.js';

        // ── PB engagement (S144) — RETIRED S151 (Textly pivot) ──────
        // The S144 warning existed because Project Blue silently swallowed
        // outbound to any number that had never texted the PB line (evidence
        // S144: 3/3 never-engaged sends stuck; the S142 Kenect import made
        // 99.3% of threads look warm while cold to PB). Textly sends from
        // 940-488-5047 — the very line all that history arrived on — so the
        // trap no longer exists. Kept as no-op exports so the two render
        // surfaces (RO modal + messages.html) drop the banner without a
        // coordinated markup change. Delete both in a later cleanup pass.
        function _last10(v) { return String(v || '').replace(/\D/g, '').slice(-10); }

        export function pbEngagement(rows) {
            // Historical shape preserved; always reads as engaged now.
            const kenectLine = _last10(KENECT_LINE_E164);
            const inbound = (rows || []).filter(m => (m.direction || '') === 'inbound');
            const onKenect = inbound.filter(m => _last10(m.phone_to) === kenectLine);
            return {
                engaged: true, // Textly = same line as the history; everyone is reachable
                lastPbInboundAt: null,
                kenectOnly: false,
                kenectInboundCount: onKenect.length,
            };
        }

        // RETIRED S151: always '' — Textly has no engagement gate.
        export function pbEngagementBannerHtml(_state) {
            return '';
        }

        // Best-effort E.164 normalization for US numbers. The modal lets the
        // user correct it, so this only has to be a sensible default.
        function _toE164(raw) {
            if (!raw) return '';
            const trimmed = String(raw).trim();
            if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/[^\d]/g, '');
            const digits = trimmed.replace(/[^\d]/g, '');
            if (digits.length === 10) return '+1' + digits;
            if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
            return digits ? '+' + digits : '';
        }

        function _statusChip(m) {
            const s = (m.status || '').toLowerCase();
            const map = {
                queued:   ['#9ca3af', 'Queued'],
                sent:     ['#3b82f6', 'Sent'],
                delivered:['#22c55e', 'Delivered'],
                read:     ['#22c55e', 'Read ✓✓'],
                received: ['#a855f7', 'Received'],
                failed:   ['#ef4444', 'Failed'],
                error:    ['#ef4444', 'Error'],
            };
            const [color, label] = map[s] || ['#9ca3af', m.status || ''];
            return `<span style="font-size:0.62rem; color:${color}; font-weight:700;">${escapeHtml(label)}</span>`;
        }

        function _bubble(m) {
            const outbound = (m.direction || 'outbound') === 'outbound';
            const when = m.created_at ? new Date(m.created_at).toLocaleString('en-US', { month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' }) : '';
            const align = outbound ? 'flex-end' : 'flex-start';
            const bg = outbound ? 'rgba(59,130,246,0.16)' : 'rgba(148,163,184,0.16)';
            const border = outbound ? 'rgba(59,130,246,0.4)' : 'rgba(148,163,184,0.35)';
            const err = m.error_message ? `<div style="font-size:0.62rem; color:#ef4444; margin-top:3px;">${escapeHtml(m.error_message)}</div>` : '';
            const roTag = (!outbound || m.ro_code) && m.ro_code
                ? `<span style="font-size:0.6rem; font-family:'JetBrains Mono',monospace; color:var(--accent-info);">${escapeHtml(m.ro_code)}</span>` : '';
            // Inbound MMS render (S138, spec P3): media_url is text[] — the
            // reconciliation poll backfills PB's media_attachment_url.
            const mediaList = Array.isArray(m.media_url) ? m.media_url : (m.media_url ? [m.media_url] : []);
            // S158 (ER d62a26e4): PDFs render as a document chip, not a broken <img>.
            const media = mediaList.filter(Boolean).map(u => {
                const isPdf = /\.pdf(\?|#|$)/i.test(String(u).split('?')[0]) || /\.pdf(\?|#|$)/i.test(String(u));
                if (isPdf) {
                    const name = decodeURIComponent(String(u).split('?')[0].split('/').pop() || 'document.pdf');
                    return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:6px 10px; border:1px solid var(--border-color); border-radius:8px; font-size:0.78rem; color:var(--accent-info); text-decoration:none; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u{1F4C4} ${escapeHtml(name)}</a>`;
                }
                return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="attachment" loading="lazy" style="max-width:200px; max-height:200px; border-radius:8px; display:block; margin-top:6px;"></a>`;
            }).join('');
            return `
                <div style="display:flex; justify-content:${align}; margin-bottom:8px;">
                    <div style="max-width:78%; background:${bg}; border:1px solid ${border}; border-radius:12px; padding:8px 11px;">
                        <div style="font-size:0.85rem; color:var(--text-primary); white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body || '')}</div>
                        ${media}
                        <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:4px;">
                            ${roTag}
                            <span style="font-size:0.62rem; color:var(--text-secondary);">${escapeHtml(when)}</span>
                            ${outbound ? _statusChip(m) : ''}
                        </div>
                        ${err}
                    </div>
                </div>`;
        }

        // Exported for messages.html (S138 PB inbox) — same renderer, one source.
        export function bubbleHtml(m) { return _bubble(m); }

        // S142 (Kenect import): media_url entries that aren't http(s) are bare
        // PRIVATE-bucket storage paths ('kenect-media/<convId>/<msgId>-<attId>.ext').
        // Resolve them to short-lived signed URLs before render, batched per
        // bucket. PB-hosted entries (https) pass through untouched.
        async function _resolveMediaUrls(rows) {
            const byBucket = {};
            rows.forEach(m => {
                const list = Array.isArray(m.media_url) ? m.media_url : (m.media_url ? [m.media_url] : []);
                list.forEach(u => {
                    if (u && !/^https?:/i.test(u)) {
                        const i = u.indexOf('/');
                        if (i > 0) (byBucket[u.slice(0, i)] = byBucket[u.slice(0, i)] || new Set()).add(u.slice(i + 1));
                    }
                });
            });
            const signed = {}; // 'bucket/path' -> signed URL
            for (const [bucket, paths] of Object.entries(byBucket)) {
                try {
                    const { data, error } = await getSB().storage.from(bucket).createSignedUrls([...paths], 3600);
                    if (error) { console.error('media signed-URL error:', error); continue; }
                    (data || []).forEach(d => { if (d.signedUrl && d.path) signed[bucket + '/' + d.path] = d.signedUrl; });
                } catch (e) { console.error('media signed-URL error:', e); }
            }
            rows.forEach(m => {
                if (!m.media_url) return;
                const list = Array.isArray(m.media_url) ? m.media_url : [m.media_url];
                m.media_url = list.map(u => signed[u] || u);
            });
            return rows;
        }

        // Customer-inbox thread (spec §3): rows tagged to this RO OR involving
        // this customer's phone, both directions, oldest first.
        export async function loadMessages(roSupabaseId, phoneE164) {
            if (!getSB()) return [];
            const phone = phoneE164 ? String(phoneE164).trim() : '';
            let query = getSB().from('messages').select('*');
            const ors = [];
            if (roSupabaseId) ors.push(`ro_id.eq.${roSupabaseId}`);
            if (phone) {
                ors.push(`phone_to.eq.${phone}`);
                ors.push(`phone_from.eq.${phone}`);
            }
            if (!ors.length) return [];
            // S142: fetch NEWEST 200 then reverse to chronological. Was
            // ascending+limit — which returned the OLDEST 200, so imported
            // Kenect threads (deepest = 2,087 msgs) would have hidden all
            // recent messages.
            const { data, error } = await query
                .or(ors.join(','))
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) { console.error('loadMessages error:', error); return []; }
            const rows = (data || []).reverse();
            return _resolveMediaUrls(rows);
        }

        async function _refreshThread(roSupabaseId, phoneE164) {
            const threadEl = document.getElementById('msgThread');
            if (!threadEl) return;
            const liveFilter = document.getElementById('msgPhone');
            const phone = liveFilter && liveFilter.value ? _toE164(liveFilter.value) : phoneE164;
            const msgs = await loadMessages(roSupabaseId, phone);
            threadEl.innerHTML = msgs.length
                ? msgs.map(_bubble).join('')
                : '<div style="text-align:center; color:var(--text-secondary); font-size:0.82rem; padding:24px 0;">No messages yet. Send the first one below.</div>';
            threadEl.scrollTop = threadEl.scrollHeight;
            // S144: warn BEFORE they type, not after they send.
            const warnEl = document.getElementById('msgPbWarn');
            if (warnEl) warnEl.innerHTML = pbEngagementBannerHtml(pbEngagement(msgs));
        }

        // ── S151b: composer extras — 📎 MMS attach, 😊 emoji, ✍️ signature ──
        // Shared by BOTH send surfaces (RO modal below + messages.html): the
        // markup uses fixed element ids, initComposerExtras() wires whichever
        // instance is currently in the DOM, and sendCustomerMessage() reads
        // the module-level state. One implementation, two composers.
        // S158 (ER d62a26e4): MULTI-attach — up to 5 photos and/or PDFs per
        // send (textly-send v1.1 already takes media_url as an array; this was
        // client-side single-file only). Images compress as before; PDFs pass
        // through untouched under the same 5MB MMS gate.
        let _msgAttachments = [];    // [{ url, name }] after successful uploads
        let _mySig;                  // undefined = not loaded · null = none · string = signature

        const MSG_MEDIA_BUCKET = 'message-media';
        const MSG_MEDIA_MAX_BYTES = 5 * 1024 * 1024; // MMS carrier ceiling; we compress toward ~1MB
        const MSG_MEDIA_MAX_COUNT = 5;               // S158: per-send attachment cap

        const COMPOSER_EMOJIS = ['\u{1F44D}','\u{1F44C}','\u{1F64F}','\u{1F44F}','\u{1F4AA}','\u{1F91D}','\u{1F44B}','✅','\u{1F389}','⭐','\u{1F525}','❤️','\u{1F600}','\u{1F601}','\u{1F602}','\u{1F605}','\u{1F642}','\u{1F609}','\u{1F60E}','\u{1F914}','\u{1F62E}','\u{1F622}','⚠️','❗','❓','\u{1F4C5}','⏰','\u{1F4DE}','\u{1F4AC}','\u{1F4B0}','\u{1F9FE}','\u{1F527}','\u{1F529}','\u{1F6E0}️','\u{1F690}','\u{1F3D5}️','☀️','\u{1F327}️','\u{1F4F7}','\u{1F4CE}'];

        // Markup injected under the textarea (modal builds it inline;
        // messages.html carries the same block statically).
        export function composerExtrasHtml() {
            return `
                <div id="msgExtrasRow" style="position:relative; display:flex; align-items:center; gap:10px; margin:8px 0 10px;">
                    <button type="button" id="msgAttachBtn" title="Attach photos or PDFs (MMS, up to 5)" style="background:transparent; border:1px solid var(--border-color); border-radius:6px; padding:3px 9px; font-size:0.85rem; cursor:pointer; color:var(--text-secondary);">\u{1F4CE}</button>
                    <button type="button" id="msgEmojiBtn" title="Insert emoji" style="background:transparent; border:1px solid var(--border-color); border-radius:6px; padding:3px 9px; font-size:0.85rem; cursor:pointer; color:var(--text-secondary);">\u{1F60A}</button>
                    <span id="msgAttachChip" style="display:none; flex-wrap:wrap; align-items:center; gap:6px; font-size:0.72rem; color:var(--accent-info); max-width:340px;"></span>
                    <input type="file" id="msgAttach" accept="image/*,application/pdf" multiple style="display:none;">
                    <div id="msgEmojiPop" style="display:none; position:absolute; bottom:34px; left:0; z-index:50; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; padding:8px; width:266px; box-shadow:0 8px 24px rgba(0,0,0,0.45);"></div>
                </div>
                <div id="msgSigPreview" style="display:none; font-size:0.7rem; color:var(--text-secondary); border-left:2px solid var(--border-color); padding:2px 0 2px 8px; margin:-2px 0 8px; white-space:pre-wrap;"></div>`;
        }

        async function _loadMySignature() {
            if (_mySig !== undefined) return _mySig;
            _mySig = null;
            try {
                const email = (typeof currentUser !== 'undefined' && currentUser?.email) || null;
                if (email && getSB()) {
                    const { data, error } = await getSB().from('staff')
                        .select('sms_signature').eq('email', email).maybeSingle();
                    if (!error && data?.sms_signature && String(data.sms_signature).trim()) {
                        _mySig = String(data.sms_signature).replace(/\r\n/g, '\n').trim();
                    }
                }
            } catch (e) { console.error('signature load failed (sending without):', e); }
            return _mySig;
        }

        export async function refreshSignaturePreview() {
            const el = document.getElementById('msgSigPreview');
            if (!el) return;
            const sig = await _loadMySignature();
            if (sig) {
                el.textContent = '✍️ Added to every send:\n' + sig;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }

        function _renderAttachChip() {
            const chip = document.getElementById('msgAttachChip');
            if (!chip) return;
            if (_msgAttachments.length) {
                chip.style.display = 'inline-flex';
                chip.innerHTML = _msgAttachments.map((a, i) => {
                    const icon = /\.pdf$/i.test(a.name || '') ? '\u{1F4C4}' : '\u{1F5BC}️';
                    return `<span style="display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(96,165,250,0.4); border-radius:6px; padding:2px 8px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${icon} ${escapeHtml(a.name)} <a href="#" class="msgAttachRm" data-idx="${i}" title="Remove attachment" style="color:#ef4444; text-decoration:none; font-weight:700;">&times;</a></span>`;
                }).join('');
                chip.querySelectorAll('.msgAttachRm').forEach(el => el.addEventListener('click', (e) => {
                    e.preventDefault();
                    _msgAttachments.splice(parseInt(el.dataset.idx, 10), 1);
                    _renderAttachChip();
                }));
            } else {
                chip.style.display = 'none';
                chip.innerHTML = '';
            }
        }

        // Downscale big images toward MMS-friendly size (max edge 1600px, JPEG).
        async function _compressImage(file) {
            if (!/^image\//.test(file.type) || file.type === 'image/gif' || file.size < 1.5 * 1024 * 1024) return file;
            try {
                const bmp = await createImageBitmap(file);
                const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bmp.width * scale);
                canvas.height = Math.round(bmp.height * scale);
                canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
                if (blob && blob.size < file.size) {
                    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
                }
            } catch (e) { console.error('image compress failed (using original):', e); }
            return file;
        }

        async function _handleAttachPick(ev) {
            // S158 (ER d62a26e4): multi-file — the picker allows several at once,
            // and repeat picks ADD to the pending set (up to MSG_MEDIA_MAX_COUNT).
            const files = Array.from(ev.target.files || []);
            ev.target.value = '';
            if (!files.length) return;
            if (!getSB() || (typeof supabaseSession === 'undefined' || !supabaseSession)) {
                showToast('Sign in first to attach files.', 'warning'); return;
            }
            const room = MSG_MEDIA_MAX_COUNT - _msgAttachments.length;
            if (room <= 0) {
                showToast(`Max ${MSG_MEDIA_MAX_COUNT} attachments per message — remove one first.`, 'warning');
                return;
            }
            if (files.length > room) {
                showToast(`Only ${room} more attachment${room === 1 ? '' : 's'} fit (max ${MSG_MEDIA_MAX_COUNT}) — attaching the first ${room}.`, 'warning', { duration: 6000 });
            }
            const btn = document.getElementById('msgAttachBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
            try {
                for (const file of files.slice(0, room)) {
                    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
                    // PDFs pass through untouched; images compress toward MMS size.
                    const upload = isPdf ? file : await _compressImage(file);
                    if (upload.size > MSG_MEDIA_MAX_BYTES) {
                        showToast(`"${upload.name}" is over 5MB${isPdf ? '' : ' even after compression'} - MMS carriers will reject it. Skipped.`, 'warning', { duration: 8000 });
                        continue;
                    }
                    const safe = (upload.name || (isPdf ? 'document.pdf' : 'photo.jpg')).replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
                    const path = `mms/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
                    const { error: upErr } = await getSB().storage.from(MSG_MEDIA_BUCKET)
                        .upload(path, upload, { contentType: upload.type || (isPdf ? 'application/pdf' : undefined), upsert: false });
                    if (upErr) { showToast(`Upload failed for "${upload.name}": ` + upErr.message, 'error', { duration: 8000 }); continue; }
                    const { data: pub } = getSB().storage.from(MSG_MEDIA_BUCKET).getPublicUrl(path);
                    if (!pub?.publicUrl) { showToast(`"${upload.name}" uploaded but no public URL came back.`, 'error'); continue; }
                    _msgAttachments.push({ url: pub.publicUrl, name: upload.name || (isPdf ? 'document' : 'photo') });
                }
                _renderAttachChip();
            } catch (e) {
                console.error('attach failed:', e);
                showToast('Attach failed: ' + e.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '\u{1F4CE}'; }
            }
        }

        function _buildEmojiPop() {
            const pop = document.getElementById('msgEmojiPop');
            if (!pop) return;
            pop.innerHTML = COMPOSER_EMOJIS.map(e =>
                `<button type="button" class="msg-emoji-opt" data-e="${e}" style="background:transparent; border:none; font-size:1.25rem; padding:3px; cursor:pointer; line-height:1;">${e}</button>`).join('');
            pop.querySelectorAll('.msg-emoji-opt').forEach(b => b.addEventListener('click', () => {
                const ta = document.getElementById('msgBody');
                if (ta) {
                    const s = ta.selectionStart ?? ta.value.length;
                    ta.value = ta.value.slice(0, s) + b.dataset.e + ta.value.slice(ta.selectionEnd ?? s);
                    ta.focus();
                    ta.selectionStart = ta.selectionEnd = s + b.dataset.e.length;
                }
                pop.style.display = 'none';
            }));
        }

        // Wire the composer-extras instance currently in the DOM. Safe to call
        // repeatedly (modal re-opens); it re-binds the fresh elements.
        export function initComposerExtras() {
            _msgAttachments = []; // S158: multi-attach reset
            document.getElementById('msgAttachBtn')?.addEventListener('click', () => document.getElementById('msgAttach')?.click());
            document.getElementById('msgAttach')?.addEventListener('change', _handleAttachPick);
            const emojiBtn = document.getElementById('msgEmojiBtn');
            const pop = document.getElementById('msgEmojiPop');
            if (emojiBtn && pop) {
                _buildEmojiPop();
                emojiBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
                });
                document.addEventListener('click', (e) => {
                    if (pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== emojiBtn) pop.style.display = 'none';
                });
            }
            _renderAttachChip();
            refreshSignaturePreview();
        }

        export async function openMessagesModal(ro) {
            if (!ro) { showToast('Open a repair order first, then click Message Customer.', 'warning'); return; }
            if (!getSB()) { showToast('Please connect to the PRVS database first.', 'warning'); return; }

            const roSupabaseId = ro._supabaseId || null;
            const roCode = ro.roId || '';
            const defaultPhone = _toE164(ro.customerPhone);

            document.getElementById('messagesModal')?.remove();
            const modal = document.createElement('div');
            modal.id = 'messagesModal';
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:520px;">
                    <div class="modal-header">
                        <h2 class="modal-title">\u{1F4AC} Message Customer</h2>
                        <button class="modal-close" onclick="closeMessagesModal()">&times;</button>
                    </div>
                    <div style="padding-bottom:10px; margin-bottom:12px; border-bottom:1px solid var(--border-color); font-size:0.85rem; color:var(--text-secondary);">
                        <strong style="color:var(--text-primary);">${escapeHtml(ro.customerName || 'Customer')}</strong>
                        ${ro.rv ? ' · ' + escapeHtml(ro.rv) : ''}
                        ${roCode ? ` · <span style="font-family:'JetBrains Mono',monospace; color:var(--accent-info); font-size:0.78rem;">${escapeHtml(roCode)}</span>` : ''}
                    </div>
                    <label style="display:block; font-size:0.72rem; color:var(--text-secondary); margin-bottom:4px;">Send to (E.164)</label>
                    <input type="tel" id="msgPhone" class="form-input" value="${escapeHtml(defaultPhone)}" placeholder="+12145551234" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:0.72rem; color:var(--text-secondary);">Conversation (all this customer's messages)</span>
                        <button type="button" onclick="refreshMessagesThread('${roSupabaseId || ''}', '${escapeHtml(defaultPhone)}')" title="Check for new replies" style="background:transparent; border:1px solid var(--border-color); border-radius:6px; padding:2px 8px; font-size:0.68rem; color:var(--text-secondary); cursor:pointer;">\u{1F504} Refresh</button>
                    </div>
                    <div id="msgThread" style="max-height:240px; overflow-y:auto; padding:6px 2px; margin-bottom:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary);">
                        <div style="text-align:center; color:var(--text-secondary); font-size:0.82rem; padding:24px 0;">Loading…</div>
                    </div>
                    <div id="msgPbWarn"></div>
                    <textarea id="msgBody" class="form-input" rows="3" placeholder="Type a message to the customer…" style="resize:vertical; margin-bottom:10px;"></textarea>
                    ${composerExtrasHtml()}
                    <div style="display:flex; gap:10px;">
                        <button onclick="closeMessagesModal()" style="flex:0 0 auto; padding:10px 16px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.85rem;">Cancel</button>
                        <button id="msgSendBtn" onclick="sendCustomerMessage('${roSupabaseId || ''}', '${roCode}')" style="flex:1; padding:10px; border-radius:8px; border:1.5px solid rgba(59,130,246,0.5); background:rgba(59,130,246,0.12); color:#3b82f6; cursor:pointer; font-size:0.9rem; font-weight:700;">\u{1F4E4} Send</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            initComposerExtras(); // S151b: wire attach/emoji/signature for this instance
            _refreshThread(roSupabaseId, defaultPhone);
        }

        export function closeMessagesModal() {
            document.getElementById('messagesModal')?.remove();
        }

        export function refreshMessagesThread(roSupabaseId, phoneE164) {
            _refreshThread(roSupabaseId || null, phoneE164 || '');
        }

        export async function sendCustomerMessage(roSupabaseId, roCode) {
            const phoneEl = document.getElementById('msgPhone');
            const bodyEl = document.getElementById('msgBody');
            const btn = document.getElementById('msgSendBtn');
            if (!phoneEl || !bodyEl) return;

            const phone = _toE164(phoneEl.value);
            let body = (bodyEl.value || '').trim();
            if (!phone || phone.length < 11) { showToast('Enter a valid phone number in +1XXXXXXXXXX format.', 'warning'); return; }
            // S151b: a photo with no text is a valid MMS. S158: multi-attach.
            if (!body && !_msgAttachments.length) { showToast('Type a message (or attach a photo/PDF) first.', 'warning'); return; }

            // S151b: per-user signature (staff.sms_signature) auto-appends —
            // the preview under the composer shows exactly what will be added.
            const sig = await _loadMySignature();
            if (sig && body && !body.endsWith(sig)) body = body + '\n\n' + sig;
            if (sig && !body) body = sig; // photo-only send still signs

            if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
            try {
                // S158a (Roland live test): ONE MEDIA PER MMS. A 5-image bundle went
                // out as one Textly send with media[5] — Textly accepted it but only
                // 1 image reached the handset (carriers cap TOTAL MMS payload ~1MB
                // and silently strip the rest). So we now chunk like phones do:
                // send #1 = text (+signature) + first attachment; each remaining
                // attachment goes as its own media-only follow-up MMS.
                const sends = [];
                if (_msgAttachments.length === 0) {
                    sends.push({ body, media_url: null });
                } else {
                    sends.push({ body, media_url: _msgAttachments[0].url });
                    for (let i = 1; i < _msgAttachments.length; i++) {
                        sends.push({ body: '', media_url: _msgAttachments[i].url });
                    }
                }
                let sentCount = 0;
                for (let i = 0; i < sends.length; i++) {
                    if (btn && sends.length > 1) btn.textContent = `Sending ${i + 1}/${sends.length}…`;
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/textly-send`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${(typeof supabaseSession !== 'undefined' && supabaseSession?.access_token) ? supabaseSession.access_token : SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json',
                            'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                        },
                        body: JSON.stringify({
                            action: 'send',
                            to: phone,
                            body: sends[i].body,
                            ro_id: roSupabaseId || null,
                            ro_code: roCode || null,
                            sent_by: (currentUser && currentUser.email) || null,
                            context: 'ro_customer',
                            media_url: sends[i].media_url,
                        }),
                    });
                    const data = await res.json().catch(() => ({}));

                    if (res.status === 503) {
                        showToast('Textly is not configured yet (TEXTLY_API_TOKEN not set on the project).', 'warning', { duration: 9000 });
                        return;
                    }
                    if (res.status === 403 && data.opted_out) {
                        // STOP gate (S138): customer texted STOP; server refuses sends.
                        showToast('\u{1F6D1} ' + (data.error || 'This customer opted out of texts (STOP). Sends are blocked until they reply START.'), 'error', { duration: 10000 });
                        return;
                    }
                    if (!res.ok || data.ok === false) {
                        const detail = data.error || data.textly?.error || `HTTP ${res.status}`;
                        showToast(`Send failed${sentCount ? ` after ${sentCount} of ${sends.length} parts` : ''}: ` + detail, 'error', { duration: 9000 });
                        log('❌ Textly send failed: ' + JSON.stringify(data));
                        return;
                    }
                    sentCount++;
                    log('✅ Textly send ok (' + sentCount + '/' + sends.length + '): ' + (data.message_handle || data.status || ''));
                }

                bodyEl.value = '';
                _msgAttachments = []; _renderAttachChip(); // S151b/S158: clear after send
                showToast(sends.length > 1 ? `Message sent (${sends.length} parts — 1 per attachment).` : 'Message sent.', 'success');
                _refreshThread(roSupabaseId, phone);
            } catch (err) {
                console.error('sendCustomerMessage error:', err);
                showToast('Send error: ' + err.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '\u{1F4E4} Send'; }
            }
        }

// ---- Window bridge (GH#39 messaging, additive) ----
Object.assign(window, {
  openMessagesModal,
  closeMessagesModal,
  refreshMessagesThread,
  sendCustomerMessage,
  initComposerExtras,      // S151b
  refreshSignaturePreview, // S151b
});
