import nodemailer from "npm:nodemailer@6";

const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-prvs-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  // ── SHARED-SECRET AUTH GATE ────────────────────────────────────────
  // Validates the X-PRVS-Secret header against a server-side secret.
  // If the secret is not yet configured in Supabase, the check is a no-op
  // (legacy-compatible). Once the secret is set with
  //   supabase secrets set PRVS_FUNCTION_SECRET=<value>
  // all callers must send a matching X-PRVS-Secret header or get 401.
  {
    const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
    if (expectedSecret) {
      const providedSecret = req.headers.get("x-prvs-secret") || "";
      if (providedSecret !== expectedSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized — missing or invalid X-PRVS-Secret header" }),
          { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    }
  }

  try {
    const body = await req.json();
    const { type } = body;

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    const customerCcGroup = Deno.env.get("CUSTOMER_EMAIL_CC_GROUP") || "info@patriotsrvservices.com";

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD secret not set" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    // ── PARTS REQUEST EMAIL ────────────────────────────────────────────
    if (type === "parts_request") {
      const { to, techName, techEmail, customerName, roId, rv, vin, timestamp, description, photoUrls } = body;
      const photos: string[] = Array.isArray(photoUrls) ? photoUrls : [];

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const subject = `🔩 Parts Request — ${customerName || "Customer"} (${roId || "RO"})`;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 16px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 22px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Parts Request — Action Required</p>
  </div>

  <div style="background: #fff3f8; border: 2px solid #FF1493; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
    <h2 style="color: #FF1493; margin: 0 0 12px; font-size: 18px;">🔩 New Parts Request</h2>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:4px 0; color:#666; width:120px;">Submitted by:</td><td style="padding:4px 0; font-weight:700;">${techName || "Unknown Tech"}${techEmail ? ` &lt;${techEmail}&gt;` : ""}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Date/Time:</td><td style="padding:4px 0;">${timestamp || new Date().toLocaleString()}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Customer:</td><td style="padding:4px 0; font-weight:700;">${customerName || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">RO Number:</td><td style="padding:4px 0; font-family:monospace;">${roId || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Vehicle:</td><td style="padding:4px 0;">${rv || "N/A"}</td></tr>
      ${vin ? `<tr><td style="padding:4px 0; color:#666;">VIN:</td><td style="padding:4px 0; font-family:monospace; font-size:12px;">${vin}</td></tr>` : ""}
    </table>
  </div>

  <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #FF1493;">
    <h3 style="margin: 0 0 10px; color: #333; font-size: 15px;">Parts Needed:</h3>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${description || "No description provided."}</p>
  </div>

  ${photos.length > 0 ? `
  <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #ff9500;">
    <h3 style="margin: 0 0 12px; color: #333; font-size: 15px;">📷 Photos Attached (${photos.length}):</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
      ${photos.map((url, i) => `
      <a href="${url}" target="_blank" style="display:block; text-decoration:none;">
        <img src="${url}" width="160" height="120"
             style="width:160px; height:120px; object-fit:cover; border-radius:6px; border:1.5px solid #ddd; display:block;"
             alt="Parts photo ${i + 1}">
        <span style="display:block; text-align:center; font-size:10px; color:#888; margin-top:3px;">Photo ${i + 1}</span>
      </a>`).join("")}
    </div>
  </div>` : ""}

  <p style="font-size: 14px; color: #555;">Please order the required parts and mark the request as <strong>Ordered</strong> in the PRVS Dashboard to clear the alert on this RO.</p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
    <p style="margin: 0; color: #888; font-size: 11px;">
      Patriots RV Services &nbsp;·&nbsp; 11399 US 380, Krum TX 76249 &nbsp;·&nbsp;
      <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a> &nbsp;·&nbsp;
      <a href="https://patriotsrvservices.com" style="color:#c8102e;">patriotsrvservices.com</a>
    </p>
    <p style="margin: 6px 0 0; color: #aaa; font-size: 10px;">This is an automated notification from the PRVS Dashboard.</p>
  </div>
</body>
</html>`;

      await transporter.sendMail({
        from:    `"Patriots RV Services" <${gmailUser}>`,
        replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        subject,
        text:    `Parts Request\n\nSubmitted by: ${techName}\nDate/Time: ${timestamp}\nCustomer: ${customerName}\nRO: ${roId}\nVehicle: ${rv}\n\nParts Needed:\n${description}${photos.length > 0 ? `\n\nPhotos (${photos.length}):\n${photos.map((u, i) => `  ${i + 1}. ${u}`).join("\n")}` : ""}`,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── PHOTO SHARE EMAIL ──────────────────────────────────────────────
    if (type === "photo_share") {
      const { to, customerName, roId, rv, message, photoUrls } = body;
      const photos: string[] = Array.isArray(photoUrls) ? photoUrls : [];

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (!photos.length) {
        return new Response(JSON.stringify({ error: "No photos provided" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const subject = `Patriots RV Services — Photos for your RV (${roId || "RO"})`;

      const photosGrid = photos.map((url, i) => `
      <a href="${url}" target="_blank" style="display:block;text-decoration:none;text-align:center;">
        <img src="${url}" width="180" height="135"
             style="width:180px;height:135px;object-fit:cover;border-radius:8px;border:1.5px solid #ddd;display:block;margin:0 auto;"
             alt="RV Photo ${i + 1}">
        <span style="display:block;font-size:10px;color:#888;margin-top:4px;">Photo ${i + 1} — tap to view full size</span>
      </a>`).join("");

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 16px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 22px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Your Veteran Owned, Mission Critical RV Service, Repair and Upgrade Center</p>
  </div>

  <p>Dear ${customerName || "Valued Customer"},</p>
  <p>Please find below photos of your RV${rv ? ` (${rv})` : ""}${roId ? ` — RO #${roId}` : ""}.</p>

  ${message ? `<div style="background:#f0f4ff;border-left:4px solid #3b82f6;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:14px;line-height:1.6;">${message.replace(/\n/g, "<br>")}</div>` : ""}

  <div style="background:#f9f9f9;border-radius:10px;padding:16px;margin:20px 0;">
    <h3 style="margin:0 0 14px;color:#333;font-size:15px;">📷 Your RV Photos (${photos.length}):</h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
      ${photosGrid}
    </div>
    <p style="margin:14px 0 0;font-size:12px;color:#888;text-align:center;">Tap any photo to view or save the full-size image.</p>
  </div>

  <p>If you have any questions about your service, please don't hesitate to contact us.</p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
    <p style="margin: 0; color: #555; font-size: 13px;">
      &#128205; 11399 US 380, Krum TX 76249<br>
      &#128222; <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a><br>
      &#127760; <a href="https://patriotsrvservices.com" style="color:#c8102e;">patriotsrvservices.com</a>
    </p>
    <p style="margin: 8px 0 0; color: #aaa; font-size: 10px;">This email was sent from the PRVS Dashboard on your behalf.</p>
  </div>
</body>
</html>`;

      await transporter.sendMail({
        from:    `"Patriots RV Services" <${gmailUser}>`,
        replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        cc:      customerCcGroup,
        subject,
        text:    `Photos from Patriots RV Services\n\nDear ${customerName},\n\nPlease find ${photos.length} photo(s) of your RV${rv ? ` (${rv})` : ""}${roId ? ` — RO #${roId}` : ""} at the following links:\n\n${photos.map((u, i) => `  ${i + 1}. ${u}`).join("\n")}${message ? `\n\nMessage: ${message}` : ""}\n\nPatriots RV Services\n11399 US 380, Krum TX 76249\n(940) 488-5047\npatriotsrvservices.com`,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── PARTS ORDERED NOTIFICATION (GH#18) ────────────────────────────
    if (type === "parts_ordered") {
      const { to, cc, customerName, roId, rv, orderedParts, orderedBy } = body;
      const parts: Array<{ name: string; partNumber?: string; eta?: string; status: string }> =
        Array.isArray(orderedParts) ? orderedParts : [];

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const subject = `✅ Parts Ordered — ${customerName || "Customer"} (RO #${roId || "N/A"})`;

      const partsRows = parts.length > 0
        ? parts.map(p => `
          <tr>
            <td style="padding:8px 10px; border-bottom:1px solid #eee;">${p.name}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; font-family:monospace; font-size:12px; color:#555;">${p.partNumber || "—"}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; color:#22c55e; font-weight:600;">${p.status}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; color:#555;">${p.eta || "TBD"}</td>
          </tr>`).join("")
        : `<tr><td colspan="4" style="padding:10px; color:#888; font-style:italic; text-align:center;">Parts details not available — please contact us for specifics.</td></tr>`;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 16px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 22px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Parts Status Update</p>
  </div>

  <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
    <h2 style="color: #16a34a; margin: 0 0 12px; font-size: 18px;">📦 Your Parts Have Been Ordered!</h2>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:4px 0; color:#666; width:120px;">Customer:</td><td style="padding:4px 0; font-weight:700;">${customerName || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">RO Number:</td><td style="padding:4px 0; font-family:monospace;">${roId || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Vehicle:</td><td style="padding:4px 0;">${rv || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Ordered by:</td><td style="padding:4px 0;">${orderedBy || "Parts Department"}</td></tr>
    </table>
  </div>

  ${parts.length > 0 ? `
  <div style="margin-bottom: 20px;">
    <h3 style="margin: 0 0 10px; color: #333; font-size: 15px;">Parts Ordered:</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 10px; text-align:left; font-weight:600; color:#374151; border-bottom:2px solid #e5e7eb;">Part Name</th>
          <th style="padding:8px 10px; text-align:left; font-weight:600; color:#374151; border-bottom:2px solid #e5e7eb;">Part #</th>
          <th style="padding:8px 10px; text-align:left; font-weight:600; color:#374151; border-bottom:2px solid #e5e7eb;">Status</th>
          <th style="padding:8px 10px; text-align:left; font-weight:600; color:#374151; border-bottom:2px solid #e5e7eb;">ETA</th>
        </tr>
      </thead>
      <tbody>
        ${partsRows}
      </tbody>
    </table>
    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">ETA is estimated and subject to supplier availability. We'll notify you if it changes.</p>
  </div>` : ""}

  <p style="font-size: 14px; color: #555;">We'll keep you updated as your parts arrive. If you have any questions, don't hesitate to reach out.</p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
    <p style="margin: 0; color: #555; font-size: 13px;">
      &#128205; 11399 US 380, Krum TX 76249<br>
      &#128222; <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a><br>
      &#127760; <a href="https://patriotsrvservices.com" style="color:#c8102e;">patriotsrvservices.com</a>
    </p>
    <p style="margin: 8px 0 0; color: #aaa; font-size: 10px;">This is an automated notification from the PRVS Dashboard.</p>
  </div>
</body>
</html>`;

      const textParts = parts.length > 0
        ? parts.map(p => `  • ${p.name}${p.partNumber ? ` (${p.partNumber})` : ""} — ${p.status}${p.eta ? `, ETA: ${p.eta}` : ""}`).join("\n")
        : "  (Contact us for part details)";

      await transporter.sendMail({
        from:    `"Patriots RV Services" <${gmailUser}>`,
        replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        cc:      cc || customerCcGroup,
        subject,
        text:    `Parts Ordered — ${customerName} (RO #${roId})\n\nGood news! Your parts have been ordered.\n\nCustomer: ${customerName}\nRO: ${roId}\nVehicle: ${rv || "N/A"}\nOrdered by: ${orderedBy || "Parts Department"}\n\nParts:\n${textParts}\n\nPatriots RV Services\n11399 US 380, Krum TX 76249\n(940) 488-5047\npatriotsrvservices.com`,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── PARTS ETA UPDATE NOTIFICATION (GH#18) ─────────────────────────
    if (type === "parts_eta_update") {
      const { to, cc, customerName, roId, rv, partName, eta, updatedBy } = body;

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const subject = `📅 Parts ETA Update — ${customerName || "Customer"} (RO #${roId || "N/A"})`;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 16px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 22px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Parts ETA Update</p>
  </div>

  <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
    <h2 style="color: #1d4ed8; margin: 0 0 12px; font-size: 18px;">📅 ETA Update for Your Part</h2>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:4px 0; color:#666; width:120px;">Customer:</td><td style="padding:4px 0; font-weight:700;">${customerName || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">RO Number:</td><td style="padding:4px 0; font-family:monospace;">${roId || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Vehicle:</td><td style="padding:4px 0;">${rv || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Part:</td><td style="padding:4px 0; font-weight:700;">${partName || "N/A"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Expected ETA:</td><td style="padding:4px 0; font-size:16px; font-weight:700; color:#1d4ed8;">${eta || "TBD"}</td></tr>
      <tr><td style="padding:4px 0; color:#666;">Updated by:</td><td style="padding:4px 0;">${updatedBy || "Parts Department"}</td></tr>
    </table>
  </div>

  <p style="font-size: 14px; color: #555;">We'll continue to keep you updated on your parts status. If you have any questions, please reach out.</p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
    <p style="margin: 0; color: #555; font-size: 13px;">
      &#128205; 11399 US 380, Krum TX 76249<br>
      &#128222; <a href="tel:9404885047" style="color:#c8102e;">(940) 488-5047</a><br>
      &#127760; <a href="https://patriotsrvservices.com" style="color:#c8102e;">patriotsrvservices.com</a>
    </p>
    <p style="margin: 8px 0 0; color: #aaa; font-size: 10px;">This is an automated notification from the PRVS Dashboard.</p>
  </div>
</body>
</html>`;

      await transporter.sendMail({
        from:    `"Patriots RV Services" <${gmailUser}>`,
        replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        cc:      cc || customerCcGroup,
        subject,
        text:    `Parts ETA Update — ${customerName} (RO #${roId})\n\nPart: ${partName}\nExpected ETA: ${eta}\nVehicle: ${rv || "N/A"}\nUpdated by: ${updatedBy || "Parts Department"}\n\nPatriots RV Services\n11399 US 380, Krum TX 76249\n(940) 488-5047\npatriotsrvservices.com`,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── RAF COPY EMAIL (GH#17 Customer Check-In) ──────────────────────
    if (type === "raf_copy") {
      const { to, cc, customerName, roId, signedDate, rv, services, workType } = body;

      // CC group: use provided cc, or the shared env var
      const rafCcGroup = cc || customerCcGroup;

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const subject = `Patriots RV Services — Signed Repair Authorization (${roId || "RO"})`;

      // Shared styles for RAF section headers and paragraphs
      const sH = 'margin:20px 0 8px;color:#1e3a8a;font-size:15px;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:4px;';
      const sP = 'margin:0 0 10px;font-size:13px;line-height:1.7;color:#374151;';

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #333; background: #f9fafb;">
  <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

    <div style="background: linear-gradient(135deg, #1e3a8a, #1d4ed8); padding: 24px 20px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">Patriots RV Services</h1>
      <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 12px; font-style: italic;">Your Veteran Owned, Mission Critical RV Service, Repair and Upgrade Center.</p>
    </div>

    <div style="padding: 24px 20px;">
      <p style="font-size: 15px;">Dear ${customerName || "Valued Customer"},</p>
      <p style="font-size: 14px; color: #555;">Thank you for choosing Patriots RV Services. This email confirms that you have reviewed and signed our <strong>Repair Authorization Form</strong> on <strong>${signedDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>. A complete copy of the signed agreement is included below for your records.</p>

      <div style="background: #f0f9ff; border: 1.5px solid #93c5fd; border-radius: 10px; padding: 16px; margin: 16px 0;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:5px 0; color:#64748b; width:130px;">Repair Order:</td><td style="padding:5px 0; font-weight:700; font-family:monospace; font-size:15px;">${roId || "Pending"}</td></tr>
          ${rv ? `<tr><td style="padding:5px 0; color:#64748b;">Vehicle:</td><td style="padding:5px 0;">${rv}</td></tr>` : ""}
          ${services ? `<tr><td style="padding:5px 0; color:#64748b;">Services:</td><td style="padding:5px 0;">${services}</td></tr>` : ""}
          ${workType ? `<tr><td style="padding:5px 0; color:#64748b;">Work Type:</td><td style="padding:5px 0;">${workType}</td></tr>` : ""}
          <tr><td style="padding:5px 0; color:#64748b;">Date Signed:</td><td style="padding:5px 0;">${signedDate || "Today"}</td></tr>
        </table>
      </div>

      <!-- ── FULL REPAIR AUTHORIZATION FORM ───────────────────────── -->
      <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:20px 18px; margin:24px 0;">
        <h2 style="text-align:center; color:#1e3a8a; font-size:18px; margin:0 0 4px;">Patriots RV Services</h2>
        <p style="text-align:center; color:#475569; font-size:13px; margin:0 0 18px;">Work Authorization &amp; Repair Agreement</p>

        <h3 style="${sH}">1. Work Authorization</h3>
        <p style="${sP}">I hereby authorize Patriots RV Services ("PRVS") to perform the repairs, upgrades, and/or services described on this Repair Order for the vehicle identified above. I agree that Patriots RV Services is <strong>not responsible</strong> for loss or damage to this vehicle or articles left in the vehicle due to fire, theft, or any other cause beyond its reasonable control. I further grant permission for PRVS employees to operate the vehicle for the purposes of testing, inspection, and quality assurance.</p>
        <p style="${sP}">Sealant, maintenance items, and winterization are the responsibility of the customer. Patriots RV Services will not be responsible for water intrusion of any kind or damages resulting thereof, unless the water intrusion is a direct result of work performed by PRVS.</p>

        <h3 style="${sH}">2. Mechanic's Lien &amp; Payment Terms</h3>
        <p style="${sP}">To secure payment in the amount of the repairs, an expressed mechanic's lien on the vehicle is acknowledged, and I further agree to pay reasonable attorney's fees and court costs in the event that legal action becomes necessary to enforce this agreement. I acknowledge that if analysis reveals additional repairs are necessary, I will be contacted for authorization of any additional charges. If new parts listed in the attached Repair Order are not available, Patriots RV Services reserves the right to use quality replacement parts when possible, and the difference between part price and labor required will be adjusted accordingly.</p>
        <p style="${sP}">The total amount of repair charges must be paid before the vehicle can be released for delivery. I acknowledge that said vehicle can be repossessed by Patriots RV Services for one of the following reasons: non-payment or partial payment, insufficient funds, stop payments, or outstanding balance due over 60 days from delivery, or if insurance coverage pays either a portion of, or the total amount due. I acknowledge that the insurance check/draft must be obtained by myself or sent in advance by the insurance company. I also acknowledge that I must make arrangements with any lien holder or other payees to endorse the insurance check/draft <strong>prior</strong> to the release of the repaired vehicle described.</p>

        <h3 style="${sH}">3. Estimates &amp; Completion Timelines</h3>
        <p style="${sP}">All estimated completion dates, repair costs, and other quoted values are approximate and subject to change. Factors that may affect final pricing and timelines include, but are not limited to: parts availability, shipping delays, lost or back-ordered shipments, weather events, equipment or facility issues, technician availability, and unforeseen complications discovered during repairs — including delays on vehicles ahead of yours in the service queue. <strong>All figures provided are estimates only and are not guaranteed until the work is fully completed and a final invoice is issued.</strong></p>

        <h3 style="${sH}">4. Scheduled Trips &amp; Travel Plans</h3>
        <p style="${sP}">Patriots RV Services cannot guarantee specific completion dates for any repair or upgrade (see Section 3 above). We strongly advise against scheduling trips or travel plans based on estimated completion dates while your RV is in our care. If you have an upcoming trip and your repair is not yet complete, you may choose to either wait for the repair to be finished or retrieve your vehicle as-is — however, please be aware that <strong>removing your RV from our shop before completion will forfeit your current position in the service queue</strong>. Rescheduling will be subject to availability at that time. Trip schedules and travel deadlines do not alter the order of our service queue, expedite repairs, or prevent delays that may arise from the factors described above. By signing below, you acknowledge that you accept full responsibility for any travel plans made while your RV is in our possession.</p>

        <h3 style="${sH}">5. Additional Repairs &amp; Hidden Damage</h3>
        <p style="${sP}">During the course of repairs, conditions may be discovered that were not apparent during the initial inspection. If additional work is necessary beyond the original scope, Patriots RV Services will contact you for authorization before proceeding. If you decline the additional work, reassembly charges may apply to restore the vehicle to a safe and transportable condition.</p>

        <h3 style="${sH}">6. Authorization to Transport</h3>
        <p style="${sP}">I do hereby authorize Patriots RV Services to transport my unit described above to an authorized facility for the purpose of additional repairs if needed, and I will hold them harmless for any and all damages that may occur during this transport. I further acknowledge that my insurance company would be the responsible party, if necessary. I further acknowledge that the vehicle has current inspection stickers and is within the legal guidelines to be towable or drivable depending on type/class of the vehicle. This includes but is not limited to all working headlights, turn signals, brake lights, windshield wipers, and brakes. All tires must be in good condition and within legal limits with a minimum of 4/32 of tread depth.</p>

        <h3 style="${sH}">7. Storage Policy</h3>
        <p style="${sP}">Due to limited lot space, you have <strong>5 business days</strong> to pick up your vehicle after notification of completion. If not picked up within that time, we will begin storage charges of <strong>$80.00 per day</strong>. Vehicles not retrieved within <strong>30 days</strong> after completion and notification may be considered abandoned in accordance with the Texas Property Code, and Patriots RV Services reserves all rights and remedies available under Texas law, including but not limited to filing for a mechanic's and storage lien under Chapter 70 of the Texas Property Code.</p>

        <h3 style="${sH}">8. Food Spoilage &amp; Perishables</h3>
        <p style="${sP}">Patriots RV Services is <strong>not responsible</strong> for food spoilage or damage to any perishable items left in the vehicle. Your RV may not remain connected to shore power during the course of service, and refrigeration, freezer, and climate control systems may be without power for extended periods. Please remove all perishable items before dropping off your vehicle.</p>

        <h3 style="${sH}">9. Rodent, Pest &amp; Wildlife Damage</h3>
        <p style="${sP}">Patriots RV Services is <strong>not responsible</strong> for any rodent, pest, or wildlife damage — whether pre-existing at the time of drop-off or occurring while the vehicle is on our premises. Rodent and pest activity is common in outdoor storage environments and is beyond our reasonable control. If rodent or pest damage is discovered during the course of repairs, you will be notified and any resulting work will require separate authorization.</p>

        <h3 style="${sH}">10. Storm, Freeze &amp; Weather Damage</h3>
        <p style="${sP}">Patriots RV Services is <strong>not responsible</strong> for any damage to your vehicle resulting from weather events including, but not limited to: hail, wind, ice, freezing temperatures, flooding, lightning, or severe storms. While your RV is stored on our premises, it is exposed to outdoor conditions. We recommend verifying that your insurance coverage includes comprehensive protection for weather-related damage. If weather damage occurs while your vehicle is in our care, your insurance carrier would be the responsible party.</p>

        <h3 style="${sH}">11. Power of Attorney — Insurance</h3>
        <p style="${sP}">For the consideration of repairs made to the vehicle, I hereby grant my power of attorney to Patriots RV Services to sign and endorse any checks and/or drafts made payable to me and release thereto as settlement for claim damage to this vehicle.</p>

        <h3 style="${sH}">12. Photo &amp; Media Authorization</h3>
        <p style="${sP}">I hereby authorize photos and video to be taken throughout the course of repairs of the vehicle. These photos/videos may be required by third parties (i.e., insurance carriers, parts suppliers, etc.) and may also be used for training and/or marketing purposes.</p>

        <h3 style="${sH}">13. Personal Property Disclaimer</h3>
        <p style="${sP}">Patriots RV Services is not responsible for any personal property left in the vehicle during the course of repairs, including but not limited to: electronics, clothing, tools, accessories, recreational equipment, and valuables. Please remove all personal items before drop-off. Any items discovered during service will be set aside when possible, but PRVS assumes no liability for loss, theft, or damage to personal property.</p>

        <h3 style="${sH}">14. Customer Responsibility — Final Payment</h3>
        <p style="${sP}">The customer is responsible for the complete repair bill including both the insurance and deductible portions. It is the customer's responsibility to inform their service representative when payment is to be made with an insurance check and to whom the check is made out to. Please note: if the lien is a payee on the check, the check will be taken to the lien holder for inspection, at which time they will endorse the check. All deductibles and customer-pay repairs are to be <strong>paid prior to delivery of vehicle</strong>. Payment in full of the balance is required before the vehicle is delivered.</p>
      </div>
      <!-- ── END FULL RAF ─────────────────────────────────────────── -->

      <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 16px; margin: 16px 0; text-align:center;">
        <p style="margin:0; font-size:14px; color:#15803d; font-weight:700;">&#9989; Signed electronically by ${customerName || "Customer"} on ${signedDate || "today"}</p>
        <p style="margin:6px 0 0; font-size:12px; color:#166534;">This document was acknowledged and agreed to via the PRVS Customer Check-In system.</p>
      </div>

      <p style="font-size: 14px; color: #555;">We will take great care of your RV. If you have any questions about your service or need to reference this agreement, you have the full document above. Don't hesitate to reach out.</p>
    </div>

    <div style="background: #f8fafc; padding: 16px 20px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #555; font-size: 13px;">
        &#128205; 11399 US 380, Krum TX 76249<br>
        &#128222; <a href="tel:9404885047" style="color:#1e3a8a; text-decoration:none;">(940) 488-5047</a><br>
        &#127760; <a href="https://patriotsrvservices.com" style="color:#1e3a8a; text-decoration:none;">patriotsrvservices.com</a>
      </p>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 10px;">This is an automated confirmation from the PRVS Dashboard. Please retain this email for your records.</p>
    </div>

  </div>
</body>
</html>`;

      await transporter.sendMail({
        from:    `"Patriots RV Services" <${gmailUser}>`,
        replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        cc:      rafCcGroup,
        subject,
        text:    `REPAIR AUTHORIZATION CONFIRMATION\n\nDear ${customerName},\n\nThank you for choosing Patriots RV Services. This confirms that you signed our Repair Authorization Form on ${signedDate || "today"}.\n\nRepair Order: ${roId || "Pending"}${rv ? `\nVehicle: ${rv}` : ""}${services ? `\nServices: ${services}` : ""}\n\n${'='.repeat(50)}\nPATRIOTS RV SERVICES\nWORK AUTHORIZATION & REPAIR AGREEMENT\n${'='.repeat(50)}\n\n1. WORK AUTHORIZATION\nI hereby authorize Patriots RV Services ("PRVS") to perform the repairs, upgrades, and/or services described on this Repair Order for the vehicle identified above. I agree that Patriots RV Services is not responsible for loss or damage to this vehicle or articles left in the vehicle due to fire, theft, or any other cause beyond its reasonable control. I further grant permission for PRVS employees to operate the vehicle for the purposes of testing, inspection, and quality assurance.\n\nSealant, maintenance items, and winterization are the responsibility of the customer. Patriots RV Services will not be responsible for water intrusion of any kind or damages resulting thereof, unless the water intrusion is a direct result of work performed by PRVS.\n\n2. MECHANIC'S LIEN & PAYMENT TERMS\nTo secure payment in the amount of the repairs, an expressed mechanic's lien on the vehicle is acknowledged, and I further agree to pay reasonable attorney's fees and court costs in the event that legal action becomes necessary to enforce this agreement. I acknowledge that if analysis reveals additional repairs are necessary, I will be contacted for authorization of any additional charges.\n\nThe total amount of repair charges must be paid before the vehicle can be released for delivery. I acknowledge that said vehicle can be repossessed by Patriots RV Services for non-payment or partial payment, insufficient funds, stop payments, or outstanding balance due over 60 days from delivery.\n\n3. ESTIMATES & COMPLETION TIMELINES\nAll estimated completion dates, repair costs, and other quoted values are approximate and subject to change. All figures provided are estimates only and are not guaranteed until the work is fully completed and a final invoice is issued.\n\n4. SCHEDULED TRIPS & TRAVEL PLANS\nPatriots RV Services cannot guarantee specific completion dates. Removing your RV from our shop before completion will forfeit your current position in the service queue.\n\n5. ADDITIONAL REPAIRS & HIDDEN DAMAGE\nDuring the course of repairs, conditions may be discovered that were not apparent during the initial inspection. If additional work is necessary, Patriots RV Services will contact you for authorization before proceeding.\n\n6. AUTHORIZATION TO TRANSPORT\nI do hereby authorize Patriots RV Services to transport my unit to an authorized facility for additional repairs if needed.\n\n7. STORAGE POLICY\nYou have 5 business days to pick up your vehicle after notification of completion. Storage charges of $80.00 per day apply after that. Vehicles not retrieved within 30 days may be considered abandoned under Texas law.\n\n8. FOOD SPOILAGE & PERISHABLES\nPatriots RV Services is not responsible for food spoilage or damage to any perishable items left in the vehicle.\n\n9. RODENT, PEST & WILDLIFE DAMAGE\nPatriots RV Services is not responsible for any rodent, pest, or wildlife damage.\n\n10. STORM, FREEZE & WEATHER DAMAGE\nPatriots RV Services is not responsible for any damage resulting from weather events.\n\n11. POWER OF ATTORNEY — INSURANCE\nI hereby grant my power of attorney to Patriots RV Services to sign and endorse any checks/drafts as settlement for claim damage.\n\n12. PHOTO & MEDIA AUTHORIZATION\nI hereby authorize photos and video to be taken throughout the course of repairs.\n\n13. PERSONAL PROPERTY DISCLAIMER\nPatriots RV Services is not responsible for any personal property left in the vehicle during repairs.\n\n14. CUSTOMER RESPONSIBILITY — FINAL PAYMENT\nThe customer is responsible for the complete repair bill including both the insurance and deductible portions. Payment in full of the balance is required before the vehicle is delivered.\n\n${'='.repeat(50)}\nSigned electronically by ${customerName || "Customer"} on ${signedDate || "today"}\n${'='.repeat(50)}\n\nPatriots RV Services\n11399 US 380, Krum TX 76249\n(940) 488-5047\npatriotsrvservices.com`,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── LEAD / WARRANTY DROP-OFF STAFF NOTIFICATION ───────────────────
    // Fires for: Lead Conversion (any work type) + Drop-off when Warranty or Hybrid.
    // Purpose: alert the appropriate silo manager that a committed job is on the way
    // so they can pre-stage parts, paperwork, and shop capacity.
    if (type === "lead_staff_notify") {
      const {
        to,
        roId,
        mode,                  // 'lead' | 'dropoff'
        customerName,
        customerType,          // 'New' | 'Returning'
        customerPhone,
        customerEmail,
        customerAddress,
        rv,
        vin,
        silos,                 // Array<{ key, label, emoji }>
        workType,              // 'standard' | 'warranty' | 'hybrid'
        workDescription,
        warrantyDescription,
        warrantyOrigRO,
        plannedDropoff,        // ISO date string or null
        promisedDate,          // ISO date string or null
        leadNotes,
        createdByName,
        createdByRole,
        createdByEmail,
        createdAt,             // ISO string
        dashboardLink,
      } = body;

      if (!to) {
        return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const silosArr: Array<{ key: string; label: string; emoji: string }> = Array.isArray(silos) ? silos : [];
      const silosLabelsText = silosArr.map(s => s.label).join(", ") || "—";
      const silosHtml = silosArr.length > 0
        ? silosArr.map(s => `<div style="padding:6px 10px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; font-weight:600; color:#1e3a8a; display:inline-block; margin:3px 4px 3px 0;">${s.emoji || ""} ${s.label}</div>`).join("")
        : `<span style="color:#888; font-style:italic;">None selected</span>`;

      const workTypeLabel =
        workType === "hybrid"   ? "Hybrid (New Work + Warranty)" :
        workType === "warranty" ? "Warranty"                     :
                                  "Standard (New Work)";
      const workTypeTag =
        workType === "hybrid"   ? " (Hybrid)"   :
        workType === "warranty" ? " (Warranty)" :
                                  "";

      // Subject line: "New Lead — Customer — Services — RV — RO ID"
      //            or "New Warranty Drop-Off — ..." / "New Hybrid Drop-Off — ..."
      let subjectPrefix = "New Lead" + workTypeTag;
      if (mode === "dropoff") {
        subjectPrefix = workType === "hybrid"   ? "New Hybrid Drop-Off" :
                        workType === "warranty" ? "New Warranty Drop-Off" :
                                                  "New Drop-Off"; // shouldn't fire for standard, but safe
      }
      const subject = `${subjectPrefix} — ${customerName || "Customer"} — ${silosLabelsText} — ${rv || "RV"} — ${roId || "RO"}`;

      const fmtDate = (iso?: string | null) => {
        if (!iso) return "—";
        try {
          return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        } catch { return iso; }
      };
      const fmtDateTime = (iso?: string | null) => {
        if (!iso) return new Date().toLocaleString();
        try { return new Date(iso).toLocaleString(); } catch { return iso; }
      };

      const createdBy = createdByName || createdByEmail || "Unknown";
      const createdByLine = createdByRole ? `${createdBy} · ${createdByRole}` : createdBy;

      const headerLabel = mode === "dropoff"
        ? (workType === "hybrid" ? "Hybrid Warranty Drop-Off" : "Warranty Drop-Off")
        : "New Lead Conversion";
      const headerSub = mode === "dropoff"
        ? "Customer is on the lot — manager prep required"
        : "Customer committed — manager prep required before drop-off";

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #333; background: #f9fafb;">
  <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

    <div style="background: linear-gradient(135deg, #1e3a8a, #1d4ed8); padding: 24px 20px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">Patriots RV Services</h1>
      <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 12px; text-transform: uppercase; letter-spacing: .08em;">${headerLabel}</p>
    </div>

    <div style="padding: 24px 20px;">

      <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
        <p style="margin:0 0 4px; font-size:13px; color:#92400e; text-transform:uppercase; letter-spacing:.05em; font-weight:700;">🔔 Action Required</p>
        <p style="margin:0; font-size:14px; color:#78350f;">${headerSub}</p>
      </div>

      <!-- ── SUMMARY ─────────────────────────────────────────────── -->
      <div style="background: #f0f9ff; border: 1.5px solid #93c5fd; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:5px 0; color:#64748b; width:140px;">RO ID:</td><td style="padding:5px 0; font-weight:700; font-family:monospace; font-size:15px; color:#1e3a8a;">${roId || "—"}</td></tr>
          <tr><td style="padding:5px 0; color:#64748b;">Created:</td><td style="padding:5px 0;">${fmtDateTime(createdAt)}</td></tr>
          <tr><td style="padding:5px 0; color:#64748b;">Created by:</td><td style="padding:5px 0; font-weight:600;">${createdByLine}</td></tr>
          <tr><td style="padding:5px 0; color:#64748b;">Work type:</td><td style="padding:5px 0; font-weight:600;">${workTypeLabel}</td></tr>
          <tr><td style="padding:5px 0; color:#64748b;">Customer type:</td><td style="padding:5px 0;">${customerType || "—"}</td></tr>
        </table>
      </div>

      <!-- ── SERVICES REQUESTED (the action block) ──────────────── -->
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Services Requested</h3>
      <div style="background:#f8fafc; border-radius:8px; padding:12px 14px; margin-bottom:16px;">
        ${silosHtml}
      </div>

      <!-- ── SCHEDULING ─────────────────────────────────────────── -->
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Scheduling</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr><td style="padding:4px 0; color:#64748b; width:170px;">Planned drop-off:</td><td style="padding:4px 0; font-weight:600;">${fmtDate(plannedDropoff)}</td></tr>
        <tr><td style="padding:4px 0; color:#64748b;">Promised complete:</td><td style="padding:4px 0; font-weight:600;">${fmtDate(promisedDate)}</td></tr>
      </table>

      <!-- ── CUSTOMER ───────────────────────────────────────────── -->
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Customer</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr><td style="padding:4px 0; color:#64748b; width:100px;">Name:</td><td style="padding:4px 0; font-weight:600;">${customerName || "—"}</td></tr>
        <tr><td style="padding:4px 0; color:#64748b;">Phone:</td><td style="padding:4px 0;">${customerPhone ? `<a href="tel:${String(customerPhone).replace(/[^+\d]/g, "")}" style="color:#1d4ed8; text-decoration:none; font-weight:600;">${customerPhone}</a>` : "—"}</td></tr>
        <tr><td style="padding:4px 0; color:#64748b;">Email:</td><td style="padding:4px 0;">${customerEmail ? `<a href="mailto:${customerEmail}" style="color:#1d4ed8; text-decoration:none;">${customerEmail}</a>` : "—"}</td></tr>
        <tr><td style="padding:4px 0; color:#64748b; vertical-align:top;">Address:</td><td style="padding:4px 0;">${customerAddress || "—"}</td></tr>
      </table>

      <!-- ── RV ─────────────────────────────────────────────────── -->
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">RV</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr><td style="padding:4px 0; color:#64748b; width:100px;">Unit:</td><td style="padding:4px 0; font-weight:600;">${rv || "—"}</td></tr>
        <tr><td style="padding:4px 0; color:#64748b;">VIN:</td><td style="padding:4px 0; font-family:monospace; font-size:13px;">${vin || "—"}</td></tr>
      </table>

      <!-- ── WORK DESCRIPTION ───────────────────────────────────── -->
      ${workDescription ? `
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">New Work Description</h3>
      <div style="background:#f8fafc; border-left:4px solid #1d4ed8; border-radius:6px; padding:12px 14px; margin-bottom:16px; font-size:14px; line-height:1.6; white-space:pre-wrap;">${workDescription}</div>
      ` : ""}

      ${warrantyDescription || warrantyOrigRO ? `
      <h3 style="margin:20px 0 8px; color:#c8102e; font-size:15px; font-weight:700; border-bottom:1px solid #fecaca; padding-bottom:4px;">Warranty Work</h3>
      <div style="background:#fef2f2; border-left:4px solid #c8102e; border-radius:6px; padding:12px 14px; margin-bottom:16px; font-size:14px; line-height:1.6;">
        ${warrantyOrigRO ? `<p style="margin:0 0 8px; font-size:13px;"><strong>Original RO:</strong> <span style="font-family:monospace;">${warrantyOrigRO}</span></p>` : ""}
        ${warrantyDescription ? `<div style="white-space:pre-wrap;">${warrantyDescription}</div>` : ""}
      </div>
      ` : ""}

      <!-- ── LEAD CONVERSION NOTES (the real context) ───────────── -->
      ${leadNotes ? `
      <h3 style="margin:20px 0 8px; color:#1e3a8a; font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Lead Conversion Notes</h3>
      <div style="background:#fffbeb; border:1.5px solid #fcd34d; border-radius:8px; padding:14px 16px; margin-bottom:20px; font-size:14px; line-height:1.7; white-space:pre-wrap; color:#422006;">${leadNotes}</div>
      ` : ""}

      <!-- ── DASHBOARD CTA ──────────────────────────────────────── -->
      ${dashboardLink ? `
      <div style="text-align:center; margin:28px 0 8px;">
        <a href="${dashboardLink}" style="display:inline-block; background: linear-gradient(135deg, #1e3a8a, #1d4ed8); color:#fff; text-decoration:none; font-weight:700; font-size:15px; padding:14px 28px; border-radius:8px; box-shadow:0 2px 6px rgba(30,58,138,0.25);">View RO on Dashboard →</a>
      </div>
      <p style="text-align:center; margin:4px 0 0; font-size:11px; color:#94a3b8;">Link opens the RO tile and highlights it.</p>
      ` : ""}

    </div>

    <div style="background: #f8fafc; padding: 16px 20px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #555; font-size: 13px;">
        &#128205; 11399 US 380, Krum TX 76249<br>
        &#128222; <a href="tel:9404885047" style="color:#1e3a8a; text-decoration:none;">(940) 488-5047</a> &nbsp;·&nbsp;
        &#127760; <a href="https://patriotsrvservices.com" style="color:#1e3a8a; text-decoration:none;">patriotsrvservices.com</a>
      </p>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 10px;">Automated internal notification from the PRVS Dashboard.</p>
    </div>

  </div>
</body>
</html>`;

      const textBody =
`${headerLabel.toUpperCase()}
${headerSub}

RO ID: ${roId || "—"}
Created: ${fmtDateTime(createdAt)}
Created by: ${createdByLine}
Work type: ${workTypeLabel}
Customer type: ${customerType || "—"}

SERVICES REQUESTED
${silosLabelsText}

SCHEDULING
Planned drop-off:   ${fmtDate(plannedDropoff)}
Promised complete:  ${fmtDate(promisedDate)}

CUSTOMER
Name:    ${customerName || "—"}
Phone:   ${customerPhone || "—"}
Email:   ${customerEmail || "—"}
Address: ${customerAddress || "—"}

RV
Unit: ${rv || "—"}
VIN:  ${vin || "—"}
${workDescription ? `\nNEW WORK DESCRIPTION\n${workDescription}\n` : ""}${warrantyDescription || warrantyOrigRO ? `\nWARRANTY WORK${warrantyOrigRO ? `\nOriginal RO: ${warrantyOrigRO}` : ""}${warrantyDescription ? `\n${warrantyDescription}` : ""}\n` : ""}${leadNotes ? `\nLEAD CONVERSION NOTES\n${leadNotes}\n` : ""}
${dashboardLink ? `\nView RO on Dashboard: ${dashboardLink}\n` : ""}
—
Patriots RV Services · 11399 US 380, Krum TX 76249 · (940) 488-5047
Automated internal notification from the PRVS Dashboard.`;

      await transporter.sendMail({
        from:    `"Patriots RV Services — Dashboard" <${gmailUser}>`,
        replyTo: createdByEmail || "Patriots RV Services <info@patriotsrvservices.com>",
        to,
        subject,
        text:    textBody,
        html:    htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── SOLAR QUOTE EMAIL (original behaviour) ─────────────────────────
    const { to, customerName, quoteNumber, roNumber, grandTotal, body: emailBody, pdfBase64 } = body;

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const subject = roNumber
      ? `Patriots RV Services — Solar Quote #${quoteNumber} (RO #${roNumber})`
      : `Patriots RV Services — Solar Quote #${quoteNumber}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 16px; margin-bottom: 20px;">
    <h1 style="color: #c8102e; margin: 0; font-size: 22px;">Patriots RV Services</h1>
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Your Veteran Owned, Mission Critical RV Service, Repair and Upgrade Center</p>
  </div>
  <p>Dear ${customerName},</p>
  <p>Thank you for your interest in our solar installation services. Please see the <strong>attached PDF</strong> for your complete quote details.</p>
  ${roNumber ? `<p><strong>Repair Order:</strong> RO #${roNumber}</p>` : ""}
  <p style="font-size: 16px;"><strong>Quote #${quoteNumber}</strong> &nbsp;&middot;&nbsp; <strong style="color: #c8102e;">Total: $${Number(grandTotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p>
  <p>To discuss this quote or schedule your installation, please contact us:</p>
  <p>
    &#128205; 11399 US 380, Krum TX 76249<br>
    &#128222; <a href="tel:9404885047">(940) 488-5047</a><br>
    &#127760; <a href="https://patriotsrvservices.com">patriotsrvservices.com</a>
  </p>
  <p style="color: #888; font-size: 11px; border-top: 1px solid #ddd; padding-top: 12px; margin-top: 20px;">
    This quote is valid for 30 days. Prices subject to change based on parts availability.
  </p>
</body>
</html>`;

    const mailOptions: Record<string, unknown> = {
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to,
      subject,
      text:    emailBody,
      html:    htmlBody,
    };

    if (pdfBase64) {
      mailOptions.attachments = [{
        filename:    `PatriotsRV-Quote-${quoteNumber}.pdf`,
        content:     pdfBase64,
        encoding:    "base64",
        contentType: "application/pdf",
      }];
    }

    await transporter.sendMail(mailOptions);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-quote-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
