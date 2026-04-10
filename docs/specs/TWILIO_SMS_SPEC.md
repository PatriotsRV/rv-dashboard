# TWILIO SMS IMPLEMENTATION SPEC
## PRVS Dashboard — Patriots RV Service

**GitHub Issues:** GH#1 (Number Port) · GH#4 (SMS Integration)  
**Prepared for:** Claude Cowork (coding AI)  
**Status:** Ready for execution  
**Last updated:** 2026-04  
**Sources:** [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource) · [Twilio US Porting Guidelines](https://www.twilio.com/en-us/guidelines/us/porting) · [Twilio Webhooks](https://www.twilio.com/docs/messaging/guides/webhook-request) · [Twilio A2P 10DLC](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc) · [Twilio SMS Pricing US](https://www.twilio.com/en-us/sms/pricing/us)

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [GH#1 — Twilio Number Port](#2-gh1--twilio-number-port)
3. [GH#4 — Supabase Schema Changes](#3-gh4--supabase-schema-changes)
4. [GH#4 — Edge Function: `twilio-sms`](#4-gh4--edge-function-twilio-sms)
5. [GH#4 — SMS Notification Templates](#5-gh4--sms-notification-templates)
6. [GH#4 — Dashboard UI Changes](#6-gh4--dashboard-ui-changes)
7. [GH#4 — A2P 10DLC Registration](#7-gh4--a2p-10dlc-registration)
8. [Phase Plan](#8-phase-plan)
9. [Pricing Reference](#9-pricing-reference)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Secrets & Environment Variables](#11-secrets--environment-variables)
12. [Testing Checklist](#12-testing-checklist)

---

## 1. Overview & Architecture

### Current State
- Kenect was planned for SMS but denied direct API access
- A dormant Kenect modal exists in `index.html` — repurpose as the SMS thread view
- No SMS table exists in Supabase yet

### Target Architecture

```
index.html (Vanilla JS)
    │
    │  supabase.functions.invoke('twilio-sms', { body: { action, ... } })
    ▼
Supabase Edge Function: twilio-sms/index.ts  (Deno/TypeScript)
    │
    │  fetch() — HTTP Basic Auth — application/x-www-form-urlencoded
    ▼
Twilio REST API  https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
    │
    │  Twilio → carrier → customer phone
    │
    │  (Phase 3) inbound reply → Twilio webhook → twilio-webhook/index.ts
    ▼
Supabase DB: sms_log table (write log, update status)
```

### Existing Pattern Reference
All Edge Functions in this project follow this pattern (match exactly):
- File: `supabase/functions/{function-name}/index.ts`
- Runtime: Deno/TypeScript via `Deno.serve()`
- Auth: Validate `Authorization: Bearer <supabase_jwt>` header (service role bypass for internal calls)
- CORS: Standard headers on every response including OPTIONS preflight
- Secrets: `Deno.env.get('SECRET_NAME')`
- External HTTP: Native `fetch()` — **do NOT use Twilio Node.js SDK** (incompatible with Deno Edge Runtime)

---

## 2. GH#1 — Twilio Number Port

### 2.1 What Roland Needs to Gather First

Before starting the port request, Roland must collect the following from the current phone carrier:

| Item | Where to Get It | Notes |
|------|----------------|-------|
| **Current carrier name** | Current phone bill or account portal | e.g., "Comcast Business", "AT&T", "Verizon" |
| **Account number** | Current phone bill (top of page) | Not the phone number itself |
| **Account PIN / passcode** | Call carrier or check online portal | Required for mobile numbers; may be required for VoIP/landline too |
| **Authorized name on account** | Exactly as it appears on the bill — character-for-character | Mismatch is the #1 cause of port rejection |
| **Service address** | Exactly as it appears on the bill | Must match CSR (Customer Service Record) |
| **Copy of recent phone bill** | Download PDF from carrier portal | Must be dated within 30 days of submitting port request |
| **Phone number to port** | The actual business number in E.164 format | e.g., `+15551234567` |

> **Important:** Ask the carrier explicitly: "Is a PIN required to port out this number?" Some carriers set a porting PIN that differs from the account PIN.

### 2.2 Twilio Account Setup

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio) and create an account
2. **Upgrade from trial** — trial accounts cannot receive ported numbers or send to unverified numbers. Navigate to: Console → Billing → Upgrade Account
3. Record the following from Console → Account Info:
   - `Account SID` (starts with `AC...`)
   - `Auth Token` (click to reveal)
4. These will become Supabase secrets `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

### 2.3 Port-In Process (Step by Step)

**Step 1: Upload the utility bill document first**

Before submitting the port request, upload the phone bill PDF using Twilio's Documents API (or via Twilio Console). The Console method is simpler:

- Console → Phone Numbers → Port & Host → Port a Number → Upload Supporting Documents
- Upload the recent phone bill PDF
- Record the returned `Document SID` (starts with `RD...`)

**Step 2: Submit Port Request via Twilio Console**

Navigate to: Console → Phone Numbers → Manage → Port & Host → Port a Number

Fill in the form:
- **Phone number(s) to port:** Enter in E.164 format (`+1XXXXXXXXXX`)
- **Current provider account number:** Exact value from bill
- **PIN:** If required by carrier
- **Account name:** Exact name on the bill
- **Service address:** Exact address on the bill
- **Target port date:** Must be at least 7 business days in the future (per [Twilio porting requirements](https://www.twilio.com/docs/phone-numbers/port-in/port-in-request-api))
- Upload the document SID when prompted

> Alternatively, submit via the [Twilio PortIn API](https://www.twilio.com/docs/phone-numbers/port-in/port-in-request-api): `POST https://numbers.twilio.com/v1/Porting/PortIn`

**Step 3: Monitor Status**

Console → Phone Numbers → Port & Host → View Port Requests

Possible statuses:
- `In review` — Twilio validating the submission
- `Waiting for Signature` — LOA needs signature (Twilio will email)
- `In progress` — Accepted, pending carrier transfer
- `Action Required` — Rejection from losing carrier; fix the issue and resubmit
- `Completed` — Number is live on Twilio

**Step 4: After Port Completes**

1. Configure the number in Console → Phone Numbers → Manage → Active Numbers
2. Set **Messaging → A MESSAGE COMES IN** webhook URL to your Supabase Edge Function (Phase 3):
   ```
   https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/twilio-webhook
   ```
   HTTP Method: `POST`
3. Set **Status Callback URL** to same webhook (for delivery receipts)
4. Save `TWILIO_PHONE_NUMBER` (E.164 format, e.g., `+15551234567`) as a Supabase secret

### 2.4 Timeline Expectations

| Scenario | Timeline |
|----------|----------|
| Standard single number port | 5–15 business days |
| Maximum (with rejections and resubmissions) | Up to 4 weeks |
| Number type: Landline | 2–5 business days once accepted |
| Number type: Mobile/VoIP | 1–3 business days once accepted |

> The number continues to work on the old carrier until the port completes. There is no downtime window — the cutover is near-instantaneous at the carrier level.

### 2.5 Common Rejection Reasons & Fixes

| Rejection | Fix |
|-----------|-----|
| "Name does not match CSR" | Get exact name from carrier CSR, not what Roland thinks it is |
| "Account number invalid" | Call carrier to confirm — account number ≠ phone number |
| "Address mismatch" | Pull exact address from carrier portal or bill |
| "PIN required" | Call carrier to get or set a porting PIN |
| "Document missing or expired" | Upload a fresh bill dated within 30 days |

---

## 3. GH#4 — Supabase Schema Changes

### 3.1 `sms_log` Table

```sql
-- Migration: create_sms_log_table
-- File: supabase/migrations/YYYYMMDDHHMMSS_create_sms_log.sql

CREATE TABLE public.sms_log (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  ro_id           TEXT          REFERENCES repair_orders(id) ON DELETE SET NULL,
  phone_to        TEXT          NOT NULL,           -- E.164 format, e.g. +15551234567
  phone_from      TEXT          NOT NULL,           -- E.164 format, Twilio number
  message_body    TEXT          NOT NULL,
  twilio_sid      TEXT,                             -- SM... or MM... SID from Twilio
  status          TEXT          DEFAULT 'queued',   -- queued|sending|sent|delivered|failed|undelivered|received|inbound
  direction       TEXT          DEFAULT 'outbound', -- outbound | inbound
  error_code      INTEGER,                          -- Twilio error code if failed
  error_message   TEXT,                             -- Twilio error message if failed
  sent_by_user_id UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ   DEFAULT now() NOT NULL
);

-- Index for RO-based message history queries
CREATE INDEX idx_sms_log_ro_id      ON public.sms_log (ro_id);
CREATE INDEX idx_sms_log_phone_to   ON public.sms_log (phone_to);
CREATE INDEX idx_sms_log_created_at ON public.sms_log (created_at DESC);
CREATE INDEX idx_sms_log_twilio_sid ON public.sms_log (twilio_sid);

-- Auto-update updated_at
CREATE TRIGGER set_sms_log_updated_at
  BEFORE UPDATE ON public.sms_log
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.sms_log IS 'Audit log of all inbound and outbound SMS messages';
COMMENT ON COLUMN public.sms_log.ro_id IS 'Repair order this SMS is associated with (nullable for staff-to-staff messages)';
COMMENT ON COLUMN public.sms_log.twilio_sid IS 'Twilio Message SID (SM.../MM...). NULL until Twilio confirms send.';
COMMENT ON COLUMN public.sms_log.status IS 'Mirrors Twilio status: queued, sending, sent, delivered, failed, undelivered, received, inbound';
```

### 3.2 `sms_templates` Table

```sql
-- Migration: create_sms_templates_table
-- File: supabase/migrations/YYYYMMDDHHMMSS_create_sms_templates.sql

CREATE TABLE public.sms_templates (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT    NOT NULL UNIQUE,  -- machine key, e.g. 'ro_status_update'
  label        TEXT    NOT NULL,          -- human label for admin UI
  body         TEXT    NOT NULL,          -- template with {{variable}} placeholders
  category     TEXT    NOT NULL,          -- 'customer' | 'tech' | 'manager'
  auto_send    BOOLEAN DEFAULT FALSE,     -- if true, fires automatically on trigger event
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TRIGGER set_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Seed default templates (see Section 5 for full body text)
INSERT INTO public.sms_templates (template_key, label, body, category, auto_send) VALUES
  ('ro_status_update',     'RO Status Update',             'Hi {{customer_name}}, your RV ({{rv_year}} {{rv_make}} {{rv_model}}) at Patriots RV Service is now: {{status}}. Questions? Reply to this message or call us at {{shop_phone}}. Reply STOP to opt out.', 'customer', FALSE),
  ('parts_ordered',        'Parts Ordered Notification',   'Hi {{customer_name}}, we''ve ordered parts for your RV ({{rv_year}} {{rv_make}} {{rv_model}}). We''ll text you when they arrive. Patriots RV Service — {{shop_phone}}. Reply STOP to opt out.', 'customer', FALSE),
  ('parts_received',       'Parts Received / Ready',       'Hi {{customer_name}}, the parts for your RV ({{rv_year}} {{rv_make}} {{rv_model}}) have arrived and work is continuing. Patriots RV Service — {{shop_phone}}. Reply STOP to opt out.', 'customer', FALSE),
  ('rv_ready_for_delivery','RV Ready for Delivery',        'Hi {{customer_name}}, great news — your RV ({{rv_year}} {{rv_make}} {{rv_model}}) is ready! Please call us at {{shop_phone}} to schedule pickup. Patriots RV Service. Reply STOP to opt out.', 'customer', FALSE),
  ('tech_task_assigned',   'Tech: New Task Assigned',      'Hi {{tech_name}}, you''ve been assigned a new task on RO #{{ro_number}}: {{task_description}}. RV: {{rv_year}} {{rv_make}} {{rv_model}}. Log in to the dashboard for details.', 'tech', FALSE),
  ('manager_parts_request','Manager: Parts Request',       'Parts request submitted on RO #{{ro_number}} ({{rv_year}} {{rv_make}} {{rv_model}}) by {{submitted_by}}. Part: {{part_name}} x{{quantity}}. Review in dashboard.', 'manager', FALSE);

COMMENT ON TABLE public.sms_templates IS 'Editable SMS message templates with variable placeholders in {{variable}} format';
COMMENT ON COLUMN public.sms_templates.template_key IS 'Stable machine-readable key used in Edge Function logic';
COMMENT ON COLUMN public.sms_templates.auto_send IS 'If true, this template fires automatically when its trigger event occurs (requires Phase 2)';
```

### 3.3 RLS Policies

```sql
-- sms_log RLS
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all SMS logs (staff visibility)
CREATE POLICY "sms_log_read_authenticated"
  ON public.sms_log FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role (Edge Functions) can insert/update sms_log
-- Frontend never writes directly to sms_log
CREATE POLICY "sms_log_insert_service_role"
  ON public.sms_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "sms_log_update_service_role"
  ON public.sms_log FOR UPDATE
  TO service_role
  USING (true);

-- sms_templates RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read templates
CREATE POLICY "sms_templates_read_authenticated"
  ON public.sms_templates FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can modify templates (admin writes go through Edge Function)
CREATE POLICY "sms_templates_write_service_role"
  ON public.sms_templates FOR ALL
  TO service_role
  USING (true);
```

### 3.4 `repair_orders` Table — Add Customer Phone Column

Check if `customer_phone` already exists. If not:

```sql
-- Only run if customer_phone does not exist on repair_orders
ALTER TABLE public.repair_orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

COMMENT ON COLUMN public.repair_orders.customer_phone IS 'Customer mobile number in E.164 format for SMS notifications';
```

---

## 4. GH#4 — Edge Function: `twilio-sms`

### 4.1 File Location

```
supabase/functions/twilio-sms/index.ts
```

### 4.2 Required Supabase Secrets

Set via `supabase secrets set` or Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### 4.3 Complete Edge Function Code

```typescript
// supabase/functions/twilio-sms/index.ts
// Twilio SMS dispatcher — send_sms | send_bulk_sms | get_message_status
// Uses native fetch() with HTTP Basic Auth — NO Twilio Node SDK (incompatible with Deno)

import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CORS headers (match pattern used by send-quote-email and send-parts-report) ───
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Twilio credentials from environment ───────────────────────────────────────
const TWILIO_ACCOUNT_SID  = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN   = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER")!;

// Twilio REST API base URL
const TWILIO_API_BASE = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`;

// ─── HTTP Basic Auth header for Twilio ─────────────────────────────────────────
function twilioAuthHeader(): string {
  return "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
}

// ─── Type definitions ──────────────────────────────────────────────────────────
interface SendSmsPayload {
  action: "send_sms";
  to: string;             // E.164 format, e.g. "+15551234567"
  body: string;           // message text, max 1600 chars
  ro_id?: string;         // repair order UUID (optional, for logging)
  sent_by_user_id?: string;
}

interface SendBulkSmsPayload {
  action: "send_bulk_sms";
  recipients: Array<{
    to: string;           // E.164 format
    body: string;         // individual message body (already rendered from template)
    ro_id?: string;
  }>;
  sent_by_user_id?: string;
}

interface GetMessageStatusPayload {
  action: "get_message_status";
  twilio_sid: string;     // SM... or MM... SID
}

type RequestPayload = SendSmsPayload | SendBulkSmsPayload | GetMessageStatusPayload;

// ─── Send a single SMS via Twilio REST API ─────────────────────────────────────
async function sendSingleSms(
  to: string,
  body: string
): Promise<{ sid: string; status: string; error_code?: number; error_message?: string }> {
  const params = new URLSearchParams({
    To:   to,
    From: TWILIO_PHONE_NUMBER,
    Body: body,
  });

  const response = await fetch(`${TWILIO_API_BASE}/Messages.json`, {
    method:  "POST",
    headers: {
      Authorization:  twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    // Twilio returns { code, message, more_info, status } on error
    throw new Error(
      `Twilio API error ${response.status}: [${data.code}] ${data.message}`
    );
  }

  return {
    sid:           data.sid,
    status:        data.status,
    error_code:    data.error_code ?? undefined,
    error_message: data.error_message ?? undefined,
  };
}

// ─── Fetch status of an existing message from Twilio ──────────────────────────
async function getMessageStatus(twilioSid: string): Promise<object> {
  const response = await fetch(
    `${TWILIO_API_BASE}/Messages/${twilioSid}.json`,
    {
      method:  "GET",
      headers: { Authorization: twilioAuthHeader() },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Twilio API error ${response.status}: [${data.code}] ${data.message}`
    );
  }

  return {
    sid:           data.sid,
    status:        data.status,
    date_sent:     data.date_sent,
    date_updated:  data.date_updated,
    error_code:    data.error_code,
    error_message: data.error_message,
    price:         data.price,
    price_unit:    data.price_unit,
  };
}

// ─── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─── Validate secrets are present ─────────────────────────────────────────
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error("Missing Twilio secrets");
    return new Response(
      JSON.stringify({ error: "Twilio configuration missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─── Initialize Supabase service-role client for DB writes ────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── ACTION: send_sms ────────────────────────────────────────────────────
    if (payload.action === "send_sms") {
      const { to, body, ro_id, sent_by_user_id } = payload as SendSmsPayload;

      if (!to || !body) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: to, body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate E.164 format
      if (!/^\+1\d{10}$/.test(to)) {
        return new Response(
          JSON.stringify({ error: "Phone number must be E.164 format: +1XXXXXXXXXX" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Write pending log entry first (optimistic insert)
      const { data: logRow, error: logError } = await supabase
        .from("sms_log")
        .insert({
          ro_id:           ro_id ?? null,
          phone_to:        to,
          phone_from:      TWILIO_PHONE_NUMBER,
          message_body:    body,
          status:          "queued",
          direction:       "outbound",
          sent_by_user_id: sent_by_user_id ?? null,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("sms_log insert error:", logError);
        // Non-fatal — continue sending
      }

      // Call Twilio
      const result = await sendSingleSms(to, body);

      // Update log with Twilio SID and status
      if (logRow?.id) {
        await supabase
          .from("sms_log")
          .update({
            twilio_sid:    result.sid,
            status:        result.status,
            error_code:    result.error_code ?? null,
            error_message: result.error_message ?? null,
          })
          .eq("id", logRow.id);
      }

      return new Response(
        JSON.stringify({ success: true, twilio_sid: result.sid, status: result.status, log_id: logRow?.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: send_bulk_sms ───────────────────────────────────────────────
    if (payload.action === "send_bulk_sms") {
      const { recipients, sent_by_user_id } = payload as SendBulkSmsPayload;

      if (!recipients || recipients.length === 0) {
        return new Response(
          JSON.stringify({ error: "No recipients provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = [];
      for (const recipient of recipients) {
        try {
          // Insert pending log row
          const { data: logRow } = await supabase
            .from("sms_log")
            .insert({
              ro_id:           recipient.ro_id ?? null,
              phone_to:        recipient.to,
              phone_from:      TWILIO_PHONE_NUMBER,
              message_body:    recipient.body,
              status:          "queued",
              direction:       "outbound",
              sent_by_user_id: sent_by_user_id ?? null,
            })
            .select("id")
            .single();

          const result = await sendSingleSms(recipient.to, recipient.body);

          if (logRow?.id) {
            await supabase
              .from("sms_log")
              .update({ twilio_sid: result.sid, status: result.status })
              .eq("id", logRow.id);
          }

          results.push({ to: recipient.to, success: true, twilio_sid: result.sid });
        } catch (err) {
          console.error(`Failed to send to ${recipient.to}:`, err);
          results.push({ to: recipient.to, success: false, error: (err as Error).message });
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: get_message_status ──────────────────────────────────────────
    if (payload.action === "get_message_status") {
      const { twilio_sid } = payload as GetMessageStatusPayload;

      if (!twilio_sid) {
        return new Response(
          JSON.stringify({ error: "Missing required field: twilio_sid" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await getMessageStatus(twilio_sid);

      // Update sms_log status if we have a matching record
      await supabase
        .from("sms_log")
        .update({ status: (result as { status: string }).status })
        .eq("twilio_sid", twilio_sid);

      return new Response(
        JSON.stringify({ success: true, message: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Unknown action ──────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: `Unknown action: ${(payload as { action: string }).action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("twilio-sms function error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 4.4 Edge Function for Inbound Webhook (Phase 3)

```
supabase/functions/twilio-webhook/index.ts
```

This function receives Twilio's inbound SMS POST and writes it to `sms_log`. It does NOT require the `Authorization` header from Supabase because Twilio calls it directly.

```typescript
// supabase/functions/twilio-webhook/index.ts
// Receives inbound SMS from Twilio and writes to sms_log
// Called by Twilio directly — no Supabase JWT validation
// Deploy with: supabase functions deploy twilio-webhook --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER")!;

Deno.serve(async (req: Request) => {
  // Twilio sends inbound SMS as application/x-www-form-urlencoded POST
  if (req.method !== "POST") {
    return new Response("<Response></Response>", {
      status: 405,
      headers: { "Content-Type": "application/xml" },
    });
  }

  const formData = await req.formData();

  // Core inbound SMS parameters from Twilio
  // See: https://www.twilio.com/docs/messaging/guides/webhook-request
  const messageSid  = formData.get("MessageSid")  as string;
  const from        = formData.get("From")         as string;  // customer's number
  const to          = formData.get("To")           as string;  // our Twilio number
  const body        = formData.get("Body")         as string;  // message text
  const numSegments = formData.get("NumSegments")  as string;

  console.log(`Inbound SMS: From=${from} Body="${body}" SID=${messageSid}`);

  // Handle OPT-OUT keywords — carriers require honoring STOP
  const upperBody = body.trim().toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upperBody)) {
    // Twilio handles opt-out automatically; we just log it
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("sms_log").insert({
      phone_to:     to,
      phone_from:   from,
      message_body: body,
      twilio_sid:   messageSid,
      status:       "received",
      direction:    "inbound",
    });
    // Return empty TwiML — do not send auto-reply to STOP
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "application/xml" },
    });
  }

  // Log inbound message
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabase.from("sms_log").insert({
    phone_to:     to,
    phone_from:   from,
    message_body: body,
    twilio_sid:   messageSid,
    status:       "received",
    direction:    "inbound",
  });

  if (error) {
    console.error("Failed to log inbound SMS:", error);
  }

  // Return empty TwiML — no auto-reply for now
  // To send an auto-reply, add <Message>...</Message> inside <Response>
  return new Response("<Response></Response>", {
    headers: { "Content-Type": "application/xml" },
  });
});
```

**Deploy command for webhook function (bypasses JWT check since Twilio calls it):**
```bash
supabase functions deploy twilio-webhook --no-verify-jwt
```

### 4.5 Twilio REST API Reference Summary

| Operation | Method | URL |
|-----------|--------|-----|
| Send SMS | `POST` | `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` |
| Get message status | `GET` | `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages/{MessageSid}.json` |
| List messages | `GET` | `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` |
| Port-in request | `POST` | `https://numbers.twilio.com/v1/Porting/PortIn` |
| Get port status | `GET` | `https://numbers.twilio.com/v1/Porting/PortIn/{PortInRequestSid}` |

**Authentication:** All requests use HTTP Basic Auth with `AccountSid` as username and `Auth Token` as password.

**Send SMS request body** (`application/x-www-form-urlencoded`):
```
To=+15558675310&From=+15557122661&Body=Your+RV+is+ready
```

**Send SMS response** (status 201):
```json
{
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "account_sid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "to": "+15558675310",
  "from": "+15557122661",
  "body": "Your RV is ready",
  "status": "queued",
  "direction": "outbound-api",
  "date_created": "Thu, 24 Aug 2023 05:01:45 +0000",
  "date_sent": null,
  "date_updated": "Thu, 24 Aug 2023 05:01:45 +0000",
  "num_segments": "1",
  "num_media": "0",
  "price": null,
  "price_unit": "USD",
  "error_code": null,
  "error_message": null,
  "uri": "/2010-04-01/Accounts/ACxxx/Messages/SMxxx.json"
}
```

**Error response** (e.g., 400):
```json
{
  "code": 21211,
  "message": "The 'To' number is not a valid phone number.",
  "more_info": "https://www.twilio.com/docs/errors/21211",
  "status": 400
}
```

---

## 5. GH#4 — SMS Notification Templates

### 5.1 Template Variable Convention

All templates use `{{variable_name}}` double-curly-brace syntax. The frontend is responsible for resolving these before calling the Edge Function. No server-side template rendering occurs in the Edge Function itself — the `body` passed in `send_sms` must already be the final rendered string.

### 5.2 Frontend Template Renderer Function

Add this utility function near the top of `index.html`'s script section (alongside existing utility functions):

```javascript
/**
 * Renders an SMS template by substituting {{variables}} with values.
 * @param {string} templateBody - Raw template body from sms_templates table
 * @param {Object} vars - Key-value map of variable substitutions
 * @returns {string} Rendered message body
 */
function renderSmsTemplate(templateBody, vars) {
  return templateBody.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}
```

### 5.3 Template Definitions and Contexts

#### Template 1: `ro_status_update` — Customer: RO Status Update

**Trigger:** Manual button click on RO card, or (Phase 2) automatic on RO status change  
**Template body:**
```
Hi {{customer_name}}, your RV ({{rv_year}} {{rv_make}} {{rv_model}}) at Patriots RV Service is now: {{status}}. Questions? Reply to this message or call us at {{shop_phone}}. Reply STOP to opt out.
```
**Variables:** `customer_name`, `rv_year`, `rv_make`, `rv_model`, `status`, `shop_phone`  
**Example rendered:**
```
Hi John, your RV (2019 Jayco Eagle) at Patriots RV Service is now: In Progress. Questions? Reply to this message or call us at (555) 123-4567. Reply STOP to opt out.
```

#### Template 2: `parts_ordered` — Customer: Parts Ordered

**Trigger:** Manual or (Phase 2) auto when parts request moves to "ordered" status  
**Template body:**
```
Hi {{customer_name}}, we've ordered the parts needed for your RV ({{rv_year}} {{rv_make}} {{rv_model}}). We'll text you when they arrive. Patriots RV Service — {{shop_phone}}. Reply STOP to opt out.
```
**Variables:** `customer_name`, `rv_year`, `rv_make`, `rv_model`, `shop_phone`

#### Template 3: `parts_received` — Customer: Parts Received

**Trigger:** Manual or (Phase 2) auto when parts are marked received  
**Template body:**
```
Hi {{customer_name}}, the parts for your RV ({{rv_year}} {{rv_make}} {{rv_model}}) have arrived and work is resuming. We'll be in touch soon. Patriots RV Service — {{shop_phone}}. Reply STOP to opt out.
```
**Variables:** `customer_name`, `rv_year`, `rv_make`, `rv_model`, `shop_phone`

#### Template 4: `rv_ready_for_delivery` — Customer: RV Ready

**Trigger:** Manual or (Phase 2) auto when RO status changes to "Ready" / "Complete"  
**Template body:**
```
Hi {{customer_name}}, great news — your RV ({{rv_year}} {{rv_make}} {{rv_model}}) is complete and ready for pickup! Please call us at {{shop_phone}} to schedule your appointment. Patriots RV Service. Reply STOP to opt out.
```
**Variables:** `customer_name`, `rv_year`, `rv_make`, `rv_model`, `shop_phone`

#### Template 5: `tech_task_assigned` — Tech: Task Assigned

**Trigger:** Manual from manager when assigning a task to a tech  
**Template body:**
```
Hi {{tech_name}}, you have a new task on RO #{{ro_number}}: {{task_description}}. RV: {{rv_year}} {{rv_make}} {{rv_model}}. Open the dashboard for full details.
```
**Variables:** `tech_name`, `ro_number`, `task_description`, `rv_year`, `rv_make`, `rv_model`

#### Template 6: `manager_parts_request` — Manager: Parts Request

**Trigger:** Manual or (Phase 2) auto when tech submits a parts request  
**Template body:**
```
Parts request on RO #{{ro_number}} ({{rv_year}} {{rv_make}} {{rv_model}}) by {{submitted_by}}: {{part_name}} x{{quantity}}. Review in the dashboard.
```
**Variables:** `ro_number`, `rv_year`, `rv_make`, `rv_model`, `submitted_by`, `part_name`, `quantity`

### 5.4 Character Count Notes

SMS segments are 160 characters (GSM-7 encoding). Messages longer than 160 characters are split and billed per segment. All templates above render under 320 characters with typical data. Each additional segment costs the same as one full message (~$0.0083 outbound US). Keep message bodies under 160 chars where possible.

---

## 6. GH#4 — Dashboard UI Changes (`index.html`)

### 6.1 SMS Button on RO Cards

**Location:** Near existing email/notification buttons on each RO card  
**Search for:** The existing email button HTML on RO cards (search for `send-quote-email` or `emailBtn` in `index.html`)  
**Add adjacent to it:**

```html
<!-- SMS Send Button — add next to existing email button on RO card -->
<button
  class="btn btn-sm btn-outline-success sms-btn"
  data-ro-id="{{ ro.id }}"
  data-customer-name="{{ ro.customer_name }}"
  data-customer-phone="{{ ro.customer_phone }}"
  data-rv-year="{{ ro.rv_year }}"
  data-rv-make="{{ ro.rv_make }}"
  data-rv-model="{{ ro.rv_model }}"
  data-ro-number="{{ ro.ro_number }}"
  onclick="openSmsModal(this)"
  title="Send SMS to customer"
>
  <i class="bi bi-chat-dots"></i> SMS
</button>
```

### 6.2 SMS Compose Modal

**Repurpose the dormant Kenect modal.** Search for `kenect` (case-insensitive) in `index.html` to find the existing modal. Replace its contents entirely with:

```html
<!-- SMS Modal — replaces dormant Kenect modal -->
<div class="modal fade" id="smsModal" tabindex="-1" aria-labelledby="smsModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">

      <div class="modal-header bg-success text-white">
        <h5 class="modal-title" id="smsModalLabel">
          <i class="bi bi-chat-dots-fill me-2"></i>Send SMS
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <!-- RO context display -->
        <div class="mb-3 p-2 bg-light rounded">
          <small class="text-muted">RO:</small>
          <strong id="smsModalRoNumber"></strong>
          <span class="mx-2">|</span>
          <small class="text-muted">Customer:</small>
          <strong id="smsModalCustomerName"></strong>
          <span class="mx-2">|</span>
          <small class="text-muted">To:</small>
          <strong id="smsModalPhoneDisplay"></strong>
        </div>

        <!-- Quick template picker -->
        <div class="mb-3">
          <label for="smsTemplateSelect" class="form-label">Quick Template</label>
          <select id="smsTemplateSelect" class="form-select" onchange="applySmsTemplate()">
            <option value="">— Select a template —</option>
            <!-- Populated dynamically from sms_templates table -->
          </select>
        </div>

        <!-- Message body -->
        <div class="mb-2">
          <label for="smsMessageBody" class="form-label">Message</label>
          <textarea
            id="smsMessageBody"
            class="form-control"
            rows="4"
            maxlength="1600"
            placeholder="Type your message..."
          ></textarea>
          <div class="d-flex justify-content-between mt-1">
            <small class="text-muted" id="smsCharCount">0 / 160 chars (1 segment)</small>
            <small class="text-muted">Carrier fees apply per segment</small>
          </div>
        </div>

        <!-- SMS History for this RO/phone -->
        <hr>
        <h6 class="text-muted">
          <i class="bi bi-clock-history me-1"></i>Message History
          <span id="smsHistoryRoLabel"></span>
        </h6>
        <div id="smsHistoryList" style="max-height:200px; overflow-y:auto; font-size:0.85rem;">
          <div class="text-center text-muted py-3">
            <div class="spinner-border spinner-border-sm me-2"></div>Loading...
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-success" onclick="sendSmsFromModal()" id="smsSendBtn">
          <i class="bi bi-send-fill me-1"></i>Send SMS
        </button>
      </div>

    </div>
  </div>
</div>
```

### 6.3 JavaScript Functions for SMS Modal

Add these functions to the script section of `index.html`. Place them in a clearly marked SMS section block:

```javascript
// ═══════════════════════════════════════════════════════════════
// SMS SECTION — Twilio SMS integration
// ═══════════════════════════════════════════════════════════════

// Global state for SMS modal
let _smsModalContext = {
  roId:         null,
  roNumber:     null,
  customerName: null,
  customerPhone: null,
  rvYear:       null,
  rvMake:       null,
  rvModel:      null,
};

let _smsTemplates = []; // cached from sms_templates table

/**
 * Opens the SMS modal and populates context from RO card button data attributes.
 */
async function openSmsModal(btn) {
  _smsModalContext = {
    roId:          btn.dataset.roId,
    roNumber:      btn.dataset.roNumber,
    customerName:  btn.dataset.customerName,
    customerPhone: btn.dataset.customerPhone,
    rvYear:        btn.dataset.rvYear,
    rvMake:        btn.dataset.rvMake,
    rvModel:       btn.dataset.rvModel,
  };

  // Validate phone number
  if (!_smsModalContext.customerPhone) {
    showToast('No phone number on file for this customer. Add one in the RO first.', 'warning');
    return;
  }

  // Populate modal header fields
  document.getElementById('smsModalRoNumber').textContent    = '#' + (_smsModalContext.roNumber || '—');
  document.getElementById('smsModalCustomerName').textContent = _smsModalContext.customerName || '—';
  document.getElementById('smsModalPhoneDisplay').textContent = _smsModalContext.customerPhone;
  document.getElementById('smsHistoryRoLabel').textContent   = ` — RO #${_smsModalContext.roNumber || ''}`;

  // Reset message body
  document.getElementById('smsMessageBody').value = '';
  updateSmsCharCount();

  // Load templates (cached after first load)
  await loadSmsTemplates();

  // Load message history for this RO
  await loadSmsHistory(_smsModalContext.roId);

  const modal = new bootstrap.Modal(document.getElementById('smsModal'));
  modal.show();
}

/**
 * Loads sms_templates from Supabase and populates the template select dropdown.
 * Results are cached in _smsTemplates to avoid redundant queries.
 */
async function loadSmsTemplates() {
  if (_smsTemplates.length > 0) {
    populateSmsTemplateDropdown();
    return;
  }
  try {
    const { data, error } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('active', true)
      .order('category')
      .order('label');

    if (error) throw error;
    _smsTemplates = data || [];
    populateSmsTemplateDropdown();
  } catch (err) {
    console.error('Failed to load SMS templates:', err);
  }
}

/**
 * Populates the template dropdown from _smsTemplates cache.
 */
function populateSmsTemplateDropdown() {
  const select = document.getElementById('smsTemplateSelect');
  select.innerHTML = '<option value="">— Select a template —</option>';

  const categories = { customer: [], tech: [], manager: [] };
  _smsTemplates.forEach(t => {
    if (categories[t.category]) categories[t.category].push(t);
  });

  const categoryLabels = { customer: 'Customer', tech: 'Tech/Staff', manager: 'Manager' };
  for (const [cat, templates] of Object.entries(categories)) {
    if (templates.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = categoryLabels[cat] || cat;
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.template_key;
      opt.textContent = t.label;
      opt.dataset.body = t.body;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }
}

/**
 * Applies selected template to the message body textarea,
 * substituting {{variables}} with current RO context.
 */
function applySmsTemplate() {
  const select  = document.getElementById('smsTemplateSelect');
  const optEl   = select.selectedOptions[0];
  if (!optEl || !optEl.dataset.body) return;

  const vars = {
    customer_name: _smsModalContext.customerName  || '',
    rv_year:       _smsModalContext.rvYear         || '',
    rv_make:       _smsModalContext.rvMake         || '',
    rv_model:      _smsModalContext.rvModel        || '',
    ro_number:     _smsModalContext.roNumber       || '',
    shop_phone:    SHOP_PHONE,  // define as const at top of script, e.g. '(555) 123-4567'
    status:        '',   // leave blank — user fills in manually or Phase 2 fills programmatically
    tech_name:     '',
    task_description: '',
    submitted_by:  '',
    part_name:     '',
    quantity:      '',
  };

  const rendered = renderSmsTemplate(optEl.dataset.body, vars);
  document.getElementById('smsMessageBody').value = rendered;
  updateSmsCharCount();
  document.getElementById('smsMessageBody').focus();
}

/**
 * Updates the character / segment counter below the textarea.
 */
function updateSmsCharCount() {
  const body    = document.getElementById('smsMessageBody').value;
  const len     = body.length;
  const segments = len <= 160 ? 1 : Math.ceil(len / 153); // 153 chars per segment for multipart
  const counter  = document.getElementById('smsCharCount');
  counter.textContent = `${len} / 160 chars (${segments} segment${segments > 1 ? 's' : ''})`;
  counter.className = len > 320 ? 'text-warning' : len > 160 ? 'text-muted' : 'text-muted';
}

// Attach char count listener (called once on page load)
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('smsMessageBody');
  if (textarea) textarea.addEventListener('input', updateSmsCharCount);
});

/**
 * Sends the SMS from the modal by calling the twilio-sms Edge Function.
 */
async function sendSmsFromModal() {
  const body  = document.getElementById('smsMessageBody').value.trim();
  const btn   = document.getElementById('smsSendBtn');

  if (!body) {
    showToast('Please enter a message.', 'warning');
    return;
  }
  if (!_smsModalContext.customerPhone) {
    showToast('No customer phone number available.', 'danger');
    return;
  }

  // Normalize phone to E.164 — strip all non-digits then prepend +1
  const digits      = _smsModalContext.customerPhone.replace(/\D/g, '');
  const phoneE164   = digits.length === 11 ? `+${digits}` : `+1${digits}`;

  btn.disabled    = true;
  btn.innerHTML   = '<span class="spinner-border spinner-border-sm me-1"></span>Sending...';

  try {
    const { data, error } = await supabase.functions.invoke('twilio-sms', {
      body: {
        action:          'send_sms',
        to:              phoneE164,
        body:            body,
        ro_id:           _smsModalContext.roId,
        sent_by_user_id: (await supabase.auth.getUser()).data.user?.id,
      },
    });

    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error || 'Unknown error');

    showToast('SMS sent successfully!', 'success');

    // Clear message body and reload history
    document.getElementById('smsMessageBody').value = '';
    document.getElementById('smsTemplateSelect').value = '';
    updateSmsCharCount();
    await loadSmsHistory(_smsModalContext.roId);

  } catch (err) {
    console.error('sendSmsFromModal error:', err);
    showToast(`SMS failed: ${err.message}`, 'danger');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="bi bi-send-fill me-1"></i>Send SMS';
  }
}

/**
 * Loads SMS message history for a given RO and renders it as a conversation thread.
 * @param {string} roId - UUID of the repair order
 */
async function loadSmsHistory(roId) {
  const container = document.getElementById('smsHistoryList');
  if (!roId) {
    container.innerHTML = '<p class="text-muted text-center">No RO associated.</p>';
    return;
  }
  container.innerHTML = '<div class="text-center text-muted py-2"><span class="spinner-border spinner-border-sm"></span></div>';

  try {
    const { data, error } = await supabase
      .from('sms_log')
      .select('*')
      .eq('ro_id', roId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-2">No messages yet.</p>';
      return;
    }

    container.innerHTML = data.map(msg => {
      const isOutbound = msg.direction === 'outbound';
      const time       = new Date(msg.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const statusBadge = msg.status === 'delivered'   ? '<span class="badge bg-success ms-1">delivered</span>'
                        : msg.status === 'sent'        ? '<span class="badge bg-info ms-1">sent</span>'
                        : msg.status === 'failed'      ? '<span class="badge bg-danger ms-1">failed</span>'
                        : msg.status === 'undelivered' ? '<span class="badge bg-warning ms-1">undelivered</span>'
                        : msg.status === 'received'    ? ''
                        : `<span class="badge bg-secondary ms-1">${msg.status}</span>`;
      return `
        <div class="d-flex ${isOutbound ? 'justify-content-end' : 'justify-content-start'} mb-1">
          <div style="max-width:80%;" class="px-2 py-1 rounded ${isOutbound ? 'bg-success text-white' : 'bg-light border'}">
            <div>${escapeHtml(msg.message_body)}</div>
            <div class="d-flex align-items-center ${isOutbound ? 'justify-content-end' : ''}" style="font-size:0.7rem; opacity:0.75;">
              <span>${time}</span>${statusBadge}
            </div>
          </div>
        </div>`;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;

  } catch (err) {
    console.error('loadSmsHistory error:', err);
    container.innerHTML = '<p class="text-danger text-center">Failed to load history.</p>';
  }
}

/**
 * Sends an SMS programmatically (for auto-notifications in Phase 2).
 * @param {string} to - E.164 phone number
 * @param {string} templateKey - key from sms_templates table
 * @param {Object} vars - variable substitutions
 * @param {string|null} roId - repair order UUID
 */
async function sendAutoSms(to, templateKey, vars, roId = null) {
  // Load template if not cached
  if (_smsTemplates.length === 0) await loadSmsTemplates();

  const template = _smsTemplates.find(t => t.template_key === templateKey && t.active);
  if (!template) {
    console.warn(`SMS template '${templateKey}' not found or inactive`);
    return;
  }
  if (!template.auto_send) {
    console.log(`Auto-send disabled for template '${templateKey}'`);
    return;
  }

  const digits    = to.replace(/\D/g, '');
  const phoneE164 = digits.length === 11 ? `+${digits}` : `+1${digits}`;
  const body      = renderSmsTemplate(template.body, vars);

  const { data, error } = await supabase.functions.invoke('twilio-sms', {
    body: {
      action: 'send_sms',
      to:     phoneE164,
      body:   body,
      ro_id:  roId,
      sent_by_user_id: (await supabase.auth.getUser()).data.user?.id,
    },
  });

  if (error) {
    console.error(`Auto-SMS failed for template '${templateKey}':`, error);
  } else {
    console.log(`Auto-SMS sent: ${templateKey} → ${to}`, data);
  }
}
```

### 6.4 Admin Settings Panel — Twilio Config

Add a "Twilio SMS" section to the existing admin/settings panel in `index.html` (search for the existing settings modal or admin section). Add:

```html
<!-- Twilio SMS Settings Card — add inside admin settings panel -->
<div class="card mb-3">
  <div class="card-header bg-success text-white">
    <i class="bi bi-chat-dots-fill me-2"></i>Twilio SMS Settings
  </div>
  <div class="card-body">

    <div class="row g-2 mb-3">
      <div class="col-md-6">
        <label class="form-label">Twilio Phone Number (from)</label>
        <input type="text" class="form-control form-control-sm" id="adminTwilioPhone"
               placeholder="+15551234567" readonly>
        <small class="text-muted">Set via Supabase secrets</small>
      </div>
      <div class="col-md-6">
        <label class="form-label">Shop Phone (in templates)</label>
        <input type="text" class="form-control form-control-sm" id="adminShopPhone"
               placeholder="(555) 123-4567">
        <small class="text-muted">Displayed in customer messages</small>
      </div>
    </div>

    <h6 class="mt-3">Message Templates</h6>
    <div id="smsTemplateAdmin">
      <!-- Dynamically populated: one row per template with editable textarea -->
      <div class="text-muted">Loading templates...</div>
    </div>

    <h6 class="mt-4">Auto-Send Toggles (Phase 2)</h6>
    <p class="text-muted small">
      When enabled, the corresponding SMS fires automatically when the trigger event occurs.
      Requires Phase 2 implementation.
    </p>
    <div id="smsAutoSendToggles">
      <!-- Dynamically populated per template with auto_send toggles -->
    </div>

    <button class="btn btn-success mt-3" onclick="saveSmsTemplates()">
      <i class="bi bi-save me-1"></i>Save Template Changes
    </button>
  </div>
</div>
```

### 6.5 Phase 2 Auto-SMS Trigger Points

When implementing Phase 2, add `sendAutoSms()` calls at these locations in `index.html`:

| Event | Function to Hook | Template Key | Key Variables Needed |
|-------|-----------------|--------------|---------------------|
| RO status changes | `updateRoStatus()` or equivalent | `ro_status_update` | `customer_name`, `rv_*`, `status` |
| Parts request submitted | `submitPartsRequest()` or equivalent | `manager_parts_request` | `ro_number`, `rv_*`, `submitted_by`, `part_name`, `quantity` |
| Parts marked ordered | `updatePartsStatus()` | `parts_ordered` | `customer_name`, `rv_*` |
| Parts marked received | `updatePartsStatus()` | `parts_received` | `customer_name`, `rv_*` |
| RO marked Ready/Complete | `updateRoStatus()` | `rv_ready_for_delivery` | `customer_name`, `rv_*` |
| Task assigned to tech | `assignTask()` or equivalent | `tech_task_assigned` | `tech_name`, `ro_number`, `task_description`, `rv_*` |

---

## 7. GH#4 — A2P 10DLC Registration

**This is required by US carriers before sending business SMS at scale.** Messages from unregistered numbers are blocked by carriers as of September 2023 ([Twilio A2P 10DLC](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)).

### 7.1 What Patriots RV Needs to Complete

**Step 1: Upgrade Twilio Account**
- Console → Billing → Upgrade (trial accounts cannot register)

**Step 2: Brand Registration**
- Console → Messaging → Regulatory Compliance → Trust Products
- Select: **Low-volume Standard** (has EIN, sends < 6,000 segments/day)
- Required: Business EIN, legal business name, address, phone, email, website URL
- Fee: $4 one-time brand registration fee ([Twilio A2P pricing](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc))

**Step 3: Campaign Registration**
- Campaign use case: **Notifications** (service appointment/repair status updates)
- Sample messages (provide 2): Use the `ro_status_update` and `rv_ready_for_delivery` templates from Section 5
- Message flow description: "Customers provide opt-in consent when checking in their RV for service. Staff member confirms customer phone number and verbally explains they'll receive SMS status updates. Customer acknowledges. Reply STOP to opt out at any time."
- Privacy Policy URL: Required as of June 30, 2026 — must be publicly accessible URL ([Twilio changelog](https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-))
- Terms & Conditions URL: Required as of June 30, 2026
- Fee: $15 one-time vetting fee + $1.50–$10/month campaign fee

**Step 4: Associate Phone Number with Campaign**
- After campaign approval, add the ported number to the Campaign's Sender Pool
- Console → Messaging → Services → [Your Campaign] → Sender Pool → Add Number

### 7.2 Opt-In Language for Check-In Form

Add this language anywhere customers provide their phone number (check-in form, RO creation):

> "By providing your mobile number, you consent to receive SMS text messages from Patriots RV Service about the status of your RV service. Message and data rates may apply. Reply STOP to opt out at any time."

---

## 8. Phase Plan

### Phase 1: Number Port + Edge Function + Manual Send

**Deliverables:**
1. Twilio account created and upgraded
2. A2P 10DLC brand registration initiated  
3. Number port request submitted
4. Supabase secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` set
5. Database migrations: `sms_log` and `sms_templates` tables created with RLS
6. `supabase/functions/twilio-sms/index.ts` deployed (`send_sms`, `send_bulk_sms`, `get_message_status` actions)
7. SMS button on RO cards → SMS compose modal (repurposed Kenect modal)
8. Template dropdown populated from `sms_templates` table
9. SMS history thread view per RO

**Definition of done for Phase 1:**
- Staff can open an RO card, click SMS, select a template, edit the message, and send it
- Sent message appears in the thread view with Twilio SID and status
- `sms_log` row is written with all fields populated
- Console test: `supabase functions invoke twilio-sms --body '{"action":"send_sms","to":"+1XXXXXXXXXX","body":"Test"}'` returns `{"success":true}`

### Phase 2: Auto-Notifications on Status Changes

**Deliverables:**
1. Admin settings panel — per-template `auto_send` toggle (saves to `sms_templates.auto_send`)
2. `sendAutoSms()` function wired to status change trigger points (see Section 6.5)
3. Guard: only fires if `auto_send = true` for that template AND customer phone is set
4. Guard: check for customer opt-out (future — track in a separate `sms_optouts` table or check for STOP replies in `sms_log`)

**Definition of done for Phase 2:**
- Changing an RO status to "Ready" automatically fires the `rv_ready_for_delivery` SMS (if toggle is on)
- Auto-sent messages appear in the SMS thread view
- No duplicate sends on page refresh (debounce or one-time flag on RO record)

### Phase 3: Two-Way SMS with Webhook

**Deliverables:**
1. `supabase/functions/twilio-webhook/index.ts` deployed with `--no-verify-jwt`
2. Twilio phone number webhook URL configured to point to the function
3. Inbound messages are written to `sms_log` with `direction = 'inbound'`
4. SMS thread view in the modal shows inbound replies inline (already built in Phase 1 — just starts rendering `direction = 'inbound'` rows)
5. Optional: badge/notification on RO card when there's an unread inbound reply

**Definition of done for Phase 3:**
- Customer texts back to the Twilio number
- Message appears in the `sms_log` table within seconds
- Staff sees the reply in the SMS thread when they open the modal
- STOP/UNSUBSCRIBE replies are logged and no further messages sent to that number

---

## 9. Pricing Reference

Prices from [Twilio SMS Pricing US](https://www.twilio.com/en-us/sms/pricing/us):

| Item | Cost |
|------|------|
| Outbound SMS (US, first 150K/mo) | $0.0083 per message |
| Inbound SMS (US) | $0.0083 per message |
| Carrier surcharge — AT&T | + $0.0035 outbound |
| Carrier surcharge — T-Mobile | + $0.0045 outbound |
| Carrier surcharge — Verizon | + $0.0040 outbound |
| Phone number monthly fee | ~$1.00/mo (10DLC long code) |
| A2P brand registration | $4 one-time |
| A2P campaign vetting | $15 one-time |
| A2P campaign monthly fee | $1.50–$10/mo |

**Estimated monthly cost for Patriots RV (~18 staff, ~50 active ROs):**
- Assume 5 outbound notifications per RO × 50 ROs = 250 messages/month
- 250 × $0.0083 + carrier fees ≈ **~$5–8/month** in message fees
- Plus ~$1/mo number + ~$2/mo campaign = **~$8–12/month total**

---

## 10. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Customer phone number missing | SMS button shows warning toast; button is visually disabled if `customer_phone` is null |
| Invalid phone number format | Edge Function validates E.164 regex before calling Twilio; returns 400 with descriptive error |
| Twilio returns `failed` status | Log error_code and error_message to `sms_log`; show toast with Twilio error code |
| Network error calling Twilio | Edge Function catches fetch error; returns 500; frontend shows "SMS failed" toast |
| Twilio `21211` error (invalid To number) | User-facing: "The phone number on file is invalid. Please update it on the RO." |
| Twilio `21610` error (STOP opt-out) | User-facing: "This number has opted out of SMS. Cannot send." |
| Twilio `30006` error (landline) | User-facing: "This number appears to be a landline and cannot receive SMS." |
| Message > 1600 chars | Frontend enforces maxlength="1600" on textarea; Edge Function also validates |
| sms_log insert fails | Non-fatal; log error to console; SMS still sends; warn in response |
| Twilio webhook receives STOP | Log as inbound; do not auto-reply; Twilio handles opt-out automatically |

**Common Twilio Error Codes:**

| Code | Meaning |
|------|---------|
| 21211 | Invalid 'To' phone number |
| 21214 | 'To' number is not mobile |
| 21610 | Number has opted out (STOP) |
| 21612 | Cannot route to this number |
| 30003 | Unreachable destination handset |
| 30006 | Landline or unreachable carrier |
| 30007 | Carrier violation / filtering |
| 30008 | Unknown delivery failure |

---

## 11. Secrets & Environment Variables

### Supabase Secrets (set via CLI or Dashboard)

```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_twilio_auth_token
supabase secrets set TWILIO_PHONE_NUMBER=+15551234567
```

### Frontend Constants (add near top of index.html script section)

```javascript
// Shop phone number for template substitution
const SHOP_PHONE = '(555) 123-4567'; // Replace with actual shop phone
```

### Verifying Secrets Are Set

```bash
supabase secrets list
```

---

## 12. Testing Checklist

### Phase 1 Pre-Deploy

- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets are set
- [ ] `sms_log` table exists with all columns
- [ ] `sms_templates` table exists and seed data loaded (6 templates)
- [ ] RLS policies applied to both tables
- [ ] `customer_phone` column added to `repair_orders` if missing

### Edge Function Tests (via CLI)

```bash
# Test send_sms action (replace +1XXXXXXXXXX with a real test number)
supabase functions invoke twilio-sms --body '{
  "action": "send_sms",
  "to": "+1XXXXXXXXXX",
  "body": "PRVS test message. Reply STOP to opt out.",
  "ro_id": null
}'
# Expected: { "success": true, "twilio_sid": "SM...", "status": "queued" }

# Test get_message_status (replace SID from above)
supabase functions invoke twilio-sms --body '{
  "action": "get_message_status",
  "twilio_sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}'
# Expected: { "success": true, "message": { "sid": "SM...", "status": "delivered", ... } }

# Test invalid phone
supabase functions invoke twilio-sms --body '{
  "action": "send_sms",
  "to": "not-a-phone",
  "body": "test"
}'
# Expected: 400 error about E.164 format
```

### UI Tests

- [ ] SMS button appears on RO cards
- [ ] Clicking SMS button with no `customer_phone` shows warning toast (does not open modal)
- [ ] Clicking SMS button with valid phone opens modal with correct customer/RO info
- [ ] Template dropdown loads and selecting a template populates the textarea
- [ ] `{{variables}}` are substituted correctly in the rendered template
- [ ] Character counter updates as user types
- [ ] Send button fires and shows spinner while in-flight
- [ ] Success toast appears after successful send
- [ ] SMS appears in thread view after send
- [ ] Inbound messages (Phase 3) appear in thread view in a different alignment/color

### Phase 3 Webhook Test

```bash
# Simulate Twilio inbound webhook with curl
curl -X POST \
  https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/twilio-webhook \
  -d "MessageSid=SMtest123&From=%2B15551234567&To=%2B15559876543&Body=Hello+from+customer&NumSegments=1" \
  -H "Content-Type: application/x-www-form-urlencoded"
# Expected: <Response></Response> (HTTP 200)
# Verify: row in sms_log with direction='inbound'
```

---

*Spec complete. All code blocks are copy-paste ready. Proceed in phase order. Start Phase 1 after number port is initiated.*
