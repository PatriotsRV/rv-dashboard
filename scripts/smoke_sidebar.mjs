// S152 sidebar deploy-plan headless smoke — pre-auth checks only (v1.481 since the S153 pre-prod merge + renumber)
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const pageErrors = [];
const consoleLogs = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => consoleLogs.push(m.text()));

// ── 1. Launcher: sets flag + redirects ──────────────────────────
await page.goto(`${BASE}/sidebar-mockup.html`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
check('launcher redirects to index.html', page.url().endsWith('/index.html'), page.url());
const flag1 = await page.evaluate(() => localStorage.getItem('prvs_layout'));
check("launcher set prvs_layout='sidebar'", flag1 === 'sidebar', String(flag1));

// ── 2. Sidebar mode boot ────────────────────────────────────────
const hasSidebarClass = await page.evaluate(() => document.documentElement.classList.contains('layout-sidebar'));
check('html.layout-sidebar set pre-paint in sidebar mode', hasSidebarClass);
const sbShell = await page.$('#sbShell');
check('#sbShell present in sidebar mode', !!sbShell);
const classicBtn = await page.$('#sbFoot button[onclick*="classic"]');
check('↩ Classic View button present in sidebar footer', !!classicBtn);

// ── 3. Boot log v1.481 ──────────────────────────────────────────
await page.waitForTimeout(1500);
const bootLog = consoleLogs.find((t) => t.includes('Module system loaded'));
check('app.js boot log announces v1.481', !!bootLog && bootLog.includes('v1.481 [SIDEBAR S147+S152'),
  bootLog ? bootLog.slice(0, 60) : 'no boot log seen');

// ── 4. Return path: Classic View ────────────────────────────────
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), classicBtn.click()]);
await page.waitForTimeout(2000);
const flag2 = await page.evaluate(() => localStorage.getItem('prvs_layout'));
check("Classic View sets prvs_layout='classic'", flag2 === 'classic', String(flag2));
const stillSidebar = await page.evaluate(() => document.documentElement.classList.contains('layout-sidebar'));
check('classic mode: html.layout-sidebar absent', !stillSidebar);

// ── 5. Classic header: toggle gone, tester link present ─────────
const oldToggle = await page.$('#layoutToggleBtn');
check('old 🧭 toggle button REMOVED', !oldToggle);
const link = await page.$('#sidebarTesterLink');
check('🧪 New RO DB Tester link present', !!link);
if (link) {
  const href = await link.getAttribute('href');
  check('tester link href is RELATIVE sidebar-mockup.html', href === 'sidebar-mockup.html', String(href));
  const text = await link.textContent();
  check('tester link label', (text || '').includes('New RO DB Tester'), String(text));
}
const badge = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('header span')];
  return spans.map((s) => s.textContent).find((t) => /^v1\.\d+$/.test((t || '').trim()));
});
check('header version badge v1.481', badge && badge.trim() === 'v1.481', String(badge));

// ── 6. Round trip: tester link → sidebar again ──────────────────
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), link.click()]);
await page.waitForTimeout(2500);
const backInSidebar = await page.evaluate(() =>
  document.documentElement.classList.contains('layout-sidebar'));
check('clicking tester link lands back in sidebar layout', backInSidebar && page.url().endsWith('/index.html'), page.url());

// ── 7. Uncaught page errors (both layouts, whole run) ───────────
const realErrors = pageErrors.filter((e) => !/net::|Failed to fetch|NetworkError|ERR_/.test(e));
check('no uncaught JS errors across the run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${fails ? ` — ${fails} FAIL` : ''}`);
process.exit(fails ? 1 : 0);
