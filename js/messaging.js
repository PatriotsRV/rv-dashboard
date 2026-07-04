// js/messaging.js — PRVS Dashboard customer messaging (GH#39, Project Blue)
// Session 131, 2026-07-04. Supersedes the Sendblue Phase 2 POC module
// (feature/sendblue-poc, v1.448) — same window-bridge surface, new provider.
//
// Sends iMessage/SMS through the `projectblue-send` edge function (dedicated
// PB line +1 940 407-4145) and renders the conversation for the RO's customer.
// Inbound replies are captured by the `projectblue-webhook` edge fn into the
// `messages` table WITHOUT an ro_id (RO routing is a later phase), so the
// thread query follows the LOCKED threading decision from
// docs/specs/MESSAGING_AUTOMATION_SPEC.md §3: **customer-inbox, RO-tagged** —
// one conversation per customer phone. loadMessages pulls rows matching the
// RO id OR the customer's phone (both directions), merged chronologically.
//
// DEFERRED (spec P3-P6): automated sends, MMS from the modal, delivery-status
// reconciliation, STOP/HELP handling, per-RO inbound routing.
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
            const roTag = (!outbound || m.ro_code) && m.ro_code
                ? `<span style="font-size:0.6rem; font-family:'JetBrains Mono',monospace; color:var(--accent-info);">${escapeHtml(m.ro_code)}</span>` : '';
            return `
                <div style="display:flex; justify-content:${align}; margin-bottom:8px;">
                    <div style="max-width:78%; background:${bg}; border:1px solid ${border}; border-radius:12px; padding:8px 11px;">
                        <div style="font-size:0.85rem; color:var(--text-primary); white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body || '')}</div>
                        <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:4px;">
                            ${roTag}
                            <span style="font-size:0.62rem; color:var(--text-secondary);">${escapeHtml(when)}</span>
                            ${outbound ? _statusChip(m) : ''}
                        </div>
                        ${err}
                    </div>
                </div>`;
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
            const { data, error } = await query
                .or(ors.join(','))
                .order('created_at', { ascending: true })
                .limit(200);
            if (error) { console.error('loadMessages error:', error); return []; }
            return data || [];
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
                    <textarea id="msgBody" class="form-input" rows="3" placeholder="Type a message to the customer…" style="resize:vertical; margin-bottom:10px;"></textarea>
                    <div style="display:flex; gap:10px;">
                        <button onclick="closeMessagesModal()" style="flex:0 0 auto; padding:10px 16px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.85rem;">Cancel</button>
                        <button id="msgSendBtn" onclick="sendCustomerMessage('${roSupabaseId || ''}', '${roCode}')" style="flex:1; padding:10px; border-radius:8px; border:1.5px solid rgba(59,130,246,0.5); background:rgba(59,130,246,0.12); color:#3b82f6; cursor:pointer; font-size:0.9rem; font-weight:700;">\u{1F4E4} Send</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
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
            const body = (bodyEl.value || '').trim();
            if (!phone || phone.length < 11) { showToast('Enter a valid phone number in +1XXXXXXXXXX format.', 'warning'); return; }
            if (!body) { showToast('Type a message first.', 'warning'); return; }

            if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
            try {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/projectblue-send`, {
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
                    showToast('Project Blue is not configured yet (PROJECTBLUE_API_KEY not set on the project).', 'warning', { duration: 9000 });
                    return;
                }
                if (!res.ok || data.ok === false) {
                    const detail = data.error || data.projectblue?.error || `HTTP ${res.status}`;
                    showToast('Send failed: ' + detail, 'error', { duration: 9000 });
                    log('❌ Project Blue send failed: ' + JSON.stringify(data));
                    return;
                }

                bodyEl.value = '';
                showToast(`Message sent${data.is_imessage === true ? ' (iMessage)' : data.is_imessage === false ? ' (SMS)' : ''}.`, 'success');
                log('✅ Project Blue send ok: ' + (data.message_handle || data.status || ''));
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
});
