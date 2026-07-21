// ============================================================
// textly-webhook (GH#39 Textly pivot, Session 151, 2026-07-21) - capture + routing
// ============================================================
// v1.0: Textly (Textable) relayWebhook ingest. Direct port of
// projectblue-webhook v1.2 — ALL of its behavior is preserved:
//   (1) capture every relayed message to `messages`
//   (2) outbound-echo dedupe (sends made via textly-send are already logged)
//   (3) inbound RO routing (phone -> active repair_orders, S132 tiebreak)
//   (4) conversations upsert both directions (+ customer_name backfill)
//   (5) STOP/HELP TCPA hard gate + one auto-reply (via direct Textly send)
//   (6) notify fork: assigned owner (email + SMS, 60-min dedupe) else
//       silo-manager/admin blast (60-min dedupe per RO)
//
// TEXTABLE RELAY WEBHOOK FACTS (docs, S148/S151 review):
// - Configured per-user: POST /api/users/{id}/webhook { url }. The relay
//   POSTs a copy of EVERY message, inbound AND outbound, for that user's
//   visible conversations.
// - Payload (documented; PascalCase):
//     { MessageID, ConversationID, ToNumber, FromNumber, MessageBody,
//       MessageDirection, TextableUserID, ContactName, ContactEmail,
//       AccessToken? }
//   No timestamp field is documented -> we stamp arrival time.
//   No media field is documented -> raw payload is logged; if Textable adds
//   media keys they'll show in the logs and we extend (see _extractMedia).
// - No documented auth/signature on the relay POST -> same posture as PB:
//   shared secret in the URL query string (?secret=...). Respond 200 fast;
//   assume NO retries (undocumented — treat like PB's single attempt).
// - Parsing is TOLERANT: PascalCase per docs with camel/lowercase fallbacks,
//   because white-label deployments have drifted from the docs before.
//
// Secrets required (set by Roland):
//   TEXTLY_WEBHOOK_SECRET - shared secret in the webhook URL query string
//   TEXTLY_API_TOKEN      - optional: used for STOP/HELP auto-replies +
//     assigned-owner SMS notifies. Missing => those sends are skipped
//     (logged); capture/upsert/notify-email still work.
//   TEXTLY_API_BASE / TEXTLY_FROM_E164 - same defaults as textly-send
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - pre-existing
// Dormant-safe: missing webhook secret => 503 (nothing captured).
//
// Deploy (Textable cannot send an Authorization header - JWT check off):
//   supabase functions deploy textly-webhook --no-verify-jwt
//
// Register (once, after deploy — uses the user API token):
//   POST {base}/api/users/{textableUserId}/webhook
//   { "url": "https://axfejhudchdejoiwaetq.supabase.co/functions/v1/textly-webhook?secret=<TEXTLY_WEBHOOK_SECRET>" }
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

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";

