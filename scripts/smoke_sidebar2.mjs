// S152 extended pre-auth regression — mobile drawer, rail, sample-card suppression
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// ── Desktop sidebar: rail collapse round-trip ─────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('prvs_layout', 'sidebar'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const railBtn = await page.$('#sbRailBtn');
  check('desktop: rail collapse button visible', !!railBtn && await railBtn.isVisible());
  if (railBtn) {
    await railBtn.click();
    await page.waitForTimeout(800);
    const collapsed = await page.evaluate(() =>
      document.documentElement.classList.contains('sb-rail') ||
      document.body.classList.contains('sb-rail') ||
      localStorage.getItem('prvs_layout_rail') === '1');
    check('rail collapses (prvs_layout_rail=1 or class set)', collapsed);
    // expand back so state is clean
    const expandBtn = await page.$('#sbRailBtn, #sbRailExpandBtn, [onclick*="sbToggleRail"]');
    if (expandBtn) { await expandBtn.click(); await page.waitForTimeout(500); }
    const railFlag = await page.evaluate(() => localStorage.getItem('prvs_layout_rail'));
    check('rail expands back', railFlag !== '1', String(railFlag));
  }
  // sample-card suppression in sidebar mode (S147 known issue: hidden in sidebar)
  const sampleVisible = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.ro-card, .rv-card, [data-ro-id]')];
    return cards.filter((c) => c.offsetParent !== null).length;
  });
  check('sidebar mode: no sample placeholder cards visible pre-auth', sampleVisible === 0, `${sampleVisible} visible`);
  await ctx.close();
}

// ── Mobile sidebar: drawer button + bottom bar ────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('prvs_layout', 'sidebar'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const drawerBtn = await page.$('#sbDrawerBtn');
  check('mobile: 🎛️ Filters drawer button present', !!drawerBtn && await drawerBtn.isVisible());
  if (drawerBtn) {
    await drawerBtn.click();
    await page.waitForTimeout(600);
    const shellVisible = await page.evaluate(() => {
      const el = document.getElementById('sbShell');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= -10;
    });
    check('mobile: drawer opens (#sbShell slides in)', shellVisible);
    const scrim = await page.$('#sbScrim');
    if (scrim && await scrim.isVisible()) {
      // Drawer covers the scrim's center on a phone viewport — dispatch the
      // tap directly (equivalent to tapping the exposed sliver).
      await page.evaluate(() => document.getElementById('sbScrim').click());
      await page.waitForTimeout(600);
      const closed = await page.evaluate(() => {
        const el = document.getElementById('sbShell');
        if (!el) return true;
        const r = el.getBoundingClientRect();
        return r.right <= 10 || r.width === 0 || getComputedStyle(el).visibility === 'hidden';
      });
      check('mobile: scrim tap closes drawer', closed);
    } else {
      check('mobile: scrim present while drawer open', false, 'scrim not visible');
    }
  }
  await ctx.close();
}

// ── Classic mode untouched: key header buttons still render ──────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('prvs_layout', 'classic'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const langBtn = await page.$('#langToggleBtn');
  check('classic: 🌐 ES lang toggle still in header', !!langBtn);
  const search = await page.$('#searchInput, input[type="search"], .controls input');
  check('classic: search/controls render', !!search);
  const realErrors = errors.filter((e) => !/net::|Failed to fetch|NetworkError|ERR_/.test(e));
  check('classic: no uncaught JS errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${fails ? ` — ${fails} FAIL` : ''}`);
process.exit(fails ? 1 : 0);
