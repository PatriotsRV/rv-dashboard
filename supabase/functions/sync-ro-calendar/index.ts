import { createClient } from "npm:@supabase/supabase-js@2";

// sync-ro-calendar — SERVER-SIDE Google Calendar sync for an RO's key dates.
// Session 129 (2026-07-01). v1.0  [ER cb7742a8]
//
// Why this exists: the client-side scheduling.js syncKeyDateCalendars only runs
// when the SAVER is signed in with a Google Calendar token (managers on the
// dashboard). The customer check-in kiosk has no Google token at all, so a
// scheduled/drop-off date entered at check-in never reached the team calendar
// (Lynn, ER cb7742a8). This function authenticates to Google server-side with a
// stored OAuth REFRESH TOKEN (no per-user token needed) and becomes the SINGLE
// source of truth for the three RO key-date events (drop-off / promised /
// pickup), replacing the client-side writer so there are no duplicate events.
//
// NOTE: we use a refresh token rather than a service-account key because the org
// policy iam.disableServiceAccountKeyCreation blocks SA key creation. The token
// is minted once (OAuth Playground / consent) by an account that can EDIT the 8
// team calendars, with scope https://www.googleapis.com/auth/calendar and
// access_type=offline. The OAuth app must be "In production" or the refresh
// token expires in 7 days.
//
// Contract:
//   POST { "ro_id": "<repair_orders.id uuid>" }  + header  X-PRVS-Secret
//   -> looks up the RO (service role), resolves each service silo calendar from
//      app_config (same mapping as the app's getCalendarId), and idempotently
//      creates / updates / deletes an all-day event per (dateType x silo) using
//      the repair_orders.cal_event_ids jsonb map. Writes the map back.
//   Returns { ok, created, updated, deleted, skipped, errors }.
//
// Secrets required (Supabase -> Edge Functions -> Secrets):
//   PRVS_FUNCTION_SECRET   (already set — the shared X-PRVS-Secret value)
//   GCAL_CLIENT_ID         (OAuth client id)
//   GCAL_CLIENT_SECRET     (OAuth client secret)
//   GCAL_REFRESH_TOKEN     (offline refresh token for a calendar-editing account)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Idempotency: cal_event_ids = { dropoff:{svc:eventId}, promised:{...}, pickup:{...} }.
// PATCH if we already have an id, POST to create, DELETE when a date is cleared
// or its service drops off the RO. A stored id that 404s is recreated.

const FALLBACK_CALENDAR_IDS: Record<string, string> = {
  "Roof": "c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com",
  "Solar": "c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com",
  "Vroom": "c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com",
  "Repairs": "c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com",
  "TrueTopper": "c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com",
  "Paint and Body": "c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com",
  "Detailing": "c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com",
  "Chassis": "c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com",
};

// Mirror the app's getCalendarId() key normalization EXACTLY (index.html).
function configKeyFor(serviceType: string): string {
  return "calendar_id_" + serviceType.toLowerCase().replace(/ /g, "_").replace(/&/g, "").replace(/__/g, "_");
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = origin === "https://patriotsrv.github.io" ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prvs-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Mint a short-lived Google access token from the stored OAuth refresh token.
async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("GCAL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GCAL_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN not configured");
  }
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Google token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

