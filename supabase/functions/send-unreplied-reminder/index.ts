// ============================================================
// send-unreplied-reminder (ER 93b00023, Session 158, 2026-07-25)
// ============================================================
// v1.0: END-OF-DAY UNREPLIED-CONVERSATIONS REMINDER.
// Fired by pg_cron weekdays at 4:30 PM Central (see
// unreplied_eod_reminder_s158.sql — cron invoker mirrors the
// process-review-requests pattern). For every ASSIGNED conversation that is
// open and awaiting a reply (last_direction = 'inbound'), the owner gets:
//   (1) an email via scheduled_notifications (source 'unreplied_eod_reminder',
//       delivered by the existing 15-min process-scheduled-notifications cron)
//   (2) an SMS to staff.phone_number (skipped when NULL), sent direct to the
//       Textly API with context 'staff_notify' (same as textly-webhook's
//       owner notify — suppression-exempt, creates no conversation row).
// One email + one SMS per OWNER (a digest listing their conversations), not
// one per conversation.
//
// Unassigned awaiting-reply conversations are NOT included (ER scope: the
// assigned owner). They surface in the count line of the response for
// observability.
//
// Idempotence: one scheduled_notifications row per owner per calendar day
// (America/Chicago) — a second cron fire or manual invoke the same day
// re-sends nothing.
//
// Config (app_config, all optional):
//   unreplied_reminder_enabled  "false" = kill switch (default on)
//
// Deploy (cron invoker sends no auth header — same as process-review-requests):
//   supabase functions deploy send-unreplied-reminder --no-verify-jwt
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";
const MESSAGES_URL = "https://patriotsrv.github.io/rv-dashboard/messages.html";

function chicagoDayISO(d: Date): string {
  // YYYY-MM-DD in America/Chicago — the per-day idempotence key.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function textlySend(to: string, body: string): Promise<boolean> {
  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) { console.log("SMS skipped: TEXTLY_API_TOKEN not set"); return false; }
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();
  try {
    const resp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: fromE164, message: body }),
    });
    if (!resp.ok) console.error(`reminder SMS Textly HTTP ${resp.status} to ${to}`);
    return resp.ok;
  } catch (e) {
    console.error("reminder SMS failed:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Kill switch ────────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from("app_config").select("value").eq("key", "unreplied_reminder_enabled").maybeSingle();
  if (String(cfg?.value ?? "true").trim().toLowerCase() === "false") {
    return json({ ok: true, action: "disabled" });
  }

  // ── Awaiting-reply conversations ───────────────────────────────────
  const { data: convos, error: convoErr } = await supabase
    .from("conversations")
    .select("id, phone_key, display_phone, customer_name, assigned_to, last_message_at, opted_out_at")
    .eq("status", "open")
    .eq("last_direction", "inbound")
    .limit(1000);
  if (convoErr) return json({ ok: false, error: convoErr.message }, 500);

  const awaiting = (convos || []);
  const assigned = awaiting.filter((c) => (c.assigned_to || "").trim());
  const unassignedCount = awaiting.length - assigned.length;
  if (assigned.length === 0) {
    return json({ ok: true, action: "nothing_to_remind", unassigned_awaiting: unassignedCount });
  }

  // Group by owner.
  const byOwner = new Map<string, typeof assigned>();
  for (const c of assigned) {
    const owner = c.assigned_to!.trim().toLowerCase();
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(c);
  }

  // ── Per-day idempotence: skip owners already reminded today ────────
  const today = chicagoDayISO(new Date());
  const dayStartUtc = new Date(`${today}T00:00:00-06:00`).toISOString(); // generous CT window
  const { data: sentToday } = await supabase
    .from("scheduled_notifications")
    .select("recipient_emails")
    .eq("source", "unreplied_eod_reminder")
    .gte("created_at", dayStartUtc);
  const alreadyReminded = new Set<string>();
  for (const r of sentToday || []) {
    for (const e of (r.recipient_emails || [])) alreadyReminded.add(String(e).toLowerCase());
  }

  // ── Staff phone lookup (one query) ─────────────────────────────────
  const { data: staff } = await supabase
    .from("staff").select("email, name, phone_number").eq("active", true);
  const staffByEmail = new Map(
    (staff || []).map((s) => [String(s.email || "").toLowerCase(), s]),
  );

  let emailed = 0, smsed = 0, skipped = 0;
  for (const [owner, list] of byOwner) {
    if (alreadyReminded.has(owner)) { skipped++; continue; }
    const lines = list.map((c) => {
      const label = c.customer_name || c.display_phone || c.phone_key;
      const when = c.last_message_at
        ? new Date(c.last_message_at).toLocaleString("en-US", {
            timeZone: "America/Chicago", month: "numeric", day: "numeric",
            hour: "numeric", minute: "2-digit",
          })
        : "";
      return `• ${label}${when ? ` — last message ${when}` : ""}`;
    });
    const n = list.length;
    const subject = `⏰ End of day — ${n} conversation${n === 1 ? "" : "s"} still waiting on your reply`;
    const { error: nErr } = await supabase.from("scheduled_notifications").insert({
      ro_id: null,
      scheduled_at: new Date().toISOString(),
      recipient_emails: [owner],
      subject,
      body: [
        `These text conversation${n === 1 ? " is" : "s are"} assigned to you and the customer is still waiting on a reply:`,
        "",
        ...lines,
        "",
        "Open Messages on the dashboard to respond before you head out:",
        MESSAGES_URL,
        "",
        "(Sent once per day at 4:30 PM when you have unreplied messages.)",
      ].join("\n"),
      source: "unreplied_eod_reminder",
      status: "pending",
      created_by_email: "send-unreplied-reminder",
    });
    if (nErr) { console.error(`reminder enqueue error for ${owner}:`, nErr.message); continue; }
    emailed++;

    const phone = (staffByEmail.get(owner)?.phone_number || "").trim();
    if (phone) {
      const first = list[0].customer_name || list[0].display_phone || list[0].phone_key;
      const smsBody = n === 1
        ? `⏰ ${first} is still waiting on your reply — open Messages before you head out.`
        : `⏰ ${n} customers are still waiting on your reply (${first} + ${n - 1} more) — open Messages before you head out.`;
      if (await textlySend(phone, smsBody)) smsed++;
    }
  }

  return json({
    ok: true,
    owners: byOwner.size,
    emailed, smsed, skipped_already_reminded: skipped,
    unassigned_awaiting: unassignedCount,
  });
});
