import nodemailer from "npm:nodemailer@6";

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
    const body = await req.json();
    const { type } = body;

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");

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
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Your Mission Critical RV Service and Upgrade Center</p>
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
        cc:      "Patriots RV Services <repair@patriotsrvservices.com>",
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
        cc:      cc || undefined,
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
        cc:      cc || undefined,
        subject,
        text:    `Parts ETA Update — ${customerName} (RO #${roId})\n\nPart: ${partName}\nExpected ETA: ${eta}\nVehicle: ${rv || "N/A"}\nUpdated by: ${updatedBy || "Parts Department"}\n\nPatriots RV Services\n11399 US 380, Krum TX 76249\n(940) 488-5047\npatriotsrvservices.com`,
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
    <p style="margin: 4px 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: .05em;">Your Mission Critical RV Service and Upgrade Center</p>
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
