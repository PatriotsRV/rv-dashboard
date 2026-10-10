-- =====================================================================
-- PROVOSE P1-03  --  invoice (one per payer per RO, snapshot, gap-free), payments, payer splits
-- Session: Provose 200 (2026-10-10)   Spec: V2_DMS_DESIGN.md s3, s4, s5 (AI may never finalize), s11.6
-- Requires P1-01, P1-02, P1-04. Idempotent.
-- Invariants: a FINAL invoice and its lines are never edited (void + reissue instead);
--             a source ro_line on a final invoice is frozen (supplements are NEW lines);
--             invoice numbers are assigned only at finalize, from a locked counter (gap-free).
-- =====================================================================

-- ---------- gap-free counters ----------
create table if not exists provose_counters (
  name     text primary key,
  next_val bigint not null
);
insert into provose_counters (name, next_val) values ('invoice_number', 50001) on conflict (name) do nothing;

-- ---------- payer splits per job (s3; net-new vs Lightspeed) ----------
create table if not exists payer_split (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references ro_job(id) on delete cascade,
  payer_id    uuid not null references payer(id),
  split_type  text not null check (split_type in ('pct','fixed','deductible','cap')),
  value       numeric(12,4) not null check (value >= 0),
  sort_order  int  not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (job_id, payer_id)
);

-- ---------- invoice ----------
create table if not exists invoice (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      bigint unique,                 -- null while draft; assigned at finalize
  ro_id               uuid references repair_orders(id) on delete restrict,
  external_ref        text,
  payer_id            uuid not null references payer(id),
  status              text not null default 'draft' check (status in ('draft','final','void')),
  issued_on           date,
  finalized_at        timestamptz,
  finalized_by        text,
  voided_at           timestamptz,
  voided_by           text,
  void_reason         text,
  reissued_as         uuid references invoice(id),
  -- snapshot totals (written by finalize; mirrors of the line snapshot)
  subtotal_taxable    numeric(12,2) not null default 0,
  subtotal_nontaxable numeric(12,2) not null default 0,
  tax_total           numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  notes               text,
  qbo_id              text,
  qbo_sync_token      text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invoice_parent check (ro_id is not null or external_ref is not null)
);
create index if not exists invoice_ro_idx on invoice (ro_id);
create index if not exists invoice_ext_idx on invoice (external_ref);
create index if not exists invoice_payer_status_idx on invoice (payer_id, status);

