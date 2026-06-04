// js/enhancement.js - Phase 18 (ADDITIVE): Genie lamp / Enhancement Requests (GH#19).
// v1.442 (Session 90, 2026-06-04).
//
// Extracted VERBATIM from index.html's SECOND classic <script> block (the GH#19
// block near the end of the body, column-0 indentation) - 11 functions:
//   openERModal, closeERModal, startERDictation, submitEnhancementRequest,
//   loadERUnreviewedCount, openERAdminView, closeERAdminView, loadERAdminData,
//   filterERAdmin, updateERStatus, saveERNote.
//   The stale MODULARIZATION_ROADMAP Phase 18 list names 8; three more belong
//   here (post-roadmap additions): closeERAdminView, loadERAdminData, saveERNote.
//   renderERAdminList is NOT here - js/render.js has owned it since Phase 6
//   (inline body deleted v1.437); these copies reach it via the window bridge.
//
// ADDITIVE PHASE - the inline copies of the 11 REMAIN in index.html. This module is
// loaded by app.js; its window bridge re-points window.openERModal etc. to these
// copies, but the bodies are byte-identical to the inline versions (only an
// `export` keyword was inserted; no reference rewriting), so behavior is unchanged.
// Every bare reference resolves through the SHARED global environment to the SAME
// symbol the inline copy uses:
//   - ER state: _erData / _erFilterStatus / _erFilterCategory - top-level `let` in
//     the GH#19 script block (global lexical env; declared, so the module copies'
//     bare writes are strict-mode safe; schema-documented in js/state.js Phase 3);
//   - helpers/bridged modules: getSB, showToast, renderERAdminList (render.js),
//     supabaseSession (var), currentUser (var);
//   - SpeechRecognition / webkitSpeechRecognition: browser APIs (startERDictation).
// Session 89 pre-scan for undeclared implicit globals: PASSED (all bare writes
// target DECLARED top-level let bindings; `recognition` is locally const).
//
// Proper ESM imports + deletion of the inline copies are deferred to the Phase 18
// delete-inline cleanup, after this additive build soaks. Do NOT rewrite references here.


export function openERModal() {
    const overlay = document.getElementById('erModalOverlay');
    overlay.style.display = 'flex';
    document.getElementById('erDescription').value = '';
    document.getElementById('erDictationStatus').textContent = '';
    // Auto-default category based on current page
    const page = window.location.pathname.split('/').pop() || 'index.html';
    const catSelect = document.getElementById('erCategory');
    const pageDefaults = {
        'checkin.html': 'Time Clock / Check-In',
        'solar.html': 'General UI/UX',
        'analytics.html': 'General UI/UX',
        'worklist-report.html': 'Work List'
    };
    if (pageDefaults[page]) {
        catSelect.value = pageDefaults[page];
    }
}

export function closeERModal() {
    document.getElementById('erModalOverlay').style.display = 'none';
}

export function startERDictation() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Voice dictation is not supported in this browser. Use Chrome or Safari.', 'warning', { duration: 10000 });
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    const statusEl = document.getElementById('erDictationStatus');
    const inputEl = document.getElementById('erDescription');
    recognition.onstart = () => {
        if (statusEl) { statusEl.textContent = '🎤 Listening... Speak now.'; statusEl.style.color = '#10b981'; }
    };
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (inputEl) {
            const cur = inputEl.value;
            inputEl.value = cur ? cur + ' ' + transcript : transcript;
        }
        if (statusEl) { statusEl.textContent = '✅ Transcribed!'; statusEl.style.color = '#10b981'; setTimeout(() => { statusEl.textContent = ''; }, 3000); }
    };
    recognition.onerror = (event) => {
        if (statusEl) { statusEl.textContent = '❌ Error: ' + event.error; statusEl.style.color = '#dc2626'; setTimeout(() => { statusEl.textContent = ''; }, 3000); }
    };
    recognition.onend = () => {
        if (statusEl && statusEl.textContent.includes('Listening')) { statusEl.textContent = ''; }
    };
    recognition.start();
}

export async function submitEnhancementRequest() {
    const description = document.getElementById('erDescription').value.trim();
    const category = document.getElementById('erCategory').value;
    if (!description) { showToast('Please describe your enhancement request.', 'warning'); return; }
    const sb = getSB();
    if (!sb || !supabaseSession) { showToast('You must be signed in to submit a request.', 'warning'); return; }
    const userEmail = supabaseSession.user?.email || 'unknown';
    const userName = currentUser?.name || supabaseSession.user?.user_metadata?.full_name || userEmail;
    const sourcePage = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    try {
        const { error } = await sb.from('enhancement_requests').insert({
            submitted_by: userEmail,
            submitted_by_name: userName,
            source_page: sourcePage,
            category: category,
            description: description
        });
        if (error) throw error;
        closeERModal();
        showToast('Wish submitted! Roland will review it.', 'success');
    } catch (err) {
        console.error('ER submit error:', err);
        showToast('Error submitting enhancement request: ' + (err.message || err), 'error');
    }
}

export async function loadERUnreviewedCount() {
    try {
        const { count, error } = await getSB().from('enhancement_requests').select('*', { count: 'exact', head: true }).eq('status', 'unreviewed');
        if (!error && count > 0) {
            document.getElementById('erUnreviewedCount').textContent = count;
        } else {
            document.getElementById('erUnreviewedCount').textContent = '';
        }
    } catch(e) {}
}

export async function openERAdminView() {
    const overlay = document.getElementById('erAdminOverlay');
    overlay.style.display = 'flex';
    _erFilterStatus = 'all';
    _erFilterCategory = 'all';
    await loadERAdminData();
}

export function closeERAdminView() {
    document.getElementById('erAdminOverlay').style.display = 'none';
}

export async function loadERAdminData() {
    try {
        let query = getSB().from('enhancement_requests').select('*').order('created_at', { ascending: false });
        if (_erFilterStatus !== 'all') query = query.eq('status', _erFilterStatus);
        if (_erFilterCategory !== 'all') query = query.eq('category', _erFilterCategory);
        const { data, error } = await query;
        if (error) throw error;
        _erData = data || [];
        renderERAdminList();
    } catch(err) {
        console.error('ER admin load error:', err);
    }
}

export function filterERAdmin(type, value) {
    if (type === 'status') _erFilterStatus = value;
    if (type === 'category') _erFilterCategory = value;
    loadERAdminData();
}

export async function updateERStatus(id, status) {
    try {
        const { error } = await getSB().from('enhancement_requests').update({ status }).eq('id', id);
        if (error) throw error;
        const er = _erData.find(e => e.id === id);
        if (er) er.status = status;
        renderERAdminList();
        loadERUnreviewedCount();
    } catch(err) { showToast('Error updating status: ' + (err.message || err), 'error'); }
}

export async function saveERNote(id) {
    const note = document.getElementById('erNote_' + id)?.value || '';
    try {
        const { error } = await getSB().from('enhancement_requests').update({ admin_notes: note }).eq('id', id);
        if (error) throw error;
        const er = _erData.find(e => e.id === id);
        if (er) er.admin_notes = note;
        renderERAdminList();
    } catch(err) { showToast('Error saving note: ' + (err.message || err), 'error'); }
}

Object.assign(window, { openERModal, closeERModal, startERDictation, submitEnhancementRequest, loadERUnreviewedCount, openERAdminView, closeERAdminView, loadERAdminData, filterERAdmin, updateERStatus, saveERNote });
