// ============================================================
// projectblue-send (GH#39 vendor eval, Session 131, 2026-07-04) - outbound only
// ============================================================
// v1.1 (Session 138, 2026-07-15): PB INBOX P2 — STOP GATE + CONVERSATION UPSERT.
//   (1) STOP/HELP hard gate (TCPA, server-side): before calling Project Blue,
//       the target phone is checked against conversations.opted_out_at (by
//       phone_key). Opted-out => 403 { ok:false, error, opted_out:true } and
//       NO send. Contexts 'staff_notify' and 'auto_reply' bypass the gate
//       (staff phones aren't customers; the STOP confirmation itself must
//       still go out — sent by projectblue-webhook via direct API anyway).
//   (2) After a successful send, upserts `conversations` on phone_key
//       (last_message_at, last_direction='outbound', display_phone).
//       Non-fatal; the send result is already committed.
//
// Sends an iMessage/SMS to a customer (or test recipient) through Project Blue
// and logs the attempt to the `messages` table. API-compatible drop-in for
// sendblue-send: SAME request/response contract, so js/messaging.js (POC
// branch) can swap providers by changing only the endpoint name.
//
// Called with the same conventions as send-quote-email: Authorization bearer
// (user JWT or anon key), Content-Type json, and an X-PRVS-Secret header
// validated against the PRVS_FUNCTION_SECRET server secret.
//
// Secrets required (set by Roland):
//   PROJECTBLUE_API_KEY       - Project Blue API key (Settings -> API Keys)
//   PROJECTBLUE_LINE_ID       - OPTIONAL lineId (GET /get-lines) to pin the
//                               sending line; omitted = PB load-balances
//   PRVS_FUNCTION_SECRET      - shared header gate (already set project-wide)
//   SUPABASE_URL              - pre-existing
//   SUPABASE_SERVICE_ROLE_KEY - pre-existing (service role bypasses RLS)
// If PROJECTBLUE_API_KEY is missing the function returns 503 so this can ship
// before the account is wired (dormant-safe pattern, mirrors sendblue-send).
//
// Deploy:  supabase functions deploy projectblue-send
//
// Request body:
//   { action?: 'send'|'test', to: '+1...', body: '...', ro_id?, ro_code?,
//     sent_by?, context?, media_url? }
// Response (success): { ok:true, status, message_handle, is_imessage, projectblue }
//
// PROVIDER NOTES (from PB support answers, research/projectblue_requirements.md C2):
// - /send-api-message returns NO message id. We poll /get-messages-api right
//   after the send (to_number + created_at_gte + body match) to capture the
//   `message_handle` (pbm_...) for status correlation. Best-effort: handle may
//   be null if PB's queue lags; a reconciliation pass can backfill later.
// - PB dedupes IDENTICAL payloads for ~1 hour. Automated senders should vary
//   the body (RO code / timestamp) if a true re-send is intended.
// - PB `status` = pending|delivered where delivered means LEFT PB'S QUEUE
//   (sent_at set) - NOT a handset receipt.
// - messageType is returned AT SEND TIME -> is_imessage resolves immediately.
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

const PB_SEND_ENDPOINT = "https://api.tryprojectblue.com/send-api-message";
const PB_LIST_ENDPOINT = "https://api.tryprojectblue.com/get-messages-api";

// Digits-only last-10 phone key. MIRRORS projectblue-webhook phoneKey() —
// same normalization algorithm; keep the two in sync (spec §3a).
function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Contexts that bypass the opt-out gate: staff phones aren't customers, and
// the STOP confirmation auto-reply must be deliverable.
const SUPPRESSION_EXEMPT_CONTEXTS = new Set(["staff_notify", "auto_reply"]);

