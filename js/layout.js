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

  if (isSidebar()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', relocate);
    } else {
      relocate();
    }
  }
})();
