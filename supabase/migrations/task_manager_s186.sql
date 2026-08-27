-- ============================================================================
-- TASK MANAGER — Phase 1 (Session 186, 2026-08-27)
-- Spec: docs/specs/TASK_MANAGER_SPEC.md
-- Creates: tasks, task_events, board_prefs, ro_activity_feed view,
--          invoke_send_task_reminders() + pg_cron job,
--          widens scheduled_notifications.source (+ 'task_reminder').
-- Run in the Supabase SQL editor. Idempotent where practical.
-- ============================================================================

-- ─── 1. tasks ───────────────────────────────────────────────────────────────
create table if not exists tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  notes               text,
  ro_uuid             uuid references repair_orders(id),
  ro_display_id       text,                 -- cached human RO id (house style, cf. ro_receivables)
  conversation_id     uuid references conversations(id),
  assigned_to_email   text not null,
  assigned_by_email   text not null,
  due_at              timestamptz not null,
  remind_lead_minutes int  not null default 0,     -- nagging starts due_at - lead
  remind_every_minutes int not null default 240,   -- nag cadence (4h default)
  requires_validation boolean not null default true,
  priority            text not null default 'normal'
                      check (priority in ('low','normal','high','urgent')),
  status              text not null default 'open'
                      check (status in ('open','done','validated','cancelled')),
  source              text not null default 'manual'
                      check (source in ('manual','promoted','ro_event','sales')),
  source_ref          text,                 -- promote dedup: 'ref_table:ref_id'
  reminder_count      int not null default 0,
  last_reminded_at    timestamptz,
  escalated_at        timestamptz,
  completed_at        timestamptz,
  completed_by_email  text,
  validated_at        timestamptz,
  validated_by_email  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_tasks_status_due  on tasks (status, due_at);
create index if not exists idx_tasks_assigned_to on tasks (assigned_to_email) where status in ('open','done');
create index if not exists idx_tasks_ro          on tasks (ro_uuid) where ro_uuid is not null;
-- Promote dedup: one live task per feed item.
create unique index if not exists uq_tasks_live_source_ref
  on tasks (source_ref) where source_ref is not null and status in ('open','done');

-- ─── 2. task_events (self-contained audit; audit_log is RO-centric) ────────
create table if not exists task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  event       text not null
              check (event in ('created','done','validated','rejected','cancelled',
                               'reassigned','due_changed','reminder_sent','escalated')),
  actor_email text not null,               -- 'system@patriotsrvservices.com' for cron
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_task_events_task on task_events (task_id, created_at);

