// ============================================================
// send-scheduled-messages v1.0 (Scheduled Messages, Session 177, 2026-08-21)
// ============================================================
// Fired by pg_cron EVERY MINUTE (invoke_send_scheduled_messages, pg_net,
// no auth header — deploy with --no-verify-jwt, same pattern as
// process-review-requests). Sends due scheduled_messages rows via the
// textly-send edge fn and flips status pending -> sent / failed.
//
// Row kinds (scheduled_messages_s177.sql):
// - 'customer':  recipients [{name,phone}] (one entry). Sent with context
//   'ro_customer', so textly-send's STOP gate runs AT FIRE TIME (an opt-out
//   between scheduling and firing is respected), the messages row is logged,
//   and the conversations upsert bumps the inbox thread — the scheduled
//   message lands in the conversation exactly like a live composer send.
//   Media chunking mirrors sendCustomerMessage (S158a: ONE media per MMS —
//   send #1 = body + first attachment, each further attachment its own
//   media-only MMS).
// - 'broadcast': recipients [{email,name,phone}] roster snapshot taken at
//   schedule time. Sent per-recipient with context 'staff_broadcast'
//   (suppression-exempt, no conversations row) and the same 📢 sender
//   prefix _runBroadcast applies, then ONE staff_broadcasts history row is
//   logged (v1.15 Broadcasts-chip parity; log write non-fatal).
//
// Claim: rows are flipped pending -> 'sending' one-at-a-time with a
// conditional UPDATE (…where status='pending'), so an overlapping cron tick
// can never double-send. Rows more than MISSED_WINDOW_MIN late (cron outage)
// are marked failed with 'missed send window' instead of firing stale.
//
// Deploy: supabase functions deploy send-scheduled-messages --no-verify-jwt
// Secrets used (all already set): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PRVS_FUNCTION_SECRET.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH_LIMIT = 20;          // per 1-min tick; backlog drains across ticks
const MISSED_WINDOW_MIN = 120;   // >2h late = don't fire, mark failed

type Recipient = { email?: string; name?: string; phone: string; ok?: boolean; error?: string };

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const fnBase = Deno.env.get("SUPABASE_URL")! + "/functions/v1";
  const secret = Deno.env.get("PRVS_FUNCTION_SECRET") || "";
  const nowIso = new Date().toISOString();

  // Due pending rows (oldest first).
  const { data: due, error: dueErr } = await supabase
    .from("scheduled_messages")
    .select("id, kind, recipients, group_label, body, media_url, send_at, created_by")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (dueErr) return json({ error: "scheduled_messages read failed: " + dueErr.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, fired: 0 });

  async function textlySend(to: string, body: string, mediaUrl: string | null, context: string, sentBy: string) {
    const resp = await fetch(`${fnBase}/textly-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        "X-PRVS-Secret": secret,
      },
      body: JSON.stringify({
        action: "send", to, body,
        context, sent_by: sentBy, media_url: mediaUrl,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.ok !== false, status: resp.status, data };
  }

  let fired = 0, failed = 0, expired = 0;

  for (const row of due) {
    // ── Claim (double-send guard across overlapping ticks) ──────────
    const { data: claimed, error: claimErr } = await supabase
      .from("scheduled_messages")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr || !claimed || claimed.length === 0) continue; // another tick has it / it was cancelled

    // ── Missed-window guard (cron outage) ───────────────────────────
    const lateMin = (Date.now() - new Date(row.send_at).getTime()) / 60000;
    if (lateMin > MISSED_WINDOW_MIN) {
      await supabase.from("scheduled_messages").update({
        status: "failed",
        error: `missed send window (${Math.round(lateMin)} min late; limit ${MISSED_WINDOW_MIN})`,
      }).eq("id", row.id);
      expired++;
      continue;
    }

    const recipients: Recipient[] = Array.isArray(row.recipients) ? row.recipients : [];
    const media: string[] = Array.isArray(row.media_url) ? row.media_url : [];
    const roster: Recipient[] = [];
    let okCount = 0, errCount = 0;
    let rowError: string | null = null;

    try {
      if (row.kind === "customer") {
        const r = recipients[0];
        const to = String(r?.phone || "").trim();
        if (!to) throw new Error("no recipient phone on row");
        // S158a chunking: body + first media, then media-only follow-ups.
        const sends: { body: string; media: string | null }[] = media.length
          ? [{ body: row.body || "", media: media[0] },
             ...media.slice(1).map((m) => ({ body: "", media: m }))]
          : [{ body: row.body || "", media: null }];
        for (const s of sends) {
          const res = await textlySend(to, s.body, s.media, "ro_customer", row.created_by);
          if (!res.ok) {
            // STOP gate (403 opted_out) or transport failure — stop the chunk loop.
            throw new Error(res.data?.error || `textly-send HTTP ${res.status}`);
          }
        }
        roster.push({ ...r, ok: true });
        okCount = 1;
      } else { // 'broadcast'
        // Mirror _runBroadcast: 📢 SenderName: body, one send per recipient.
        let senderName = row.created_by;
        try {
          const { data: st } = await supabase.from("staff")
            .select("name").eq("email", row.created_by).maybeSingle();
          if (st?.name) senderName = st.name;
        } catch { /* name lookup is cosmetic */ }
        const body = `\u{1F4E2} ${senderName}: ${row.body}`;
        for (const r of recipients) {
          const to = String(r?.phone || "").trim();
          if (!to) { roster.push({ ...r, ok: false, error: "no phone" }); errCount++; continue; }
          const res = await textlySend(to, body, media[0] || null, "staff_broadcast", row.created_by);
          if (res.ok) { roster.push({ ...r, ok: true }); okCount++; }
          else {
            roster.push({ ...r, ok: false, error: res.data?.error || `HTTP ${res.status}` });
            errCount++;
            console.error(`broadcast send failed (${row.id}) for ${r.email}:`, res.data);
          }
        }
        // ONE staff_broadcasts history row (non-fatal — texts are already out).
        try {
          const { error: logErr } = await supabase.from("staff_broadcasts").insert({
            group_name: (row.group_label || "All staff") + " (scheduled)",
            sender_email: row.created_by,
            body: row.body,
            recipients: roster,
            recipient_count: recipients.length,
            sent_count: okCount,
            failed_count: errCount,
          });
          if (logErr) console.error("staff_broadcasts log error:", logErr.message);
        } catch (e) {
          console.error("staff_broadcasts log failed:", e);
        }
        if (okCount === 0) rowError = "all recipients failed";
      }
    } catch (e) {
      rowError = String((e as Error)?.message || e);
      if (roster.length === 0 && recipients[0]) roster.push({ ...recipients[0], ok: false, error: rowError });
    }

    const succeeded = rowError === null && okCount > 0;
    await supabase.from("scheduled_messages").update({
      status: succeeded ? "sent" : "failed",
      sent_at: succeeded ? new Date().toISOString() : null,
      result: roster,
      error: succeeded
        ? (errCount ? `${errCount} of ${recipients.length} recipient(s) failed` : null)
        : rowError,
    }).eq("id", row.id);
    if (succeeded) fired++; else failed++;
  }

  return json({ ok: true, fired, failed, expired });
});
