// ============================================================
// projectblue-webhook (GH#39, Session 131, 2026-07-04) - capture + routing
// ============================================================
// v1.2 (Session 138, 2026-07-15): PB INBOX P2 — CONVERSATIONS + STOP/HELP.
//   Per docs/specs/PB_INBOX_ASSIGNMENT_SPEC.md §4a + the S137 STOP/HELP
//   fold-in decision:
//   (1) Every inbound upserts `conversations` on phone_key (last_message_at,
//       last_direction, display_phone, customer_name from routed RO).
//   (2) STOP/HELP hard gate (TCPA): exact-keyword inbound bodies flip the
//       conversation's opted_out_at (STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT
//       set it; START/YES/UNSTOP clear it; HELP/INFO = info reply only), write
//       a conversation_events row (actor 'customer-sms'), and fire ONE direct
//       PB auto-reply (logged to messages as context 'auto_reply' so the
//       outbound-echo dedupe suppresses PB's webhook event for it).
//       projectblue-send enforces the suppression on the send side.
//   (3) Notify fork: if the conversation is ASSIGNED, the inbound notifies the
//       OWNER (scheduled_notifications source 'assigned_inbound_notify' +
//       direct PB SMS to staff.phone_number, both 60-min deduped) INSTEAD of
//       the silo-manager blast; unassigned keeps the existing blast fallback.
//   All new work is non-fatal: capture never fails because of it.
//
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
//   because of it.
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
//   `destination` = the EXTERNAL contact's number in both directions.
//
// Secrets required (set by Roland):
//   PROJECTBLUE_WEBHOOK_SECRET - shared secret in the webhook URL query string
//   PROJECTBLUE_API_KEY        - NEW in v1.2 (optional): used for STOP/HELP
//     auto-replies + assigned-owner SMS notifies. Missing => those sends are
//     skipped (logged); capture/upsert/notify-email still work.
//   PROJECTBLUE_LINE_ID        - optional line pin (same as projectblue-send)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - pre-existing
// Dormant-safe: missing webhook secret => 503 (nothing captured).
//
// Deploy (PB cannot send an Authorization header - JWT check must be off):
//   supabase functions deploy projectblue-webhook --no-verify-jwt
//
// DEDUPE NOTE: outbound sends made through projectblue-send are ALREADY
// logged by that function, and v1.2's auto-replies/owner-SMS insert their own
// messages rows here. PB's outbound webhook event for the same message would
// create a duplicate row, so outbound events that match a recent outbound
// `messages` row (same contact number + body within 2 hours) are SKIPPED.
// Outbound events with no matching row (e.g. sends made from the PB web app)
// ARE logged so the dashboard sees staff activity that happened outside it.
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

// TCPA keyword sets (exact match on the trimmed, uppercased body).
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

const AUTO_REPLIES = {
  opted_out: "Patriots RV Services: You have been unsubscribed and will receive no more texts from us. Reply START to resubscribe.",
  opted_in: "Patriots RV Services: You are resubscribed and may receive texts from us again. Reply STOP to unsubscribe.",
  help: "Patriots RV Services: Reply STOP to unsubscribe, START to resubscribe, or call us at (940) 488-5047.",
};

const PB_SEND_ENDPOINT = "https://api.tryprojectblue.com/send-api-message";

