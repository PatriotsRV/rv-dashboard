-- ============================================================
-- pb_inbox_conversations.sql (Session 138, 2026-07-15, GH#39)
-- PB Inbox + Conversation Assignment — P1 migration
-- Per docs/specs/PB_INBOX_ASSIGNMENT_SPEC.md §3 (with one approved
-- deviation: REUSE staff.phone_number instead of adding mobile_phone —
-- the column survived the S106 Twilio teardown "reusable by a future
-- messaging flow" and 16/19 active staff already have phone + consent).
-- Also carries the STOP/HELP suppression storage (folded into this
-- build per Roland, S137).
--
-- Additive only. Idempotent. Safe to run on live prod anytime.
-- ============================================================

-- ── 1. conversations — one row per customer phone thread ─────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_key        text NOT NULL UNIQUE,      -- digits-only last-10; join key to messages
  display_phone    text,                      -- last-seen E.164 form for display
  customer_name    text,                      -- best-known; refreshed on RO routing
  assigned_to      text,                      -- staff.email of owner; NULL = unassigned
  assigned_by      text,                      -- staff.email who assigned
  assigned_at      timestamptz,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_message_at  timestamptz,               -- maintained by webhook/send/reconcile
  last_direction   text CHECK (last_direction IN ('inbound','outbound')),
  -- STOP/HELP hard gate (TCPA) — S137 decision: ships with this build
  opted_out_at     timestamptz,               -- set by STOP, cleared by START
  opt_out_keyword  text,                      -- the keyword that triggered opt-out
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversations IS
  'GH#39 PB inbox: one row per customer phone thread (phone_key = digits-only last-10). Assignment owner + STOP/HELP suppression live here. Maintained by projectblue-webhook / projectblue-send / messages.html.';
COMMENT ON COLUMN public.conversations.opted_out_at IS
  'Non-NULL = customer texted STOP (or equivalent). projectblue-send MUST refuse sends while set. Cleared when customer texts START.';

CREATE INDEX IF NOT EXISTS idx_conversations_last_msg  ON public.conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned  ON public.conversations (assigned_to);

-- S115 shared updated_at trigger
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.conversations;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. conversation_events — assignment/status audit ─────────────────
-- (audit_log is RO-scoped; conversations may have no RO)
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  event           text NOT NULL CHECK (event IN ('assigned','unassigned','closed','reopened','opted_out','opted_in')),
  actor_email     text NOT NULL,               -- staff email, or 'customer-sms' for STOP/START
  old_value       text,
  new_value       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_convo
  ON public.conversation_events (conversation_id, created_at DESC);

-- ── 3. staff phone: REUSE existing column (approved deviation) ───────
COMMENT ON COLUMN public.staff.phone_number IS
  'E.164 mobile (e.g. +19405551234). NULL = no SMS notifies. Kept through the S106 Twilio teardown; reused by the GH#39 PB inbox assignment notifies (Session 138 decision — spec §3c mobile_phone superseded).';

-- ── 4. scheduled_notifications.source CHECK — widen (S127 gotcha) ────
ALTER TABLE public.scheduled_notifications
    DROP CONSTRAINT IF EXISTS scheduled_notifications_source_check;

ALTER TABLE public.scheduled_notifications
    ADD CONSTRAINT scheduled_notifications_source_check
    CHECK (source = ANY (ARRAY[
        'manual'::text,
        'auto_dropoff_reminder'::text,
        'auto_promised_reminder'::text,
        'auto_pickup_reminder'::text,
        'service_added_notify'::text,
        'urgent_update_notify'::text,
        'inbound_message_notify'::text,
        'stale_message_alarm'::text,
        'conversation_assigned'::text,      -- NEW: assign-action notify (P4)
        'assigned_inbound_notify'::text     -- NEW: inbound-to-owner notify (P2)
    ]));

-- ── 5. Role helper: Manager / Sr Manager / Admin (assign rights) ─────
-- Mirrors is_sr_manager_or_admin() (fix_wo_rls_sr_manager_bypass.sql).
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r       ON r.id = ur.role_id
    WHERE u.id = auth.uid()
    AND r.name IN ('Manager', 'Sr Manager', 'Admin')
  );
$$;

-- ── 6. RLS — authenticated-only (post-S134 posture; NO anon) ─────────
ALTER TABLE public.conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_authenticated" ON public.conversations;
CREATE POLICY "conversations_select_authenticated"
  ON public.conversations FOR SELECT TO authenticated USING (true);

-- Writes (assign/close/name edit) = Manager+. Edge fns use service role (bypass).
DROP POLICY IF EXISTS "conversations_insert_manager" ON public.conversations;
CREATE POLICY "conversations_insert_manager"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "conversations_update_manager" ON public.conversations;
CREATE POLICY "conversations_update_manager"
  ON public.conversations FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
-- (no DELETE policy — conversations are never deleted from the UI)

DROP POLICY IF EXISTS "conversation_events_select_authenticated" ON public.conversation_events;
CREATE POLICY "conversation_events_select_authenticated"
  ON public.conversation_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "conversation_events_insert_authenticated" ON public.conversation_events;
CREATE POLICY "conversation_events_insert_authenticated"
  ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());