// Poll /get-messages-api to capture the message_handle for a just-queued send.
// Two attempts with a short delay; returns null if PB's queue hasn't surfaced
// the row yet (non-fatal - reconciliation can backfill).
async function captureMessageHandle(
  apiKey: string,
  to: string,
  body: string,
  sinceIso: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const qs = new URLSearchParams({
        to_number: to,
        direction: "outbound",
        created_at_gte: sinceIso,
        order_by: "createdAt",
        order_direction: "desc",
        limit: "5",
      });
      const resp = await fetch(`${PB_LIST_ENDPOINT}?${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      const match = rows.find((r) => r?.content === body && r?.message_handle);
      if (match) return String(match.message_handle);
    } catch (_e) {
      // swallow - handle capture is best-effort
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Shared-secret gate (matches send-quote-email / sendblue-send) ──
  const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-prvs-secret") || "";
    if (provided !== expectedSecret) {
      return json({ error: "Unauthorized - missing or invalid X-PRVS-Secret header" }, 401);
    }
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── Dormant-safe: no Project Blue key => 503 ───────────────────────
  const apiKey = Deno.env.get("PROJECTBLUE_API_KEY");
  if (!apiKey) {
    return json({
      error: "Project Blue not configured",
      detail: "PROJECTBLUE_API_KEY is not set on this project.",
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
    ? (String(payload.body || "").trim() || "PRVS Project Blue test - if you got this, the RO dashboard can text you.")
    : String(payload.body || "").trim();
  const mediaUrl = payload.media_url ? String(payload.media_url).trim() : "";

  if (!to) return json({ error: "Missing 'to' phone number (E.164, e.g. +12145551234)" }, 400);
  if (!content) return json({ error: "Missing message body" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── STOP gate (v1.1): refuse sends to opted-out customers ──────────
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

  // Optional line pin. Omitted => PB load-balances across the account's lines.
  const lineId = (Deno.env.get("PROJECTBLUE_LINE_ID") || "").trim();

  const pbBody: Record<string, unknown> = { message: content, phone: to };
  if (lineId) pbBody.lineId = lineId;
  if (mediaUrl) pbBody.mediaAttachmentUrl = mediaUrl;
  // PRVS CRM lives in this dashboard - never auto-create contacts in a
  // connected CRM (no CRM is connected today; explicit for safety).
  pbBody.shouldAutoCreateContact = false;

  const sinceIso = new Date(Date.now() - 5000).toISOString();

  // ── Call Project Blue ──────────────────────────────────────────────
  let pbResp: Response;
  let pbData: any;
  try {
    pbResp = await fetch(PB_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pbBody),
    });
    const text = await pbResp.text();
    try { pbData = JSON.parse(text); } catch { pbData = { raw: text }; }
  } catch (err) {
    return json({ error: "Project Blue request failed", detail: String(err) }, 502);
  }

  const ok = pbResp.ok && pbData?.success === true;
  // PB resolves iMessage-vs-SMS at send time (unlike Sendblue).
  const isImessage = pbData?.messageType === "iMessage" ? true
    : pbData?.messageType === "SMS" ? false
    : null;
  // PB "delivered" = left their queue, NOT handset receipt. New sends queue.
  const status = ok ? "queued" : "error";

  // Best-effort message_handle capture for status correlation.
  const messageHandle = ok ? await captureMessageHandle(apiKey, to, content, sinceIso) : null;

  // ── Log to messages (service role bypasses RLS) ────────────────────
  try {
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: payload.ro_id || null,
      ro_code: payload.ro_code || null,
      direction: "outbound",
      phone_to: to,
      phone_from: pbData?.devicePhoneNumber || null,
      body: content,
      media_url: mediaUrl ? [mediaUrl] : null,
      message_handle: messageHandle,
      status,
      is_imessage: isImessage,
      error_code: ok ? null : String(pbResp.status),
      error_message: ok ? null : (pbData?.error || `Project Blue HTTP ${pbResp.status}`),
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
    return json({ ok: false, projectblue_status: pbResp.status, projectblue: pbData }, 502);
  }

  // ── Conversation upsert (v1.1) — non-fatal, send already succeeded ─
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
    is_imessage: isImessage,
    projectblue: pbData,
  });
});
