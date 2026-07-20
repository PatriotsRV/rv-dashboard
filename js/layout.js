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
    if (repairBtn) moveInto('sbSlotRepair', repairBtn.closest('.filter-section'));
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
    { key: 'work',  title: '🧰 WORK' },
    { key: 'parts', title: '🔩 PARTS' },
    { key: 'cust',  title: '💬 CUSTOMER' },
    { key: 'admin', title: '⚙️ ADMIN' }
  ];

  // selector → group key. Matched in card DOM order per group, moved in order.
  var GROUP_MAP = [
    ['.insurance-badge', 'mgmt'], ['.customer-pay-badge', 'mgmt'],
    ['.warranty-badge', 'mgmt'], ['.hybrid-badge', 'mgmt'],
    ['.shop-badge', 'mgmt'], ['.training-badge', 'mgmt'],
    ['.status-selector-container', 'mgmt'], ['.wo-summary-chips', 'mgmt'],
    ['.note-item[data-field="roStatusNotes"]', 'mgmt'],
    ['.edit-ro-btn', 'mgmt'], ['.card-secondary-btn[data-action="add-to-list"]', 'mgmt'],
    ['.schedule-ro-btn', 'mgmt'],
    ['.key-dates-row', 'notif'],
    ['.checkin-btn', 'work'], ['.keys-power-row', 'work'],
    ['.card-parking-badge', 'work'], ['.progress-section', 'work'],
    ['.time-logs-section', 'work'], ['.work-order-btn', 'work'],
    ['.parts-badge', 'parts'], ['.parts-status-chip', 'parts'],
    ['.request-parts-btn', 'parts'], ['.parts-btn', 'parts'],
    ['.mark-ordered-btn', 'parts'],
    ['.note-item[data-field="customerCommunicationNotes"]', 'cust'],
    ['.message-customer-btn', 'cust'],
    ['.rv-info', 'admin'], ['.photo-upload-btn', 'admin'],
    ['.qr-collapsible-wrapper', 'admin'], ['.archive-ro-btn', 'admin']
  ];

  window.sbToggleCsec = function (el) {
    el.parentElement.classList.toggle('open');
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
        // .rv-info itself moves to admin — skip descendants already captured
        if (!bodies[pair[1]]) {
          bodies[pair[1]] = document.createElement('div');
          bodies[pair[1]].className = 'sb-csec-b';
        }
        bodies[pair[1]].appendChild(els[i]);
      }
    });

    // Customer group: pull phone/email rows out of the (now-moved) rv-info
    var rvInfo = bodies.admin && bodies.admin.querySelector('.rv-info');
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
      if (!rvInfo.querySelector('.info-row')) rvInfo.remove();
      if (bodies.admin && !bodies.admin.childNodes.length) delete bodies.admin;
    }

    // Drop now-empty original wrappers
    ['.card-actions-primary', '.card-actions-secondary', '.notes-section'].forEach(function (sel) {
      var w = card.querySelector(sel);
      if (w && !w.querySelector('button, .note-item')) w.remove();
    });

    // Append populated groups in canonical order
    GROUPS.forEach(function (g) {
      if (!bodies[g.key]) return;
      card.appendChild(buildSec(g, bodies[g.key]));
    });
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
