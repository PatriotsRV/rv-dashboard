// js/home-link.js  v1.0  (Session 199, 2026-10-08)
// One shared "Home" pill for every standalone staff page, so nobody is stranded
// on analytics / closed-ros / guide / leads / solar / time-off / worklist-report /
// checkin with no way back to the PRVS Assistant entry page (home.html).
// Roland S199: "there is no breadcrumb path home" after landing on home.html
// and clicking through to an adjacent page.
//
// Usage (classic <script>, anywhere in the page - it waits for DOM ready):
//     <script src="js/home-link.js?v=1.0"></script>
// Optional attributes on that <script> tag:
//     data-pos="top-center" (default; Roland S199 - top-left ran into page titles)
//              | "top-left" | "top-right" | "bottom-center" | "bottom-left" | "bottom-right"
//     data-pos-mobile="bottom-center" (default; <= 640px wide - phone headers are already full,
//              Roland S199 "crowded on mobile" - the bottom edge is empty and thumb-reachable)
//     data-label="Home"   (default; e.g. "Inicio" on a Spanish page)
//
// Deliberately NOT on: index.html / messages.html / tasks.html (they already link
// home in their own headers), customer-checkin.html (kiosk), v.html / review.html
// (customers), login.html (pre-login).
//
// Palette = home.html (--navy #10243E, --gold #C9A544). Fixed position with a
// safe-area inset so it clears the iPhone notch; z-index high enough to sit over
// sticky headers but under modals (which use 9999+ across the app).
(function () {
    var me = document.currentScript || {};
    var posDesktop = (me.dataset && me.dataset.pos) || 'top-center';
    var posMobile = (me.dataset && me.dataset.posMobile) || 'bottom-center';
    var label = (me.dataset && me.dataset.label) || 'Home';
    var mq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
    function place(a) {
        var pos = (mq && mq.matches) ? posMobile : posDesktop;
        var v = pos.indexOf('bottom') === 0 ? 'bottom' : 'top';
        var h = pos.indexOf('right') > -1 ? 'right' : (pos.indexOf('left') > -1 ? 'left' : 'center');
        var hcss = h === 'center'
            ? 'left:50%;transform:translateX(-50%);'
            : h + ':calc(10px + env(safe-area-inset-' + h + ',0px));';
        a._lift = h === 'center' ? 'translateX(-50%) translateY(-1px)' : 'translateY(-1px)';
        a._rest = h === 'center' ? 'translateX(-50%)' : '';
        a.style.cssText =
            'position:fixed;' + v + ':calc(10px + env(safe-area-inset-' + v + ',0px));' + hcss +
            'z-index:5000;display:inline-flex;align-items:center;gap:6px;' +
            'padding:7px 12px 7px 10px;border-radius:999px;' +
            'background:#10243E;color:#fff;border:1px solid rgba(201,165,68,.55);' +
            'font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
            'text-decoration:none;letter-spacing:.2px;' +
            'box-shadow:0 4px 14px rgba(16,36,62,.25);opacity:.92;' +
            'transition:opacity .15s,transform .15s;-webkit-tap-highlight-color:transparent;';
    }
    function mount() {
        if (document.getElementById('prvsHomeLink')) return;
        var a = document.createElement('a');
        a.id = 'prvsHomeLink';
        a.href = 'home.html';
        a.setAttribute('aria-label', 'Back to PRVS Assistant home');
        a.title = 'PRVS Assistant home';
        a.innerHTML = '<span aria-hidden="true" style="font-size:15px;line-height:1">&#127968;</span><span>' + label + '</span>';
        place(a);
        a.addEventListener('mouseenter', function () { a.style.opacity = '1'; a.style.transform = a._lift; a.style.borderColor = '#C9A544'; });
        a.addEventListener('mouseleave', function () { a.style.opacity = '.92'; a.style.transform = a._rest; a.style.borderColor = 'rgba(201,165,68,.55)'; });
        if (mq) { (mq.addEventListener ? mq.addEventListener('change', function () { place(a); }) : mq.addListener(function () { place(a); })); }
        document.body.appendChild(a);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
