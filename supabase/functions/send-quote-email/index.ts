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
    const { to, customerName, quoteNumber, roNumber, grandTotal, body, pdfBase64 } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing 'to' address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD secret not set" }), {
        status: 500,
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

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const mailOptions: Record<string, unknown> = {
      from: `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to,
      subject,
      text: body,
      html: htmlBody,
    };

    if (pdfBase64) {
      mailOptions.attachments = [{
        filename: `PatriotsRV-Quote-${quoteNumber}.pdf`,
        content: pdfBase64,
        encoding: "base64",
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
