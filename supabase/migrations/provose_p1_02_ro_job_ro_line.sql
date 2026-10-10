-- =====================================================================
-- PROVOSE P1-02  --  ro_job + ro_line: the money model at the line
-- Session: Provose 200 (2026-10-10)   Spec: V2_DMS_DESIGN.md s3, s4, s11.1, s11.6
-- Requires P1-01. Side-by-side: a job may hang off a v1 repair_orders row
-- (ro_id) OR stand alone with an external_ref (Lightspeed import, parallel run).
-- Idempotent.
-- =====================================================================

-- ---------- ro_job: unit of approval, payer and hold (s3) ----------
create table if not exists ro_job (
  id                    uuid primary key default gen_random_uuid(),
  ro_id                 uuid references repair_orders(id) on delete restrict,
  external_ref          text,                       -- Lightspeed doc number during import / parallel run
  job_no                int  not null default 1,
  title                 text not null,
  description           text,
  silo                  text,                       -- department queue (v1 silo names)
  payer_id              uuid references payer(id),  -- filled by trigger: Customer (self-pay)
  approval_status       text not null default 'pending' check (approval_status in ('pending','approved','declined')),
  approved_at           timestamptz,
  approved_by           text,
  declined_reason       text,
  hold_reason           text not null default 'none' check (hold_reason in ('none','parts','adjuster','customer','sublet')),
  hold_started_at       timestamptz,
  flag_hours            numeric(8,2),
  estimate_version      int  not null default 1,
  labor_rate_type       provose_labor_rate_type not null default 'retail',
  shop_supplies_override numeric(10,2),             -- null = formula (5% of labor, cap $250); s11.6: editable
  sort_order            int  not null default 0,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ro_job_parent check (ro_id is not null or external_ref is not null)
);
create index if not exists ro_job_ro_idx  on ro_job (ro_id);
create index if not exists ro_job_ext_idx on ro_job (external_ref);

-- default payer + hold clock
create or replace function provose_ro_job_defaults() returns trigger
language plpgsql as $$
begin
  if new.payer_id is null then
    select id into new.payer_id from payer where payer_type='customer' and name='Customer (self-pay)' limit 1;
  end if;
  if tg_op = 'INSERT' then
    if new.hold_reason <> 'none' and new.hold_started_at is null then new.hold_started_at := now(); end if;
  elsif new.hold_reason is distinct from old.hold_reason then
    new.hold_started_at := case when new.hold_reason = 'none' then null else now() end;
  end if;
  if new.approval_status = 'approved' and (old is null or old.approval_status <> 'approved') and new.approved_at is null then
    new.approved_at := now();
    new.approved_by := coalesce(new.approved_by, auth.jwt()->>'email');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_ro_job_defaults on ro_job;
create trigger trg_ro_job_defaults before insert or update on ro_job for each row execute function provose_ro_job_defaults();
drop trigger if exists trg_ro_job_audit on ro_job;
create trigger trg_ro_job_audit after insert or update or delete on ro_job for each row execute function provose_audit();

