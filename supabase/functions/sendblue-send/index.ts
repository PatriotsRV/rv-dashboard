// ============================================================
// sendblue-send (GH#39 Phase 2 POC, Session 98, 2026-06-09) - outbound only
// ============================================================
// Sends an iMessage/SMS to a customer (or test recipient) through Sendblue
// and logs the attempt to the `messages` table. Replaces the messaging gap
// left by the Kenect removal (v1.445).
//
// Called from the dashboard (js/messaging.js) with the same conventions as
// send-quote-email: Authorization bearer (user JWT or anon key), Content-Type
// json, and an X-PRVS-Secret header validated against the PRVS_FUNCTION_SECRET
// server secret.
//
// Secrets required (set by Roland):
//   SENDBLUE_API_KEY_ID       - Sendblue "API Key ID"
//   SENDBLUE_API_SECRET_KEY   - Sendblue "API Secret Key"
//   PRVS_FUNCTION_SECRET      - shared header gate (already set project-wide)
//   SUPABASE_URL              - pre-existing
//   SUPABASE_SERVICE_ROLE_KEY - pre-existing (service role bypasses RLS)
// If the SENDBLUE_* secrets are missing the function returns 503 so the
// migration + UI can ship before the account is wired (dormant-safe pattern).
//
// Deploy:  supabase functions deploy sendblue-send
//
// Request body:
//   { action?: 'send'|'test', to: '+1...', body: '...', ro_id?, ro_code?,
//     sent_by?, context? }
// Response (success): { ok:true, status, message_handle, is_imessage, sendblue }
//
// NOT in this POC: inbound replies, delivery/read webhooks, MMS/media send.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// POC allows the prod origin + the localhost dev origin (Session 67 OAuth
// origin) so the panel can be smoke-tested locally. Tighten to prod-only
// before the production cutover.
const ALLOWED_ORIGINS = ["https://patriotsrv.github.io", "http://localhost:8765"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prvs-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SENDBLUE_ENDPOINT = "https://api.sendblue.co/api/send-message";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Shared-secret gate (matches send-quote-email) ──────────────────
  const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-prvs-secret") || "";
    if (provided !== expectedSecret) {
      return json({ error: "Unauthorized - missing or invalid X-PRVS-Secret header" }, 401);
    }
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── Dormant-safe: no Sendblue creds => 503 ─────────────────────────
  const keyId = Deno.env.get("SENDBLUE_API_KEY_ID");
  const keySecret = Deno.env.get("SENDBLUE_API_SECRET_KEY");
  if (!keyId || !keySecret) {
    return json({
      error: "Sendblue not configured",
      detail: "SENDBLUE_API_KEY_ID / SENDBLUE_API_SECRET_KEY are not set on this project.",
    }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = (payload.action as string) || "send";
  const to = String(payload.to || "").trim();
  const content = action === "test"
    ? (String(payload.body || "").trim() || "PRVS Sendblue test - if you got this, the RO dashboard can text you.")
    : String(payload.body || "").trim();

  if (!to) return json({ error: "Missing 'to' phone number (E.164, e.g. +12145551234)" }, 400);
  if (!content) return json({ error: "Missing message body" }, 400);

  // Sendblue's send-message API requires from_number (which line to send from).
  // Default to the shared sandbox line; override via the SENDBLUE_FROM_NUMBER
  // secret when migrating to the hosted office number for production cutover.
  const fromNumber = (Deno.env.get("SENDBLUE_FROM_NUMBER") || "+16466208124").trim();

  // ── Call Sendblue ──────────────────────────────────────────────────
  let sbResp: Response;
  let sbData: any;
  try {
    sbResp = await fetch(SENDBLUE_ENDPOINT, {
      method: "POST",
      headers: {
        "sb-api-key-id": keyId,
        "sb-api-secret-key": keySecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: to, from_number: fromNumber, content }),
    });
    const text = await sbResp.text();
    try { sbData = JSON.parse(text); } catch { sbData = { raw: text }; }
  } catch (err) {
    return json({ error: "Sendblue request failed", detail: String(err) }, 502);
  }

  const ok = sbResp.ok;
  const status = sbData?.status ? String(sbData.status).toLowerCase() : (ok ? "sent" : "error");
  // Sendblue `was_downgraded`: true = iMessage fell back to SMS; false = stayed iMessage.
  const isImessage = sbData?.was_downgraded === true ? false
    : sbData?.was_downgraded === false ? true
    : null;

  // ── Log to messages (service role bypasses RLS) ────────────────────
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: payload.ro_id || null,
      ro_code: payload.ro_code || null,
      direction: "outbound",
      phone_to: to,
      phone_from: sbData?.from_number || null,
      body: content,
      message_handle: sbData?.message_handle || null,
      status: ok ? status : "error",
      is_imessage: isImessage,
      error_code: sbData?.error_code != null ? String(sbData.error_code) : null,
      error_message: sbData?.error_message || (ok ? null : `Sendblue HTTP ${sbResp.status}`),
      context: (payload.context as string) || (action === "test" ? "test" : "ro_customer"),
      sent_by: payload.sent_by || null,
      created_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    });
    if (insErr) console.error("messages insert error:", insErr.message);
  } catch (e) {
    console.error("messages log failed:", e);
  }

  if (!ok) {
    return json({ ok: false, sendblue_status: sbResp.status, sendblue: sbData }, 502);
  }
  return json({
    ok: true,
    status,
    message_handle: sbData?.message_handle || null,
    is_imessage: isImessage,
    sendblue: sbData,
  });
});
