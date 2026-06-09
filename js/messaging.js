// js/messaging.js — PRVS Dashboard Sendblue messaging (GH#39 Phase 2 POC)
// Session 98, 2026-06-09.
//
// Outbound-only proof-of-concept: from an RO's detail view, send an
// iMessage/SMS to the customer through the `sendblue-send` edge function and
// log it to the `messages` table, rendering the thread for that RO. This
// fills the messaging hole left when Kenect was removed (v1.445).
//
// DEFERRED to a later Phase 2 step (pending Sendblue answers on webhook auth,
// status callbacks, and media — Q6-Q8 from the 2026-06-09 vendor call):
//   - inbound reply routing (sendblue-webhook)
//   - delivery / read status updates
//   - MMS / image attachments
//
// Conventions: window-bridge pattern (Object.assign at bottom) like the other
// modules; reads bare globals getSB / currentUser / showToast / escapeHtml /
// log / supabaseSession that app.js + the inline bootstrap attach to window.

import { SUPABASE_URL, SUPABASE_ANON_KEY, PRVS_FUNCTION_SECRET } from './config.js';

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
            return `
                <div style="display:flex; justify-content:${align}; margin-bottom:8px;">
                    <div style="max-width:78%; background:${bg}; border:1px solid ${border}; border-radius:12px; padding:8px 11px;">
                        <div style="font-size:0.85rem; color:var(--text-primary); white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body || '')}</div>
                        <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:4px;">
                            <span style="font-size:0.62rem; color:var(--text-secondary);">${escapeHtml(when)}</span>
                            ${outbound ? _statusChip(m) : ''}
                        </div>
                        ${err}
                    </div>
                </div>`;
        }

        export async function loadMessages(roSupabaseId) {
            if (!getSB() || !roSupabaseId) return [];
            const { data, error } = await getSB()
                .from('messages')
                .select('*')
                .eq('ro_id', roSupabaseId)
                .order('created_at', { ascending: true });
            if (error) { console.error('loadMessages error:', error); return []; }
            return data || [];
        }

        async function _refreshThread(roSupabaseId) {
            const threadEl = document.getElementById('sbThread');
            if (!threadEl) return;
            const msgs = await loadMessages(roSupabaseId);
            threadEl.innerHTML = msgs.length
                ? msgs.map(_bubble).join('')
                : '<div style="text-align:center; color:var(--text-secondary); font-size:0.82rem; padding:24px 0;">No messages yet. Send the first one below.</div>';
            threadEl.scrollTop = threadEl.scrollHeight;
        }

        export async function openMessagesModal(ro) {
            if (!ro) { showToast('Open a repair order first, then click Message Customer.', 'warning'); return; }
            if (!getSB()) { showToast('Please connect to the PRVS database first.', 'warning'); return; }

            const roSupabaseId = ro._supabaseId || null;
            const roCode = ro.roId || '';
            const defaultPhone = _toE164(ro.customerPhone);

            document.getElementById('sendblueModal')?.remove();
            const modal = document.createElement('div');
            modal.id = 'sendblueModal';
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
                    <div style="background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.3); border-radius:8px; padding:8px 11px; margin-bottom:12px; font-size:0.72rem; color:var(--text-secondary);">
                        Sendblue POC — sends through the shared sandbox line to <strong>verified contacts only</strong>. Replies + delivery/read status arrive in a later step.
                    </div>
                    <label style="display:block; font-size:0.72rem; color:var(--text-secondary); margin-bottom:4px;">Send to (E.164)</label>
                    <input type="tel" id="sbPhone" class="form-input" value="${escapeHtml(defaultPhone)}" placeholder="+12145551234" style="margin-bottom:12px;">
                    <div id="sbThread" style="max-height:240px; overflow-y:auto; padding:6px 2px; margin-bottom:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary);">
                        <div style="text-align:center; color:var(--text-secondary); font-size:0.82rem; padding:24px 0;">Loading…</div>
                    </div>
                    <textarea id="sbBody" class="form-input" rows="3" placeholder="Type a message to the customer…" style="resize:vertical; margin-bottom:10px;"></textarea>
                    <div style="display:flex; gap:10px;">
                        <button onclick="closeMessagesModal()" style="flex:0 0 auto; padding:10px 16px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.85rem;">Cancel</button>
                        <button id="sbSendBtn" onclick="sendSendblueMessage('${roSupabaseId || ''}', '${roCode}')" style="flex:1; padding:10px; border-radius:8px; border:1.5px solid rgba(59,130,246,0.5); background:rgba(59,130,246,0.12); color:#3b82f6; cursor:pointer; font-size:0.9rem; font-weight:700;">\u{1F4E4} Send</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            _refreshThread(roSupabaseId);
        }

        export function closeMessagesModal() {
            document.getElementById('sendblueModal')?.remove();
        }

        export async function sendSendblueMessage(roSupabaseId, roCode) {
            const phoneEl = document.getElementById('sbPhone');
            const bodyEl = document.getElementById('sbBody');
            const btn = document.getElementById('sbSendBtn');
            if (!phoneEl || !bodyEl) return;

            const phone = _toE164(phoneEl.value);
            const body = (bodyEl.value || '').trim();
            if (!phone || phone.length < 11) { showToast('Enter a valid phone number in +1XXXXXXXXXX format.', 'warning'); return; }
            if (!body) { showToast('Type a message first.', 'warning'); return; }

            if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
            try {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/sendblue-send`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${(typeof supabaseSession !== 'undefined' && supabaseSession?.access_token) ? supabaseSession.access_token : SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'X-PRVS-Secret': PRVS_FUNCTION_SECRET,
                    },
                    body: JSON.stringify({
                        action: 'send',
                        to: phone,
                        body,
                        ro_id: roSupabaseId || null,
                        ro_code: roCode || null,
                        sent_by: (currentUser && currentUser.email) || null,
                        context: 'ro_customer',
                    }),
                });
                const data = await res.json().catch(() => ({}));

                if (res.status === 503) {
                    showToast('Sendblue is not configured yet (SENDBLUE_* secrets not set on the project).', 'warning', { duration: 9000 });
                    return;
                }
                if (!res.ok || data.ok === false) {
                    const detail = data.error || data.sendblue?.error_message || `HTTP ${res.status}`;
                    showToast('Send failed: ' + detail, 'error', { duration: 9000 });
                    log('❌ Sendblue send failed: ' + JSON.stringify(data));
                    return;
                }

                bodyEl.value = '';
                showToast(`Message sent${data.is_imessage === true ? ' (iMessage)' : data.is_imessage === false ? ' (SMS)' : ''}.`, 'success');
                log('✅ Sendblue send ok: ' + (data.message_handle || data.status || ''));
                _refreshThread(roSupabaseId);
            } catch (err) {
                console.error('sendSendblueMessage error:', err);
                showToast('Send error: ' + err.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '\u{1F4E4} Send'; }
            }
        }

// ---- Window bridge (Sendblue Phase 2 POC, additive) ----
Object.assign(window, {
  openMessagesModal,
  closeMessagesModal,
  sendSendblueMessage,
  loadMessages,
});
