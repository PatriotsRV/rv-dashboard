// GH#20: Slack notifications — routes dashboard events to #parts-alerts, #ro-updates, #warranty-flags
// v1.0: Initial implementation — part received, new RO, status→Ready, urgency→Critical, warranty RO opened
// v1.1: Fix 401 — switch from user JWT validation to anon/service key check

const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const WEBHOOKS: Record<string, string> = {
  'parts-alerts':   Deno.env.get('SLACK_WEBHOOK_PARTS_ALERTS')   || '',
  'ro-updates':     Deno.env.get('SLACK_WEBHOOK_RO_UPDATES')     || '',
  'warranty-flags': Deno.env.get('SLACK_WEBHOOK_WARRANTY_FLAGS') || '',
};

// Event → channel routing
const EVENT_CHANNEL: Record<string, string> = {
  'part_received':      'parts-alerts',
  'part_overdue':       'parts-alerts',
  'part_missing_eta':   'parts-alerts',
  'ro_created':         'ro-updates',
  'ro_ready_pickup':    'ro-updates',
  'ro_urgency_critical':'ro-updates',
  'warranty_ro_opened': 'warranty-flags',
};

// Message builders
function buildMessage(event: string, d: Record<string, string>): string {
  switch (event) {
    case 'part_received':
      return `✅ *Part Arrived:* ${d.partName} for *${d.customerName}* (${d.roId})${d.technicianAssigned ? ` — ${d.technicianAssigned} has been notified` : ''}.`;
    case 'part_overdue':
      return `⚠️ *OVERDUE PART:* ${d.partName} for *${d.customerName}* (${d.roId}). ETA was ${d.eta}. Call the supplier now.`;
    case 'part_missing_eta':
      return `📋 *Missing ETA:* ${d.partName} for *${d.customerName}* (${d.roId}) has no ETA set. Bobby — add it in the dashboard now.`;
    case 'ro_created':
      return `🔧 *New RO:* ${d.customerName} — ${d.rv} (${d.roId}). Tech: ${d.technicianAssigned || 'Unassigned'}. Urgency: ${d.urgency || 'Medium'}.`;
    case 'ro_ready_pickup':
      return `🚗 *Ready for Pickup:* ${d.customerName}'s ${d.rv} (${d.roId}) is ready.${d.parkingSpot ? ` Parking spot: ${d.parkingSpot}.` : ''}`;
    case 'ro_urgency_critical':
      return `🔴 *CRITICAL urgency* set on ${d.roId} — ${d.customerName} (${d.rv}). Tech: ${d.technicianAssigned || 'Unassigned'}.`;
    case 'warranty_ro_opened':
      return `🔄 *WARRANTY RO OPENED:* ${d.customerName} — ${d.rv} (${d.roId}).${d.originalRO ? ` Original RO: ${d.originalRO}.` : ''}${d.warrantyReason ? ` Reason: ${d.warrantyReason}.` : ''} Urgency: *CRITICAL* — customer expects fast turnaround.`;
    default:
      return `Dashboard event: ${event}`;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Accept requests from the dashboard (anon key or service role key)
    const authHeader = req.headers.get('Authorization');
    const origin = req.headers.get('Origin') || '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const token = authHeader?.replace('Bearer ', '') || '';
    const validToken = token === ANON_KEY || token === SERVICE_KEY;
    const validOrigin = origin === ALLOWED_ORIGIN;

    if (!validToken && !validOrigin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { event, ...data } = body;

    if (!event) return new Response(JSON.stringify({ error: 'Missing event' }), { status: 400, headers: corsHeaders });

    const channel = EVENT_CHANNEL[event];
    if (!channel) return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), { status: 400, headers: corsHeaders });

    const webhookUrl = WEBHOOKS[channel];
    if (!webhookUrl) return new Response(JSON.stringify({ error: `No webhook configured for ${channel}` }), { status: 500, headers: corsHeaders });

    const text = buildMessage(event, data);

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      throw new Error(`Slack webhook failed: ${slackRes.status} ${errText}`);
    }

    return new Response(JSON.stringify({ success: true, channel, event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('slack-notify error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
