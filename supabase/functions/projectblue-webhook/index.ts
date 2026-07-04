// ============================================================
// projectblue-webhook (GH#39 vendor eval, Session 131, 2026-07-04) - capture
// ============================================================
// Receives Project Blue's message webhooks (inbound AND outbound events) and
// logs them to the `messages` table. This is the PoC capture half of the PB
// transport layer; RO routing / STOP handling are later phases (spec P5).
//
// PB WEBHOOK FACTS (support answers 2026-07-04, research doc C2):
// - Plain HTTPS JSON POST. NO auth headers, NO HMAC, NO signature.
//   -> Auth = shared secret in the URL query string (?secret=...).
// - SINGLE attempt, NO retries, ~10s timeout -> respond 200 FAST, keep work
//   minimal, and treat this stream as a HINT: the reconciliation poll of
//   /get-messages-api is the source of truth for anything missed.
// - Payload is TEXT-ONLY today (no media field). Inbound MMS media surfaces
//   later in /get-messages-api.media_attachment_url - poll to pick it up.
// - Payload shape (both directions):
//   { message, destination, receivedAt, direction: 'inbound'|'outbound',
//     messageId (number), guid (string), linePhoneNumber }
//   `destination` = the EXTERNAL contact's number in both directions (their
//   docs' inbound + outbound examples both show the customer number there);
//   `linePhoneNumber` = our PB line. Raw payload is console.logged for
//   verification during the PoC in case that reading is wrong.
//
// Secrets required (set by Roland):
//   PROJECTBLUE_WEBHOOK_SECRET - shared secret; PB portal webhook URL must be
//     https://<ref>.supabase.co/functions/v1/projectblue-webhook?secret=<value>
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - pre-existing
// Dormant-safe: missing secret => 503 (nothing captured until configured).
//
// Deploy (PB cannot send an Authorization header - JWT check must be off):
//   supabase functions deploy projectblue-webhook --no-verify-jwt
//
// DEDUPE NOTE: outbound sends made through projectblue-send are ALREADY
// logged by that function. PB's outbound webhook event for the same message
// would create a duplicate row, so outbound events that match a recent
// outbound `messages` row (same contact number + body within 2 hours) are
// SKIPPED (counted in the response for PoC visibility). Outbound events with
// no matching row (e.g. sends made from the PB web app) ARE logged so the
// dashboard sees staff activity that happened outside it.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── Secret-in-URL gate (PB cannot send custom headers) ─────────────
  const expected = Deno.env.get("PROJECTBLUE_WEBHOOK_SECRET");
  if (!expected) {
    return json({ error: "Webhook not configured", detail: "PROJECTBLUE_WEBHOOK_SECRET is not set." }, 503);
  }
  const provided = new URL(req.url).searchParams.get("secret") || "";
  if (provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Raw capture for PoC verification (visible in edge fn logs).
  console.log("PB webhook payload:", JSON.stringify(payload));

  const direction = payload.direction === "inbound" ? "inbound" : "outbound";
  const contactNumber = String(payload.destination || "").trim() || null;
  const lineNumber = String(payload.linePhoneNumber || "").trim() || null;
  const body = String(payload.message ?? "");
  const guid = payload.guid != null ? String(payload.guid) : null;
  const receivedAt = payload.receivedAt ? String(payload.receivedAt) : new Date().toISOString();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Outbound echo dedupe (see header note) ─────────────────────────
  if (direction === "outbound" && contactNumber) {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: dupes, error: dupErr } = await supabase
        .from("messages")
        .select("id")
        .eq("direction", "outbound")
        .eq("phone_to", contactNumber)
        .eq("body", body)
        .gte("created_at", twoHoursAgo)
        .limit(1);
      if (!dupErr && dupes && dupes.length > 0) {
        return json({ ok: true, action: "skipped_duplicate_outbound", guid });
      }
    } catch (e) {
      console.error("dedupe check failed (continuing to insert):", e);
    }
  }

  // ── Log to messages ────────────────────────────────────────────────
  const row = {
    ro_id: null, // RO routing is a later phase (spec P5)
    ro_code: null,
    direction,
    phone_to: direction === "inbound" ? lineNumber : contactNumber,
    phone_from: direction === "inbound" ? contactNumber : lineNumber,
    body,
    media_url: null, // PB webhooks are text-only today; media via list-API poll
    message_handle: guid, // PB webhook guid; NOT the same id space as pbm_ handles
    status: direction === "inbound" ? "received" : "sent",
    is_imessage: null, // not present in webhook payload; reconciliation can set it
    context: "pb_webhook",
    sent_by: null,
    created_at: receivedAt,
    status_updated_at: new Date().toISOString(),
  };

  const { error: insErr } = await supabase.from("messages").insert(row);
  if (insErr) {
    console.error("messages insert error:", insErr.message);
    // Still 200: PB will NOT retry, and the reconciliation poll can recover.
    return json({ ok: false, action: "insert_failed", detail: insErr.message });
  }

  return json({ ok: true, action: "logged", direction, guid });
});