// Digits-only last-10 phone key (US numbers). '+1 (940) 372-6085' -> '9403726085'.
function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Tolerant field picker: PascalCase per docs, camelCase/lowercase fallbacks.
function pick(payload: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = payload[n];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// Media extraction: NOT documented for the relay payload. Accept the obvious
// shapes if Textable sends them; otherwise null (raw payload is in the logs).
function extractMedia(payload: Record<string, unknown>): string[] | null {
  const cand = payload["Media"] ?? payload["media"] ?? payload["MediaUrls"] ??
    payload["mediaUrls"] ?? payload["MediaURL"] ?? payload["mediaUrl"];
  if (!cand) return null;
  const arr = Array.isArray(cand) ? cand : [cand];
  const urls = arr.map((u) => String(u)).filter((u) => /^https?:/i.test(u));
  return urls.length ? urls : null;
}

// Direct Textly send for auto-replies + owner SMS notifies. Fire-and-log:
// non-fatal. Inserts its own messages row so the outbound-echo dedupe
// suppresses the relay event for this send.
async function textlyDirectSend(
  supabase: ReturnType<typeof createClient>,
  to: string,
  body: string,
  context: string,
): Promise<boolean> {
  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) {
    console.log(`textlyDirectSend skipped (${context}): TEXTLY_API_TOKEN not set`);
    return false;
  }
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();
  try {
    const resp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: fromE164, message: body }),
    });
    const ok = resp.ok;
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: null,
      ro_code: null,
      direction: "outbound",
      phone_to: to,
      phone_from: fromE164,
      body,
      media_url: null,
      message_handle: null,
      status: ok ? "sent" : "error",
      is_imessage: null,
      error_code: ok ? null : String(resp.status),
      error_message: ok ? null : `Textly HTTP ${resp.status}`,
      context,
      sent_by: "textly-webhook",
      created_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    });
    if (insErr) console.error(`textlyDirectSend (${context}) messages log error:`, insErr.message);
    if (!ok) console.error(`textlyDirectSend (${context}) Textly HTTP ${resp.status}`);
    return ok;
  } catch (e) {
    console.error(`textlyDirectSend (${context}) failed:`, e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── Secret-in-URL gate (relay POST carries no auth headers) ────────
  const expected = Deno.env.get("TEXTLY_WEBHOOK_SECRET");
  if (!expected) {
    return json({ error: "Webhook not configured", detail: "TEXTLY_WEBHOOK_SECRET is not set." }, 503);
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

  // Raw capture for rollout verification (visible in edge fn logs). Redact
  // the AccessToken field if present — we never store or use it.
  const logged = { ...payload };
  delete logged["AccessToken"]; delete logged["accessToken"];
  console.log("Textly relay payload:", JSON.stringify(logged));

  const rawDirection = pick(payload, "MessageDirection", "messageDirection", "direction").toLowerCase();
  const direction = rawDirection.includes("in") && !rawDirection.includes("out") ? "inbound" : "outbound";
  const toNumber = pick(payload, "ToNumber", "toNumber", "to");
  const fromNumber = pick(payload, "FromNumber", "fromNumber", "from");
  // The EXTERNAL contact's number: inbound => sender, outbound => recipient.
  const contactNumber = (direction === "inbound" ? fromNumber : toNumber) || null;
  const lineNumber = (direction === "inbound" ? toNumber : fromNumber) || null;
  const body = pick(payload, "MessageBody", "messageBody", "message", "body");
  const messageId = pick(payload, "MessageID", "MessageId", "messageId", "id") || null;
  const contactName = pick(payload, "ContactName", "contactName") || null;
  const media = extractMedia(payload);
  const receivedAt = new Date().toISOString(); // no timestamp in documented payload

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Duplicate-relay guard (by Textable MessageID, both directions) ─
  // Retry semantics are undocumented; if the relay ever re-POSTs, the
  // MessageID match stops a double insert. Cheap indexed-column lookup.
  if (messageId) {
    try {
      const { data: dupes, error: dupErr } = await supabase
        .from("messages")
        .select("id")
        .eq("message_handle", messageId)
        .limit(1);
      if (!dupErr && dupes && dupes.length > 0) {
        return json({ ok: true, action: "skipped_duplicate_relay", message_id: messageId });
      }
    } catch (e) {
      console.error("relay dedupe check failed (continuing):", e);
    }
  }

  // ── Outbound echo dedupe (sends via textly-send already logged) ────
  if (direction === "outbound" && contactNumber) {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: dupes, error: dupErr } = await supabase
        .from("messages")
        .select("id, message_handle")
        .eq("direction", "outbound")
        .eq("phone_to", contactNumber)
        .eq("body", body)
        .gte("created_at", twoHoursAgo)
        .limit(1);
      if (!dupErr && dupes && dupes.length > 0) {
        // Backfill the Textable message id onto our send row if it lacks one
        // (textly-send's response id capture is best-effort).
        if (messageId && dupes[0] && !dupes[0].message_handle) {
          const { error: bfErr } = await supabase
            .from("messages")
            .update({ message_handle: messageId, status_updated_at: new Date().toISOString() })
            .eq("id", dupes[0].id);
          if (bfErr) console.error("handle backfill error:", bfErr.message);
        }
        return json({ ok: true, action: "skipped_duplicate_outbound", message_id: messageId });
      }
    } catch (e) {
      console.error("dedupe check failed (continuing to insert):", e);
    }
  }

  // ── Inbound RO routing (ported from projectblue-webhook v1.1 S132) ─
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
    phone_to: toNumber || null,
    phone_from: fromNumber || null,
    body,
    media_url: media,
    message_handle: messageId,
    status: direction === "inbound" ? "received" : "sent",
    is_imessage: null,
    context: "textly_webhook",
    sent_by: null,
    created_at: receivedAt,
    status_updated_at: new Date().toISOString(),
  };

  const { error: insErr } = await supabase.from("messages").insert(row);
  if (insErr) {
    console.error("messages insert error:", insErr.message);
    // Still 200: assume the relay will NOT retry (undocumented) — the raw
    // payload is in the logs for manual recovery.
    return json({ ok: false, action: "insert_failed", detail: insErr.message });
  }

  // ── Conversation upsert + STOP/HELP gate (ported v1.2 S138) ────────
  // Non-fatal: message is already captured above.
  let convo: {
    id: string; assigned_to: string | null; customer_name: string | null;
    opted_out_at: string | null;
  } | null = null;
  let keywordAction: "opted_out" | "opted_in" | "help" | null = null;
  if (direction === "outbound" && contactNumber) {
    // Outbound events that reach here are NON-dupes (sends made outside the
    // dashboard, e.g. the Textly web app) — keep the conversation row current.
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
        // Name precedence: routed RO (our CRM truth) > Textable ContactName
        // (only when we have nothing — don't clobber CRM names with carrier
        // caller-id strings).
        if (routedRO?.customer_name) upsertRow.customer_name = routedRO.customer_name;
        else if (contactName && !existing?.customer_name) upsertRow.customer_name = contactName;
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
          // their info replies. Sent direct (not via textly-send, whose
          // suppression gate would block the STOP confirmation).
          // NOTE: Textable/carrier may ALSO auto-handle STOP; if we see
          // doubled confirmations in the field, drop this call.
          await textlyDirectSend(supabase, contactNumber, AUTO_REPLIES[keywordAction], "auto_reply");
        }
      }
    } catch (e) {
      console.error("conversation upsert/keyword handling failed (message already logged):", e);
    }
  }

  // ── Inbound notify: owner fork else silo blast (ported v1.2/v1.1) ──
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
          created_by_email: "textly-webhook",
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
            await textlyDirectSend(
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
    // ── UNASSIGNED fallback: existing silo-manager/admin blast ───────
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
          created_by_email: "textly-webhook",
        });
        if (nErr) console.error("inbound notify enqueue error:", nErr.message);
        else notified = true;
      }
    } catch (e) {
      console.error("inbound notify failed (message already logged):", e);
    }
  }

  return json({
    ok: true, action: "logged", direction, message_id: messageId,
    routed_ro: routedRO ? routedRO.ro_id : null,
    keyword: keywordAction,
    notified, notified_owner: notifiedOwner,
  });
});
