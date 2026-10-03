/**
 * claude-vision-proxy — Supabase Edge Function
 * Proxies Claude Vision API calls so the Anthropic key never leaves the server.
 * Auth: origin-only (same pattern as slack-notify v1.2, send-quote-email v1.1)
 */
// [S194 SEC Phase 1 step 6] dashboard.prvstools.com added for the Cloudflare cutover; github.io stays until GitHub Pages is retired
const ALLOWED_ORIGINS = ['https://patriotsrv.github.io', 'https://dashboard.prvstools.com'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Origin-only auth — Anthropic key never leaves the server
  const origin = req.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { system, messages, model, max_tokens } = body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ system, messages, model: model || 'claude-opus-4-5', max_tokens: max_tokens || 2048 }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
