// ============================================================
// auth-send-sms v1.0 (Session 195, 2026-10-04) - Supabase Auth "Send SMS" hook
// ============================================================
// WHY: Provose Phase 0 - phone-OTP sign-in INSIDE the app replaces Google
// (Roland decision S195). Supabase Auth's built-in SMS senders are Twilio /
// MessageBird / Vonage / Textlocal; the "Send SMS" auth hook replaces them with
// an HTTP endpoint of ours, so login codes go out over Textly from the shop
// line (+1 940-488-5047) - same transport as descope-sms (gate codes) and
// textly-send (customer texts). No new SMS vendor.
//
// Supabase calls this with the Standard Webhooks envelope:
//   headers: webhook-id, webhook-timestamp, webhook-signature
//   body:    { "user": { id, phone, email, ... }, "sms": { "otp": "123456" } }
// and expects HTTP 200 + `{}` on success, or
//   { "error": { "http_code": 4xx|5xx, "message": "..." } } on failure.
//
// SECURITY (two gates, both required):
//   1. Standard-Webhooks signature with SEND_SMS_HOOK_SECRET (the value Supabase
//      shows when the hook is created: "v1,whsec_<base64>"). Verified with the
//      standardwebhooks library - never trust an unsigned call.
//   2. The user's phone MUST equal the phone_number of an ACTIVE public.staff
//      row. A departed employee (staff.active=false) cannot receive a code even
//      if their auth.users row still exists.
//
// Deliberately NOT routed through textly-send (customer opt-out gate + inbox
// conversations rows - login codes must never appear on the Messages board).
//
// Secrets: SEND_SMS_HOOK_SECRET (new; from Supabase -> Authentication -> Hooks),
//   TEXTLY_API_TOKEN, TEXTLY_FROM_E164 (optional), TEXTLY_API_BASE (optional),
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (pre-existing).
// Deploy:  supabase functions deploy auth-send-sms --no-verify-jwt
//   (--no-verify-jwt: the caller is GoTrue, not a user; the signature IS the auth.
//    11th --no-verify-jwt fn - add to the S194 audit list.)
// Hook URL to register: https://axfejhudchdejoiwaetq.supabase.co/functions/v1/auth-send-sms
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:standardwebhooks@1.0.0";

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";

function digits10(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

function hookError(message: string, http_code = 500, status = 200) {
  // GoTrue reads the error envelope from the body; the surfaced message is what
  // the user sees in the sign-in UI, so keep it short and non-revealing.
  return new Response(JSON.stringify({ error: { http_code, message } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return hookError("POST only", 405, 405);

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!hookSecret) return hookError("SEND_SMS_HOOK_SECRET is not set", 503, 503);

  // Gate 1: Standard Webhooks signature over the RAW body.
  const rawBody = await req.text();
  let payload: any;
  try {
    const wh = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));
    payload = wh.verify(rawBody, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    });
  } catch (e) {
    console.warn("auth-send-sms: signature verification failed:", String(e));
    return hookError("Unauthorized", 401, 401);
  }

  const phone = String(payload?.user?.phone ?? "").trim();
  const otp = String(payload?.sms?.otp ?? "").trim();
  if (!phone || !otp) return hookError("Missing phone or otp in hook payload", 400);

  // Gate 2: active staff phone only.
  const key = digits10(phone);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: staff, error: staffErr } = await supabase
    .from("staff").select("id, name, phone_number").eq("active", true).not("phone_number", "is", null);
  if (staffErr) return hookError("staff lookup failed", 500);
  const match = (staff || []).find((s) => digits10(s.phone_number) === key);
  if (!match) {
    console.warn(`auth-send-sms: refused non-staff phone ***${key.slice(-4)}`);
    return hookError("This phone number is not registered for PRVS staff sign-in.", 403);
  }

  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) return hookError("TEXTLY_API_TOKEN is not set", 503);
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();

  const message = `PRVS Dashboard sign-in code: ${otp}\nExpires in 5 minutes. If you did not request this, ignore it.`;
  let txResp: Response, txText = "";
  try {
    txResp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+1" + key, from: fromE164, message, notify: false }),
    });
    txText = await txResp.text();
  } catch (err) {
    return hookError("Could not reach the SMS provider", 502);
  }
  if (!txResp.ok) {
    console.error(`auth-send-sms: Textly ${txResp.status} for ${match.name}: ${txText.slice(0, 200)}`);
    return hookError("The SMS provider rejected the message", 502);
  }
  console.log(`auth-send-sms: code sent to ${match.name} (***${key.slice(-4)})`);
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
