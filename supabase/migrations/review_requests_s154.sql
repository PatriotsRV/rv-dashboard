-- review_requests_s154.sql — Session 154 (2026-07-22) — GH#40
-- "Please Give Us a Review" automation (Kenect Reviews replacement).
-- Per docs/specs/REVIEW_REQUEST_SPEC.md + Roland S154 decisions:
--   delay = 24h (Kenect parity, app_config-tunable), spec-draft SMS copy.
-- Idempotent: safe to re-run.
--
-- Pieces:
--   1. review_requests + review_feedback tables + RLS
--   2. app_config keys (delay / enabled / SMS copy)
--   3. AFTER INSERT trigger on cashiered -> enqueue (60-day guard, opt-out guard)
--   4. Kenect reviewRequestSent seed (41 contacts -> historical 'sent' rows)
--   5. scheduled_notifications.source CHECK widened (+review_feedback_notify)
--   6. pg_cron: invoke process-review-requests every 15 min (pg_net)

-- ── 1. Tables ────────────────────────────────────────────────────────
create table if not exists public.review_requests (
  id            uuid primary key default gen_random_uuid(),
  token         uuid not null unique default gen_random_uuid(),
  ro_id         text,
  phone         text not null,
  phone_key     text not null,
  customer_name text,
  status        text not null default 'pending'
                check (status in ('pending','sent','skipped','failed','cancelled')),
  scheduled_at  timestamptz not null,
  sent_at       timestamptz,
  clicked_at    timestamptz,          -- customer opened Yes -> a review site
  review_site   text,                 -- 'google' | 'facebook'
  feedback_at   timestamptz,          -- customer used the No -> feedback path
  manual        boolean not null default false,
  requested_by  text,                 -- staff email on manual requests
  error_message text,
  source        text not null default 'ro_cashiered',  -- 'ro_cashiered' | 'manual' | 'kenect_import'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_review_requests_pending
  on public.review_requests (scheduled_at) where status = 'pending';
create index if not exists idx_review_requests_phone_key
  on public.review_requests (phone_key);

create table if not exists public.review_feedback (
  id                uuid primary key default gen_random_uuid(),
  review_request_id uuid references public.review_requests(id),
  phone_key         text,
  customer_name     text,
  feedback          text not null,
  status            text not null default 'needs_response'
                    check (status in ('needs_response','in_progress','resolved')),
  resolved_by       text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.review_requests enable row level security;
alter table public.review_feedback enable row level security;

drop policy if exists review_requests_select_authenticated on public.review_requests;
create policy review_requests_select_authenticated
  on public.review_requests for select to authenticated using (true);
drop policy if exists review_requests_insert_manager on public.review_requests;
create policy review_requests_insert_manager
  on public.review_requests for insert to authenticated
  with check (is_manager_or_above());
drop policy if exists review_requests_update_manager on public.review_requests;
create policy review_requests_update_manager
  on public.review_requests for update to authenticated
  using (is_manager_or_above()) with check (is_manager_or_above());
grant select, insert, update on public.review_requests to authenticated;

drop policy if exists review_feedback_select_authenticated on public.review_feedback;
create policy review_feedback_select_authenticated
  on public.review_feedback for select to authenticated using (true);
drop policy if exists review_feedback_update_manager on public.review_feedback;
create policy review_feedback_update_manager
  on public.review_feedback for update to authenticated
  using (is_manager_or_above()) with check (is_manager_or_above());
grant select, update on public.review_feedback to authenticated;
-- (No anon grants anywhere: the landing page talks ONLY to the token-gated
--  review-feedback edge fn, which uses the service role.)

drop trigger if exists trg_review_requests_updated_at on public.review_requests;
create trigger trg_review_requests_updated_at
  before update on public.review_requests
  for each row execute function set_updated_at();
drop trigger if exists trg_review_feedback_updated_at on public.review_feedback;
create trigger trg_review_feedback_updated_at
  before update on public.review_feedback
  for each row execute function set_updated_at();

-- ── 2. app_config ────────────────────────────────────────────────────
insert into public.app_config (key, value, label) values
  ('review_request_enabled', 'true', 'Review requests: master switch'),
  ('review_request_delay_minutes', '1440', 'Review requests: delay after Cashiered (min)'),
  ('review_request_text',
   'Thanks for choosing Patriots RV Services! We''d love to hear how we did: {link}  Reply STOP to opt out.',
   'Review requests: SMS copy ({link} placeholder)')
on conflict (key) do nothing;

-- ── 3. Enqueue trigger on cashiered ─────────────────────────────────
create or replace function public.enqueue_review_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled text;
  v_delay   int;
  v_pk      text;
begin
  select value into v_enabled from app_config where key = 'review_request_enabled';
  if coalesce(v_enabled, 'true') <> 'true' then return new; end if;

  v_pk := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
  if v_pk is null or length(v_pk) < 10 then return new; end if;

  -- Opt-out guard (STOP): never enqueue for an opted-out conversation.
  if exists (select 1 from conversations c
             where c.phone_key = v_pk and c.opted_out_at is not null) then
    return new;
  end if;

  -- Frequency guard (Kenect parity): max one per 60 days per number,
  -- and never stack a second pending request.
  if exists (select 1 from review_requests r
             where r.phone_key = v_pk
               and (r.status = 'pending'
                    or (r.status = 'sent' and r.sent_at > now() - interval '60 days'))) then
    return new;
  end if;

  select coalesce(nullif(value,'')::int, 1440) into v_delay
    from app_config where key = 'review_request_delay_minutes';
  v_delay := coalesce(v_delay, 1440);

  insert into review_requests (ro_id, phone, phone_key, customer_name,
                               scheduled_at, source)
  values (new.ro_id, new.phone, v_pk, new.customer_name,
          now() + make_interval(mins => v_delay), 'ro_cashiered');
  return new;
end;
$$;

drop trigger if exists trg_enqueue_review_request on public.cashiered;
create trigger trg_enqueue_review_request
  after insert on public.cashiered
  for each row execute function public.enqueue_review_request();

-- ── 4. Kenect seed: 41 contacts Kenect already asked ────────────────
-- Preserves the 60-day guard across the platform switch (most are older
-- than 60 days; seeded anyway as history). Idempotent via the
-- kenect_import source + phone_key existence check.
insert into public.review_requests
  (phone, phone_key, customer_name, status, scheduled_at, sent_at, source)
select
  s.number, s.pk, s.display_name, 'sent', s.sent_ts, s.sent_ts, 'kenect_import'
from (
  select distinct on (right(regexp_replace(payload->'mainNumber'->>'number','\D','','g'),10))
    payload->'mainNumber'->>'number' as number,
    right(regexp_replace(payload->'mainNumber'->>'number','\D','','g'),10) as pk,
    payload->>'displayName' as display_name,
    to_timestamp((payload->>'reviewRequestSent')::bigint / 1000.0) as sent_ts
  from public.kenect_contacts_raw
  where payload ? 'reviewRequestSent'
    and (payload->>'reviewRequestSent') ~ '^\d+$'
) s
where s.pk is not null and length(s.pk) = 10
  and not exists (select 1 from public.review_requests r
                  where r.phone_key = s.pk and r.source = 'kenect_import');

-- ── 5. Widen scheduled_notifications.source for feedback notify ─────
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.scheduled_notifications'::regclass
     and contype = 'c' and pg_get_constraintdef(oid) ilike '%source%';
  if v_def is not null and v_def not ilike '%review_feedback_notify%' then
    alter table public.scheduled_notifications
      drop constraint scheduled_notifications_source_check;
    alter table public.scheduled_notifications
      add constraint scheduled_notifications_source_check
      check (source = any (array['manual','auto_dropoff_reminder','auto_promised_reminder',
        'auto_pickup_reminder','service_added_notify','urgent_update_notify',
        'inbound_message_notify','stale_message_alarm','conversation_assigned',
        'assigned_inbound_notify','review_feedback_notify']));
  end if;
end $$;

-- ── 6. pg_cron: process-review-requests every 15 min ────────────────
create extension if not exists pg_net;

create or replace function public.invoke_process_review_requests()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare v_request_id bigint;
begin
  select net.http_post(
    url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/process-review-requests',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'process-review-requests-15min') then
    perform cron.schedule('process-review-requests-15min', '*/15 * * * *',
      'SELECT invoke_process_review_requests()');
  end if;
end $$;

-- ── Report ──────────────────────────────────────────────────────────
select
  (select count(*) from review_requests where source='kenect_import') as kenect_seeded,
  (select count(*) from app_config where key like 'review_request%')  as config_keys,
  (select count(*) from cron.job where jobname='process-review-requests-15min') as cron_job;
