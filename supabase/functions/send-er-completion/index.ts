import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// send-er-completion — Enhancement Request "your wish shipped" notice.
// Session 119 (2026-06-20). v1.0
//
// Fired by the `trg_notify_er_completion` DB trigger (pg_net) when an
// enhancement_requests row transitions to status='done'. Emails the person who
// submitted the request (enhancement_requests.submitted_by) telling them:
//   (a) their request is complete, (b) WHAT was done (completion_notes),
//   (c) HOW to confirm it works (test_steps).
//
// Idempotent: skips if completion_emailed_at is already set; stamps it on success.
// Trigger payload: { "er_id": "<uuid>" }.

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

function block(label: string, value: string, accent: string) {
  const safe = escapeHtml(value).replace(/\n/g, "<br>");
  return `
    <div style="margin:0 0 14px 0;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${accent};margin-bottom:5px;">${escapeHtml(label)}</div>
      <div style="font-size:14px;line-height:1.7;color:#0f172a;">${safe}</div>
    </div>`;
}

function buildEmailHtml(er: any) {
  const niceCat = er.category ? `<span style="display:inline-block;padding:2px 9px;background:#eef2ff;color:#3730a3;border-radius:6px;font-size:12px;font-weight:700;">${escapeHtml(er.category)}</span>` : "";
  const what = (er.completion_notes && String(er.completion_notes).trim())
    ? block("What we did", er.completion_notes, "#16a34a")
    : block("What we did", "Your request has been completed and is now live in the dashboard.", "#16a34a");
  const how = (er.test_steps && String(er.test_steps).trim())
    ? block("How to see it / test it", er.test_steps, "#2563eb")
    : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:22px;color:#0f172a;">
      <h2 style="margin:0 0 6px 0;font-size:19px;">✅ Your dashboard request is live</h2>
      <div style="height:3px;background:linear-gradient(to right,#16a34a,#22c55e);border-radius:2px;margin-bottom:16px;"></div>
      <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">
        Hi ${escapeHtml(er.submitted_by_name || "there")}, the enhancement request you submitted has shipped. Thanks for the idea — here's what changed and how to check it out.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 16px 0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:5px;">Your request ${niceCat}</div>
        <div style="font-size:14px;line-height:1.7;color:#0f172a;">${escapeHtml(er.description).replace(/\n/g, "<br>")}</div>
      </div>
      ${what}
      ${how}
      <p style="margin:16px 0 0 0;font-size:13px;">
        <a href="https://patriotsrv.github.io/rv-dashboard/" style="display:inline-block;padding:9px 16px;background:#1e40af;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open the Dashboard →</a>
      </p>
      <hr style="margin:22px 0 12px 0;border:0;border-top:1px solid #e2e8f0;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Patriots RV Services — Enhancement Request update<br>
        You're getting this because you submitted this request from the dashboard. Reply to this email if something isn't working as described.
      </p>
    </div>`;
}

function buildText(er: any) {
  const lines = [
    `Your dashboard request is live`,
    ``,
    `Hi ${er.submitted_by_name || "there"}, the enhancement request you submitted has shipped.`,
    ``,
    `YOUR REQUEST${er.category ? ` (${er.category})` : ""}:`,
    er.description || "",
    ``,
    `WHAT WE DID:`,
    (er.completion_notes && String(er.completion_notes).trim()) ? er.completion_notes : "Your request has been completed and is now live in the dashboard.",
  ];
  if (er.test_steps && String(er.test_steps).trim()) {
    lines.push(``, `HOW TO SEE IT / TEST IT:`, er.test_steps);
  }
  lines.push(``, `Open the dashboard: https://patriotsrv.github.io/rv-dashboard/`);
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const json = (obj: any, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return json({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }, 500);
    }

    let er_id: string | null = null;
    try {
      const body = await req.json();
      er_id = body?.er_id || body?.id || null;
    } catch (_) { /* no body */ }
    if (!er_id) return json({ ok: false, skipped: "no er_id" });

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: er, error: selErr } = await sb
      .from("enhancement_requests")
      .select("id, submitted_by, submitted_by_name, category, description, status, completion_notes, test_steps, completion_emailed_at")
      .eq("id", er_id)
      .maybeSingle();

    if (selErr) return json({ error: selErr.message }, 500);
    if (!er) return json({ ok: false, skipped: "not found" });

    // ── Guards ────────────────────────────────────────────────────────────
    if (er.status !== "done") return json({ ok: false, skipped: "status not done" });
    if (er.completion_emailed_at) return json({ ok: false, skipped: "already emailed" });
    const to = String(er.submitted_by || "").trim();
    if (!to.includes("@")) {
      // Nothing we can email; stamp so the trigger doesn't keep retrying.
      await sb.from("enhancement_requests").update({ completion_emailed_at: new Date().toISOString() }).eq("id", er.id);
      return json({ ok: false, skipped: "submitter has no email" });
    }

    // ── Send ──────────────────────────────────────────────────────────────
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const shortDesc = String(er.description || "your request").replace(/\s+/g, " ").trim().slice(0, 60);
    await transport.sendMail({
      from: `"PRVS Dashboard" <${gmailUser}>`,
      to,
      replyTo: "info@patriotsrvservices.com",
      subject: `✅ Your dashboard request is live: ${shortDesc}`,
      html: buildEmailHtml(er),
      text: buildText(er),
    });

    await sb.from("enhancement_requests")
      .update({ completion_emailed_at: new Date().toISOString() })
      .eq("id", er.id);

    return json({ ok: true, sent_to: to, er_id: er.id });
  } catch (err: any) {
    console.error("send-er-completion error:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