-- ---------- invoice_line: a SNAPSHOT of ro_line at finalize time ----------
create table if not exists invoice_line (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references invoice(id) on delete cascade,
  job_id          uuid references ro_job(id) on delete restrict,
  ro_line_id      uuid references ro_line(id) on delete set null,
  job_title       text,
  line_type       provose_line_type not null,
  subtype         text,
  description     text not null,
  part_number     text,
  tech_name       text,
  unit            provose_unit not null,
  qty             numeric(12,3) not null,
  unit_cost       numeric(12,2) not null,
  unit_price      numeric(12,2) not null,
  discount_amount numeric(12,2) not null,
  taxable         boolean not null,
  tax_code        text not null,
  tax_rate        numeric(6,4) not null,
  sale_amount     numeric(12,2) not null,
  cost_amount     numeric(12,2) not null,
  tax_amount      numeric(12,2) not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists invoice_line_invoice_idx on invoice_line (invoice_id);
create index if not exists invoice_line_ro_line_idx on invoice_line (ro_line_id);

-- ---------- payment (deposits are liabilities until applied) ----------
create table if not exists payment (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid references invoice(id) on delete restrict,   -- null = unapplied deposit
  ro_id         uuid references repair_orders(id) on delete restrict,
  external_ref  text,
  payer_id      uuid references payer(id),
  method        text not null check (method in ('cash','check','card','ach','financing','other')),
  reference     text,                                               -- check #, last 4, auth code
  amount        numeric(12,2) not null check (amount <> 0),         -- refunds are negative
  received_on   date not null default current_date,
  is_deposit    boolean not null default false,
  applied_at    timestamptz,
  notes         text,
  qbo_id        text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payment_parent check (invoice_id is not null or ro_id is not null or external_ref is not null)
);
create index if not exists payment_invoice_idx on payment (invoice_id);
create index if not exists payment_ro_idx on payment (ro_id);

-- ---------- immutability guards ----------
-- RPCs set a transaction-local flag; nothing else may touch a final invoice or its lines.
create or replace function provose_rpc_active() returns boolean
language sql stable as $$ select coalesce(current_setting('provose.rpc', true), '') = '1' $$;

create or replace function provose_guard_invoice() returns trigger
language plpgsql as $$
begin
  if provose_rpc_active() then
    if tg_op = 'DELETE' then return old; end if;
    new.updated_at := now(); return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Provose: invoice % is %, it cannot be deleted (void it)', old.invoice_number, old.status; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- only harmless bookkeeping fields may change on a final/void invoice
    if new.status is distinct from old.status or new.invoice_number is distinct from old.invoice_number
       or new.payer_id is distinct from old.payer_id or new.total is distinct from old.total
       or new.tax_total is distinct from old.tax_total or new.subtotal_taxable is distinct from old.subtotal_taxable
       or new.subtotal_nontaxable is distinct from old.subtotal_nontaxable or new.issued_on is distinct from old.issued_on
       or new.finalized_at is distinct from old.finalized_at or new.ro_id is distinct from old.ro_id then
      raise exception 'Provose: invoice % is %; finalized invoices are never edited (void + reissue)', old.invoice_number, old.status;
    end if;
  end if;
  if tg_op = 'INSERT' and (new.status <> 'draft' or new.invoice_number is not null) then
    raise exception 'Provose: invoices are created as drafts and numbered by provose_finalize_invoice()';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_invoice_guard on invoice;
create trigger trg_invoice_guard before insert or update or delete on invoice for each row execute function provose_guard_invoice();

create or replace function provose_guard_invoice_line() returns trigger
language plpgsql as $$
begin
  if not provose_rpc_active() then
    raise exception 'Provose: invoice lines are written only by provose_finalize_invoice()';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_invoice_line_guard on invoice_line;
create trigger trg_invoice_line_guard before insert or update or delete on invoice_line for each row execute function provose_guard_invoice_line();

-- a source line that sits on a FINAL invoice is frozen
create or replace function provose_guard_ro_line_invoiced() returns trigger
language plpgsql as $$
declare n bigint;
begin
  select i.invoice_number into n from invoice_line il join invoice i on i.id = il.invoice_id
   where il.ro_line_id = old.id and i.status = 'final' limit 1;
  if n is not null then
    raise exception 'Provose: line "%" is on final invoice %; add a new line (supplement) instead', old.description, n;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_ro_line_invoiced on ro_line;
create trigger trg_ro_line_invoiced before update or delete on ro_line for each row execute function provose_guard_ro_line_invoiced();

-- ---------- role gates that also accept a backend caller (SQL Editor / service role: auth.uid() is null) ----------
create or replace function provose_is_backend() returns boolean
language sql stable as $$ select auth.uid() is null and current_user in ('postgres','service_role') $$;

create or replace function provose_require_manager() returns void
language plpgsql stable as $$
begin
  if not (provose_is_backend() or is_manager_or_above()) then raise exception 'Provose: manager or above required'; end if;
end $$;

create or replace function provose_require_sr_manager() returns void
language plpgsql stable as $$
begin
  if not (provose_is_backend() or is_sr_manager_or_admin()) then raise exception 'Provose: sr manager or admin required'; end if;
end $$;

-- ---------- RPCs (the only path to money state changes; AI never calls these - s5) ----------
-- Build a DRAFT invoice for one payer from the approved, not-yet-invoiced lines of an RO.
create or replace function provose_build_invoice(p_ro_id uuid, p_external_ref text, p_payer_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare inv uuid; n int;
begin
  perform provose_require_manager();
  if p_ro_id is null and p_external_ref is null then raise exception 'Provose: ro_id or external_ref required'; end if;
  perform set_config('provose.rpc', '1', true);
  insert into invoice (ro_id, external_ref, payer_id, created_by)
    values (p_ro_id, p_external_ref, p_payer_id, auth.jwt()->>'email') returning id into inv;
  insert into invoice_line (invoice_id, job_id, ro_line_id, job_title, line_type, subtype, description, part_number, tech_name,
                            unit, qty, unit_cost, unit_price, discount_amount, taxable, tax_code, tax_rate,
                            sale_amount, cost_amount, tax_amount, sort_order)
  select inv, j.id, l.id, j.title, l.line_type, l.subtype, l.description, l.part_number, s.name,
         l.unit, l.qty, l.unit_cost, l.unit_price, l.discount_amount, l.taxable, l.tax_code, l.tax_rate,
         l.sale_amount, l.cost_amount, l.tax_amount, (j.job_no * 1000) + l.sort_order
  from ro_job j join ro_line l on l.job_id = j.id left join staff s on s.id = l.tech_staff_id
  where ((p_ro_id is not null and j.ro_id = p_ro_id) or (p_ro_id is null and j.external_ref = p_external_ref))
    and j.approval_status = 'approved' and j.payer_id = p_payer_id
    and not exists (select 1 from invoice_line x join invoice i on i.id = x.invoice_id
                    where x.ro_line_id = l.id and i.status = 'final');
  get diagnostics n = row_count;
  if n = 0 then
    delete from invoice where id = inv;
    raise exception 'Provose: no approved, un-invoiced lines for that payer';
  end if;
  update invoice set subtotal_taxable = t.tx, subtotal_nontaxable = t.ntx, tax_total = t.tax, total = t.tx + t.ntx + t.tax
  from (select coalesce(sum(sale_amount) filter (where taxable),0) tx, coalesce(sum(sale_amount) filter (where not taxable),0) ntx,
               coalesce(sum(tax_amount),0) tax from invoice_line where invoice_id = inv) t
  where id = inv;
  return inv;
end $$;

-- Finalize: assign the next gap-free number, freeze. Re-snapshots lines first so a draft is never stale.
create or replace function provose_finalize_invoice(p_invoice_id uuid, p_issued_on date default current_date)
returns bigint
language plpgsql security definer set search_path = public as $$
declare inv invoice; num bigint;
begin
  perform provose_require_manager();
  select * into inv from invoice where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Provose: invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'Provose: invoice is already %', inv.status; end if;
  perform set_config('provose.rpc', '1', true);
  -- refresh the snapshot from the live lines (drafts follow edits; finals never do)
  update invoice_line il set
      description = l.description, part_number = l.part_number, unit = l.unit, qty = l.qty, unit_cost = l.unit_cost,
      unit_price = l.unit_price, discount_amount = l.discount_amount, taxable = l.taxable, tax_code = l.tax_code,
      tax_rate = l.tax_rate, sale_amount = l.sale_amount, cost_amount = l.cost_amount, tax_amount = l.tax_amount
  from ro_line l where l.id = il.ro_line_id and il.invoice_id = inv.id;
  if not exists (select 1 from invoice_line where invoice_id = inv.id) then raise exception 'Provose: invoice has no lines'; end if;
  update provose_counters set next_val = next_val + 1 where name = 'invoice_number' returning next_val - 1 into num;
  update invoice set invoice_number = num, status = 'final', issued_on = p_issued_on,
                     finalized_at = now(), finalized_by = auth.jwt()->>'email',
                     subtotal_taxable = t.tx, subtotal_nontaxable = t.ntx, tax_total = t.tax, total = t.tx + t.ntx + t.tax
  from (select coalesce(sum(sale_amount) filter (where taxable),0) tx, coalesce(sum(sale_amount) filter (where not taxable),0) ntx,
               coalesce(sum(tax_amount),0) tax from invoice_line where invoice_id = inv.id) t
  where id = inv.id;
  -- apply any unapplied deposits for this RO + payer
  update payment set invoice_id = inv.id, applied_at = now()
   where invoice_id is null and payer_id = inv.payer_id
     and ((inv.ro_id is not null and ro_id = inv.ro_id) or (inv.ro_id is null and external_ref = inv.external_ref));
  return num;
end $$;

-- Void: the only exit from final. Payments stay attached (refund = negative payment) unless reissued.
create or replace function provose_void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform provose_require_sr_manager();
  if coalesce(trim(p_reason),'') = '' then raise exception 'Provose: a void reason is required'; end if;
  perform set_config('provose.rpc', '1', true);
  update invoice set status = 'void', voided_at = now(), voided_by = auth.jwt()->>'email', void_reason = p_reason
   where id = p_invoice_id and status = 'final';
  if not found then raise exception 'Provose: only a final invoice can be voided'; end if;
end $$;

-- ---------- balances + AR aging by payer (s7) ----------
create or replace view invoice_balances as
select i.id as invoice_id, i.invoice_number, i.ro_id, i.external_ref, i.payer_id, p.payer_type, p.name as payer_name,
       i.status, i.issued_on, i.total,
       coalesce(sum(pm.amount), 0) as paid,
       i.total - coalesce(sum(pm.amount), 0) as balance,
       case when i.status = 'final' then current_date - i.issued_on end as days_open
from invoice i join payer p on p.id = i.payer_id
left join payment pm on pm.invoice_id = i.id
group by i.id, p.payer_type, p.name;

create or replace view ar_aging_by_payer as
select payer_type, payer_name, payer_id,
       count(*) filter (where balance > 0)                         as open_invoices,
       sum(balance) filter (where balance > 0)                     as total_due,
       sum(balance) filter (where balance > 0 and days_open <= 30) as due_0_30,
       sum(balance) filter (where balance > 0 and days_open between 31 and 60) as due_31_60,
       sum(balance) filter (where balance > 0 and days_open between 61 and 90) as due_61_90,
       sum(balance) filter (where balance > 0 and days_open > 90)  as due_over_90
from invoice_balances where status = 'final'
group by 1, 2, 3;

-- unapplied deposits = liability
create or replace view deposit_liability as
select coalesce(ro_id::text, 'ext:' || external_ref) as ro_key, ro_id, external_ref, payer_id, sum(amount) as unapplied
from payment where invoice_id is null group by 1, 2, 3, 4;

-- ---------- audit + RLS + grants ----------
drop trigger if exists trg_invoice_audit on invoice;
create trigger trg_invoice_audit after insert or update or delete on invoice for each row execute function provose_audit();
drop trigger if exists trg_invoice_line_audit on invoice_line;
create trigger trg_invoice_line_audit after insert or update or delete on invoice_line for each row execute function provose_audit();
drop trigger if exists trg_payment_audit on payment;
create trigger trg_payment_audit after insert or update or delete on payment for each row execute function provose_audit();
drop trigger if exists trg_payer_split_audit on payer_split;
create trigger trg_payer_split_audit after insert or update or delete on payer_split for each row execute function provose_audit();
drop trigger if exists trg_payment_touch on payment;
create trigger trg_payment_touch before update on payment for each row execute function provose_touch_updated_at();
drop trigger if exists trg_payer_split_touch on payer_split;
create trigger trg_payer_split_touch before update on payer_split for each row execute function provose_touch_updated_at();

alter table provose_counters enable row level security;
alter table payer_split      enable row level security;
alter table invoice          enable row level security;
alter table invoice_line     enable row level security;
alter table payment          enable row level security;

revoke all on provose_counters, payer_split, invoice, invoice_line, payment, invoice_balances, ar_aging_by_payer, deposit_liability from anon;
grant select on provose_counters to authenticated;                      -- written only inside the definer RPC
grant select, insert, update, delete on payer_split, invoice, payment to authenticated;
grant select on invoice_line to authenticated;                          -- written only inside the definer RPCs
grant select on invoice_balances, ar_aging_by_payer, deposit_liability to authenticated;

drop policy if exists provose_counters_read on provose_counters;
create policy provose_counters_read on provose_counters for select to authenticated using (is_manager_or_above());
drop policy if exists payer_split_read on payer_split;  drop policy if exists payer_split_write on payer_split;
create policy payer_split_read  on payer_split for select to authenticated using (true);
create policy payer_split_write on payer_split for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());
drop policy if exists invoice_read on invoice;  drop policy if exists invoice_write on invoice;
create policy invoice_read  on invoice for select to authenticated using (true);
create policy invoice_write on invoice for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());
drop policy if exists invoice_line_read on invoice_line;
create policy invoice_line_read on invoice_line for select to authenticated using (true);
drop policy if exists payment_read on payment;  drop policy if exists payment_write on payment;
create policy payment_read  on payment for select to authenticated using (true);
create policy payment_write on payment for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());

-- ---------- verification (SQL Editor runs as postgres = backend caller; see provose_is_backend) ----------
-- 1. build + finalize an invoice for one imported Lightspeed RO; expect the number 50001 and the RO's totals
-- select provose_finalize_invoice(provose_build_invoice(null, 'LS:41203', (select id from payer where name='Customer (self-pay)')));
-- select invoice_number, status, subtotal_taxable, subtotal_nontaxable, tax_total, total from invoice where external_ref='LS:41203';
-- 2. immutability: both of these MUST fail
-- update invoice set total = 1 where external_ref='LS:41203';
-- update ro_line set unit_price = 1 where id = (select ro_line_id from invoice_line limit 1);
