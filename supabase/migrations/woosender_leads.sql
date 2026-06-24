-- WooSender lead intake — Session 123 (2026-06-24)
-- Inbound webhook from WooSender -> Zapier -> the `woosender-intake` edge fn lands
-- a row here. This table doubles as the REVIEW QUEUE: a Won-stage lead is captured
-- raw first (capture-first), a person reviews it, then promotes it to a real RO.
-- Additive + re-runnable.

-- 1. Table.
create table if not exists public.woosender_leads (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  raw_payload     jsonb not null,                 -- full body Zapier/WooSender POSTed
  secret_valid    boolean not null default false, -- did the request carry the right shared secret
  source          text not null default 'woosender',

  -- Extracted fields — left NULL during the capture phase; populated in the
  -- mapping phase once we see the real payload shape. Additive now so phase 2
  -- needs no second migration.
  lead_name       text,
  lead_phone      text,
  lead_email      text,
  rv_info         text,
  service_request text,
  woosender_id    text,                           -- WooSender lead/opportunity id (for dedupe + idempotency)

  -- Review queue.
  --   new       — awaiting review
  --   promoted  — a NEW RO was created from this lead
  --   merged    — the lead was merged into an EXISTING RO (notes + field updates)
  --   dismissed — discarded (junk / not actionable)
  --   duplicate — superseded duplicate
  review_status   text not null default 'new'
                  check (review_status in ('new','promoted','merged','dismissed','duplicate')),
  promoted_ro_id  text,                           -- repair_orders.id (uuid as text) once promoted
  matched_ro_id   text,                           -- existing RO matched on phone/email (dedupe hint)
  review_notes    text,
  reviewed_by     text,
  reviewed_at     timestamptz,

  updated_at      timestamptz not null default now()
);

-- 2. Indexes — newest-first queue scan + status filter + dedupe lookups.
create index if not exists idx_woosender_leads_received   on public.woosender_leads (received_at desc);
create index if not exists idx_woosender_leads_status      on public.woosender_leads (review_status);
create index if not exists idx_woosender_leads_woosenderid on public.woosender_leads (woosender_id);

-- 3. RLS — authenticated dashboard users can READ the queue; writes come from the
--    edge fn using the service-role key, which bypasses RLS. (Mirrors `messages`.)
alter table public.woosender_leads enable row level security;

drop policy if exists "Authenticated can read woosender_leads" on public.woosender_leads;
create policy "Authenticated can read woosender_leads"
  on public.woosender_leads
  for select
  to authenticated
  using (true);

-- 4. updated_at is auto-maintained by the shared trg_set_updated_at trigger
--    (auto_set_updated_at.sql, Session 115). Attach it here too.
drop trigger if exists trg_set_updated_at on public.woosender_leads;
create trigger trg_set_updated_at
  before update on public.woosender_leads
  for each row
  execute function public.set_updated_at();
