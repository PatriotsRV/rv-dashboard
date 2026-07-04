// ============================================================
// projectblue-webhook (GH#39, Session 131, 2026-07-04) - capture + routing
// ============================================================
// v1.1 (Session 132, 2026-07-04): INBOUND RO ROUTING + MANAGER NOTIFY.
//   Inbound messages are matched phone -> active repair_orders row (digits-only
//   last-10 compare vs repair_orders.phone, deleted_at IS NULL). Tiebreak when a
//   customer has multiple active ROs: prefer status != 'Delivered/Cashed Out',
//   then most recent updated_at (Roland decision S132). Matched inbound rows are
//   inserted WITH ro_id + ro_code; unknown numbers stay untagged (unassigned
//   inbox per spec section 10). A routed inbound also enqueues ONE
//   scheduled_notifications row (source 'inbound_message_notify', sent by the
//   15-min process-scheduled-notifications cron) to the RO's silo manager(s) +
//   admins - deduped so rapid-fire texts within 60 min to the same RO do not
//   stack notifications. Requires migration inbound_message_notify_source.sql
//   (CHECK widen). All routing/notify work is non-fatal: capture never fails
//   because of it. STOP/HELP handling remains a later phase (spec P5/section 8).
//
// v1.0 (Session 131): capture half of the PB transport layer.
// Receives Project Blue's message webhooks (inbound AND outbound events) and
// logs them to the `messages` table.
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

// Mirrors js/config.js REPAIR_TYPE_TO_SILO (repair_type label -> staff.service_silo key).
const REPAIR_TYPE_TO_SILO: Record<string, string> = {
  "repairs": "repair",
  "repair": "repair",
  "vroom": "vroom",
  "solar": "solar",
  "roof": "roof",
  "paint and body": "paint_body",
  "paint & body": "paint_body",
  "chassis": "chassis",
  "detailing": "detailing",
  "truetopper": "truetopper",
};

// Digits-only last-10 phone key (US numbers). '+1 (940) 372-6085' -> '9403726085'.
function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

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

  // ── Inbound RO routing (v1.1 S132) ─────────────────────────────────
  // phone -> active RO. Non-fatal: any failure leaves the row untagged.
  let routedRO: {
    id: string; ro_id: string | null; customer_name: string | null;
    rv: string | null; repair_type: string | null;
  } | null = null;
  if (direction === "inbound" && contactNumber) {
    try {
      const key = phoneKey(contactNumber);
      if (key) {
        const { data: ros, error: roErr } = await supabase
          .from("repair_orders")
          .select("id, ro_id, customer_name, rv, phone, status, repair_type, updated_at")
          .is("deleted_at", null)
          .not("phone", "is", null);
        if (!roErr && ros) {
          const matches = ros.filter((r) => phoneKey(r.phone) === key);
          // Tiebreak: prefer not-yet-delivered, then most recent activity.
          matches.sort((a, b) => {
            const aDone = a.status === "Delivered/Cashed Out" ? 1 : 0;
            const bDone = b.status === "Delivered/Cashed Out" ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
          });
          if (matches.length > 0) routedRO = matches[0];
        }
      }
    } catch (e) {
      console.error("RO routing failed (row will be untagged):", e);
    }
  }

  // ── Log to messages ────────────────────────────────────────────────
  const row = {
    ro_id: routedRO ? routedRO.id : null,
    ro_code: routedRO ? routedRO.ro_id : null,
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

  // ── Silo-manager notification for routed inbound (v1.1 S132) ───────
  // ONE pending scheduled_notifications row per RO per 60 min (rapid-fire
  // texts do not stack). Sent by the 15-min process-scheduled-notifications
  // cron. Recipients mirror js/ro-crud.js _keyDateRecipients: silo manager(s)
  // for the RO's repair_type + sr-managers with no silo + admin_report_
  // recipients from app_config; fallback repair@. Non-fatal.
  let notified = false;
  if (direction === "inbound" && routedRO) {
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("scheduled_notifications")
        .select("id")
        .eq("ro_id", routedRO.id)
        .eq("source", "inbound_message_notify")
        .gte("created_at", hourAgo)
        .limit(1);
      if (!recent || recent.length === 0) {
        const silos = String(routedRO.repair_type || "").split(",")
          .map((s) => REPAIR_TYPE_TO_SILO[s.trim().toLowerCase()]).filter(Boolean);
        let recipients: string[] = [];
        const { data: staff } = await supabase
          .from("staff")
          .select("email, role, active, service_silo");
        if (staff) {
          recipients = staff
            .filter((s) => s.active !== false && s.email
              && (s.role === "manager" || s.role === "sr_manager")
              && (silos.includes(s.service_silo) || (s.service_silo == null && s.role === "sr_manager")))
            .map((s) => s.email);
        }
        const { data: cfg } = await supabase
          .from("app_config")
          .select("value")
          .eq("key", "admin_report_recipients")
          .maybeSingle();
        const admins = String(cfg?.value || "").split(",").map((e) => e.trim()).filter(Boolean);
        const all = [...new Set([...recipients, ...admins])];
        const finalRecipients = all.length ? all : ["repair@patriotsrvservices.com"];
        const preview = body.length > 160 ? body.slice(0, 157) + "..." : body;
        const { error: nErr } = await supabase.from("scheduled_notifications").insert({
          ro_id: routedRO.id,
          scheduled_at: new Date().toISOString(),
          recipient_emails: finalRecipients,
          subject: `\u{1F4AC} Customer reply — ${routedRO.customer_name || "Customer"} (${routedRO.ro_id || ""})`,
          body: [
            `${routedRO.customer_name || "A customer"} replied by text about ${routedRO.rv || "their RV"}.`,
            "",
            `"${preview}"`,
            "",
            `Service: ${routedRO.repair_type || "TBD"}`,
            `RO ID: ${routedRO.ro_id || ""}`,
            "",
            "Open the RO card on the dashboard and click \u{1F4AC} Message Customer to reply.",
            "(You will get at most one of these per RO per hour, even if the customer sends several texts.)",
          ].join("\n"),
          source: "inbound_message_notify",
          status: "pending",
          created_by_email: "pb-webhook",
        });
        if (nErr) console.error("inbound notify enqueue error:", nErr.message);
        else notified = true;
      }
    } catch (e) {
      console.error("inbound notify failed (message already logged):", e);
    }
  }

  return json({
    ok: true, action: "logged", direction, guid,
    routed_ro: routedRO ? routedRO.ro_id : null, notified,
  });
});
