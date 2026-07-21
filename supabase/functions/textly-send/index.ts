// ============================================================
// textly-send (GH#39 Textly pivot, Session 151, 2026-07-21) - outbound only
// ============================================================
// v1.0: Textly (Vested Networks' white-label of Textable) replaces Project
// Blue as the outbound SMS/MMS transport. API-compatible DROP-IN for
// projectblue-send: SAME request/response contract, so js/messaging.js and
// messages.html swap providers by changing only the endpoint name (the exact
// swap projectblue-send itself did to sendblue-send in S131).
//
// WHY THE PIVOT (S148): Project Blue requires porting the ENTIRE phone number
// to them. Textly sends from 940-488-5047 — the SAME line all 56k imported
// Kenect messages live on, already hosted at Vested. No port, no PB
// engagement gate (PB's silent-swallow of never-engaged numbers, S144, is a
// PB-specific behavior — Textable is a straight SMS provider).
//
// TEXTABLE API (docs: vestednetworks-txb.textable.app/docs/html, S148 review):
// - Auth: user API token (minted via POST /api/v2/users/{id}/token with a
//   FirebaseAuth bearer). Sent as `Authorization: Bearer <token>`.
// - Outbound: POST /api/send  { to, from, message } (E.164), optional
//   media[] (public URLs, MMS), sendAt (UTC ms, scheduling), notify (bool —
//   whether to alert the Textly web-app user).
// - Error codes: 400 bad request, 404 user/contact not found, 451 opted out
//   (legal), 500 server. NOTE: 451 means TEXTABLE-side opt-out; our own
//   conversations.opted_out_at gate still runs first (defense in depth).
// - No documented message-list/status endpoint: delivery-status semantics are
//   webhook-driven (relayWebhook copies every message both directions).
//   `status` for a successful send is therefore 'sent' (accepted by Textable),
//   NOT a handset receipt — same caveat as PB's 'delivered'.
// - is_imessage is always null (Textable is SMS/MMS only; no iMessage lane).
//
// Secrets required (set by Roland):
//   TEXTLY_API_TOKEN     - user API token (minted S151)
//   TEXTLY_FROM_E164     - sending line; '+19404885047' (shared number on
//                          Roland's Textly account). REQUIRED by /api/send.
//   TEXTLY_API_BASE      - OPTIONAL; defaults to the Vested tenant base URL.
//   PRVS_FUNCTION_SECRET - shared header gate (already set project-wide)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - pre-existing
// If TEXTLY_API_TOKEN is missing the function returns 503 (dormant-safe
// pattern, mirrors projectblue-send / sendblue-send).
//
// Deploy:  supabase functions deploy textly-send
//
// Request body (UNCHANGED from projectblue-send):
//   { action?: 'send'|'test', to: '+1...', body: '...', ro_id?, ro_code?,
//     sent_by?, context?, media_url? }
// Response (success): { ok:true, status, message_handle, is_imessage, textly }
//   (message_handle = Textable message id when the response surfaces one;
//    otherwise null — the relayWebhook echo carries MessageID and the echo
//    dedupe in textly-webhook matches on contact+body, not handle.)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

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

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047"; // Patriots RV main line (hosted at Vested)