-- (no UPDATE/DELETE policies — events are immutable)

-- Explicit grants (S124 gotcha: don't rely on default Data API grants)
GRANT SELECT, INSERT, UPDATE ON public.conversations       TO authenticated;
GRANT SELECT, INSERT         ON public.conversation_events TO authenticated;

-- ── 7. Backfill from messages (one-time; idempotent via ON CONFLICT) ─
-- One row per distinct customer phone in messages, excluding the PB line
-- (+1 940 407-4145). last_message_at/last_direction/display_phone from the
-- newest message; customer_name from the newest RO-routed message if any.
INSERT INTO public.conversations
  (phone_key, display_phone, customer_name, last_message_at, last_direction)
SELECT DISTINCT ON (k.phone_key)
  k.phone_key,
  k.raw_phone,
  (
    SELECT ro.customer_name
    FROM public.messages m2
    JOIN public.repair_orders ro ON ro.id = m2.ro_id
    WHERE right(regexp_replace(coalesce(
            CASE WHEN m2.direction = 'inbound' THEN m2.phone_from ELSE m2.phone_to END, ''),
            '\D', '', 'g'), 10) = k.phone_key
      AND m2.ro_id IS NOT NULL
    ORDER BY m2.created_at DESC
    LIMIT 1
  ),
  k.created_at,
  k.direction
FROM (
  SELECT
    right(regexp_replace(coalesce(
      CASE WHEN m.direction = 'inbound' THEN m.phone_from ELSE m.phone_to END, ''),
      '\D', '', 'g'), 10) AS phone_key,
    CASE WHEN m.direction = 'inbound' THEN m.phone_from ELSE m.phone_to END AS raw_phone,
    m.created_at,
    m.direction
  FROM public.messages m
) k
WHERE length(k.phone_key) = 10
  AND k.phone_key <> '9404074145'   -- our PB line
ORDER BY k.phone_key, k.created_at DESC
ON CONFLICT (phone_key) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.conversations) AS conversations_backfilled,
  (SELECT count(DISTINCT right(regexp_replace(coalesce(
      CASE WHEN direction='inbound' THEN phone_from ELSE phone_to END,''),'\D','','g'),10))
     FROM public.messages
     WHERE length(regexp_replace(coalesce(
       CASE WHEN direction='inbound' THEN phone_from ELSE phone_to END,''),'\D','','g')) >= 10
       AND right(regexp_replace(coalesce(
       CASE WHEN direction='inbound' THEN phone_from ELSE phone_to END,''),'\D','','g'),10) <> '9404074145'
  ) AS distinct_customer_phones,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_set_updated_at'
     AND tgrelid='public.conversations'::regclass) AS updated_at_trigger,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conname='scheduled_notifications_source_check') LIKE '%assigned_inbound_notify%'
     AS source_check_widened;
