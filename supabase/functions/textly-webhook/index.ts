// ============================================================
// textly-webhook (GH#39 Textly pivot, Session 151, 2026-07-21) - capture + routing
// ============================================================
// v1.2 (Session 155, 2026-07-22): OPT-IN KEYWORDS GATED ON opted_out_at.
//   A body of exactly START/YES/UNSTOP is only treated as a TCPA opt-in
//   when the conversation is currently opted out. Fixes the S154 field
//   incident: a customer answering "Yes" to a service advisor's question
//   got the "You are resubscribed..." confirmation (and, silently, no
//   staff notify — keyword messages skip the notify fork). Policy per
//   Roland: everyone in the messaging DB is opted-in by default; the
//   opt-in path exists only to reverse a prior STOP.
//   Also S155: after-hours default text gains "Mon-Fri" (matches the
//   app_config after_hours_reply_text row, updated same session — the
//   config row is the LIVE source; this default is the fallback).
// v1.1 (Session 152, 2026-07-21): AFTER-HOURS AUTO-REPLY — replaces the
//   Kenect "Auto Response" feature (Kenect dies COB 7/24). Inbound,
//   non-keyword messages arriving outside business hours get ONE reply
//   per conversation per closed period. Config via app_config (all
//   optional — hard defaults ship in code):
//     business_hours            JSON: {"tz":"America/Chicago",
//                               "mon":"08:30-17:00",..., "sat":null,"sun":null}
//                               (null/missing day = closed all day)
//     after_hours_reply_text    the reply body
//     after_hours_reply_enabled "false" = kill switch (default on)
//   Dedupe: one outbound messages row with context
//   'after_hours_auto_reply' per number since the closed period began
//   (period start = the most recent open instant, walked back in 30-min
//   steps; 24h fallback if the schedule is closed 8+ days). Opted-out
//   conversations are never auto-replied (TCPA).
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

// ── After-hours auto-reply (v1.1, S152) ────────────────────────────
// Defaults mirror the Kenect Auto Response config captured S151
// (docs/specs/REVIEW_REQUEST_SPEC.md). app_config overrides all three.
const DEFAULT_AFTER_HOURS_TEXT =
  "Thank you for texting Patriots RV Services. We are currently closed. We will respond to you as soon as we become available between 8:30 - 5:00 CST Mon-Fri. Have a great day.";
type BusinessHours = { tz?: string; [day: string]: string | null | undefined };
const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  tz: "America/Chicago",
  mon: "08:30-17:00", tue: "08:30-17:00", wed: "08:30-17:00",
  thu: "08:30-17:00", fri: "08:30-17:00",
  sat: null, sun: null,
};

// Cached per-tz formatter (closedPeriodStart walks up to ~384 instants).
const _tzFmtCache = new Map<string, Intl.DateTimeFormat>();
function localParts(d: Date, tz: string): { dow: string; minutes: number } {
  let fmt = _tzFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    _tzFmtCache.set(tz, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") parts[p.type] = p.value;
  const dow = String(parts.weekday || "").toLowerCase().slice(0, 3);
  // hour12:false can yield "24" for midnight in some ICU builds — normalize.
  const minutes = (parseInt(parts.hour || "0", 10) % 24) * 60 + parseInt(parts.minute || "0", 10);
  return { dow, minutes };
}

// "08:00-17:00" -> [480, 1020]; null/invalid -> null (closed all day).
function parseWindow(s: string | null | undefined): [number, number] | null {
  if (!s) return null;
  const m = String(s).match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const open = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const close = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  return close > open ? [open, close] : null;
}

function isOpenAt(d: Date, hours: BusinessHours): boolean {
  const tz = hours.tz || "America/Chicago";
  const { dow, minutes } = localParts(d, tz);
  const w = parseWindow(hours[dow]);
  return !!w && minutes >= w[0] && minutes < w[1];
}

// Start of the CURRENT closed period = the most recent instant we were
// open (30-min granularity — the walk can only overshoot INTO the open
// window, never miss part of the closed period, and no auto-reply can
// exist from open time anyway). Fallback 24h if closed 8+ straight days.
function closedPeriodStartISO(now: Date, hours: BusinessHours): string {
  const STEP = 30 * 60 * 1000;
  let t = now.getTime();
  for (let i = 0; i < 8 * 48; i++) {
    t -= STEP;
    if (isOpenAt(new Date(t), hours)) return new Date(t).toISOString();
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

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

        // v1.2 (S155): opt-in keywords only count when the conversation is
        // ACTUALLY opted out. Policy (Roland): everyone in the messaging DB
        // is opted-in by default; opt-in/out is the STOP/START lifecycle
        // going forward. So a plain "Yes" from an opted-in customer (e.g.
        // answering a service advisor's question — the S154 Johnny
        // Huddleston case) is a normal conversational reply: no state
        // change, no "resubscribed" confirmation, and the ordinary
        // after-hours + staff-notify flow applies. START/YES/UNSTOP still
        // resubscribe (with confirmation) when opted_out_at is set.
        if (keywordAction === "opted_in" && !existing?.opted_out_at) keywordAction = null;

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

  // ── After-hours auto-reply (v1.1, S152 — Kenect Auto Response port) ─
  // Inbound, non-keyword, not opted out. One reply per conversation per
  // closed period. Non-fatal; never blocks the notify fork below.
  let afterHoursReplied = false;
  if (direction === "inbound" && !keywordAction && contactNumber && !convo?.opted_out_at) {
    try {
      const { data: cfgRows, error: cfgErr } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["after_hours_reply_enabled", "business_hours", "after_hours_reply_text"]);
      if (cfgErr) console.error("after-hours config read error (using defaults):", cfgErr.message);
      const cfg: Record<string, string> = {};
      for (const r of cfgRows || []) cfg[String(r.key)] = String(r.value ?? "");
      const enabled = (cfg["after_hours_reply_enabled"] || "true").trim().toLowerCase() !== "false";
      if (enabled) {
        let hours: BusinessHours = DEFAULT_BUSINESS_HOURS;
        if (cfg["business_hours"]) {
          try {
            hours = { ...DEFAULT_BUSINESS_HOURS, ...JSON.parse(cfg["business_hours"]) };
          } catch {
            console.error("business_hours config is not valid JSON — using defaults");
          }
        }
        const now = new Date();
        if (!isOpenAt(now, hours)) {
          const periodStart = closedPeriodStartISO(now, hours);
          const { data: prior, error: priorErr } = await supabase
            .from("messages")
            .select("id")
            .eq("direction", "outbound")
            .eq("context", "after_hours_auto_reply")
            .eq("phone_to", contactNumber)
            .gte("created_at", periodStart)
            .limit(1);
          if (priorErr) {
            // Can't verify dedupe — DON'T send (better a missed auto-reply
            // than spamming a customer on every text all night).
            console.error("after-hours dedupe check error (skipping send):", priorErr.message);
          } else if (!prior || prior.length === 0) {
            const replyText = cfg["after_hours_reply_text"] || DEFAULT_AFTER_HOURS_TEXT;
            afterHoursReplied = await textlyDirectSend(
              supabase, contactNumber, replyText, "after_hours_auto_reply",
            );
          }
        }
      }
    } catch (e) {
      console.error("after-hours auto-reply failed (message already logged):", e);
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
    after_hours_replied: afterHoursReplied,
    notified, notified_owner: notifiedOwner,
  });
});
