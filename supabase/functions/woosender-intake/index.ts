import { createClient } from "npm:@supabase/supabase-js@2";

// woosender-intake — inbound webhook for WooSender Won-stage leads.
// Session 123 (2026-06-24). v1.1 — CAPTURE + EXTRACT.
//
// WooSender -> Zapier -> POST here. Validates a shared secret, logs the full
// raw payload to public.woosender_leads, ALSO extracts the reliable core fields
// (name / phone / email / rv / service / woosender id) into typed columns for
// the review queue, and returns 200. No RO creation yet — that's the review
// page (phase 2B), where a person promotes a queued lead into a real RO.
//
// The JSON envelope is identical across WooSender pipelines; lean forms just
// send empty strings, so every extracted field treats "" as null.
//
// Idempotency: if an un-reviewed ('new') lead with the same WooSender contact
// id is already queued, we UPDATE it in place instead of inserting a duplicate
// (a contact can re-fire on the Won stage).
//
// Auth: Zapier sends a custom header `x-prvs-webhook-secret` whose value must
// match the WOOSENDER_WEBHOOK_SECRET edge-fn secret. Deploy with
// `--no-verify-jwt` so the external caller needs no Supabase login.
//
// Writes use the service-role key (bypasses RLS).

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Trim a value; return null for missing / empty-string (the lean-form case).
function clean(v: unknown): string | null {
  const s = (v == null ? "" : String(v)).trim();
  return s === "" ? null : s;
}

// Pull the reliable core fields out of the raw WooSender payload.
function extract(payload: any) {
  const p = payload && typeof payload === "object" ? payload : {};
  const opp = p.opportunity && typeof p.opportunity === "object" ? p.opportunity : {};

  const fullName =
    clean(p.fullName) ||
    [clean(p.firstName), clean(p.lastName)].filter(Boolean).join(" ") ||
    null;

  const rvInfo =
    [clean(p.yearMakeType), clean(p.length)].filter(Boolean).join(", ") || null;

  // Prefer the explicit service-needs field; fall back to the pipeline name
  // (always present, identifies the service: roof / RV solar / etc.).
  const service = clean(p.clientServiceNeeds) || clean(opp.pipeline);

  // contactGuid is the stable per-lead key (present even on lean forms);
  // contactId is the human-readable fallback.
  const woosenderId = clean(p.contactGuid) || clean(p.contactId);

  return {
    lead_name: fullName,
    lead_phone: clean(p.phoneNumber),
    lead_email: clean(p.email),
    rv_info: rvInfo,
    service_request: service,
    woosender_id: woosenderId,
  };
}

Deno.serve(async (req: Request) => {
  // CORS preflight (harmless; Zapier is server-to-server and won't send it).
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-prvs-webhook-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedSecret = Deno.env.get("WOOSENDER_WEBHOOK_SECRET") || "";

    // ── Shared-secret gate ────────────────────────────────────────────────
    const provided =
      req.headers.get("x-prvs-webhook-secret") ||
      req.headers.get("X-PRVS-Webhook-Secret") ||
      "";
    const secretValid = !!expectedSecret && provided === expectedSecret;
    if (!secretValid) {
      // Reject unauthenticated callers; do NOT log (avoids spam rows).
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    // ── Parse body (JSON; fall back to raw text / form) ───────────────────
    let payload: unknown;
    const ctype = req.headers.get("content-type") || "";
    const rawText = await req.text();
    if (ctype.includes("application/json")) {
      try {
        payload = JSON.parse(rawText);
      } catch (_) {
        payload = { _unparsed: rawText };
      }
    } else if (ctype.includes("application/x-www-form-urlencoded")) {
      payload = Object.fromEntries(new URLSearchParams(rawText));
    } else {
      // Unknown content-type — try JSON, else keep the raw string.
      try {
        payload = JSON.parse(rawText);
      } catch (_) {
        payload = { _raw: rawText, _content_type: ctype };
      }
    }

    // ── Extract the reliable core fields ──────────────────────────────────
    const fields = extract(payload);

    // ── Log to the review queue ───────────────────────────────────────────
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Idempotency: if this WooSender contact is already queued and not yet
    // reviewed, update that row in place rather than queuing a duplicate.
    if (fields.woosender_id) {
      const { data: existing } = await sb
        .from("woosender_leads")
        .select("id")
        .eq("woosender_id", fields.woosender_id)
        .eq("review_status", "new")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error: updErr } = await sb
          .from("woosender_leads")
          .update({
            raw_payload: payload,
            secret_valid: true,
            received_at: new Date().toISOString(),
            ...fields,
          })
          .eq("id", existing.id);
        if (updErr) {
          console.error("woosender-intake update error:", updErr);
          return json({ ok: false, error: updErr.message }, 500);
        }
        return json({ ok: true, id: existing.id, received: true, deduped: true });
      }
    }

    const { data, error } = await sb
      .from("woosender_leads")
      .insert({
        raw_payload: payload,
        secret_valid: true,
        source: "woosender",
        review_status: "new",
        ...fields,
      })
      .select("id")
      .single();

    if (error) {
      console.error("woosender-intake insert error:", error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true, id: data?.id, received: true });
  } catch (err) {
    console.error("woosender-intake error:", err);
    return json({ ok: false, error: (err as Error)?.message || String(err) }, 500);
  }
});