-- ---------- ro_line: every money line, cost + sale, signed (s3, s11.6) ----------
create table if not exists ro_line (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references ro_job(id) on delete cascade,
  line_type             provose_line_type not null,
  subtype               text,                       -- part: accessory | fee: shop_supplies, shipping_handling, admin | ...
  description           text not null,
  part_number           text,
  vendor                text,
  tech_staff_id         uuid references staff(id),  -- labor attribution (s11.6: every labor line names the tech)
  unit                  provose_unit not null default 'each',   -- labor defaults to hour (trigger)
  qty                   numeric(12,3) not null default 1 check (qty <> 0),
  unit_cost             numeric(12,2) not null default 0,
  unit_price            numeric(12,2) not null default 0,       -- signed: credits are negative prices
  discount_amount       numeric(12,2) not null default 0,       -- per-line discount (s11.6 torsion kit $5)
  price_overrides_hours boolean not null default false,         -- s11.6: price typed, hours derived
  labor_rate_type       provose_labor_rate_type,                -- null = inherit job
  taxable               boolean,                                -- resolved by trigger from taxability if null
  tax_code              text references tax_code(code),
  tax_rate              numeric(6,4) not null default 0,        -- snapshot of tax_code.rate at write time
  core_charge           numeric(12,2) not null default 0,
  freight               numeric(12,2) not null default 0,
  -- generated money (PG rule: a generated column may not reference another generated column)
  sale_amount           numeric(12,2) generated always as (round(qty * unit_price, 2) - discount_amount) stored,
  cost_amount           numeric(12,2) generated always as (round(qty * unit_cost, 2) + core_charge + freight) stored,
  -- s11.6: tax is charged on the UNDISCOUNTED price today (CPA Q5). Change here when the CPA answers.
  tax_amount            numeric(12,2) generated always as (case when taxable then round(round(qty * unit_price, 2) * tax_rate, 2) else 0 end) stored,
  source                text not null default 'manual' check (source in ('manual','ai_draft','kit','lightspeed_import')),
  import_ref            text,                                   -- e.g. 'LS:41348:PAM'
  sort_order            int  not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ro_line_job_idx on ro_line (job_id);
create index if not exists ro_line_import_idx on ro_line (import_ref);

-- resolve unit / taxability / tax_rate on every write
create or replace function provose_ro_line_defaults() returns trigger
language plpgsql as $$
declare r record;
begin
  if new.line_type = 'labor' and tg_op = 'INSERT' and new.unit = 'each' then new.unit := 'hour'; end if;
  if new.taxable is null or new.tax_code is null
     or tg_op = 'INSERT'
     or new.line_type is distinct from old.line_type or new.subtype is distinct from old.subtype then
    select * into r from provose_resolve_tax(new.line_type, new.subtype);
    if new.taxable is null then new.taxable := coalesce(r.taxable, false); end if;
    if new.tax_code is null then new.tax_code := coalesce(r.tax_code, 'NONE'); end if;
  end if;
  select rate into new.tax_rate from tax_code where code = new.tax_code;
  new.tax_rate := coalesce(new.tax_rate, 0);
  if not new.taxable then new.tax_rate := 0; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_ro_line_defaults on ro_line;
create trigger trg_ro_line_defaults before insert or update on ro_line for each row execute function provose_ro_line_defaults();
drop trigger if exists trg_ro_line_audit on ro_line;
create trigger trg_ro_line_audit after insert or update or delete on ro_line for each row execute function provose_audit();

-- ---------- shop supplies: formula by default, editable per job, always a real taxable line ----------
create or replace function provose_shop_supplies_amount(p_job_id uuid) returns numeric
language sql stable as $$
  select coalesce(j.shop_supplies_override,
         least(round(coalesce(sum(l.sale_amount) filter (where l.line_type = 'labor'), 0) * c.shop_supplies_pct, 2), c.shop_supplies_cap))
  from ro_job j cross join provose_config c
  left join ro_line l on l.job_id = j.id
  where j.id = p_job_id
  group by j.shop_supplies_override, c.shop_supplies_pct, c.shop_supplies_cap
$$;

create or replace function provose_apply_shop_supplies(p_job_id uuid) returns uuid
language plpgsql as $$
declare amt numeric; lid uuid;
begin
  amt := provose_shop_supplies_amount(p_job_id);
  select id into lid from ro_line where job_id = p_job_id and line_type = 'fee' and subtype = 'shop_supplies' limit 1;
  if amt is null or amt = 0 then
    if lid is not null then delete from ro_line where id = lid; end if;
    return null;
  end if;
  if lid is null then
    insert into ro_line (job_id, line_type, subtype, description, qty, unit_price, sort_order)
      values (p_job_id, 'fee', 'shop_supplies', 'Shop Supplies', 1, amt, 900) returning id into lid;
  else
    update ro_line set qty = 1, unit_price = amt where id = lid;
  end if;
  return lid;
end $$;

-- ---------- totals views (s7 feeds; invoice snapshot comes in P1-03) ----------
create or replace view ro_job_totals as
select j.id as job_id, j.ro_id, j.external_ref, j.job_no, j.title, j.payer_id, j.approval_status, j.hold_reason,
  coalesce(sum(l.sale_amount) filter (where l.line_type='part'),0)     as parts_sale,
  coalesce(sum(l.cost_amount) filter (where l.line_type='part'),0)     as parts_cost,
  coalesce(sum(l.sale_amount) filter (where l.line_type='labor'),0)    as labor_sale,
  coalesce(sum(l.cost_amount) filter (where l.line_type='labor'),0)    as labor_cost,
  coalesce(sum(l.qty)         filter (where l.line_type='labor' and l.unit='hour'),0) as labor_hours,
  coalesce(sum(l.sale_amount) filter (where l.line_type='sublet'),0)   as sublet_sale,
  coalesce(sum(l.cost_amount) filter (where l.line_type='sublet'),0)   as sublet_cost,
  coalesce(sum(l.sale_amount) filter (where l.line_type='fee'),0)      as fees,
  coalesce(sum(l.sale_amount) filter (where l.line_type='discount'),0) as discounts,
  coalesce(sum(l.sale_amount),0)                                        as sale_total,
  coalesce(sum(l.cost_amount),0)                                        as cost_total,
  coalesce(sum(l.sale_amount) filter (where l.taxable),0)              as taxable_sale,
  coalesce(sum(l.sale_amount) filter (where not l.taxable),0)          as nontaxable_sale,
  coalesce(sum(l.tax_amount),0)                                         as tax_total,
  coalesce(sum(l.sale_amount),0) - coalesce(sum(l.cost_amount),0)       as gross_profit
from ro_job j left join ro_line l on l.job_id = j.id
group by j.id;

create or replace view ro_totals as
select coalesce(ro_id::text, 'ext:' || external_ref) as ro_key, ro_id, external_ref,
  count(*) as jobs,
  sum(parts_sale) parts_sale, sum(parts_cost) parts_cost, sum(labor_sale) labor_sale, sum(labor_cost) labor_cost,
  sum(labor_hours) labor_hours, sum(sublet_sale) sublet_sale, sum(sublet_cost) sublet_cost,
  sum(fees) fees, sum(discounts) discounts,
  sum(sale_total) sale_total, sum(cost_total) cost_total, sum(taxable_sale) taxable_sale,
  sum(nontaxable_sale) nontaxable_sale, sum(tax_total) tax_total, sum(sale_total) + sum(tax_total) as grand_total,
  sum(gross_profit) gross_profit
from ro_job_totals
group by 1, 2, 3;

-- ---------- RLS + grants ----------
alter table ro_job  enable row level security;
alter table ro_line enable row level security;
revoke all on ro_job, ro_line, ro_job_totals, ro_totals from anon;
grant select, insert, update, delete on ro_job, ro_line to authenticated;
grant select on ro_job_totals, ro_totals to authenticated;

drop policy if exists ro_job_read  on ro_job;
drop policy if exists ro_job_write on ro_job;
create policy ro_job_read  on ro_job for select to authenticated using (true);
create policy ro_job_write on ro_job for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());

drop policy if exists ro_line_read  on ro_line;
drop policy if exists ro_line_write on ro_line;
create policy ro_line_read  on ro_line for select to authenticated using (true);
create policy ro_line_write on ro_line for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());

-- ---------- verification (expect: parts 1250.00, labor 390.00, hours 2, fees 169.50, taxable 1269.50, nontaxable 540.00, tax 79.35, grand 1888.85) ----------
-- with j as (insert into ro_job (external_ref, title) values ('TEST-P102','Smoke test') returning id)
-- insert into ro_line (job_id, line_type, subtype, description, qty, unit_cost, unit_price, discount_amount)
-- select id,'part',null,'Converter',1,800,1250,0 from j union all
-- select id,'labor',null,'Install converter',2,0,195,0 from j union all
-- select id,'fee','shipping_handling','Shipping & Handling',1,0,150,0 from j;
-- select provose_apply_shop_supplies((select id from ro_job where external_ref='TEST-P102'));
-- select parts_sale, labor_sale, labor_hours, fees, taxable_sale, nontaxable_sale, tax_total, grand_total from ro_totals where external_ref='TEST-P102';
-- delete from ro_job where external_ref='TEST-P102';
