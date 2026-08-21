-- ============================================================
-- scheduled_messages_s177.sql (Scheduled Messages, Session 177, 2026-08-21)
-- ============================================================
-- Roland directive: schedule a message (customer composer OR staff
-- broadcast) to fire at a minute-specific future time. Examples: "remind
-- the tech at 4:35 PM to send the invoice"; "Team lunch is here" broadcast
-- built hours ahead.
--
-- Design (mirrors review_requests_s154 queue + process-review-requests):
-- - ONE row per scheduled message. `recipients` is an explicit roster
--   snapshot taken at schedule time ([{name,phone}] for customer;
--   [{email,name,phone}] for broadcast — same shape _runBroadcast takes).
-- - Fired by NEW edge fn send-scheduled-messages via a 1-MINUTE pg_cron
--   (the 15-min notification cron is too coarse for "4:35 PM").
-- - The edge fn routes through textly-send, so the customer STOP gate,
--   messages logging, and conversations upsert all run AT FIRE TIME
--   (someone opting out between scheduling and firing is respected).
-- - Broadcast fires also log ONE staff_broadcasts row (v1.15 history parity).
-- - Managers+ only (Roland call, S177): RLS + the UI both gate on
--   is_manager_or_above().
-- - Edit/cancel: UPDATE allowed on PENDING rows only (edit = body/send_at;
--   cancel = status -> 'cancelled'). 'sending' is the claim state so an
--   overlapping cron tick can never double-send.
-- S124 note: explicit grants (Supabase drops default Data API grants for
-- new tables after 2026-10-30).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists scheduled_messages (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('customer','broadcast')),
  recipients   jsonb not null default '[]'::jsonb, -- customer: [{name,phone}] · broadcast: [{email,name,phone}]
  group_label  text,                               -- broadcast only ('All staff' / silo / custom group name)
  body         text not null default '',           -- raw text (customer: signature already appended; broadcast: WITHOUT the 📢 prefix — added at fire like _runBroadcast)
  media_url    jsonb,                              -- array of public URLs; chunked 1-per-MMS at fire (S158a rule)
  send_at      timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending','sending','sent','cancelled','failed')),
  sent_at      timestamptz,
  result       jsonb,                              -- per-recipient [{...,ok}] roster from the fire
  error        text,
  created_by   text not null,                      -- scheduler's email
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint scheduled_messages_has_content
    check (length(trim(body)) > 0 or media_url is not null),
  constraint scheduled_messages_has_recipients
    check (jsonb_array_length(recipients) > 0)
);

create index if not exists idx_scheduled_messages_due
  on scheduled_messages (status, send_at);

-- updated_at rides the S115 trigger fn (do NOT hand-set updated_at).
drop trigger if exists scheduled_messages_updated_at on scheduled_messages;
create trigger scheduled_messages_updated_at
  before update on scheduled_messages
  for each row execute function public.set_updated_at();

-- ── RLS: managers+ only ─────────────────────────────────────────────
alter table scheduled_messages enable row level security;

drop policy if exists scheduled_messages_manager_select on scheduled_messages;
create policy scheduled_messages_manager_select on scheduled_messages
  for select to authenticated using (is_manager_or_above());

drop policy if exists scheduled_messages_manager_insert on scheduled_messages;
create policy scheduled_messages_manager_insert on scheduled_messages
  for insert to authenticated with check (is_manager_or_above());

-- Edit/cancel: pending rows only. The edge fn uses service role (bypasses
-- RLS) for its claim/sent/failed flips.
drop policy if exists scheduled_messages_manager_update on scheduled_messages;
create policy scheduled_messages_manager_update on scheduled_messages
  for update to authenticated
  using (is_manager_or_above() and status = 'pending')
  with check (is_manager_or_above() and status in ('pending','cancelled'));

-- Explicit grants (S124 gotcha).
grant select, insert, update on scheduled_messages to authenticated;

-- ── 1-minute pg_cron → send-scheduled-messages edge fn ──────────────
-- Same pg_net pattern as invoke_send_unreplied_reminder (S158). The fn is
-- deployed --no-verify-jwt; it only acts on due pending rows, so an
-- unauthenticated poke is harmless (worst case: sends fire on time).
create extension if not exists pg_net;

create or replace function public.invoke_send_scheduled_messages()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare v_request_id bigint;
begin
  select net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-scheduled-messages',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request_id;
  return v_request_id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-scheduled-messages-1min') then
    perform cron.schedule('send-scheduled-messages-1min', '* * * * *',
      'SELECT invoke_send_scheduled_messages()');
  end if;
end $$;

-- ── Report ──────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_name = 'scheduled_messages') as table_exists,
  (select count(*) from pg_policies
    where tablename = 'scheduled_messages') as policy_count,
  (select count(*) from cron.job
    where jobname = 'send-scheduled-messages-1min') as cron_job;
