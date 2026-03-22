import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type } = body;

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD secret not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SOLAR QUOTE EMAIL (original behaviour) ─────────────────────────
    const { to, customerName, quoteNumber, roNumber, grandTotal, body: emailBody, pdfBase64 } = body;

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-quote-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
