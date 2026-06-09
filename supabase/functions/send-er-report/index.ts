import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#19: Daily Enhancement Request report — called by Supabase pg_cron at 7:00 AM CDT (weekdays)
// Sends a summary of all unreviewed + recent requests to Roland.
// S97 (2026-06-09): now surfaces the nightly AI triage verdicts (bucket + effort + one-line verdict).

const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
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

    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── 1. Unreviewed requests ──────────────────────────────────────
    const { data: unreviewed, error: e1 } = await sb
      .from("enhancement_requests")
      .select("*")
      .eq("status", "unreviewed")
      .order("created_at", { ascending: false });
    if (e1) console.error("Error fetching unreviewed ERs:", e1);

    // ── 2. Requests submitted today ─────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayRequests, error: e2 } = await sb
      .from("enhancement_requests")
      .select("*")
      .gte("created_at", todayStart.toISOString())
      .neq("status", "unreviewed")
      .order("created_at", { ascending: false });
    if (e2) console.error("Error fetching today's ERs:", e2);

    // ── 3. Summary counts ───────────────────────────────────────────
    const { count: totalOpen } = await sb
      .from("enhancement_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["unreviewed", "reviewed", "planned", "in-progress"]);

    const unreviewedCount = unreviewed?.length || 0;
    const todayCount      = (unreviewed?.filter(r => new Date(r.created_at) >= todayStart).length || 0) + (todayRequests?.length || 0);

    // If nothing to report, still send a brief "all clear"
    const hasContent = unreviewedCount > 0 || (todayRequests?.length || 0) > 0;

    // ── Build email HTML ────────────────────────────────────────────
    const thStyle = `padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e7eb; background: #f9fafb;`;
    const tdStyle = `padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top;`;

    const statusBadge = (status: string) => {
      const colors: Record<string, string> = {
        unreviewed: "#f59e0b", reviewed: "#3b82f6", planned: "#8b5cf6",
        "in-progress": "#10b981", done: "#22c55e", declined: "#6b7280",
      };
      const c = colors[status] || "#6b7280";
      return `<span style="background:${c}22;color:${c};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">${status}</span>`;
    };

    // ── AI triage display helpers (S97) ─────────────────────────────
    const esc = (s: any) => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // What it is — done | bug | needed | data | duplicate
    const bucketChip = (bucket: string | null) => {
      if (!bucket) return `<span style="color:#bbb;font-size:12px;">—</span>`;
      const map: Record<string, string> = {
        bug: "#ef4444", needed: "#3b82f6", done: "#22c55e", data: "#8b5cf6", duplicate: "#6b7280",
      };
      const c = map[bucket] || "#6b7280";
      return `<span style="background:${c}22;color:${c};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;text-transform:capitalize;">${esc(bucket)}</span>`;
    };

    // Effort to fix — S | M | L | XL
    const loeBadge = (loe: string | null) => {
      if (!loe) return "";
      const map: Record<string, string> = { S: "#22c55e", M: "#3b82f6", L: "#f59e0b", XL: "#ef4444" };
      const c = map[loe] || "#6b7280";
      return `<span style="border:1px solid ${c};color:${c};padding:1px 6px;border-radius:6px;font-size:11px;font-weight:700;margin-left:4px;">${esc(loe)}</span>`;
    };

    const erRow = (er: any) => {
      const date = new Date(er.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        timeZone: "America/Chicago",
      });
      const rawDesc  = er.description || "";
      const descShort = rawDesc.length > 100 ? rawDesc.substring(0, 100) + "..." : rawDesc;
      const verdictLine = er.triage_verdict
        ? `<div style="margin-top:5px;color:#6b7280;font-size:11px;line-height:1.4;">🤖 ${esc(er.triage_verdict)}</div>`
        : "";
      return `<tr>
        <td style="${tdStyle}">${date}</td>
        <td style="${tdStyle} font-weight:600;">${esc(er.submitted_by_name || er.submitted_by || "")}</td>
        <td style="${tdStyle}"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">${esc(er.category || "")}</span></td>
        <td style="${tdStyle}">${esc(descShort)}${verdictLine}</td>
        <td style="${tdStyle} white-space:nowrap;">${bucketChip(er.triage_bucket)}${loeBadge(er.triage_loe)}</td>
        <td style="${tdStyle}">${statusBadge(er.status)}</td>
        <td style="${tdStyle} color:#888; font-size:12px;">${esc(er.source_page || "")}</td>
      </tr>`;
    };

    const unreviewedRows = unreviewed?.length
      ? unreviewed.map(erRow).join("")
      : `<tr><td colspan="7" style="padding:10px 16px;color:#888;font-style:italic;font-size:13px;">No unreviewed requests</td></tr>`;

    const todayRows = todayRequests?.length
      ? todayRequests.map(erRow).join("")
      : "";

    const tableHeaders = ["Date", "Requester", "Category", "Description", "🤖 AI Triage", "Status", "Page"]
      .map(c => `<th style="${thStyle}">${c}</th>`).join("");

    // ── Triage roll-up (S97) — "what it is + effort to fix" at a glance ──
    const triaged = (unreviewed || []).filter((r: any) => r.triage_bucket);
    const bucketCounts: Record<string, number> = {};
    const loeCounts: Record<string, number> = {};
    for (const r of triaged) {
      bucketCounts[r.triage_bucket] = (bucketCounts[r.triage_bucket] || 0) + 1;
      if (r.triage_loe) loeCounts[r.triage_loe] = (loeCounts[r.triage_loe] || 0) + 1;
    }
    const latestRun = triaged.map((r: any) => r.triage_run_at).filter(Boolean).sort().pop();
    const latestRunStr = latestRun
      ? new Date(latestRun).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" })
      : "";
    const bucketOrder = ["bug", "needed", "data", "duplicate", "done"];
    const loeOrder = ["S", "M", "L", "XL"];
    const triageSummaryHtml = triaged.length ? `
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">🤖 AI Triage of unreviewed${latestRunStr ? ` <span style="font-weight:400;color:#9ca3af;">· updated ${latestRunStr}</span>` : ""}</div>
    <div style="font-size:13px;color:#4b5563;line-height:1.9;">
      ${bucketOrder.filter(b => bucketCounts[b]).map(b => `${bucketChip(b)}&nbsp;<b>${bucketCounts[b]}</b>`).join("&nbsp;&nbsp;&nbsp;")}
      ${Object.keys(loeCounts).length ? `&nbsp;&nbsp;<span style="color:#d1d5db;">|</span>&nbsp;&nbsp;<span style="color:#6b7280;font-size:12px;">Effort to fix:</span>&nbsp;${loeOrder.filter(l => loeCounts[l]).map(l => `${loeBadge(l)}&nbsp;<b>${loeCounts[l]}</b>`).join("&nbsp;&nbsp;")}` : ""}
    </div>
  </div>` : "";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fff;">

  <div style="border-bottom: 3px solid #d97706; padding-bottom: 14px; margin-bottom: 20px;">
    <h1 style="color: #d97706; margin: 0; font-size: 20px;">🪔 Enhancement Request Report</h1>
    <p style="margin: 4px 0 0; color: #555; font-size: 13px;">
      Patriots RV Services &nbsp;·&nbsp; ${dateStr}
    </p>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
    <div style="background:#fef3c7;border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#d97706;">${unreviewedCount}</div>
      <div style="font-size:12px;color:#92400e;font-weight:600;">Unreviewed</div>
    </div>
    <div style="background:#dbeafe;border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#2563eb;">${todayCount}</div>
      <div style="font-size:12px;color:#1e40af;font-weight:600;">Submitted Today</div>
    </div>
    <div style="background:#e0e7ff;border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#4f46e5;">${totalOpen || 0}</div>
      <div style="font-size:12px;color:#3730a3;font-weight:600;">Total Open</div>
    </div>
  </div>

  ${triageSummaryHtml}

  ${!hasContent ? `<p style="color:#16a34a;font-weight:600;font-size:15px;">✅ All clear — no new enhancement requests to review.</p>` : ""}

  ${unreviewedCount > 0 ? `
  <h2 style="color:#d97706;font-size:16px;margin:20px 0 8px;">🔔 Needs Review (${unreviewedCount})</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
    <thead><tr>${tableHeaders}</tr></thead>
    <tbody>${unreviewedRows}</tbody>
  </table>` : ""}

  ${todayRequests?.length ? `
  <h2 style="color:#3b82f6;font-size:16px;margin:20px 0 8px;">📝 Already Reviewed Today (${todayRequests.length})</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
    <thead><tr>${tableHeaders}</tr></thead>
    <tbody>${todayRows}</tbody>
  </table>` : ""}

  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#888;font-size:11px;">
      Patriots RV Services &nbsp;·&nbsp; 11399 US 380, Krum TX 76249 &nbsp;·&nbsp;
      <a href="tel:9404885047" style="color:#d97706;">(940) 488-5047</a><br>
      This is an automated daily report from the PRVS Dashboard. View and manage requests in the dashboard under 🪔 Wishes.
    </p>
  </div>
</body>
</html>`;

    // ── Send email to Roland ────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const recipient = "roland@patriotsrvservices.com";
    const subject = `🪔 Enhancement Requests — ${dateStr}${unreviewedCount > 0 ? ` — ${unreviewedCount} Unreviewed` : ""}`;

    await transporter.sendMail({
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to:      recipient,
      subject,
      text:    `Enhancement Request Report — ${dateStr}\n\nUnreviewed: ${unreviewedCount}\nSubmitted Today: ${todayCount}\nTotal Open: ${totalOpen || 0}\n\nView and manage in the PRVS Dashboard.\n\nPatriots RV Services — (940) 488-5047`,
      html:    htmlBody,
    });

    const summary = {
      success:     true,
      unreviewed:  unreviewedCount,
      todayCount,
      totalOpen:   totalOpen || 0,
    };

    console.log("ER report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-er-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
