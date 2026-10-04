// ============================================================
// descope-sms v1.0 (Session 195, 2026-10-04) - SMS gateway for Descope login codes
// ============================================================
// WHY: Cloudflare Access one-time PIN is EMAIL-ONLY. S195 added Descope as a
// generic-OIDC login method on the Access app so staff can sign in at the
// Cloudflare gate with their PHONE + a texted code. Descope's built-in SMS
// sender is capped at 100/month on the free plan, so Descope's "Generic SMS
// Gateway" connector POSTs every login code HERE and we send it over Textly
// from the shop line (+1 940-488-5047) - same transport as textly-send, no
// second SMS vendor.
//
// Descope POSTs (connector docs, "SMS Gateway"):
//   { "recipient": "+1...", "body": "<rendered template incl. code>",
//     "sender": "<configured sender>", "token": "<code only>" }
//
// SECURITY (two gates, both required):
//   1. Authorization: Bearer <DESCOPE_SMS_SECRET> must match the secret set
//      on this project (set by Roland: supabase secrets set DESCOPE_SMS_SECRET=...).
//   2. recipient MUST be the phone_number of an ACTIVE row in public.staff.
//      A leaked secret therefore cannot text customers or random numbers -
//      the worst it can do is send a login-code-shaped text to a staff phone.
//
// Deliberately NOT routed through textly-send: that function runs the
// customer opt-out gate and creates/updates conversations rows (inbox is
// customer-only). Login codes must never appear on the Messages board.
//
// Secrets required: DESCOPE_SMS_SECRET (new), TEXTLY_API_TOKEN,
//   TEXTLY_FROM_E164 (optional), TEXTLY_API_BASE (optional),
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (pre-existing).
// Deploy:  supabase functions deploy descope-sms --no-verify-jwt
//   (--no-verify-jwt because the caller is Descope, not a Supabase user; the
//    Bearer secret above IS the auth. Add to the S194 --no-verify-jwt audit list.)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";

function digits10(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Gate 1: shared secret
  const expected = Deno.env.get("DESCOPE_SMS_SECRET");
  if (!expected) return json({ error: "DESCOPE_SMS_SECRET is not set on this project" }, 503);
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided !== expected) return json({ error: "Unauthorized" }, 401);

  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) return json({ error: "TEXTLY_API_TOKEN is not set" }, 503);
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const recipient = String(p.recipient ?? p.to ?? "").trim();
  const body = String(p.body ?? p.message ?? "").trim();
  if (!recipient || !body) return json({ error: "recipient and body are required" }, 400);

  // Gate 2: recipient must be an active staff phone
  const key = digits10(recipient);
  if (!key) return json({ error: "recipient is not a valid phone number" }, 400);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: staff, error: staffErr } = await supabase
    .from("staff")
    .select("id, name, phone_number")
    .eq("active", true)
    .not("phone_number", "is", null);
  if (staffErr) return json({ error: "staff lookup failed", detail: staffErr.message }, 500);
  const match = (staff || []).find((s) => digits10(s.phone_number) === key);
  if (!match) {
    console.warn(`descope-sms: refused non-staff recipient ***${key.slice(-4)}`);
    return json({ error: "recipient is not an active staff phone" }, 403);
  }

  const to = "+1" + key; // staff.phone_number is stored E.164 US; normalize defensively
  let txResp: Response;
  let txText = "";
  try {
    txResp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: fromE164, message: body, notify: false }),
    });
    txText = await txResp.text();
  } catch (err) {
    return json({ error: "Textly request failed", detail: String(err) }, 502);
  }

  if (!txResp.ok) {
    console.error(`descope-sms: Textly ${txResp.status} for ${match.name}: ${txText.slice(0, 200)}`);
    return json({ error: "Textly rejected the send", status: txResp.status, detail: txText.slice(0, 300) }, 502);
  }
  console.log(`descope-sms: login code sent to ${match.name} (***${key.slice(-4)})`);
  return json({ ok: true, to_last4: key.slice(-4), staff: match.name });
});
