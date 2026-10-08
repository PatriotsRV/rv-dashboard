// [S198 Session B step 3] Staff deep links now mint https://dashboard.prvstools.com/ (Cloudflare Pages + Access) instead of patriotsrv.github.io; old links still redirect via the v1.513 shim. CORS ALLOWED_ORIGINS unchanged.
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#ER1 + GH#ER2 — Unified Scheduled Notifications
// Session 56 (2026-04-25) v1.0 · Session 199 (2026-10-08) v1.1
//
// deploy: --no-verify-jwt   (pg_cron calls this with NO Authorization header; the
//   cron row would silently 401 otherwise — S198 outage. Deploy ONLY via
//   `bash scripts/deploy_fn.sh process-scheduled-notifications`.)
//
// v1.1 (S199): the S198 backlog of 128 rows fired through ONE run and Gmail
//   answered `454-4.7.0 Too many login attempts` from row ~66 on — nodemailer
//   opens a new SMTP login per sendMail() unless pooled, and Gmail caps logins,
//   not messages. Now: pooled transport (ONE connection per run), a short gap
//   between sends, recipients de-duplicated, and a TRANSIENT Gmail failure
//   (4xx: 421/454/4.7.x) leaves the row `pending` for the next 15-min tick and
//   ends the run instead of marking the rest of the batch `failed`. Permanent
//   failures (5xx, bad address) still flip to `failed` as before. A row that
//   stays pending past 2h is what the S199 notification watchdog alerts on.
//
// Invoked every 15 minutes by pg_cron (`process-scheduled-notifications`).
// Fetches all `scheduled_notifications` rows where:
//   status = 'pending' AND scheduled_at <= NOW()
// Sends an email per row, then flips status to 'sent' (with fired_at) or
// 'failed' (with error_message).
//
// Email format: plain HTML body with a small PRVS header and the dashboard
// deep-link if the row has an ro_id.

