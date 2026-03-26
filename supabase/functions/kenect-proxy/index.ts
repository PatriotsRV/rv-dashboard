/**
 * kenect-proxy — Supabase Edge Function
 * Proxies requests to the Kenect Integrations API.
 *
 * Required Supabase secrets (set once via CLI):
 *   supabase secrets set KENECT_API_KEY=your_key_here
 *
 * Optional secret (can also be passed per-request):
 *   supabase secrets set KENECT_LOCATION_ID=your_location_id
 */

const KENECT_BASE = "https://integrations-api.kenect.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("KENECT_API_KEY");
    const envLocationId = Deno.env.get("KENECT_LOCATION_ID") || "";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "KENECT_API_KEY secret is not set. Run: supabase secrets set KENECT_API_KEY=your_key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, params = {}, payload = {} } = body;

    // Build Kenect request headers
    const kenectHeaders: Record<string, string> = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    let kenectUrl = "";
    let kenectMethod = "GET";
    let kenectBody: string | undefined;

    switch (action) {
      // ── Test credentials ───────────────────────────────────────────────
      case "test_credentials": {
        kenectUrl = `${KENECT_BASE}/api/v1/credentials/me`;
        break;
      }

      // ── Get active locations ───────────────────────────────────────────
      case "get_locations": {
        kenectUrl = `${KENECT_BASE}/api/v1/locations`;
        break;
      }

      // ── Fetch conversation thread by phone number ──────────────────────
      case "get_conversation": {
        const { phoneNumber, locationId } = params;
        if (!phoneNumber) {
          return new Response(
            JSON.stringify({ error: "params.phoneNumber is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const locId = locationId || envLocationId;
        const qs = new URLSearchParams({ phoneNumber });
        if (locId) qs.set("locationId", locId);
        kenectUrl = `${KENECT_BASE}/api/v1/messages/conversations/by-phone-number?${qs}`;
        break;
      }

      // ── Fetch all conversations (paginated) ────────────────────────────
      case "get_conversations": {
        const { locationId, page = 0, size = 25 } = params;
        const locId = locationId || envLocationId;
        const qs = new URLSearchParams({ page: String(page), size: String(size) });
        if (locId) qs.set("locationId", locId);
        kenectUrl = `${KENECT_BASE}/api/v1/messages?${qs}`;
        break;
      }

      // ── Fetch messages by phone number (simpler endpoint) ─────────────
      case "get_messages_by_phone": {
        const { phoneNumber, locationId } = params;
        if (!phoneNumber) {
          return new Response(
            JSON.stringify({ error: "params.phoneNumber is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const locId = locationId || envLocationId;
        const qs = new URLSearchParams({ phoneNumber });
        if (locId) qs.set("locationId", locId);
        kenectUrl = `${KENECT_BASE}/api/v1/messages/by-phone-number?${qs}`;
        break;
      }

      // ── Send a message ─────────────────────────────────────────────────
      case "send_message": {
        const { contactPhone, messageBody, locationId, externalContactId } = payload;
        if (!contactPhone || !messageBody) {
          return new Response(
            JSON.stringify({ error: "payload.contactPhone and payload.messageBody are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const locId = locationId || envLocationId;
        kenectUrl = `${KENECT_BASE}/api/v1/messages`;
        kenectMethod = "POST";
        const msgData: Record<string, string> = {
          contactPhone,
          messageBody,
        };
        if (locId) msgData.partnerLocationId = locId;
        if (externalContactId) msgData.externalContactId = externalContactId;
        kenectBody = JSON.stringify(msgData);
        break;
      }

      // ── Request a review ───────────────────────────────────────────────
      case "send_review_request": {
        const { contactPhone, locationId, name } = payload;
        if (!contactPhone) {
          return new Response(
            JSON.stringify({ error: "payload.contactPhone is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const locId = locationId || envLocationId;
        kenectUrl = `${KENECT_BASE}/api/v1/reviews/review-request`;
        kenectMethod = "POST";
        const reviewData: Record<string, string> = { contactPhone };
        if (locId) reviewData.partnerLocationId = locId;
        if (name) reviewData.name = name;
        kenectBody = JSON.stringify(reviewData);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: "${action}". Valid actions: test_credentials, get_locations, get_conversation, get_conversations, get_messages_by_phone, send_message, send_review_request` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Forward to Kenect
    const kenectResp = await fetch(kenectUrl, {
      method: kenectMethod,
      headers: kenectHeaders,
      body: kenectBody,
    });

    const respText = await kenectResp.text();
    let respData: unknown;
    try {
      respData = JSON.parse(respText);
    } catch {
      respData = { raw: respText };
    }

    return new Response(
      JSON.stringify({ status: kenectResp.status, ok: kenectResp.ok, data: respData }),
      {
        status: kenectResp.ok ? 200 : kenectResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
