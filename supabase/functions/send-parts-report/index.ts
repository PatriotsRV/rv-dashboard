import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#18: Parts status report — called by Supabase pg_cron at 8 AM + 3 PM CDT Mon-Fri
// v1.3: Added contextual action prompts above each section + end-of-day checklist on 3 PM send
// Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}

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
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser    = Deno.env.get("GMAIL_USER");
    const gmailPass    = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Service-role client — bypasses RLS
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── Determine report time label ─────────────────────────────────────
    const now        = new Date();
    const utcHour    = now.getUTCHours();
    const isMorning  = utcHour < 17; // before 5 PM UTC = before 12 PM CDT (morning send is 13:00 UTC / 8 AM CDT)
    const timeLabel  = isMorning ? "Morning" : "Afternoon";
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

    // Fetch individual parts for open ROs
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
      .select("id, part_name, part_number, eta, status, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
      .in("status", ["Ordered", "In Transit", "Backordered"])
      .order("eta", { ascending: true, nullsFirst: false });
    if (e2) console.error("Error fetching ordered parts:", e2);

    // ── 3. Overdue parts (ETA < today, not received) ────────────────────
    const todayStr = now.toISOString().split("T")[0];
    const { data: overdueParts, error: e3 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
      .lt("eta", todayStr)
      .not("status", "eq", "Received")
      .order("eta", { ascending: true });
    if (e3) console.error("Error fetching overdue parts:", e3);

    // ── 4. Parts received in last 24 hours ──────────────────────────────
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const { data: receivedParts, error: e4 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
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
      (staff || []).map((s: any) => s.email).filter(Boolean)
    )];

    if (!recipients.length) {
      return new Response(JSON.stringify({ error: "No manager recipients found in staff table" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Shared style constants ───────────────────────────────────────────
    const thStyle = `padding: 7px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e7eb; background: #f9fafb;`;
    const tdStyle = `padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top;`;

    // ── Helper: section header row ───────────────────────────────────────
    const sectionHeader = (emoji: string, title: string, count: number, color: string) => `
      <tr>
        <td colspan="6" style="padding: 14px 16px 8px; background: ${color}; border-radius: 6px 6px 0 0;">
          <span style="font-size: 15px; font-weight: 700; color: #111;">${emoji} ${title}</span>
          <span style="margin-left: 8px; background: rgba(0,0,0,0.12); color: #333; font-size: 11px; padding: 2px 7px; border-radius: 10px; font-weight: 600;">${count}</span>
        </td>
      </tr>`;

    // ── Helper: action prompt row (sits between header and column labels) ─
    const actionPrompt = (text: string, bgColor: string, textColor: string) => `
      <tr>
        <td colspan="6" style="padding: 9px 16px 10px; background: ${bgColor}; border-bottom: 2px solid #e5e7eb;">
          <span style="font-size: 13px; font-weight: 600; color: ${textColor};">&#8594; ${text}</span>
        </td>
      </tr>`;

    const emptyRow = (msg: string) => `
      <tr>
        <td colspan="6" style="padding: 10px 16px; color: #888; font-style: italic; font-size: 13px;">${msg}</td>
      </tr>`;

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

    // ── Section 1 rows: Open Parts Requests ─────────────────────────────
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
      : emptyRow("No open parts requests — nothing to source right now.");

    // Action prompt text for section 1
    const s1Action = openROs?.length
      ? `For each RO below: find the part, place the order, then update the status to Ordered and fill in Supplier, PO Number, Date Ordered, and ETA. Click "Notify Requester" to email whoever submitted the request.`
      : `Nothing to do here — no open requests.`;
    const s1ActionColor  = openROs?.length ? "#fffbeb" : "#f0fdf4";
    const s1ActionTColor = openROs?.length ? "#92400e" : "#15803d";

    // ── Section 2 rows: Ordered / In Transit / Backordered ───────────────
    const orderedRows = orderedParts?.length
      ? orderedParts.map((p: any) => {
          const etaText = p.eta || "NO ETA SET";
          const etaMissing = !p.eta;
          const etaColor = etaMissing ? "#dc2626" : "#374151";
          const etaWeight = etaMissing ? "700" : "600";
          return `
          <tr>
            <td style="${tdStyle} font-family:monospace;">${p.repair_orders?.ro_id || "—"}</td>
            <td style="${tdStyle} font-weight:600;">${p.repair_orders?.customer_name || "—"}</td>
            <td style="${tdStyle}">${p.part_name || "—"}</td>
            <td style="${tdStyle}">
              <span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
                ${p.status}
              </span>
            </td>
            <td style="${tdStyle} color:${etaColor}; font-weight:${etaWeight};">${etaText}</td>
          </tr>`;
        }).join("")
      : emptyRow("No parts currently in Ordered / In Transit / Backordered status.");

    const missingEtaCount = (orderedParts || []).filter((p: any) => !p.eta).length;
    let s2Action: string;
    if (!orderedParts?.length) {
      s2Action = "Nothing to do here — no parts currently on order.";
    } else if (missingEtaCount > 0) {
      s2Action = `Check each ETA below. If today or past — call the supplier now and get an updated date. ${missingEtaCount} part${missingEtaCount > 1 ? "s are" : " is"} missing an ETA entirely — open the dashboard and add it.`;
    } else {
      s2Action = `Check each ETA below. If any are today or already past, call the supplier now and update the ETA in the dashboard.`;
    }
    const s2ActionColor  = orderedParts?.length ? "#eff6ff" : "#f0fdf4";
    const s2ActionTColor = orderedParts?.length ? "#1e40af" : "#15803d";

    // ── Section 3 rows: Overdue ──────────────────────────────────────────
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
            <td style="${tdStyle} color:#dc2626; font-weight:700;">${p.eta} — OVERDUE</td>
          </tr>`).join("")
      : emptyRow("No overdue parts — you are on top of it.");

    const s3Action = overdueParts?.length
      ? `Each of these parts is LATE. Call the supplier for every one today. Get a new ETA and update it in the dashboard. If they still can't deliver, change the status to Backordered and let the manager on that RO know right away.`
      : `Nothing overdue — keep it that way.`;
    const s3ActionColor  = overdueParts?.length ? "#fef2f2" : "#f0fdf4";
    const s3ActionTColor = overdueParts?.length ? "#991b1b" : "#15803d";

    // ── Section 4 rows: Received in Last 24h ────────────────────────────
    const receivedRows = receivedParts?.length
      ? receivedParts.map((p: any) => {
          const recvDate = p.updated_at
            ? new Date(p.updated_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
                timeZone: "America/Chicago",
              })
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
      : emptyRow("No parts received in the last 24 hours.");

    const s4Action = receivedParts?.length
      ? `Make sure each of these is marked Received in the dashboard with today's date. Then let the tech or manager on that RO know their part is in.`
      : `Nothing received yet — when parts arrive, mark them Received in the dashboard right away.`;
    const s4ActionColor  = receivedParts?.length ? "#f0fdf4" : "#f9fafb";
    const s4ActionTColor = receivedParts?.length ? "#15803d" : "#6b7280";

    // ── Morning banner (8 AM only) ───────────────────────────────────────
    const morningBanner = isMorning ? `
  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #c8102e; border-radius:6px; padding:12px 16px; margin-bottom:20px;">
    <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:#1e293b;">Good morning, Bobby. Work through this report in order:</p>
    <ol style="margin:0; padding-left:20px; font-size:13px; color:#374151; line-height:2;">
      <li><strong>Overdue (Section 3)</strong> — call suppliers, get new ETAs, mark Backordered if needed</li>
      <li><strong>Open Requests (Section 1)</strong> — order everything you can today</li>
      <li><strong>Ordered/In Transit (Section 2)</strong> — check ETAs, chase anything due today</li>
      <li><strong>Received (Section 4)</strong> — confirm each is logged and notify the tech</li>
    </ol>
  </div>` : "";

    // ── End-of-day checklist (3 PM only) ────────────────────────────────
    const eodChecklist = !isMorning ? `
  <div style="background:#fff7ed; border:1px solid #fed7aa; border-left:4px solid #f97316; border-radius:6px; padding:14px 18px; margin-top:24px; margin-bottom:8px;">
    <p style="margin:0 0 10px; font-size:14px; font-weight:700; color:#9a3412;">Before You Leave Today — Check These Off:</p>
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Every part that arrived today is marked <strong>Received</strong> in the dashboard with today's date and your name in "Received By."</td>
      </tr>
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Every part you ordered today has a <strong>PO Number, ETA, and your name</strong> filled in under Manage Parts.</td>
      </tr>
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Every part in <strong>Ordered or In Transit</strong> status has an ETA date. If any are missing — add it now.</td>
      </tr>
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Any part still in <strong>Sourcing</strong> that you couldn't order today — write it on your notepad so it's first on your list tomorrow morning.</td>
      </tr>
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Check for any parts with a <strong>Return Deadline of today or tomorrow</strong> — flag those to management before you leave.</td>
      </tr>
      <tr>
        <td style="width:24px; vertical-align:top; padding:3px 8px 3px 0; font-size:16px;">&#9744;</td>
        <td style="font-size:13px; color:#374151; padding:3px 0; line-height:1.5;">Any phone calls with suppliers that changed an ETA or status today — make sure those are <strong>updated in the dashboard</strong> before you go.</td>
      </tr>
    </table>
  </div>` : "";

    // ── Overdue alert banner (shown on both sends if overdue exists) ─────
    const overdueAlert = overdueParts?.length ? `
  <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:10px 16px; margin-bottom:18px;">
    <strong style="color:#b91c1c; font-size:14px;">ACTION REQUIRED: ${overdueParts.length} overdue part${overdueParts.length > 1 ? "s" : ""} — ETA has passed. See Section 3. Call the supplier today.</strong>
  </div>` : "";

    // ── Assemble full HTML email ─────────────────────────────────────────
    const hasSomething = (openROs?.length || 0) + (orderedParts?.length || 0) +
                         (overdueParts?.length || 0) + (receivedParts?.length || 0) > 0;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fff;">

  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 14px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 20px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #555; font-size: 13px;">
      Parts Status Report &nbsp;&middot;&nbsp; <strong>${timeLabel}</strong> &nbsp;&middot;&nbsp; ${dateStr}
    </p>
  </div>

  ${!hasSomething ? `<p style="color: #16a34a; font-weight:600; font-size:15px;">All clear — no open parts issues to report.</p>` : ""}

  ${overdueAlert}
  ${morningBanner}

  <!-- Section 1: Open Parts Requests -->
  <table style="width:100%; border-collapse:collapse;">
    <tbody>
      ${sectionHeader("Section 1", "Open Requests — Not Yet Ordered", openROs?.length || 0, "#fff3f8")}
      ${actionPrompt(s1Action, s1ActionColor, s1ActionTColor)}
    </tbody>
  </table>
  ${tableWrap(openROsRows, ["RO #", "Customer", "Vehicle", "Parts Needed", "Status", "Requester"])}

  <!-- Section 2: Ordered / In Transit / Backordered -->
  <table style="width:100%; border-collapse:collapse;">
    <tbody>
      ${sectionHeader("Section 2", "Ordered — Not Yet Received", orderedParts?.length || 0, "#eff6ff")}
      ${actionPrompt(s2Action, s2ActionColor, s2ActionTColor)}
    </tbody>
  </table>
  ${tableWrap(orderedRows, ["RO #", "Customer", "Part Name", "Status", "ETA"])}

  <!-- Section 3: Overdue -->
  <table style="width:100%; border-collapse:collapse;">
    <tbody>
      ${sectionHeader("Section 3", "Overdue Parts — ETA Has Passed", overdueParts?.length || 0, "#fef2f2")}
      ${actionPrompt(s3Action, s3ActionColor, s3ActionTColor)}
    </tbody>
  </table>
  ${tableWrap(overdueRows, ["RO #", "Customer", "Part Name", "Status", "ETA"])}

  <!-- Section 4: Received in Last 24h -->
  <table style="width:100%; border-collapse:collapse;">
    <tbody>
      ${sectionHeader("Section 4", "Received in Last 24 Hours", receivedParts?.length || 0, "#f0fdf4")}
      ${actionPrompt(s4Action, s4ActionColor, s4ActionTColor)}
    </tbody>
  </table>
  ${tableWrap(receivedRows, ["RO #", "Customer", "Part Name", "Status", "Received At"])}

  ${eodChecklist}

  <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0; color: #888; font-size: 11px;">
      Patriots RV Services &nbsp;&middot;&nbsp; Denton, TX &nbsp;&middot;&nbsp;
      <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a><br>
      Automated ${timeLabel.toLowerCase()} report from the PRVS Dashboard &nbsp;&middot;&nbsp; Mon–Fri at 8 AM and 3 PM CDT
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

    const overdueFlag = overdueParts?.length ? ` — ${overdueParts.length} OVERDUE` : "";
    const subject = `PRVS Parts Report — ${timeLabel} — ${dateStr}${overdueFlag}`;

    const plainText = [
      `PRVS Parts Report — ${timeLabel} — ${dateStr}`,
      ``,
      `Open Requests (not ordered): ${openROs?.length || 0}`,
      `Ordered / In Transit:        ${orderedParts?.length || 0}`,
      `Overdue:                     ${overdueParts?.length || 0}`,
      `Received (last 24h):         ${receivedParts?.length || 0}`,
      ``,
      isMorning
        ? `Work through this in order: (3) Overdue first → (1) Open Requests → (2) Check ETAs → (4) Confirm received.`
        : `Before you leave: mark all received parts in the dashboard, make sure every ordered part has an ETA, flag any return deadlines due today or tomorrow.`,
      ``,
      `Open dashboard: https://patriotsrv.github.io/rv-dashboard/`,
      ``,
      `Patriots RV Services — (940) 488-5047`,
    ].join("\n");

    await transporter.sendMail({
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to:      recipients.join(", "),
      subject,
      text:    plainText,
      html:    htmlBody,
    });

    const summary = {
      success:        true,
      version:        "v1.3",
      timeLabel,
      recipients:     recipients.length,
      openRequests:   openROs?.length || 0,
      orderedParts:   orderedParts?.length || 0,
      overdueParts:   overdueParts?.length || 0,
      receivedLast24: receivedParts?.length || 0,
    };

    console.log("Parts report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-parts-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