// Digits-only last-10 phone key. MIRRORS textly-webhook phoneKey() —
// same normalization algorithm; keep the two in sync (spec §3a).
function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Contexts that bypass the opt-out gate: staff phones aren't customers, and
// the STOP confirmation auto-reply must be deliverable.
const SUPPRESSION_EXEMPT_CONTEXTS = new Set(["staff_notify", "auto_reply"]);

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Shared-secret gate (matches projectblue-send / send-quote-email) ──
  const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-prvs-secret") || "";
    if (provided !== expectedSecret) {
      return json({ error: "Unauthorized - missing or invalid X-PRVS-Secret header" }, 401);
    }
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── Dormant-safe: no Textly token => 503 ───────────────────────────
  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) {
    return json({
      error: "Textly not configured",
      detail: "TEXTLY_API_TOKEN is not set on this project.",
    }, 503);
  }
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = (payload.action as string) || "send";
  const to = String(payload.to || "").trim();
  const content = action === "test"
    ? (String(payload.body || "").trim() || "PRVS Textly test - if you got this, the RO dashboard can text you.")
    : String(payload.body || "").trim();
  const mediaUrl = payload.media_url ? String(payload.media_url).trim() : "";

  if (!to) return json({ error: "Missing 'to' phone number (E.164, e.g. +12145551234)" }, 400);
  if (!content) return json({ error: "Missing message body" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── STOP gate: refuse sends to opted-out customers ─────────────────
  // Fail-open on lookup errors (a DB blip must not block urgent sends);
  // the gate is best-effort defense-in-depth on top of the UI indicator.
  const requestContext = (payload.context as string) || (action === "test" ? "test" : "ro_customer");
  if (!SUPPRESSION_EXEMPT_CONTEXTS.has(requestContext)) {
    try {
      const key = phoneKey(to);
      if (key) {
        const { data: convo, error: convoErr } = await supabase
          .from("conversations")
          .select("opted_out_at, opt_out_keyword")
          .eq("phone_key", key)
          .maybeSingle();
        if (!convoErr && convo?.opted_out_at) {
          return json({
            ok: false,
            opted_out: true,
            error: `This customer opted out of texts (replied ${convo.opt_out_keyword || "STOP"} on ${String(convo.opted_out_at).slice(0, 10)}). Sends are blocked until they reply START.`,
          }, 403);
        }
      }
    } catch (e) {
      console.error("opt-out gate lookup failed (failing open):", e);
    }
  }

  const txBody: Record<string, unknown> = {
    to,
    from: fromE164,
    message: content,
  };
  if (mediaUrl) txBody.media = [mediaUrl];

  // ── Call Textly ────────────────────────────────────────────────────
  let txResp: Response;
  let txData: any;
  try {
    txResp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(txBody),
    });
    const text = await txResp.text();
    try { txData = JSON.parse(text); } catch { txData = { raw: text }; }
  } catch (err) {
    return json({ error: "Textly request failed", detail: String(err) }, 502);
  }

  const ok = txResp.ok;
  // Textable 451 = opted out on THEIR side (legal). Surface it like our own
  // STOP gate so the UI shows the right toast.
  if (txResp.status === 451) {
    return json({
      ok: false,
      opted_out: true,
      error: "Textly reports this number opted out of texts. Sends are blocked until they reply START.",
    }, 403);
  }

  // Response body shape is undocumented — pull an id if one is offered.
  const messageHandle = ok
    ? String(txData?.MessageID ?? txData?.messageId ?? txData?.id ?? "") || null
    : null;
  // 'sent' = accepted by Textable. NOT a handset receipt (no status API).
  const status = ok ? "sent" : "error";

  // ── Log to messages (service role bypasses RLS) ────────────────────
  try {
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: payload.ro_id || null,
      ro_code: payload.ro_code || null,
      direction: "outbound",
      phone_to: to,
      phone_from: fromE164,
      body: content,
      media_url: mediaUrl ? [mediaUrl] : null,
      message_handle: messageHandle,
      status,
      is_imessage: null, // Textable is SMS/MMS only
      error_code: ok ? null : String(txResp.status),
      error_message: ok ? null : (txData?.error || txData?.message || `Textly HTTP ${txResp.status}`),
      context: requestContext,
      sent_by: payload.sent_by || null,
      created_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    });
    if (insErr) console.error("messages insert error:", insErr.message);
  } catch (e) {
    console.error("messages log failed:", e);
  }

  if (!ok) {
    return json({ ok: false, textly_status: txResp.status, textly: txData }, 502);
  }

  // ── Conversation upsert — non-fatal, send already succeeded ────────
  // Staff notifies / auto-replies don't create customer conversations.
  if (!SUPPRESSION_EXEMPT_CONTEXTS.has(requestContext)) {
    try {
      const key = phoneKey(to);
      if (key) {
        const { error: upErr } = await supabase.from("conversations").upsert({
          phone_key: key,
          display_phone: to,
          last_message_at: new Date().toISOString(),
          last_direction: "outbound",
        }, { onConflict: "phone_key" });
        if (upErr) console.error("conversations upsert error:", upErr.message);
      }
    } catch (e) {
      console.error("conversations upsert failed (send already logged):", e);
    }
  }

  return json({
    ok: true,
    status,
    message_handle: messageHandle,
    is_imessage: null,
    textly: txData,
  });
});
