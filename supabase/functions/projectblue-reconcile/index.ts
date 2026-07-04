// ============================================================
// projectblue-reconcile (GH#39, Session 132, 2026-07-04) - source of truth poll
// ============================================================
// PB webhooks are SINGLE-attempt, unsigned, and text-only, and PB emits no
// failure/read events (support answers, research/projectblue_requirements.md
// C2) - so this cron-driven sweep of /get-messages-api is the SOURCE OF TRUTH
// for the messages table. Runs every 15 minutes (pg_cron), sweeping the last
// 24 hours:
//
//   1. BACKFILL - PB rows with no matching messages row are inserted (webhook
//      missed/dropped). Missed INBOUND rows get the same RO routing + silo-
//      manager notification as the webhook (shared logic, 60-min dedupe).
//   2. ENRICH - matched rows get message_handle backfilled, is_imessage
//      resolved, inbound media_attachment_url picked up (webhooks are
//      text-only), and PB status 'delivered' upgrades our 'queued' -> 'sent'.
//      NOTE: PB 'delivered' means LEFT PB'S QUEUE (sent_at set), NOT handset
//      receipt - so it maps to our 'sent', never our 'delivered'.
//   3. STALE-PENDING ALARM - outbound rows still 'queued' after
//      STALE_PENDING_MINUTES (30) = an S130-class stall. ONE combined email
//      to admin_report_recipients via scheduled_notifications (source
//      'stale_message_alarm' - migration stale_message_alarm_source.sql),
//      at most one alarm per ALARM_COOLDOWN_HOURS (4).
//
// Matching: message_handle when present; else direction + last-10-digits
// phone + exact body + created_at within 10 minutes.
//
// Secrets: PROJECTBLUE_API_KEY (dormant-safe 503 if missing),
//   PRVS_FUNCTION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Deploy:  supabase functions deploy projectblue-reconcile
// Invoke:  POST {} with Authorization bearer + X-PRVS-Secret (cron or manual).
// Response: counts for every action taken + sample_keys of the first PB row
//   (debug aid while PB's list-row field names settle).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const PB_LIST_ENDPOINT = "https://api.tryprojectblue.com/get-messages-api";
const LOOKBACK_HOURS = 24;
const MATCH_WINDOW_MS = 10 * 60 * 1000;
const STALE_PENDING_MINUTES = 30;
const ALARM_COOLDOWN_HOURS = 4;
const NOTIFY_DEDUPE_MINUTES = 60;

// Mirrors js/config.js REPAIR_TYPE_TO_SILO (same map as projectblue-webhook).
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

