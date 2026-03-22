// Supabase Edge Function: roof-lookup
// Proxies RV roof dimension requests to the Anthropic API.
// The ANTHROPIC_API_KEY secret must be set via:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { rvType, make, model, year, detailed } = await req.json()

    if (!make) {
      return new Response(JSON.stringify({ error: 'make is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build prompt — detailed mode for fetchRoofInfo, quick mode for handleLookup
    const prompt = detailed
      ? `Return ONLY valid JSON, no markdown. For a ${rvType} RV: ${year} ${make} ${model}. Estimate roof dimensions and obstacles. Schema: {roofLengthFt:number,roofWidthFt:number,confidence:string,notes:string,obstacles:[{name:string,approxLengthIn:number,approxWidthIn:number}]}`
      : `Return ONLY a JSON object (no markdown) for a ${rvType} ${year} ${make} ${model} with keys: roofLengthFt, roofWidthFt, obstacles (array of {name,approxLengthIn,approxWidthIn}). Use best estimate.`

    const maxTokens = detailed ? 800 : 400

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(JSON.stringify({ error: 'Anthropic API error', details: errText }), {
        status: anthropicRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await anthropicRes.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
