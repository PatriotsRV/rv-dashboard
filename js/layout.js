/* ============================================================================
   PRVS Layout Switcher — v1.477 (S147, feature/sidebar-layout)
   Classic ⇄ Sidebar layout toggle. NOT a module — defines window globals used
   by inline onclick in the #sbShell markup.

   How it works: html.layout-sidebar is set by an early <head> script from
   localStorage('prvs_layout') before first paint. On DOMContentLoaded (only
   in sidebar mode) this file RELOCATES the existing classic DOM nodes into
   the sidebar shell slots. Element ids, inline handlers, and addEventListener
   listeners all survive appendChild moves, so every module (render, parts,
   work-list, i18n …) keeps working untouched. Classic mode: this file is a
   no-op beyond defining the toggle helpers.
   ========================================================================== */
(function () {
  'use strict';

  var LS_LAYOUT = 'prvs_layout';       // 'classic' (default) | 'sidebar'
  var LS_RAIL   = 'prvs_layout_rail';  // '1' = collapsed rail

  function isSidebar() {
    return document.documentElement.classList.contains('layout-sidebar');
  }

  /* ── Toggle helpers (used by inline onclick; reload keeps things simple
        and guarantees a clean single-layout DOM) ── */
  window.setSbLayout = function (mode) {
    try { localStorage.setItem(LS_LAYOUT, mode); } catch (e) {}
    location.reload();
  };
  window.sbToggleRail = function () {
    var on = document.documentElement.classList.toggle('sb-rail');
    try { localStorage.setItem(LS_RAIL, on ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('sbRailBtn');
    if (btn) btn.textContent = on ? '⏩' : '⏪';
  };
  window.sbToggleSec = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  };
  window.sbOpenDrawer = function () {
    document.documentElement.classList.add('sb-drawer-open');
  };
  window.sbCloseDrawer = function () {
    document.documentElement.classList.remove('sb-drawer-open');
  };

  /* ── Relocation ── */
  function moveInto(slotId, el) {
    var slot = document.getElementById(slotId);
    if (slot && el) slot.appendChild(el);
  }

  function relocate() {
    // 1. Search block (customerSearch + clearSearch ids ride along)
    moveInto('sbSlotSearch', document.querySelector('.controls .search-section'));

    // 2. Primary + header-stack buttons
    moveInto('sbSlotPrimary', document.getElementById('newROBtn'));

    // 3. Quick Links: My Work List + Shop Tasks first, then the whole
    //    .view-mode-section (tile-view selector + every nav button, with
    //    role-gated display:none preserved)
    moveInto('sbSlotQL', document.getElementById('workListBtn'));
    moveInto('sbSlotQL', document.getElementById('shopTasksBtn'));
    moveInto('sbSlotQL', document.querySelector('.controls .view-mode-section'));

    // 4. Days on Lot = first .filter-section of the first filters-row
    var daysSection = document.getElementById('daysOnLotFilter');
    if (daysSection) moveInto('sbSlotDays', daysSection.closest('.filter-section'));

    // 5. The four filter groups → sidebar cards (existing collapse JS intact)
    var partsC = document.getElementById('parts-collapsible');
    if (partsC) moveInto('sbSlotParts', partsC.closest('.filter-section'));
    var rotypeC = document.getElementById('insurance-collapsible');
    if (rotypeC) moveInto('sbSlotROType', rotypeC.closest('.filter-section'));
    var repairBtn = document.querySelector('.filter-btn[data-type="repair"]');
    if (repairBtn) {
      var repairSec = repairBtn.closest('.filter-section');
      moveInto('sbSlotRepair', repairSec);
      // v1.477 S150 (Roland): Repair Type has no chevron in classic (always-open
      // section) — give it one in sidebar mode for parity with the other filter
      // groups. Sidebar-only DOM enhancement; classic markup untouched.
      var repairLbl = repairSec && repairSec.querySelector('.filter-label');
      if (repairLbl && !repairLbl.querySelector('.filter-chevron')) {
        var repairChev = document.createElement('span');
        repairChev.className = 'filter-chevron open';
        repairChev.textContent = '▼';
        repairLbl.appendChild(repairChev);
        repairLbl.classList.add('filter-toggle-label');
        repairLbl.style.cursor = 'pointer';
        repairLbl.addEventListener('click', function () {
          var grp = repairSec.querySelector('.filter-group');
          if (!grp) return;
          var isOpen = grp.style.display !== 'none';
          grp.style.display = isOpen ? 'none' : '';
          repairChev.classList.toggle('open', !isOpen);
        });
      }
    }
    var statusC = document.getElementById('status-collapsible');
    if (statusC) moveInto('sbSlotStatus', statusC.closest('.filter-section'));

    // 6. Header strip: live meta + connect + lang toggle relocated from <header>
    var strip = document.getElementById('sbHdrStrip');
    if (strip) {
      var right = strip.querySelector('.sb-hdr-right');
      var live = document.querySelector('header .live-indicator');
      if (live) strip.insertBefore(live, right);
      var time = document.getElementById('currentTime');
      if (time) strip.insertBefore(time, right);
      var totals = document.getElementById('totalRVs');
      if (totals) strip.insertBefore(totals, right);
      if (right) {
        var connect = document.getElementById('connectSheetsBtn');
        if (connect) right.appendChild(connect);
        var lang = document.getElementById('langToggleBtn');
        if (lang) right.appendChild(lang);
      }
    }

    // 7. Stats bar → collapsible wrapper just above the board grid
    var statsBar = document.getElementById('statsBar');
    if (statsBar && statsBar.parentNode) {
      var wrap = document.createElement('div');
      wrap.className = 'sb-sec open';
      wrap.id = 'sbStatsSec';
      wrap.innerHTML =
        '<div class="sb-sec-h" onclick="sbToggleSec(\'sbStatsSec\')">📊 Stats' +
        '<span class="chev">▼</span></div>';
      var body = document.createElement('div');
      body.className = 'sb-sec-b';
      statsBar.parentNode.insertBefore(wrap, statsBar);
      body.appendChild(statsBar);
      wrap.appendChild(body);
    }

    // 8. Restore rail preference
    try {
      if (localStorage.getItem(LS_RAIL) === '1') {
        document.documentElement.classList.add('sb-rail');
        var btn = document.getElementById('sbRailBtn');
        if (btn) btn.textContent = '⏩';
      }
    } catch (e) {}
  }

  /* ── Card chevron-group regrouping (sidebar mode only) ──────────────────
     Ports the sidebar-mockup v0.5–0.7 card organization onto the REAL cards:
     always-visible triage layer stays put; everything else is relocated into
     6 collapsible chevron groups appended at the card end. Pure reparenting —
     ids, data-action delegation, and listeners survive. render.js untouched;
     a MutationObserver re-runs the pass after every board re-render. */

  var GROUPS = [
    { key: 'mgmt',  title: '📋 RO MANAGEMENT' },
    { key: 'notif', title: '🔔 NOTIFICATIONS & REMINDERS' },
    { key: 'work',  title: '🧰 WORK ORDERS' }, // [S159b Roland] was WORK
    { key: 'parts', title: '🔩 PARTS' },
    { key: 'cust',  title: '💬 CUSTOMER INFO AND COMMS' }, // [S159b Roland] was CUSTOMER
    { key: 'admin', title: '⚙️ ADMIN' }
  ];

  // selector → group key. Matched in card DOM order per group, moved in order.
  var GROUP_MAP = [
    ['.insurance-badge', 'mgmt'], ['.customer-pay-badge', 'mgmt'],
    ['.warranty-badge', 'mgmt'], ['.hybrid-badge', 'mgmt'],
    ['.shop-badge', 'mgmt'], ['.training-badge', 'mgmt'],
    ['.status-selector-container', 'mgmt'],
    // [S159b Roland] WO summary chips moved mgmt → work (chips live where techs check in)
    ['.note-item[data-field="roStatusNotes"]', 'mgmt'],
    // [S159 Roland] TYPE/RV/VIN/TECH rows + Manage Photos & Docs moved ADMIN → RO MGMT,
    // placed ABOVE the action buttons (details after notes, buttons at group end).
    ['.rv-info', 'mgmt'], ['.photo-upload-btn', 'mgmt'],
    ['.edit-ro-btn', 'mgmt'], ['.card-secondary-btn[data-action="add-to-list"]', 'mgmt'],
    ['.schedule-ro-btn', 'mgmt'],
    ['.schedule-notif-banner-btn', 'notif'],   // mockup v0.5.2: Schedule button lives IN the 🔔 group
    ['.key-dates-row', 'notif'],
    ['.progress-section', 'work'],  // [S159b Roland] progress bar at the TOP of Work Orders
    ['.wo-summary-chips', 'work'],  // then the per-silo WO overview
    ['.checkin-btn', 'work'], ['.keys-power-row', 'work'],
    ['.card-parking-badge', 'work'], // staging only — hdr2 build relocates it to the card top
    ['.time-logs-section', 'work'], ['.work-order-btn', 'work'],
    ['.parts-badge', 'parts'], ['.parts-status-chip', 'parts'],
    ['.request-parts-btn', 'parts'], ['.parts-btn', 'parts'],
    ['.mark-ordered-btn', 'parts'],
    ['.note-item[data-field="customerCommunicationNotes"]', 'cust'],
    ['.message-customer-btn', 'cust'],
    ['.qr-collapsible-wrapper', 'admin'], ['.archive-ro-btn', 'admin']
  ];

  window.sbToggleCsec = function (el) {
    el.parentElement.classList.toggle('open');
  };

  // [S159] Sidebar ADMIN-dropdown Delete RO — resolve the card's RO via data-ro-sid
  // (UUID-first, GH#29 pattern), then hand off to the shared soft-delete flow.
  window.sbDeleteRO = function (btn) {
    var card = btn.closest('.ro-card');
    var sid = card && card.getAttribute('data-ro-sid');
    if (!sid || typeof window.softDeleteCurrentRO !== 'function') return;
    // currentData is an inline top-level `let` — reach it via the shared global
    // lexical environment (S84 pattern), not window.
    var _cd = (typeof currentData !== 'undefined') ? currentData : (window.currentData || []);
    var idx = _cd.findIndex(function (r) { return r._supabaseId === sid; });
    if (idx < 0) {
      if (typeof window.showToast === 'function') window.showToast('Could not resolve this RO — refresh and try again.', 'danger');
      return;
    }
    window.softDeleteCurrentRO(idx);
  };

  function tr(s) { return (typeof window.t === 'function') ? window.t(s) : s; }

  function regroupCard(card) {
    if (card.hasAttribute('data-sb-grouped')) return;
    card.setAttribute('data-sb-grouped', '1');

    // Build group bodies (detached)
    var bodies = {};
    GROUP_MAP.forEach(function (pair) {
      var els = card.querySelectorAll(pair[0]);
      for (var i = 0; i < els.length; i++) {
        // phone/email rows are pulled from .rv-info separately below, and
        // .rv-info itself moves to mgmt (S159; was admin) — skip descendants already captured
        if (!bodies[pair[1]]) {
          bodies[pair[1]] = document.createElement('div');
          bodies[pair[1]].className = 'sb-csec-b';
        }
        bodies[pair[1]].appendChild(els[i]);
      }
    });

    // Customer group: pull phone/email rows out of the (now-moved) rv-info
    // [S159] rv-info now lands in mgmt (was admin)
    var rvInfo = bodies.mgmt && bodies.mgmt.querySelector('.rv-info');
    if (rvInfo) {
      var links = rvInfo.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]');
      for (var j = 0; j < links.length; j++) {
        var row = links[j].closest('.info-row');
        if (row) {
          if (!bodies.cust) { bodies.cust = document.createElement('div'); bodies.cust.className = 'sb-csec-b'; }
          // keep phone above email above comm notes
          bodies.cust.insertBefore(row, bodies.cust.querySelector('.note-item, .message-customer-btn'));
        }
      }
      // [S159b Roland] TYPE (services) row moves up directly under the status
      // dropdown — quick read of the RO's services at the top of RO Management.
      var typeRow = null, tRows = rvInfo.querySelectorAll('.info-row');
      for (var k = 0; k < tRows.length; k++) {
        var tl = tRows[k].querySelector('.info-label');
        if (tl && /^(type|tipo)/i.test(tl.textContent.trim())) { typeRow = tRows[k]; break; }
      }
      if (typeRow && bodies.mgmt) {
        var statusC = bodies.mgmt.querySelector('.status-selector-container');
        if (statusC) statusC.insertAdjacentElement('afterend', typeRow);
        else bodies.mgmt.insertBefore(typeRow, bodies.mgmt.firstChild);
      }
      if (!rvInfo.querySelector('.info-row')) rvInfo.remove();
    }
    if (bodies.admin && !bodies.admin.childNodes.length) delete bodies.admin;

    // Drop now-empty original wrappers
    ['.card-actions-primary', '.card-actions-secondary', '.notes-section'].forEach(function (sel) {
      var w = card.querySelector(sel);
      if (w && !w.querySelector('button, .note-item')) w.remove();
    });

    // ── Mockup tile-header anatomy ─────────────────────────────────────────
    // name → sub (unit · RO-ID) → chip row (status · days · urgency) → thin
    // progress bar. $ moves into RO Management. No-photo placeholder.
    var name = card.querySelector('.customer-name');
    if (name) {
      if (!card.querySelector('.rv-photo')) {
        var ph = document.createElement('div');
        ph.className = 'sb-nophoto';
        ph.textContent = '🚐';
        card.insertBefore(ph, name);
      }
      // sub-line: RV unit (text from the Admin rv-info) · RO-ID element
      var sub = document.createElement('div');
      sub.className = 'sb-sub';
      var unitText = '';
      if (bodies.mgmt) { // [S159] rv-info moved admin → mgmt
        var rows = bodies.mgmt.querySelectorAll('.rv-info .info-row');
        for (var r = 0; r < rows.length; r++) {
          var lbl = rows[r].querySelector('.info-label');
          if (lbl && /^RV\b/i.test(lbl.textContent.trim())) {
            var v = rows[r].querySelector('.info-value');
            if (v) unitText = v.textContent.trim();
            break;
          }
        }
      }
      if (unitText && !/not specified/i.test(unitText) && unitText.toUpperCase() !== 'ALL') {
        var us = document.createElement('span');
        us.textContent = unitText;
        sub.appendChild(us);
      }
      var roid = card.querySelector('.card-ro-id');
      if (roid) sub.appendChild(roid);
      if (sub.childNodes.length) name.insertAdjacentElement('afterend', sub);

      // chip row
      var hdr2 = document.createElement('div');
      hdr2.className = 'sb-hdr2';
      var statusSel = bodies.mgmt && bodies.mgmt.querySelector('.status-dropdown');
      var statusTxt = statusSel ? statusSel.options[statusSel.selectedIndex].text
        : (card.querySelector('.compact-stage') ? card.querySelector('.compact-stage').textContent : '');
      if (!statusTxt) { // shop ROs render no dropdown — derive from card class
        var m = card.className.match(/ro-card-status-([a-z-]+)/);
        if (m) statusTxt = m[1].replace(/-/g, ' ');
      }
      if (statusTxt) {
        var sc = document.createElement('span');
        sc.className = 'sb-status-chip';
        sc.textContent = statusTxt;
        hdr2.appendChild(sc);
      }
      var days = card.querySelector('.days-on-lot');
      if (days) {
        // "Not On Lot" (no digit) duplicates the status chip — hide it
        if (/\d/.test(days.textContent)) hdr2.appendChild(days);
        else days.style.display = 'none';
      }
      var urg = card.querySelector('.urgency-selector-badge');
      if (urg) hdr2.appendChild(urg);
      // [S159b Roland] 📍 RV location (parking badge) belongs at the TOP of the RO —
      // pulled out of the Work group into the always-visible header chip row.
      var park = (bodies.work && bodies.work.querySelector('.card-parking-badge')) || card.querySelector('.card-parking-badge');
      if (park) hdr2.appendChild(park);
      (sub.parentNode ? sub : name).insertAdjacentElement('afterend', hdr2);

      // always-visible thin progress bar (input stays in 🧰 Work)
      var pin = bodies.work && bodies.work.querySelector('.progress-input');
      if (pin && pin.value !== '') {
        var tp = document.createElement('div');
        tp.className = 'sb-thinprog';
        tp.innerHTML = '<div class="fill" style="width:' + Math.max(0, Math.min(100, +pin.value || 0)) + '%"></div>';
        hdr2.insertAdjacentElement('afterend', tp);
      }
    }
    // $ → RO Management (mockup shows it only there + in the header hint)
    var dv = card.querySelector('.dollar-value');
    if (dv && bodies.mgmt) bodies.mgmt.insertBefore(dv, bodies.mgmt.firstChild);
    var chr = card.querySelector('.card-header-row');
    if (chr && !chr.children.length) chr.remove();

    // [S159 Roland] 🗑 Delete RO moves out of the Edit RO modal (sidebar only) into
    // the ⚙️ ADMIN dropdown. Admin-gated; same softDeleteCurrentRO flow (soft-delete,
    // 7-day auto-purge, restorable from Recently Deleted).
    try {
      if (typeof window.isAdmin === 'function' && window.isAdmin() && card.getAttribute('data-ro-sid')) {
        if (!bodies.admin) { bodies.admin = document.createElement('div'); bodies.admin.className = 'sb-csec-b'; }
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'sb-del-ro-btn';
        delBtn.textContent = '🗑 ' + tr('Delete RO');
        delBtn.setAttribute('onclick', 'sbDeleteRO(this)');
        bodies.admin.appendChild(delBtn);
      }
    } catch (e) {}

    // Append populated groups in canonical order
    GROUPS.forEach(function (g) {
      if (!bodies[g.key]) return;
      card.appendChild(buildSec(g, bodies[g.key]));
    });

    // ── Collapsed-header hints (mockup compact info layer) ────────────────
    setHint(card, 'mgmt', (function () {
      // [S159b] WO chips moved to WORK — mgmt hint is the $ value alone now
      var d = card.querySelector('.sb-csec[data-sbg="mgmt"] .dollar-value');
      return d ? d.textContent.trim() : '';
    })());
    setHint(card, 'work', (function () {
      // [S159b] WO count rides with the chips into the WORK hint
      var woN = card.querySelectorAll('.sb-csec[data-sbg="work"] .wo-summary-chip:not(.wo-summary-chip-empty)').length;
      var pv = card.querySelector('.sb-csec[data-sbg="work"] .progress-value');
      var parts = [];
      if (woN) parts.push(woN + ' WO');
      if (pv) parts.push(pv.textContent.trim());
      return parts.join(' · ');
    })());
    setHint(card, 'parts', (function () {
      var pb = card.querySelector('.sb-csec[data-sbg="parts"] .parts-badge');
      if (pb) { var m2 = pb.textContent.match(/(\d+)\s/); if (m2) return m2[1] + ' parts'; }
      return card.querySelector('.sb-csec[data-sbg="parts"] .parts-status-chip') ? '!' : '';
    })());
    setHint(card, 'cust', '💬');
  }

  function setHint(card, key, text) {
    if (!text) return;
    var h = card.querySelector('.sb-csec[data-sbg="' + key + '"] .sb-hint');
    if (h && !h.textContent) h.textContent = text;
  }

  function buildSec(g, body) {
    var sec = document.createElement('div');
    sec.className = 'sb-csec';
    sec.setAttribute('data-sbg', g.key);
    var h = document.createElement('div');
    h.className = 'sb-csec-h';
    h.setAttribute('onclick', 'sbToggleCsec(this)');
    h.innerHTML = g.title + '<span class="sb-hint"></span><span class="chev">▼</span>';
    sec.appendChild(h);
    sec.appendChild(body);
    return sec;
  }

  // Get (or create, in canonical position) a group section on a card
  function ensureSec(card, key) {
    var sec = card.querySelector('.sb-csec[data-sbg="' + key + '"]');
    if (sec) return sec;
    var g = null, after = [];
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].key === key) { g = GROUPS[i]; after = GROUPS.slice(i + 1).map(function (x) { return x.key; }); break; }
    }
    var body = document.createElement('div');
    body.className = 'sb-csec-b';
    sec = buildSec(g, body);
    var anchor = null;
    for (var j = 0; j < after.length && !anchor; j++) {
      anchor = card.querySelector('.sb-csec[data-sbg="' + after[j] + '"]');
    }
    card.insertBefore(sec, anchor);
    return sec;
  }

  /* ── Live scheduled_notifications feed (🔔 group) ────────────────────────
     Sidebar-mockup v0.6 feature on the real dashboard. READ-ONLY batch query
     via the module bridge (getSB), canonical auth guard, 60s cache. Decorates
     each card: amber "N SENT TODAY" banner, ⏳ upcoming / ✅ recent rows in
     the 🔔 group, and a next-date hint on the group header. */
  var _notifCache = {};          // sid → rows
  var _notifCacheAt = 0;
  var _notifBusy = false;

  function fmtShort(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt)) return String(d).slice(5, 10);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function decorateNotifs() {
    if (!isSidebar() || _notifBusy) return;
    if (typeof window.getSB !== 'function' || !window.getSB() || !window.supabaseSession) return;
    var cards = document.querySelectorAll('#boardGrid .ro-card[data-sb-grouped]:not([data-sb-notif])');
    if (!cards.length) return;

    var sids = [];
    for (var i = 0; i < cards.length; i++) {
      var sid = cards[i].getAttribute('data-ro-sid');
      if (sid) sids.push(sid);
    }
    if (!sids.length) return;

    var fresh = (Date.now() - _notifCacheAt) < 60000;
    var missing = fresh ? sids.filter(function (s) { return !(s in _notifCache); }) : sids;

    var apply = function () {
      var now = Date.now();
      for (var k = 0; k < cards.length; k++) {
        var card = cards[k];
        card.setAttribute('data-sb-notif', '1');
        var rows = _notifCache[card.getAttribute('data-ro-sid')] || [];
        if (!rows.length) continue;
        var pending = rows.filter(function (r) { return r.status === 'pending'; });
        var fired = rows.filter(function (r) { return r.fired_at; })
          .sort(function (a, b) { return new Date(b.fired_at) - new Date(a.fired_at); });
        var firedToday = fired.filter(function (r) { return (now - new Date(r.fired_at)) < 86400000; }).length;

        if (firedToday) {
          var b = document.createElement('div');
          b.className = 'sb-dalert amber';
          b.style.display = '';
          b.textContent = '🔔 ' + firedToday + ' ' + tr(firedToday === 1 ? 'NOTIFICATION SENT TODAY' : 'NOTIFICATIONS SENT TODAY');
          card.insertBefore(b, card.firstChild);
        }

        var sec = ensureSec(card, 'notif');
        var body = sec.querySelector('.sb-csec-b');
        var html = '';
        if (pending.length) {
          html += '<div class="sb-ngrp">⏳ ' + tr('UPCOMING') + '</div>' + pending.slice(0, 4).map(function (r) {
            return '<div class="sb-nrow"><span>' + String(r.subject || '').replace(/</g, '&lt;') + '</span><span class="d">' + fmtShort(r.scheduled_at) + '</span></div>';
          }).join('');
        }
        if (fired.length) {
          html += '<div class="sb-ngrp">✅ ' + tr('RECENT') + '</div>' + fired.slice(0, 3).map(function (r) {
            return '<div class="sb-nrow' + (r.status === 'failed' ? ' fail' : '') + '"><span>' + String(r.subject || '').replace(/</g, '&lt;') + '</span><span class="d">' + fmtShort(r.fired_at) + '</span></div>';
          }).join('');
        }
        if (html) body.insertAdjacentHTML('beforeend', html);
        var hint = sec.querySelector('.sb-hint');
        if (hint && pending.length) hint.textContent = tr('next') + ' ' + fmtShort(pending[0].scheduled_at) + ' · ' + pending.length + ' ' + tr('pending');
      }
    };

    if (!missing.length) { apply(); return; }
    _notifBusy = true;
    window.getSB().from('scheduled_notifications')
      .select('ro_id, subject, scheduled_at, status, fired_at')
      .in('ro_id', missing.slice(0, 300))
      .order('scheduled_at', { ascending: true })
      .limit(600)
      .then(function (res) {
        _notifBusy = false;
        if (res.error) { console.warn('[layout] notif feed query failed:', res.error.message); return; }
        if (!fresh) { _notifCache = {}; }
        _notifCacheAt = Date.now();
        missing.forEach(function (s) { if (!(s in _notifCache)) _notifCache[s] = []; });
        (res.data || []).forEach(function (r) {
          (_notifCache[r.ro_id] = _notifCache[r.ro_id] || []).push(r);
        });
        apply();
      });
  }

  function regroupAll() {
    var cards = document.querySelectorAll('#boardGrid .ro-card:not([data-sb-grouped])');
    for (var i = 0; i < cards.length; i++) regroupCard(cards[i]);
  }

  var _regroupQueued = false;
  function queueRegroup() {
    if (_regroupQueued) return;
    _regroupQueued = true;
    // setTimeout, NOT requestAnimationFrame: rAF is paused in background
    // tabs, which left freshly-rendered boards ungrouped until refocus.
    setTimeout(function () {
      _regroupQueued = false;
      regroupAll();
      decorateNotifs();
    }, 0);
  }

  function startCardObserver() {
    var grid = document.getElementById('boardGrid');
    if (!grid) return;
    regroupAll();
    decorateNotifs();
    // childList only (no subtree): fires on board re-render; our own
    // within-card reparenting never re-triggers it.
    new MutationObserver(queueRegroup).observe(grid, { childList: true });
    // Straggler sweep: cards rendered before auth was ready get their
    // notification feed once the session lands (guard-gated, no-op otherwise).
    setInterval(decorateNotifs, 20000);
  }

  if (isSidebar()) {
    var boot = function () { relocate(); startCardObserver(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
