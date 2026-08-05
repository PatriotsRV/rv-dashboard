// process-review-requests — GH#40 review-request sender v1.1 (Session 169)
//
// Fired by pg_cron every 15 min (invoke_process_review_requests, pg_net,
// no auth header — deploy with --no-verify-jwt, same pattern as
// process-scheduled-notifications). Sends due review_requests rows via the
// textly-send edge fn (context 'review_request'; its STOP gate applies) and
// flips status pending -> sent / skipped / failed.
//
// SMS copy comes from app_config.review_request_text ({name} + {link}
// placeholders); the link is review.html?t=<row token> on GitHub Pages.
//
// v1.1 (Session 169, Kenect-parity per Roland's old-message screenshot):
//   - {name} placeholder — customer_name as stored on the RO (Roland call).
//   - Link is SHORTENED via the S166 short_links machinery (v.html?c=<code>).
//     Self-hosted, NOT TinyURL — carriers spam-flag public shortener domains
//     (S166 gotcha). Full-URL fallback on ANY failure — never blocks the send.
//     Note: rows hold review.html?t=<token> URLs (tokened, customer-facing,
//     same thing the SMS itself carries — not PII).
//   - Logo attached via textly-send media_url (message goes MMS). logo-sms.png
//     600x600 ~116KB, under the ~1MB carrier cap (S158a); ONE media per
//     message per S158a chunking rule — we send exactly one.
//
// Deploy: supabase functions deploy process-review-requests --no-verify-jwt
// Secrets used (all already set): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PRVS_FUNCTION_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const REVIEW_PAGE_BASE = "https://patriotsrv.github.io/rv-dashboard/review.html";
const SHORT_LINK_BASE = "https://patriotsrv.github.io/rv-dashboard/v.html?c=";
const LOGO_URL = "https://patriotsrv.github.io/rv-dashboard/logo-sms.png";
const BATCH_LIMIT = 25; // per 15-min tick; backlog drains across ticks

// Mirrors js/messaging.js _shortenUrl (S166): 6-char code, no 0/O/1/l/i,
// 3 collision retries, full-URL fallback. Service role bypasses RLS.
const SHORT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
// deno-lint-ignore no-explicit-any
async function shortenUrl(supabase: any, url: string): Promise<string> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => SHORT_CODE_ALPHABET[b % SHORT_CODE_ALPHABET.length]).join("");
      const { error } = await supabase.from("short_links")
        .insert({ code, url, created_by: "review-request-automation" });
      if (!error) return SHORT_LINK_BASE + code;
      if (!/duplicate|unique|23505/i.test(error.message || String(error.code || ""))) throw error;
      // collision — regenerate and retry
    }
    throw new Error("3 code collisions");
  } catch (e) {
    console.error("short link failed (sending full URL instead):", e);
    return url;
  }
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Master switch + SMS copy.
  const { data: cfgRows, error: cfgErr } = await supabase
    .from("app_config").select("key, value")
    .in("key", ["review_request_enabled", "review_request_text"]);
  if (cfgErr) return json({ error: "app_config read failed: " + cfgErr.message }, 500);
  const cfg = Object.fromEntries((cfgRows || []).map((r) => [r.key, r.value]));
  if ((cfg.review_request_enabled || "true") !== "true") {
    return json({ ok: true, disabled: true, sent: 0 });
  }
  const template = cfg.review_request_text ||
    "Thanks for choosing Patriots RV Services! We'd love to hear how we did: {link}";

  // Due pending rows.
  const { data: due, error: dueErr } = await supabase
    .from("review_requests")
    .select("id, token, phone, phone_key, customer_name, ro_id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (dueErr) return json({ error: "review_requests read failed: " + dueErr.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, sent: 0 });

  const fnBase = Deno.env.get("SUPABASE_URL")! + "/functions/v1";
  const secret = Deno.env.get("PRVS_FUNCTION_SECRET") || "";
  let sent = 0, skipped = 0, failed = 0;

  for (const row of due) {
    // v1.1: branded short link (full-URL fallback inside shortenUrl).
    const link = await shortenUrl(supabase, `${REVIEW_PAGE_BASE}?t=${row.token}`);
    const body = template
      .replace("{name}", (row.customer_name || "").trim() || "there")
      .replace("{link}", link);
    const to = /^\+/.test(row.phone) ? row.phone : "+1" + row.phone_key;
    try {
      const resp = await fetch(`${fnBase}/textly-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          "X-PRVS-Secret": secret,
        },
        body: JSON.stringify({
          to, body,
          media_url: LOGO_URL, // v1.1: logo MMS (one media per S158a)
          context: "review_request",
          ro_id: row.ro_id || undefined,
          sent_by: "review-request-automation",
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        await supabase.from("review_requests")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", row.id);
        sent++;
      } else if (resp.status === 403 && (data as any)?.opted_out) {
        await supabase.from("review_requests")
          .update({ status: "skipped", error_message: "opted out (STOP)" })
          .eq("id", row.id);
        skipped++;
      } else {
        await supabase.from("review_requests")
          .update({ status: "failed", error_message: `textly-send ${resp.status}: ${JSON.stringify(data).slice(0, 300)}` })
          .eq("id", row.id);
        failed++;
      }
    } catch (e) {
      await supabase.from("review_requests")
        .update({ status: "failed", error_message: String(e).slice(0, 300) })
        .eq("id", row.id);
      failed++;
    }
  }
  console.log(`process-review-requests: sent=${sent} skipped=${skipped} failed=${failed}`);
  return json({ ok: true, sent, skipped, failed });
});
