// ============================================================
// twilio-webhook (Stage 1, Session 53, 2026-04-21)
// ============================================================
// Receives inbound SMS from Twilio. Parses tech replies:
//   YES            → extend current open session by 1 hour (stamps extended_at)
//   OUT, CLOCKOUT  → close current open session now
//   STOP, UNSUB…   → clear staff.sms_opt_in_at (A2P compliance; no further SMS)
//   (anything else) → log + no-op
//
// Deploy with: supabase functions deploy twilio-webhook --no-verify-jwt
// (Twilio posts unauthenticated form-encoded data; we validate via Twilio
//  signature header + shared secret fallback.)
//
// Twilio webhook URL → https://axfejhudchdejoiwaetq.supabase.co/functions/v1/twilio-webhook
// Configure in Twilio console → Phone Numbers → Active Numbers → [Number] → Messaging → A MESSAGE COMES IN webhook.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// Twilio signature validation per https://www.twilio.com/docs/usage/webhooks/webhooks-security
async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
): Promise<boolean> {
  // Build data string: URL + concatenated sorted POST params
  const sortedKeys = Array.from(params.keys()).sort();
  let data = url;
  for (const k of sortedKeys) {
    data += k + params.get(k);
  }
  const encoder = new TextEncoder();
  const keyData = encoder.encode(authToken);
  const msgData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  // Base64-encode the signature bytes
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const expected = btoa(binary);
  return expected === signature;
}

// TwiML reply helper — Twilio posts expect TwiML XML in the response
function twimlReply(body: string | null): Response {
  const xml = body
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  const twilioAuth  = Deno.env.get("TWILIO_AUTH_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!twilioAuth) {
    // Dormant guard — if Twilio isn't configured, this endpoint should never be hit,
    // but if it is, return 503 and log for diagnosis.
    console.error('twilio-webhook hit but TWILIO_AUTH_TOKEN is not set');
    return new Response("Twilio not configured", { status: 503 });
  }

  // Parse form-encoded body (Twilio webhooks use application/x-www-form-urlencoded)
  let formText: string;
  try {
    formText = await req.text();
  } catch {
    return new Response("Bad request body", { status: 400 });
  }
  const params = new URLSearchParams(formText);

  // Validate Twilio signature
  const signature = req.headers.get('X-Twilio-Signature') || '';
  const url = req.url; // must be the full URL Twilio used to call us
  const sigOk = await verifyTwilioSignature(twilioAuth, url, params, signature);
  if (!sigOk) {
    console.warn('twilio-webhook signature mismatch — rejecting');
    return new Response("Invalid signature", { status: 403 });
  }

  const fromPhone = params.get('From') || '';
  const toPhone   = params.get('To')   || '';
  const bodyRaw   = params.get('Body') || '';
  const body = bodyRaw.trim().toUpperCase();

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Log inbound message first (audit)
  const inboundLogId = await (async () => {
    const { data, error } = await sb.from('sms_log').insert({
      phone_to: toPhone,
      phone_from: fromPhone,
      message_body: bodyRaw,
      direction: 'inbound',
      status: 'received',
      context: 'tech_reply_raw',
    }).select('id').maybeSingle();
    if (error) console.error('sms_log inbound insert error:', error);
    return data?.id ?? null;
  })();

  // Look up staff by phone_number to figure out which tech this is
  const { data: staffRow } = await sb
    .from('staff')
    .select('email, name, phone_number, sms_opt_in_at')
    .eq('phone_number', fromPhone)
    .maybeSingle();

  if (!staffRow) {
    // Unknown sender — do not respond, just log.
    console.log('Inbound SMS from unknown phone', fromPhone);
    return twimlReply(null);
  }

  // STOP / UNSUB — always honor
  if (body === 'STOP' || body === 'STOPALL' || body === 'UNSUBSCRIBE' || body === 'CANCEL' || body === 'END' || body === 'QUIT') {
    await sb.from('staff').update({ sms_opt_in_at: null }).eq('email', staffRow.email);
    await sb.from('sms_log').update({ context: 'tech_reply_stop' }).eq('id', inboundLogId);
    // Twilio auto-sends STOP confirmation; don't double-reply.
    return twimlReply(null);
  }

  // Only proceed if staff is opted in
  if (!staffRow.sms_opt_in_at) {
    return twimlReply('You are opted out of PRVS SMS. Contact Roland to re-enable.');
  }

  // Find the tech's currently open session (if any)
  const { data: openSession } = await sb
    .from('time_logs')
    .select('id, clock_in, ro_id')
    .ilike('tech_email', staffRow.email)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  // YES → extend 1 hour (only meaningful if session is open)
  if (body === 'YES' || body === 'Y') {
    if (!openSession) {
      return twimlReply('No open clock-in found. If you meant to clock in, open the PRVS check-in page.');
    }
    await sb
      .from('time_logs')
      .update({ extended_at: new Date().toISOString() })
      .eq('id', openSession.id);
    await sb.from('sms_log').update({ context: 'tech_reply_yes', time_log_id: openSession.id }).eq('id', inboundLogId);
    return twimlReply('OK, extended 1 hour. Reply OUT to clock out, or another YES around 5:45 to extend another hour.');
  }

  // OUT / CLOCKOUT → close the open session now
  if (body === 'OUT' || body === 'CLOCKOUT' || body === 'CLOCK OUT' || body === 'DONE') {
    if (!openSession) {
      return twimlReply('No open clock-in to close.');
    }
    await sb
      .from('time_logs')
      .update({ clock_out: new Date().toISOString(), close_reason: 'tech_sms_reply' })
      .eq('id', openSession.id);
    await sb.from('sms_log').update({ context: 'tech_reply_out', time_log_id: openSession.id }).eq('id', inboundLogId);
    return twimlReply('Clocked out. Thanks!');
  }

  // Anything else — log + gentle help response
  await sb.from('sms_log').update({ context: 'tech_reply_other' }).eq('id', inboundLogId);
  return twimlReply('PRVS: reply YES to stay clocked in 1 hr, OUT to clock out now, or STOP to stop SMS.');
});