-- ─── 3. board_prefs (Lynn's feed-kind selector; per user, follows devices) ──
create table if not exists board_prefs (
  staff_email text primary key,
  feed_kinds  jsonb not null default
    '["parts","pickup","dropoff","promised","ro_reminder","receivable","quiet_ro"]',
  quiet_days  int not null default 21,     -- Roland S186: 21 (14-21 considered)
  updated_at  timestamptz not null default now()
);

-- ─── 4. RLS — house style (authenticated full access; UI enforces
--        transitions, task_events records who did what) ────────────────────
alter table tasks        enable row level security;
alter table task_events  enable row level security;
alter table board_prefs  enable row level security;
drop policy if exists tasks_authenticated_full_access on tasks;
create policy tasks_authenticated_full_access on tasks
  for all to authenticated using (true) with check (true);
drop policy if exists task_events_authenticated_full_access on task_events;
create policy task_events_authenticated_full_access on task_events
  for all to authenticated using (true) with check (true);
drop policy if exists board_prefs_authenticated_full_access on board_prefs;
create policy board_prefs_authenticated_full_access on board_prefs
  for all to authenticated using (true) with check (true);

-- ─── 5. scheduled_notifications.source — widen CHECK (+ 'task_reminder') ───
-- ⚠️ FULL array read from live pg_constraint 2026-08-27 (S185 rule: the FILES
-- are not trustworthy; this list is the live 14 + the 1 new value).
alter table scheduled_notifications
  drop constraint if exists scheduled_notifications_source_check;
alter table scheduled_notifications
  add constraint scheduled_notifications_source_check
  check (source = any (array[
    'manual','auto_dropoff_reminder','auto_promised_reminder','auto_pickup_reminder',
    'service_added_notify','urgent_update_notify','inbound_message_notify',
    'stale_message_alarm','conversation_assigned','assigned_inbound_notify',
    'review_feedback_notify','unreplied_eod_reminder','approval_notify',
    'receivable_followup',
    'task_reminder'                                   -- NEW S186
  ]::text[]));

-- ─── 6. ro_activity_feed view (read-through; NEVER copies — S183 lesson) ───
-- Active-RO predicate = lot-wide sweep: not deleted, not training, not
-- Delivered/Cashed Out, not Closed - No Charge. (Matches send-manager-report's
-- deliberately lot-wide scope.)
create or replace view ro_activity_feed as
with active_ros as (
  select id, ro_id, customer_name, status, promised_date,
         planned_dropoff_date, pickup_date, updated_at
    from repair_orders
   where deleted_at is null
     and coalesce(is_training, false) = false
     and status not in ('Delivered/Cashed Out','Closed - No Charge')
)
-- parts: outstanding parts (not yet received/installed)
select 'parts'::text as kind, a.id as ro_uuid, a.ro_id as ro_display_id,
       a.customer_name,
       coalesce(p.part_name,'Part') || ' — ' || coalesce(p.status,'?')
         || case when p.qty is not null and p.qty > 1 then ' ×' || p.qty else '' end as title,
       case when p.eta is not null then 'ETA ' || to_char(p.eta,'Mon DD') else null end as detail,
       coalesce(p.eta::timestamptz, p.date_ordered::timestamptz, a.updated_at) as event_at,
       null::text as actor, 'parts'::text as ref_table, p.id::text as ref_id
  from parts p join active_ros a on a.id = p.ro_id
 where p.status in ('Sourcing','Ordered')
union all
-- pickup / dropoff / promised dates on the RO
select 'pickup', a.id, a.ro_id, a.customer_name,
       'Pickup ' || to_char(a.pickup_date,'Mon DD'), a.status,
       a.pickup_date::timestamptz, null, 'repair_orders', a.id::text || ':pickup'
  from active_ros a where a.pickup_date is not null
union all
select 'dropoff', a.id, a.ro_id, a.customer_name,
       'Drop-off ' || to_char(a.planned_dropoff_date,'Mon DD'), a.status,
       a.planned_dropoff_date::timestamptz, null, 'repair_orders', a.id::text || ':dropoff'
  from active_ros a where a.planned_dropoff_date is not null
union all
select 'promised', a.id, a.ro_id, a.customer_name,
       'Promised ' || to_char(a.promised_date,'Mon DD'), a.status,
       a.promised_date::timestamptz, null, 'repair_orders', a.id::text || ':promised'
  from active_ros a where a.promised_date is not null
union all
-- ro_reminder: pending 🔔 RO Reminders (manual only — auto_* mirror the date
-- kinds above; same double-count rule as send-manager-report)
select 'ro_reminder', a.id, a.ro_id, a.customer_name,
       coalesce(n.subject,'Reminder'), null,
       n.scheduled_at, n.created_by_email, 'scheduled_notifications', n.id::text
  from scheduled_notifications n join active_ros a on a.id = n.ro_id
 where n.status = 'pending' and n.source = 'manual'
union all
-- scheduled_msg: queued Scheduled Messages (S177) — lot-wide, no RO tie
select 'scheduled_msg', null::uuid, null::text, null::text,
       'Scheduled msg → ' || coalesce(m.group_label, 'recipients') as title,
       left(m.body, 80), m.send_at, m.created_by, 'scheduled_messages', m.id::text
  from scheduled_messages m where m.status = 'pending'
union all
-- receivable: open outstanding payments (S185)
select 'receivable', r.ro_id, r.ro_display_id, r.customer_name,
       '$' || to_char(r.amount_expected,'FM999,999,990.00') || ' from '
         || coalesce(r.payer_name, r.payer_type),
       'expected ' || to_char(r.expected_by,'Mon DD'),
       r.expected_by::timestamptz, r.opened_by_email, 'ro_receivables', r.id::text
  from ro_receivables r where r.status = 'open'
union all
-- status_change: last 14 days on active ROs
select 'status_change', a.id, a.ro_id, a.customer_name,
       coalesce(l.old_value,'?') || ' → ' || coalesce(l.new_value,'?'),
       l.user_name, l.changed_at, l.user_email, 'audit_log', l.id::text
  from audit_log l join active_ros a on a.id = l.ro_id
 where l.field_changed = 'status' and l.changed_at > now() - interval '14 days'
union all
-- quiet_ro: EVERY active RO with its last activity timestamp; the CLIENT
-- filters to older-than board_prefs.quiet_days (default 21). S183 lesson:
-- an event feed cannot show an RO where nothing is happening.
select 'quiet_ro', a.id, a.ro_id, a.customer_name,
       a.status, 'last activity',
       greatest(
         coalesce((select max(n2.created_at) from notes n2     where n2.ro_id = a.id), 'epoch'::timestamptz),
         coalesce((select max(l2.changed_at) from audit_log l2 where l2.ro_id = a.id), 'epoch'::timestamptz),
         a.updated_at
       ), null, 'repair_orders', a.id::text || ':quiet'
  from active_ros a;

-- ─── 7. Reminder cron: pg_cron → invoke_* → edge fn (house pattern) ────────
create or replace function public.invoke_send_task_reminders()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'net'
as $function$
declare v_request_id bigint;
begin
  select net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-task-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

-- Every 30 min, 8:00 AM - 5:30 PM CDT weekdays (13-22 UTC). The window IS the
-- quiet-hours answer: no task SMS outside business hours.
select cron.schedule(
  'send-task-reminders-30min',
  '*/30 13-22 * * 1-5',
  $$SELECT invoke_send_task_reminders()$$
);
