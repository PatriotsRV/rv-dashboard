// ============================================================
// twilio-sms (Stage 1, Session 53, 2026-04-21) — outbound only
// ============================================================
// Minimal outbound-SMS edge function for tech shift-end reminders.
// NOT yet deployed by default — Roland will deploy once his Twilio
// account is live and the TWILIO_* secrets are set. If the secrets
// are missing, returns 503 Service Unavailable so callers (the
// pg_cron reminder job, the webhook confirmation writes) get a clean
// signal to no-op without crashing.
//
// Actions:
//   send_sms — { to, body, context?, time_log_id? }
//              → calls Twilio Messages API, writes sms_log row
//   test      — { to } → sends a small "PRVS test" message; used by
//              Roland for smoke-testing once Twilio is live
//
// Does NOT implement:
//   - Templates (hardcoded message strings in the caller for Stage 1)
//   - Customer-facing SMS (that's Stage 3, after number port)
//   - Bulk send (send_sms is one-at-a-time)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-prvs-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

interface SendBody {
  action?: 'send_sms' | 'test';
  to?: string;
  body?: string;
  context?: string;
  time_log_id?: string | null;
}

interface TwilioSuccess {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  error_code?: number | null;
  error_message?: string | null;
}

// E.164 sanity check: + followed by 10-15 digits.
function isValidE164(s: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(s);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // ── Secret check (dormant-until-configured) ───────────────
  const twilioSid   = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom  = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!twilioSid || !twilioToken || !twilioFrom) {
    return new Response(JSON.stringify({
      error: "Twilio not configured",
      detail: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER must be set in Supabase → Settings → Edge Functions → Secrets.",
    }), {
      status: 503,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // ── Parse body ────────────────────────────────────────────
  let payload: SendBody;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const action = payload.action || 'send_sms';
  const to     = (payload.to || '').trim();
  const bodyStr = action === 'test'
    ? 'PRVS Dashboard SMS test — if you got this, Twilio is wired up correctly.'
    : (payload.body || '').trim();

  if (!to || !isValidE164(to)) {
    return new Response(JSON.stringify({ error: "Invalid 'to' — must be E.164 format like +15551234567" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  if (!bodyStr) {
    return new Response(JSON.stringify({ error: "Missing 'body'" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // ── Call Twilio ───────────────────────────────────────────
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', twilioFrom);
  form.set('Body', bodyStr);
  const basicAuth = btoa(`${twilioSid}:${twilioToken}`);

  let twilioResp: TwilioSuccess | null = null;
  let errorCode: number | null = null;
  let errorMsg: string | null = null;
  let twilioStatus = 'failed';

  try {
    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const respBody = await resp.json();
    if (resp.ok) {
      twilioResp = respBody as TwilioSuccess;
      twilioStatus = twilioResp.status || 'sent';
    } else {
      errorCode = respBody?.code || resp.status;
      errorMsg  = respBody?.message || `HTTP ${resp.status}`;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  // ── Audit log ─────────────────────────────────────────────
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    await sb.from('sms_log').insert({
      time_log_id: payload.time_log_id || null,
      phone_to: to,
      phone_from: twilioFrom,
      message_body: bodyStr,
      twilio_sid: twilioResp?.sid || null,
      status: twilioStatus,
      direction: 'outbound',
      error_code: errorCode,
      error_message: errorMsg,
      context: payload.context || (action === 'test' ? 'test' : null),
    });
  } catch (e) {
    console.error('sms_log insert failed:', e);
    // Non-fatal — the SMS itself still succeeded.
  }

  if (twilioResp) {
    return new Response(JSON.stringify({ success: true, sid: twilioResp.sid, status: twilioResp.status }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: false, error: errorMsg, code: errorCode }), {
    status: 502,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
});