// [S194 SEC Phase 1 step 6] dashboard.prvstools.com added for the Cloudflare cutover; github.io stays until GitHub Pages is retired
const ALLOWED_ORIGINS = ["https://patriotsrv.github.io", "https://dashboard.prvstools.com"];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(row: any, roMeta: any | null) {
  const sourceTag = row.source === "auto_dropoff_reminder"
    ? `<span style="display:inline-block;padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:11px;font-weight:700;margin-left:8px;">AUTO</span>`
    : "";

  const roLink = row.ro_id && roMeta?.ro_id
    ? `<p style="margin:14px 0 0 0;font-size:13px;">
         <a href="https://dashboard.prvstools.com/?ro=${escapeHtml(roMeta.ro_id)}"
            style="display:inline-block;padding:8px 14px;background:#1e40af;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
           Open RO in Dashboard →
         </a>
       </p>`
    : "";

  const roHeader = roMeta
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 14px 0;font-size:13px;line-height:1.6;">
         <strong>${escapeHtml(roMeta.customer_name || "—")}</strong><br>
         ${escapeHtml(roMeta.rv || "RV not specified")}<br>
         <span style="color:#64748b;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(roMeta.ro_id || "")}</span>
       </div>`
    : "";

  // Body: preserve line breaks but escape HTML
  const safeBody = escapeHtml(row.body).replace(/\n/g, "<br>");

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0f172a;">
      <h2 style="margin:0 0 6px 0;font-size:18px;">${escapeHtml(row.subject)}${sourceTag}</h2>
      <div style="height:3px;background:linear-gradient(to right,#1e40af,#3b82f6);border-radius:2px;margin-bottom:16px;"></div>
      ${roHeader}
      <div style="font-size:14px;line-height:1.7;white-space:normal;">${safeBody}</div>
      ${roLink}
      <hr style="margin:22px 0 12px 0;border:0;border-top:1px solid #e2e8f0;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Patriots RV Services — Scheduled Notification<br>
        Sent automatically when scheduled_at &le; NOW(). To stop or reschedule, edit the notification on the RO card.
      </p>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── Fetch pending rows whose time has come ────────────────────────────
    const { data: rows, error: selErr } = await sb
      .from("scheduled_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);  // cap per run to avoid runaway batches

    if (selErr) {
      console.error("Select error:", selErr);
      return new Response(JSON.stringify({ error: selErr.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: "No pending rows" }), {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Fetch RO metadata for rows with ro_id ─────────────────────────────
    const roIds = [...new Set(rows.map((r: any) => r.ro_id).filter(Boolean))] as string[];
    const roMetaById: Record<string, any> = {};
    if (roIds.length > 0) {
      const { data: roMeta } = await sb
        .from("repair_orders")
        .select("id, ro_id, customer_name, rv")
        .in("id", roIds);
      for (const r of (roMeta || [])) roMetaById[r.id] = r;
    }

    // ── Gmail transport — POOLED: one SMTP login for the whole run (v1.1) ──
    const transport = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 1,
      maxMessages: 200,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const SEND_GAP_MS = 350;   // breathing room between messages on the shared connection
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Gmail 4xx = "try again later", never a bad message. 421 = service unavailable,
    // 454 = too many logins, 4.7.x = rate/policy throttles.
    const isTransient = (err: any) => {
      const code = Number(err?.responseCode || 0);
      const msg = String(err?.message || err || "");
      return (code >= 400 && code < 500) || /\b4\d\d[- ]4\.\d\.\d/.test(msg) || /ETIMEDOUT|ECONNRESET|ECONNREFUSED/.test(msg);
    };

    let sent = 0;
    let failed = 0;
    let deferred = 0;
    const results: any[] = [];

    for (const row of rows) {
      const rawRecipients: string[] = Array.isArray(row.recipient_emails) ? row.recipient_emails : [];
      const recipients = [...new Set(rawRecipients.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      if (recipients.length === 0) {
        // Should never happen (CHECK constraint), but defensive
        await sb.from("scheduled_notifications").update({
          status: "failed",
          error_message: "No recipients",
          fired_at: new Date().toISOString(),
        }).eq("id", row.id);
        failed++;
        results.push({ id: row.id, status: "failed", reason: "no recipients" });
        continue;
      }

      const roMeta = row.ro_id ? roMetaById[row.ro_id] : null;
      const html = buildEmailHtml(row, roMeta);
      const subjectPrefix = row.source === "auto_dropoff_reminder" ? "📅 Drop-Off Tomorrow — " : "🔔 ";

      try {
        await transport.sendMail({
          from: `"PRVS Dashboard" <${gmailUser}>`,
          to: recipients.join(", "),
          subject: subjectPrefix + row.subject,
          html,
        });
        await sb.from("scheduled_notifications").update({
          status: "sent",
          fired_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", row.id);
        sent++;
        results.push({ id: row.id, status: "sent", recipients: recipients.length });
        await sleep(SEND_GAP_MS);

        // Audit trail to RO Status notes (execution log)
        if (row.ro_id) {
          try {
            const ts = new Date().toLocaleString("en-US", {
              timeZone: "America/Chicago",
              month: "2-digit", day: "2-digit", year: "2-digit",
              hour: "2-digit", minute: "2-digit",
            });
            const sourceLabel = row.source === "auto_dropoff_reminder" ? "AUTO DROP-OFF REMINDER" : "NOTIFICATION";
            await sb.from("notes").insert({
              ro_id: row.ro_id,
              type:  "ro_status",
              body:  `[${ts} - Scheduler] 🔔 ${sourceLabel} SENT: "${row.subject}" → ${recipients.length} recipient(s)`,
            });
          } catch (auditErr) {
            console.warn(`Audit note insert failed for row ${row.id}:`, auditErr);
          }
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (isTransient(err)) {
          // Leave the row pending: the next cron tick retries it. Stop the run —
          // every further send on this connection would fail the same way.
          console.warn(`Transient SMTP failure on row ${row.id}, deferring the rest of the batch:`, msg);
          await sb.from("scheduled_notifications").update({
            error_message: ("DEFERRED (transient, will retry): " + msg).slice(0, 500),
          }).eq("id", row.id);
          deferred = rows.length - sent - failed;
          results.push({ id: row.id, status: "deferred", reason: msg });
          break;
        }
        console.error(`Send failed for row ${row.id}:`, msg);
        await sb.from("scheduled_notifications").update({
          status: "failed",
          fired_at: new Date().toISOString(),
          error_message: msg.slice(0, 500),  // cap to avoid bloat
        }).eq("id", row.id);
        failed++;
        results.push({ id: row.id, status: "failed", reason: msg });

        // Audit trail for failures too
        if (row.ro_id) {
          try {
            const ts = new Date().toLocaleString("en-US", {
              timeZone: "America/Chicago",
              month: "2-digit", day: "2-digit", year: "2-digit",
              hour: "2-digit", minute: "2-digit",
            });
            await sb.from("notes").insert({
              ro_id: row.ro_id,
              type:  "ro_status",
              body:  `[${ts} - Scheduler] 🔔 NOTIFICATION FAILED: "${row.subject}" → ${msg.slice(0, 200)}`,
            });
          } catch (_) { /* non-fatal */ }
        }
      }
    }

    try { transport.close(); } catch (_) { /* pool already closed */ }

    return new Response(JSON.stringify({
      ok: true,
      version: "v1.1",
      processed: rows.length,
      sent,
      failed,
      deferred,
      results,
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