function addDaysISO(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function calFetch(token: string, calId: string, path: string, method: string, body?: unknown) {
  return await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // ── Secret gate ────────────────────────────────────────────────────────────
  const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-prvs-secret") || "";
    if (provided !== expectedSecret) {
      return json({ error: "Unauthorized — missing or invalid X-PRVS-Secret header" }, 401);
    }
  }

  try {
    const { ro_id } = await req.json();
    if (!ro_id) return json({ error: "Missing ro_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load the RO.
    const { data: ro, error: roErr } = await supabase
      .from("repair_orders")
      .select("id, ro_id, customer_name, rv, phone, repair_type, planned_dropoff_date, promised_date, pickup_date, cal_event_ids")
      .eq("id", ro_id)
      .maybeSingle();
    if (roErr) return json({ error: `RO lookup failed: ${roErr.message}` }, 500);
    if (!ro) return json({ error: "RO not found" }, 404);

    // Build the calendar-id resolver from app_config (fallback to hardcoded).
    const { data: cfgRows } = await supabase.from("app_config").select("key, value");
    const cfg: Record<string, string> = {};
    for (const r of cfgRows || []) cfg[r.key] = r.value;
    const getCalendarId = (svc: string): string | null =>
      cfg[configKeyFor(svc)] || FALLBACK_CALENDAR_IDS[svc] || null;

    const roServices = String(ro.repair_type || "")
      .split(",").map((s) => s.trim()).filter((s) => s && getCalendarId(s));

    const token = await getGoogleAccessToken();

    const ids = (ro.cal_event_ids && typeof ro.cal_event_ids === "object")
      ? JSON.parse(JSON.stringify(ro.cal_event_ids)) : {};

    const customerName = ro.customer_name || "Customer";
    const rv = ro.rv || "RV";
    const phone = ro.phone || "";
    const roCode = ro.ro_id || "";

    const dateDefs = [
      { type: "dropoff", label: "Drop-Off", colorId: "2", date: (ro.planned_dropoff_date || "").slice(0, 10) },
      { type: "promised", label: "Promised", colorId: "5", date: (ro.promised_date || "").slice(0, 10) },
      { type: "pickup", label: "Pickup", colorId: "10", date: (ro.pickup_date || "").slice(0, 10) },
    ];

    let created = 0, updated = 0, deleted = 0, skipped = 0;
    const errors: string[] = [];
    let changed = false;

    for (const def of dateDefs) {
      ids[def.type] = ids[def.type] || {};
      const perSvc: Record<string, string> = ids[def.type];

      // Delete events for services no longer on the RO, or when the date was cleared.
      for (const svc of Object.keys(perSvc)) {
        if (!def.date || !roServices.includes(svc)) {
          const calId = getCalendarId(svc);
          if (calId && perSvc[svc]) {
            try {
              await calFetch(token, calId, `/${encodeURIComponent(perSvc[svc])}`, "DELETE");
              deleted++;
            } catch (e) { errors.push(`delete ${def.type}/${svc}: ${e}`); }
          }
          delete perSvc[svc];
          changed = true;
        }
      }

      if (!def.date) continue;

      const endDate = addDaysISO(def.date, 1); // all-day end is exclusive
      const summary = `[${def.label}] ${customerName} — ${rv}`;
      const description = [
        `Customer: ${customerName}`,
        `RV: ${rv}`,
        phone ? `Phone: ${phone}` : "",
        `${def.label} date: ${def.date}`,
        roCode ? `RO ID: ${roCode}` : "",
      ].filter(Boolean).join("\n");

      for (const svc of roServices) {
        const calId = getCalendarId(svc);
        if (!calId) { skipped++; continue; }
        const evt = { summary, description, start: { date: def.date }, end: { date: endDate }, colorId: def.colorId };
        const existing = perSvc[svc];
        try {
          let resp = existing
            ? await calFetch(token, calId, `/${encodeURIComponent(existing)}`, "PATCH", evt)
            : await calFetch(token, calId, "", "POST", evt);
          // Stored event vanished (deleted in Calendar) — recreate.
          if (existing && resp.status === 404) {
            resp = await calFetch(token, calId, "", "POST", evt);
          }
          if (resp.ok) {
            const data = await resp.json();
            if (data.id && data.id !== existing) { perSvc[svc] = data.id; changed = true; }
            if (existing) updated++; else created++;
          } else {
            errors.push(`${def.type}/${svc}: ${resp.status} ${await resp.text()}`);
          }
        } catch (e) { errors.push(`${def.type}/${svc}: ${e}`); }
      }
    }

    if (changed) {
      const { error: upErr } = await supabase
        .from("repair_orders")
        .update({ cal_event_ids: ids })
        .eq("id", ro.id);
      if (upErr) errors.push(`cal_event_ids writeback: ${upErr.message}`);
    }

    return json({ ok: errors.length === 0, ro_id: ro.ro_id, created, updated, deleted, skipped, errors, cal_event_ids: ids });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
