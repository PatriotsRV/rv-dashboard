// functions/_middleware.js — Cloudflare Pages Function (runs on EVERY request before static assets).
//
// [S194 SEC Phase 1 step 4] Host allow-list. Ported from prvshepard/prvs-internal-tools (S180) and
// prvs-sales-trainer (S181). Cloudflare Access can only protect hostnames on a zone we control, so
// the auto-issued *.pages.dev hostname (production AND every per-deployment preview URL) would be an
// ungated side door to the whole dashboard. This closes it at the edge.
//
// Returns a bare 404 rather than 403 on purpose: a 403 confirms something worth gating exists.
//
// This file is inert on GitHub Pages (served as a static file nobody links to) and does NOT run under
// python3 -m http.server locally — local dev is unaffected.

const ALLOWED_HOSTS = new Set([
  'dashboard.prvstools.com',
]);

export async function onRequest(context) {
  const host = (context.request.headers.get('host') || '').toLowerCase().split(':')[0];
  if (!ALLOWED_HOSTS.has(host)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  return context.next();
}