// Digits-only last-10 phone key (US numbers). '+1 (940) 372-6085' -> '9403726085'.
function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Direct PB send for auto-replies + owner SMS notifies. Fire-and-log:
// non-fatal, no message_handle capture (reconciliation can backfill).
// Inserts its own messages row so the outbound-echo dedupe suppresses the
// PB webhook event for this send.
async function pbDirectSend(
  supabase: ReturnType<typeof createClient>,
  to: string,
  body: string,
  context: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("PROJECTBLUE_API_KEY");
  if (!apiKey) {
    console.log(`pbDirectSend skipped (${context}): PROJECTBLUE_API_KEY not set`);
    return false;
  }
  try {
    const pbBody: Record<string, unknown> = {
      message: body,
      phone: to,
      shouldAutoCreateContact: false,
    };
    const lineId = (Deno.env.get("PROJECTBLUE_LINE_ID") || "").trim();
    if (lineId) pbBody.lineId = lineId;
    const resp = await fetch(PB_SEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(pbBody),
    });
    const ok = resp.ok;
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: null,
      ro_code: null,
      direction: "outbound",
      phone_to: to,
      phone_from: null,
      body,
      media_url: null,
      message_handle: null,
      status: ok ? "queued" : "error",
      is_imessage: null,
      error_code: ok ? null : String(resp.status),
      error_message: ok ? null : `Project Blue HTTP ${resp.status}`,
      context,
      sent_by: "pb-webhook",
      created_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    });
    if (insErr) console.error(`pbDirectSend (${context}) messages log error:`, insErr.message);
    if (!ok) console.error(`pbDirectSend (${context}) PB HTTP ${resp.status}`);
    return ok;
  } catch (e) {
    console.error(`pbDirectSend (${context}) failed:`, e);
    return false;
  }
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

  // ── Conversation upsert + STOP/HELP gate (v1.2 S138) ───────────────
  // Non-fatal: message is already captured above.
  let convo: {
    id: string; assigned_to: string | null; customer_name: string | null;
    opted_out_at: string | null;
  } | null = null;
  let keywordAction: "opted_out" | "opted_in" | "help" | null = null;
  if (direction === "outbound" && contactNumber) {
    // Outbound events that reach here are NON-dupes (sends made outside the
    // dashboard, e.g. the PB web app) — keep the conversation row current.
    try {
      const key = phoneKey(contactNumber);
      if (key) {
        const { error: upErr } = await supabase.from("conversations").upsert({
          phone_key: key,
          display_phone: contactNumber,
          last_message_at: receivedAt,
          last_direction: "outbound",
        }, { onConflict: "phone_key" });
        if (upErr) console.error("outbound conversations upsert error:", upErr.message);
      }
    } catch (e) {
      console.error("outbound conversations upsert failed (message already logged):", e);
    }
  }
  if (direction === "inbound" && contactNumber) {
    try {
      const key = phoneKey(contactNumber);
      if (key) {
        const normalized = body.trim().toUpperCase();
        if (OPT_OUT_KEYWORDS.has(normalized)) keywordAction = "opted_out";
        else if (OPT_IN_KEYWORDS.has(normalized)) keywordAction = "opted_in";
        else if (HELP_KEYWORDS.has(normalized)) keywordAction = "help";

        // Read existing row first so we can (a) avoid clobbering a good
        // customer_name with null and (b) write old/new values to events.
        const { data: existing } = await supabase
          .from("conversations")
          .select("id, assigned_to, customer_name, opted_out_at")
          .eq("phone_key", key)
          .maybeSingle();

        const upsertRow: Record<string, unknown> = {
          phone_key: key,
          display_phone: contactNumber,
          last_message_at: receivedAt,
          last_direction: "inbound",
        };
        if (routedRO?.customer_name) upsertRow.customer_name = routedRO.customer_name;
        if (keywordAction === "opted_out") {
          upsertRow.opted_out_at = new Date().toISOString();
          upsertRow.opt_out_keyword = body.trim().toUpperCase();
        } else if (keywordAction === "opted_in") {
          upsertRow.opted_out_at = null;
          upsertRow.opt_out_keyword = null;
        }

        const { data: upserted, error: upErr } = await supabase
          .from("conversations")
          .upsert(upsertRow, { onConflict: "phone_key" })
          .select("id, assigned_to, customer_name, opted_out_at")
          .maybeSingle();
        if (upErr) console.error("conversations upsert error:", upErr.message);
        convo = upserted || existing || null;

        // Audit + auto-reply for the keyword actions.
        if (convo && keywordAction === "opted_out" && !existing?.opted_out_at) {
          const { error: evErr } = await supabase.from("conversation_events").insert({
            conversation_id: convo.id,
            event: "opted_out",
            actor_email: "customer-sms",
            old_value: null,
            new_value: body.trim().toUpperCase(),
          });
          if (evErr) console.error("opted_out event insert error:", evErr.message);
        }
        if (convo && keywordAction === "opted_in" && existing?.opted_out_at) {
          const { error: evErr } = await supabase.from("conversation_events").insert({
            conversation_id: convo.id,
            event: "opted_in",
            actor_email: "customer-sms",
            old_value: existing.opted_out_at,
            new_value: null,
          });
          if (evErr) console.error("opted_in event insert error:", evErr.message);
        }
        if (keywordAction) {
          // TCPA allows exactly one confirmation after STOP; HELP/START get
          // their info replies. Sent direct (not via projectblue-send, whose
          // suppression gate would block the STOP confirmation).
          await pbDirectSend(supabase, contactNumber, AUTO_REPLIES[keywordAction], "auto_reply");
        }
      }
    } catch (e) {
      console.error("conversation upsert/keyword handling failed (message already logged):", e);
    }
  }

  // ── Inbound notify: owner fork (v1.2) else silo blast (v1.1) ───────
  // Keyword messages (STOP/START/HELP) never notify — the auto-reply and
  // conversation_events row are the record.
  let notified = false;
  let notifiedOwner: string | null = null;
  if (direction === "inbound" && !keywordAction && convo?.assigned_to) {
    // ── ASSIGNED: notify the owner instead of the blast ──────────────
    try {
      const owner = convo.assigned_to;
      const customerLabel = convo.customer_name || routedRO?.customer_name || contactNumber || "Customer";
      const subject = `\u{1F4AC} Customer reply — ${customerLabel} (${phoneKey(contactNumber)})`;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("scheduled_notifications")
        .select("id")
        .eq("source", "assigned_inbound_notify")
        .eq("subject", subject)
        .gte("created_at", hourAgo)
        .limit(1);
      if (!recent || recent.length === 0) {
        const preview = body.length > 160 ? body.slice(0, 157) + "..." : body;
        const { error: nErr } = await supabase.from("scheduled_notifications").insert({
          ro_id: routedRO ? routedRO.id : null,
          scheduled_at: new Date().toISOString(),
          recipient_emails: [owner],
          subject,
          body: [
            `${customerLabel} replied by text${routedRO?.rv ? ` about ${routedRO.rv}` : ""}. This conversation is assigned to you.`,
            "",
            `"${preview}"`,
            "",
            routedRO?.ro_id ? `RO ID: ${routedRO.ro_id}` : "(No active RO matched this number.)",
            "",
            "Open Messages on the dashboard to respond.",
            "(You will get at most one of these per conversation per hour.)",
          ].join("\n"),
          source: "assigned_inbound_notify",
          status: "pending",
          created_by_email: "pb-webhook",
        });
        if (nErr) console.error("assigned inbound notify enqueue error:", nErr.message);
        else {
          notified = true;
          notifiedOwner = owner;
          // SMS to the owner's mobile (staff.phone_number; NULL = skip).
          // Shares the 60-min dedupe above (we only get here when fresh).
          const { data: staffRow } = await supabase
            .from("staff")
            .select("phone_number")
            .eq("email", owner)
            .maybeSingle();
          const ownerPhone = (staffRow?.phone_number || "").trim();
          if (ownerPhone) {
            const smsPreview = body.length > 80 ? body.slice(0, 77) + "..." : body;
            await pbDirectSend(
              supabase,
              ownerPhone,
              `\u{1F4AC} ${customerLabel} replied: "${smsPreview}" — open Messages to respond.`,
              "staff_notify",
            );
          }
        }
      }
    } catch (e) {
      console.error("assigned inbound notify failed (message already logged):", e);
    }
  } else if (direction === "inbound" && !keywordAction && routedRO) {
    // ── UNASSIGNED fallback: existing silo-manager/admin blast (v1.1) ─
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
    routed_ro: routedRO ? routedRO.ro_id : null,
    keyword: keywordAction,
    notified, notified_owner: notifiedOwner,
  });
});
