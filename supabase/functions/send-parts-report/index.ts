import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#18: Parts status report — called by GitHub Actions cron at 8 AM + 3 PM CDT Mon-Fri
// Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser    = Deno.env.get("GMAIL_USER");
    const gmailPass    = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client — bypasses RLS
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── Determine report time label ─────────────────────────────────────
    const now        = new Date();
    const utcHour    = now.getUTCHours();
    const timeLabel  = utcHour < 17 ? "Morning" : "Afternoon";
    const dateStr    = now.toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── 1. Open parts requests (has_open_parts_request=true, not received) ──
    const { data: openROs, error: e1 } = await sb
      .from("repair_orders")
      .select("id, ro_id, customer_name, rv, parts_status, requested_by_email, updated_at")
      .eq("has_open_parts_request", true)
      .not("parts_status", "eq", "received")
      .order("updated_at", { ascending: false });
    if (e1) console.error("Error fetching open ROs:", e1);

    // Fetch individual parts for open ROs so the report shows what parts are needed
    const openROIds = (openROs || []).map((ro: any) => ro.id).filter(Boolean);
    const openROPartsMap: Record<string, string[]> = {};
    if (openROIds.length > 0) {
      const { data: openROPartsList } = await sb
        .from("parts")
        .select("part_name, status, ro_id")
        .in("ro_id", openROIds)
        .not("status", "eq", "Received");
      for (const p of (openROPartsList || [])) {
        if (!openROPartsMap[p.ro_id]) openROPartsMap[p.ro_id] = [];
        openROPartsMap[p.ro_id].push(
          p.part_name + (p.status ? " (" + p.status + ")" : "")
        );
      }
    }

    // ── 2. Parts: ordered but not yet received ──────────────────────────
    const { data: orderedParts, error: e2 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, repair_order_id, repair_orders(ro_id, customer_name, rv)")
      .in("status", ["Ordered", "In Transit", "Backordered"])
      .order("eta", { ascending: true, nullsFirst: false });
    if (e2) console.error("Error fetching ordered parts:", e2);

    // ── 3. Overdue parts (ETA < today, not received) ────────────────────
    const todayStr = now.toISOString().split("T")[0];
    const { data: overdueParts, error: e3 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, repair_order_id, repair_orders(ro_id, customer_name, rv)")
      .lt("eta", todayStr)
      .not("status", "eq", "Received")
      .order("eta", { ascending: true });
    if (e3) console.error("Error fetching overdue parts:", e3);

    // ── 4. Parts received in last 24 hours ──────────────────────────────
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const { data: receivedParts, error: e4 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, repair_order_id, repair_orders(ro_id, customer_name, rv)")
      .eq("status", "Received")
      .gte("updated_at", yesterday)
      .order("updated_at", { ascending: false });
    if (e4) console.error("Error fetching received parts:", e4);

    // ── Get recipient list (managers + sr_managers + parts_managers) ────
    const { data: staff, error: e5 } = await sb
      .from("staff")
      .select("name, email, role")
      .in("role", ["sr_manager", "manager", "parts_manager"]);
    if (e5) console.error("Error fetching staff:", e5);

    const recipients = [...new Set(
      (staff || []).map(s => s.email).filter(Boolean)
    )];

    if (!recipients.length) {
      return new Response(JSON.stringify({ error: "No manager recipients found in staff table" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build email HTML ────────────────────────────────────────────────
    const hasSomething = (openROs?.length || 0) + (orderedParts?.length || 0) +
                         (overdueParts?.length || 0) + (receivedParts?.length || 0) > 0;

    const sectionHeader = (emoji: string, title: string, count: number, color: string) => `
      <tr>
        <td colspan="5" style="padding: 18px 16px 8px; background: ${color}; border-radius: 6px 6px 0 0;">
          <span style="font-size: 15px; font-weight: 700; color: #111;">${emoji} ${title}</span>
          <span style="margin-left: 8px; background: rgba(0,0,0,0.12); color: #333; font-size: 11px; padding: 2px 7px; border-radius: 10px; font-weight: 600;">${count}</span>
        </td>
      </tr>`;

    const emptyRow = (msg: string) => `
      <tr>
        <td colspan="5" style="padding: 10px 16px; color: #888; font-style: italic; font-size: 13px;">${msg}</td>
      </tr>`;

    const thStyle = `padding: 7px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e7eb; background: #f9fafb;`;
    const tdStyle = `padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top;`;

    // Section 1: Open Parts Requests
    const openROsRows = openROs?.length
      ? openROs.map((ro: any) => {
          const roParts = openROPartsMap[ro.id] || [];
          const partsHtml = roParts.length
            ? roParts.map(p => `<div style="font-size:12px; color:#374151; line-height:1.7;">• ${p}</div>`).join("")
            : `<span style="color:#aaa; font-style:italic; font-size:12px;">No parts logged yet</span>`;
          return `
          <tr>
            <td style="${tdStyle} font-family:monospace;">${ro.ro_id || "—"}</td>
            <td style="${tdStyle} font-weight:600;">${ro.customer_name || "—"}</td>
            <td style="${tdStyle}">${ro.rv || "—"}</td>
            <td style="${tdStyle}">${partsHtml}</td>
            <td style="${tdStyle}">
              <span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
                ${ro.parts_status || "outstanding"}
              </span>
            </td>
            <td style="${tdStyle} color:#666; font-size:12px;">${ro.requested_by_email || "—"}</td>
          </tr>`;
        }).join("")
      : emptyRow("No open parts requests");

    // Section 2: Ordered, not received
    const orderedRows = orderedParts?.length
      ? orderedParts.map((p: any) => `
          <tr>
            <td style="${tdStyle} font-family:monospace;">${p.repair_orders?.ro_id || "—"}</td>
            <td style="${tdStyle} font-weight:600;">${p.repair_orders?.customer_name || "—"}</td>
            <td style="${tdStyle}">${p.part_name || "—"}</td>
            <td style="${tdStyle}">
              <span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
                ${p.status}
              </span>
            </td>
            <td style="${tdStyle} color:#555; font-weight:${p.eta ? '600' : '400'};">${p.eta || "No ETA"}</td>
          </tr>`).join("")
      : emptyRow("No parts currently in Ordered / In Transit / Backordered status");

    // Section 3: Overdue
    const overdueRows = overdueParts?.length
      ? overdueParts.map((p: any) => `
          <tr>
            <td style="${tdStyle} font-family:monospace;">${p.repair_orders?.ro_id || "—"}</td>
            <td style="${tdStyle} font-weight:600;">${p.repair_orders?.customer_name || "—"}</td>
            <td style="${tdStyle}">${p.part_name || "—"}</td>
            <td style="${tdStyle}">
              <span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
                ${p.status}
              </span>
            </td>
            <td style="${tdStyle} color:#dc2626; font-weight:700;">${p.eta} ⚠️</td>
          </tr>`).join("")
      : emptyRow("No overdue parts");

    // Section 4: Received in last 24h
    const receivedRows = receivedParts?.length
      ? receivedParts.map((p: any) => {
          const recvDate = p.updated_at
            ? new Date(p.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" })
            : "—";
          return `
          <tr>
            <td style="${tdStyle} font-family:monospace;">${p.repair_orders?.ro_id || "—"}</td>
            <td style="${tdStyle} font-weight:600;">${p.repair_orders?.customer_name || "—"}</td>
            <td style="${tdStyle}">${p.part_name || "—"}</td>
            <td style="${tdStyle}">
              <span style="background:#dcfce7; color:#14532d; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
                Received
              </span>
            </td>
            <td style="${tdStyle} color:#16a34a; font-weight:600;">${recvDate}</td>
          </tr>`;
        }).join("")
      : emptyRow("No parts received in the last 24 hours");

    const tableWrap = (rows: string, cols: string[]) => `
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
        <thead>
          <tr>
            ${cols.map(c => `<th style="${thStyle}">${c}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fff;">

  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 14px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 20px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #555; font-size: 13px;">
      📦 Parts Status Report &nbsp;·&nbsp; <strong>${timeLabel}</strong> &nbsp;·&nbsp; ${dateStr}
    </p>
  </div>

  ${!hasSomething ? `<p style="color: #16a34a; font-weight:600; font-size:15px;">✅ All clear — no open parts issues to report.</p>` : ""}

  ${overdueParts?.length ? `
  <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:10px 16px; margin-bottom:18px;">
    <strong style="color:#b91c1c; font-size:14px;">⚠️ ${overdueParts.length} overdue part${overdueParts.length > 1 ? "s" : ""} — ETA has passed without receipt. Immediate follow-up needed.</strong>
  </div>` : ""}

  <!-- Section 1: Open Parts Requests -->
  <table style="width:100%; margin-bottom:4px;"><tbody>
    ${sectionHeader("🔩", "Open Parts Requests", openROs?.length || 0, "#fff3f8")}
  </tbody></table>
  ${tableWrap(openROsRows, ["RO #", "Customer", "Vehicle", "Parts Needed", "Status", "Requester"])}

  <!-- Section 2: Ordered / In Transit / Backordered -->
  <table style="width:100%; margin-bottom:4px;"><tbody>
    ${sectionHeader("📦", "Ordered — Not Yet Received", orderedParts?.length || 0, "#eff6ff")}
  </tbody></table>
  ${tableWrap(orderedRows, ["RO #", "Customer", "Part Name", "Status", "ETA"])}

  <!-- Section 3: Overdue -->
  <table style="width:100%; margin-bottom:4px;"><tbody>
    ${sectionHeader("⚠️", "Overdue Parts (ETA Passed)", overdueParts?.length || 0, "#fef2f2")}
  </tbody></table>
  ${tableWrap(overdueRows, ["RO #", "Customer", "Part Name", "Status", "ETA (Overdue)"])}

  <!-- Section 4: Received in Last 24h -->
  <table style="width:100%; margin-bottom:4px;"><tbody>
    ${sectionHeader("✅", "Received in Last 24 Hours", receivedParts?.length || 0, "#f0fdf4")}
  </tbody></table>
  ${tableWrap(receivedRows, ["RO #", "Customer", "Part Name", "Status", "Received At"])}

  <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0; color: #888; font-size: 11px;">
      Patriots RV Services &nbsp;·&nbsp; 11399 US 380, Krum TX 76249 &nbsp;·&nbsp;
      <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a><br>
      This is an automated ${timeLabel.toLowerCase()} report from the PRVS Dashboard. Reports run Mon–Fri at 8 AM and 3 PM CDT.
    </p>
  </div>
</body>
</html>`;

    // ── Send email ──────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const subject = `📦 PRVS Parts Report — ${timeLabel} — ${dateStr}${overdueParts?.length ? ` ⚠️ ${overdueParts.length} Overdue` : ""}`;

    await transporter.sendMail({
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to:      recipients.join(", "),
      subject,
      text:    `PRVS Parts Report — ${timeLabel} — ${dateStr}\n\nOpen Requests: ${openROs?.length || 0}\nOrdered/In Transit: ${orderedParts?.length || 0}\nOverdue: ${overdueParts?.length || 0}\nReceived (24h): ${receivedParts?.length || 0}\n\nView full report in the PRVS Dashboard.\n\nPatriots RV Services — (940) 488-5047`,
      html:    htmlBody,
    });

    const summary = {
      success:        true,
      timeLabel,
      recipients:     recipients.length,
      openRequests:   openROs?.length || 0,
      orderedParts:   orderedParts?.length || 0,
      overdueParts:   overdueParts?.length || 0,
      receivedLast24: receivedParts?.length || 0,
    };

    console.log("Parts report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-parts-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
