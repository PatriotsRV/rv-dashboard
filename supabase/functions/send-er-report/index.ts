import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#19: Daily Enhancement Request report — called by Supabase pg_cron at 3:30 PM CDT
// Sends a summary of all unreviewed + recent requests to Roland

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const erRow = (er: any) => {
      const date = new Date(er.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        timeZone: "America/Chicago",
      });
      return `<tr>
        <td style="${tdStyle}">${date}</td>
        <td style="${tdStyle} font-weight:600;">${er.submitted_by_name || er.submitted_by}</td>
        <td style="${tdStyle}"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">${er.category}</span></td>
        <td style="${tdStyle}">${er.description.length > 100 ? er.description.substring(0, 100) + "..." : er.description}</td>
        <td style="${tdStyle}">${statusBadge(er.status)}</td>
        <td style="${tdStyle} color:#888; font-size:12px;">${er.source_page}</td>
      </tr>`;
    };

    const unreviewedRows = unreviewed?.length
      ? unreviewed.map(erRow).join("")
      : `<tr><td colspan="6" style="padding:10px 16px;color:#888;font-style:italic;font-size:13px;">No unreviewed requests</td></tr>`;

    const todayRows = todayRequests?.length
      ? todayRequests.map(erRow).join("")
      : "";

    const tableHeaders = ["Date", "Requester", "Category", "Description", "Status", "Page"]
      .map(c => `<th style="${thStyle}">${c}</th>`).join("");

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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-er-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
