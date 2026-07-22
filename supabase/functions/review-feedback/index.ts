// review-feedback — GH#40 landing-page endpoint v1.0 (Session 154)
//
// Public, token-gated endpoint behind review.html (GitHub Pages).
// Deploy with --no-verify-jwt (anonymous customers hit it from the page).
// The uuid token ties every call to exactly one review_requests row —
// no token, no data; nothing here exposes customer PII beyond the
// first name used in the page greeting.
//
// POST { t: "<token>", action: "click", site: "google"|"facebook" }
//   -> stamps clicked_at + review_site (idempotent; first click wins the stamp)
// POST { t: "<token>", action: "feedback", text: "..." }
//   -> inserts review_feedback (private queue) + stamps feedback_at
//      + enqueues a review_feedback_notify scheduled_notifications row
//        to managers+admins (15-min email cron picks it up)
// GET  ?t=<token>
//   -> { ok, first_name } for the greeting (404 on unknown token)
//
// Deploy: supabase functions deploy review-feedback --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

// Same origin allow-list pattern as textly-send (localhost for dev tests).
const ALLOWED_ORIGINS = ["https://patriotsrv.github.io", "http://localhost:8765"];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const findRow = async (token: string) => {
    if (!UUID_RE.test(token)) return null;
    const { data, error } = await supabase
      .from("review_requests")
      .select("id, phone_key, customer_name, clicked_at, feedback_at")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("t") || "";
      const row = await findRow(token);
      if (!row) return json({ error: "Unknown link" }, 404);
      const first = (row.customer_name || "").trim().split(/\s+/)[0] || "";
      return json({ ok: true, first_name: first });
    }

    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const payload = await req.json().catch(() => null);
    if (!payload) return json({ error: "Invalid JSON" }, 400);
    const row = await findRow(String(payload.t || ""));
    if (!row) return json({ error: "Unknown link" }, 404);

    if (payload.action === "click") {
      const site = payload.site === "facebook" ? "facebook" : "google";
      if (!row.clicked_at) {
        const { error } = await supabase.from("review_requests")
          .update({ clicked_at: new Date().toISOString(), review_site: site })
          .eq("id", row.id);
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (payload.action === "feedback") {
      const text = String(payload.text || "").trim().slice(0, 4000);
      if (!text) return json({ error: "Empty feedback" }, 400);
      const { error: fbErr } = await supabase.from("review_feedback").insert({
        review_request_id: row.id,
        phone_key: row.phone_key,
        customer_name: row.customer_name,
        feedback: text,
      });
      if (fbErr) throw fbErr;
      const { error: upErr } = await supabase.from("review_requests")
        .update({ feedback_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw upErr;

      // Manager notify via the existing 15-min email cron.
      // Role values + active filter mirror send-dropoff-report's recipient
      // pattern (lowercase snake_case; there is no 'Admin' staff role —
      // Roland is sr_manager). S154 fix: the first cut used capitalized
      // labels and matched ZERO staff, silently skipping the notify.
      const { data: mgrs, error: mgrErr } = await supabase
        .from("staff").select("email, role, active")
        .in("role", ["manager", "sr_manager", "parts_manager"])
        .not("email", "is", null);
      const recipients = [...new Set((mgrs || [])
        .filter((s) => s.active !== false && s.email).map((s) => s.email))];
      if (!mgrErr && recipients.length) {
        const { error: snErr } = await supabase.from("scheduled_notifications").insert({
          scheduled_at: new Date().toISOString(),
          recipient_emails: recipients,
          subject: `⭐ Private review feedback from ${row.customer_name || "a customer"}`,
          body: `A customer chose "send us direct feedback" instead of a public review.\n\n` +
                `Customer: ${row.customer_name || "(no name)"} (…${row.phone_key.slice(-4)})\n\n` +
                `Feedback:\n${text}\n\n` +
                `Queue: review_feedback (status needs_response).`,
          source: "review_feedback_notify",
          status: "pending",
          created_by_email: "review-feedback@prvs",
        });
        if (snErr) console.error("manager notify enqueue failed:", snErr);
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("review-feedback error:", e);
    return json({ error: "Server error" }, 500);
  }
});