function phoneKey(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Defensive field readers - PB list-row key names vary between docs examples.
function pbField(r: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (r[n] != null && r[n] !== "") return r[n];
  return null;
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-prvs-secret") || "";
    if (provided !== expectedSecret) return json({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("PROJECTBLUE_API_KEY");
  if (!apiKey) {
    return json({ error: "Project Blue not configured", detail: "PROJECTBLUE_API_KEY is not set." }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const counts = {
    pb_rows: 0, matched: 0, handle_backfilled: 0, status_upgraded: 0,
    imessage_resolved: 0, media_backfilled: 0, inserted_inbound: 0,
    inserted_outbound: 0, routed: 0, notified: 0, stale_pending: 0, alarmed: false,
  };

  // ── 1. Pull PB's view of the window ────────────────────────────────
  let pbRows: Record<string, unknown>[] = [];
  try {
    const qs = new URLSearchParams({
      created_at_gte: sinceIso,
      order_by: "createdAt",
      order_direction: "desc",
      limit: "100", // PB rejects >100 ("limit must be an integer between 1 and 100")
    });
    const resp = await fetch(`${PB_LIST_ENDPOINT}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return json({ error: `PB list HTTP ${resp.status}`, detail: await resp.text() }, 502);
    const data = await resp.json();
    pbRows = Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    return json({ error: "PB list request failed", detail: String(err) }, 502);
  }
  counts.pb_rows = pbRows.length;
  const sampleKeys = pbRows.length ? Object.keys(pbRows[0]) : [];

  // ── 2. Pull our view of the same window (+ margin) ─────────────────
  const marginIso = new Date(Date.parse(sinceIso) - MATCH_WINDOW_MS).toISOString();
  const { data: ours, error: oursErr } = await supabase
    .from("messages")
    .select("id, direction, phone_to, phone_from, body, message_handle, status, is_imessage, media_url, ro_id, created_at")
    .gte("created_at", marginIso);
  if (oursErr) return json({ error: "messages read failed", detail: oursErr.message }, 500);
  const ourRows = ours || [];

  // Cached lookups for routing/notify (fetched lazily, at most once per run).
  let roCache: Record<string, unknown>[] | null = null;
  let staffCache: Record<string, unknown>[] | null = null;
  let adminCsv: string | null = null;

  async function routeToRO(contactPhone: string) {
    const key = phoneKey(contactPhone);
    if (!key) return null;
    if (!roCache) {
      const { data } = await supabase
        .from("repair_orders")
        .select("id, ro_id, customer_name, rv, phone, status, repair_type, updated_at")
        .is("deleted_at", null)
        .not("phone", "is", null);
      roCache = data || [];
    }
    const matches = roCache.filter((r) => phoneKey(r.phone) === key);
    matches.sort((a, b) => {
      const aDone = a.status === "Delivered/Cashed Out" ? 1 : 0;
      const bDone = b.status === "Delivered/Cashed Out" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
    return matches[0] || null;
  }

  async function notifyInbound(ro: Record<string, unknown>, msgBody: string) {
    const dedupeIso = new Date(Date.now() - NOTIFY_DEDUPE_MINUTES * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("scheduled_notifications")
      .select("id")
      .eq("ro_id", ro.id)
      .eq("source", "inbound_message_notify")
      .gte("created_at", dedupeIso)
      .limit(1);
    if (recent && recent.length > 0) return false;
    if (!staffCache) {
      const { data } = await supabase.from("staff").select("email, role, active, service_silo");
      staffCache = data || [];
    }
    if (adminCsv === null) {
      const { data: cfg } = await supabase
        .from("app_config").select("value").eq("key", "admin_report_recipients").maybeSingle();
      adminCsv = String(cfg?.value || "");
    }
    const silos = String(ro.repair_type || "").split(",")
      .map((s) => REPAIR_TYPE_TO_SILO[s.trim().toLowerCase()]).filter(Boolean);
    const mgrEmails = staffCache
      .filter((s) => s.active !== false && s.email
        && (s.role === "manager" || s.role === "sr_manager")
        && (silos.includes(s.service_silo as string) || (s.service_silo == null && s.role === "sr_manager")))
      .map((s) => s.email as string);
    const admins = adminCsv.split(",").map((e) => e.trim()).filter(Boolean);
    const all = [...new Set([...mgrEmails, ...admins])];
    const recipients = all.length ? all : ["repair@patriotsrvservices.com"];
    const preview = msgBody.length > 160 ? msgBody.slice(0, 157) + "..." : msgBody;
    const { error: nErr } = await supabase.from("scheduled_notifications").insert({
      ro_id: ro.id,
      scheduled_at: new Date().toISOString(),
      recipient_emails: recipients,
      subject: `\u{1F4AC} Customer reply — ${ro.customer_name || "Customer"} (${ro.ro_id || ""})`,
      body: [
        `${ro.customer_name || "A customer"} replied by text about ${ro.rv || "their RV"}.`,
        "",
        `"${preview}"`,
        "",
        `Service: ${ro.repair_type || "TBD"}`,
        `RO ID: ${ro.ro_id || ""}`,
        "",
        "(Recovered by the reconciliation sweep - the live webhook missed this one.)",
        "Open the RO card on the dashboard and click \u{1F4AC} Message Customer to reply.",
      ].join("\n"),
      source: "inbound_message_notify",
      status: "pending",
      created_by_email: "pb-reconcile",
    });
    if (nErr) { console.error("notify enqueue error:", nErr.message); return false; }
    return true;
  }

  // ── 3. Sweep PB rows: match -> enrich, no match -> backfill ────────
  const usedOurIds = new Set<string>();
  for (const pb of pbRows) {
    const direction = String(pbField(pb, "direction") || "").toLowerCase() === "inbound" ? "inbound" : "outbound";
    const handle = pbField(pb, "message_handle", "messageHandle") as string | null;
    const content = String(pbField(pb, "content", "message") ?? "");
    const createdAt = String(pbField(pb, "created_at", "createdAt", "receivedAt") || "");
    const contact = String(pbField(pb, direction === "inbound" ? "from_number" : "to_number",
      direction === "inbound" ? "fromNumber" : "toNumber", "destination") || "");
    const line = String(pbField(pb, direction === "inbound" ? "to_number" : "from_number",
      "linePhoneNumber", "devicePhoneNumber") || "");
    const pbStatus = String(pbField(pb, "status") || "").toLowerCase();
    // List rows carry `service` (not `messageType` like the send response) -
    // confirmed via sample_keys on the first live run (S132).
    const mt = String(pbField(pb, "messageType", "message_type", "service") || "").toLowerCase();
    const isIm = mt === "imessage" ? true : mt === "sms" ? false : null;
    const media = pbField(pb, "media_attachment_url", "mediaAttachmentUrl") as string | null;
    const pbMs = Date.parse(createdAt) || 0;
    const cKey = phoneKey(contact);

    // Match: handle first, then direction+phone+body+time.
    let match = handle ? ourRows.find((m) => m.message_handle === handle && !usedOurIds.has(m.id)) : undefined;
    if (!match) {
      match = ourRows.find((m) => {
        if (usedOurIds.has(m.id) || m.direction !== direction || m.body !== content) return false;
        const mPhone = direction === "inbound" ? m.phone_from : m.phone_to;
        if (phoneKey(mPhone) !== cKey) return false;
        const mMs = Date.parse(m.created_at) || 0;
        return pbMs === 0 || Math.abs(mMs - pbMs) <= MATCH_WINDOW_MS;
      });
    }

    if (match) {
      usedOurIds.add(match.id);
      counts.matched++;
      const patch: Record<string, unknown> = {};
      if (!match.message_handle && handle) { patch.message_handle = handle; counts.handle_backfilled++; }
      if (match.is_imessage == null && isIm !== null) { patch.is_imessage = isIm; counts.imessage_resolved++; }
      if (pbStatus === "delivered" && (match.status === "queued" || match.status === "pending")) {
        patch.status = "sent"; counts.status_upgraded++;
      }
      if (direction === "inbound" && media && !match.media_url) {
        patch.media_url = [media]; counts.media_backfilled++;
      }
      if (Object.keys(patch).length > 0) {
        patch.status_updated_at = new Date().toISOString();
        const { error: upErr } = await supabase.from("messages").update(patch).eq("id", match.id);
        if (upErr) console.error("enrich update error:", match.id, upErr.message);
      }
      continue;
    }

    // No match -> the webhook missed this one. Backfill.
    let ro: Record<string, unknown> | null = null;
    if (direction === "inbound" && contact) {
      try { ro = await routeToRO(contact); } catch (e) { console.error("routing failed:", e); }
    }
    const { error: insErr } = await supabase.from("messages").insert({
      ro_id: ro ? ro.id : null,
      ro_code: ro ? ro.ro_id : null,
      direction,
      phone_to: direction === "inbound" ? (line || null) : (contact || null),
      phone_from: direction === "inbound" ? (contact || null) : (line || null),
      body: content,
      media_url: media ? [media] : null,
      message_handle: handle || null,
      status: direction === "inbound" ? "received" : (pbStatus === "delivered" ? "sent" : "queued"),
      is_imessage: isIm,
      context: "pb_reconcile",
      sent_by: null,
      created_at: createdAt || new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    });
    if (insErr) { console.error("backfill insert error:", insErr.message); continue; }
    if (direction === "inbound") {
      counts.inserted_inbound++;
      if (ro) {
        counts.routed++;
        try { if (await notifyInbound(ro, content)) counts.notified++; }
        catch (e) { console.error("notify failed:", e); }
      }
    } else {
      counts.inserted_outbound++;
    }
  }

  // ── 4. Stale-pending alarm ─────────────────────────────────────────
  try {
    const staleIso = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from("messages")
      .select("id, phone_to, body, ro_code, created_at")
      .eq("direction", "outbound")
      .eq("status", "queued")
      .gte("created_at", sinceIso)
      .lt("created_at", staleIso)
      .order("created_at", { ascending: true });
    counts.stale_pending = (stale || []).length;
    if (stale && stale.length > 0) {
      const cooldownIso = new Date(Date.now() - ALARM_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { data: recentAlarm } = await supabase
        .from("scheduled_notifications")
        .select("id")
        .eq("source", "stale_message_alarm")
        .gte("created_at", cooldownIso)
        .limit(1);
      if (!recentAlarm || recentAlarm.length === 0) {
        if (adminCsv === null) {
          const { data: cfg } = await supabase
            .from("app_config").select("value").eq("key", "admin_report_recipients").maybeSingle();
          adminCsv = String(cfg?.value || "");
        }
        const admins = adminCsv.split(",").map((e) => e.trim()).filter(Boolean);
        const lines = stale.slice(0, 20).map((m) => {
          const age = Math.round((Date.now() - Date.parse(m.created_at)) / 60000);
          return `- ${m.phone_to} (${m.ro_code || "no RO"}) ${age} min ago: "${String(m.body || "").slice(0, 60)}"`;
        });
        const { error: aErr } = await supabase.from("scheduled_notifications").insert({
          ro_id: null,
          scheduled_at: new Date().toISOString(),
          recipient_emails: admins.length ? admins : ["repair@patriotsrvservices.com"],
          subject: `⚠️ ${stale.length} customer text(s) stuck in the Project Blue queue`,
          body: [
            `${stale.length} outbound message(s) have been sitting in Project Blue's queue for over ${STALE_PENDING_MINUTES} minutes (S130-class stall):`,
            "",
            ...lines,
            "",
            "PB emits no failure events - stuck sends stay pending forever unless PB clears them.",
            "Check the PB portal and consider contacting PB support if these do not move soon.",
            `(At most one of these alarms is sent per ${ALARM_COOLDOWN_HOURS} hours.)`,
          ].join("\n"),
          source: "stale_message_alarm",
          status: "pending",
          created_by_email: "pb-reconcile",
        });
        if (aErr) console.error("alarm enqueue error:", aErr.message);
        else counts.alarmed = true;
      }
    }
  } catch (e) {
    console.error("stale-pending check failed:", e);
  }

  return json({ ok: true, since: sinceIso, ...counts, sample_keys: sampleKeys });
});
