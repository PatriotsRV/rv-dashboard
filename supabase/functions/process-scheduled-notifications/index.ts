import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#ER1 + GH#ER2 — Unified Scheduled Notifications
// Session 56 (2026-04-25)
// v1.0
//
// Invoked every 15 minutes by pg_cron (`process-scheduled-notifications`).
// Fetches all `scheduled_notifications` rows where:
//   status = 'pending' AND scheduled_at <= NOW()
// Sends an email per row, then flips status to 'sent' (with fired_at) or
// 'failed' (with error_message).
//
// Email format: plain HTML body with a small PRVS header and the dashboard
// deep-link if the row has an ro_id.

const ALLOWED_ORIGIN = "https://patriotsrv.github.io";
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
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
         <a href="https://patriotsrv.github.io/rv-dashboard/?ro=${escapeHtml(roMeta.ro_id)}"
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

    // ── Gmail transport ───────────────────────────────────────────────────
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const row of rows) {
      const recipients: string[] = Array.isArray(row.recipient_emails) ? row.recipient_emails : [];
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
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`Send failed for row ${row.id}:`, msg);
        await sb.from("scheduled_notifications").update({
          status: "failed",
          fired_at: new Date().toISOString(),
          error_message: msg.slice(0, 500),  // cap to avoid bloat
        }).eq("id", row.id);
        failed++;
        results.push({ id: row.id, status: "failed", reason: msg });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: rows.length,
      sent,
      failed,
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
