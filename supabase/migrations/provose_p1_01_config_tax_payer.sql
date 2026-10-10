-- =====================================================================
-- PROVOSE P1-01  --  shop config, tax codes, taxability rules, payers
-- Session: Provose 200 (2026-10-10)   Spec: docs/specs/V2_DMS_DESIGN.md s3, s10, s11
-- Side-by-side with v1: nothing here touches an existing table.
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------- enums (locked vocabulary, spec s3/s4) ----------
do $$ begin
  if not exists (select 1 from pg_type where typname='provose_line_type') then
    create type provose_line_type as enum ('labor','part','sublet','fee','discount');
  end if;
  if not exists (select 1 from pg_type where typname='provose_payer_type') then
    create type provose_payer_type as enum ('customer','insurance','warranty','internal');
  end if;
  if not exists (select 1 from pg_type where typname='provose_unit') then
    create type provose_unit as enum ('hour','ft','each');
  end if;
  if not exists (select 1 from pg_type where typname='provose_labor_rate_type') then
    create type provose_labor_rate_type as enum ('retail','insurance','flat');
  end if;
end $$;

-- ---------- generic audit log + trigger (extends the v1 audit pattern to every money table) ----------
create table if not exists provose_audit_log (
  id            bigint generated always as identity primary key,
  table_name    text        not null,
  row_id        uuid,
  action        text        not null check (action in ('INSERT','UPDATE','DELETE')),
  old_row       jsonb,
  new_row       jsonb,
  changed_by    uuid,
  changed_email text,
  changed_at    timestamptz not null default now()
);
create index if not exists provose_audit_log_table_row_idx on provose_audit_log (table_name, row_id, changed_at desc);

create or replace function provose_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if tg_op = 'DELETE' then
    begin rid := (to_jsonb(old)->>'id')::uuid; exception when others then rid := null; end;
    insert into provose_audit_log(table_name,row_id,action,old_row,changed_by,changed_email)
      values (tg_table_name, rid, tg_op, to_jsonb(old), auth.uid(), auth.jwt()->>'email');
    return old;
  else
    begin rid := (to_jsonb(new)->>'id')::uuid; exception when others then rid := null; end;
    insert into provose_audit_log(table_name,row_id,action,old_row,new_row,changed_by,changed_email)
      values (tg_table_name, rid, tg_op,
              case when tg_op='UPDATE' then to_jsonb(old) end, to_jsonb(new),
              auth.uid(), auth.jwt()->>'email');
    return new;
  end if;
end $$;

create or replace function provose_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- shop config (singleton; spec s10.1, s11) ----------
create table if not exists provose_config (
  id                        int  primary key check (id = 1),
  shop_name                 text not null default 'Patriots RV Services',
  employee_burden_pct       numeric(6,4) not null default 0.1000,  -- s10.1: FICA+FUTA+TX SUTA, employees only
  sales_tax_rate            numeric(6,4) not null default 0.0625,  -- s11.2: TX state only as practised (CPA Q4 open)
  shop_supplies_pct         numeric(6,4) not null default 0.0500,  -- s11.1: 5% of labor ...
  shop_supplies_cap         numeric(10,2) not null default 250.00, -- ... capped at $250 per job
  labor_rate_retail         numeric(10,2) not null default 195.00, -- s11.6
  labor_rate_insurance      numeric(10,2) not null default 165.00, -- s11.6 (Lynn: insurance vs paint/body - open)
  labor_billing_increment   numeric(5,2)  not null default 0.25,   -- s11.1: 0.25 hr steps
  accessory_markup_divisor  numeric(6,4)  not null default 0.7500, -- s11.5: price = cost / 0.75
  updated_at                timestamptz not null default now()
);
insert into provose_config (id) values (1) on conflict (id) do nothing;

-- ---------- tax codes (s11.2: exactly two in practice) ----------
create table if not exists tax_code (
  code        text primary key,
  description text not null,
  rate        numeric(6,4) not null check (rate >= 0 and rate < 1),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
insert into tax_code (code, description, rate) values
  ('TX_STATE', 'Texas state sales tax (as collected today; local rate = CPA Q4)', 0.0625),
  ('NONE',     'Not taxable', 0)
on conflict (code) do nothing;

-- ---------- taxability rules: (line_type, subtype) -> taxable + tax_code  (s10.2 + s11.2/11.6) ----------
create table if not exists taxability (
  line_type   provose_line_type not null,
  subtype     text not null default '*',       -- '*' = any; fee codes: shop_supplies, shipping_handling, admin ...
  taxable     boolean not null,
  tax_code    text not null references tax_code(code),
  basis       text not null default 'lightspeed_sep_2026',  -- where the rule came from
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (line_type, subtype)
);
insert into taxability (line_type, subtype, taxable, tax_code, note) values
  ('part',     '*',                 true,  'TX_STATE', 'PAM: parts & materials taxed (s11.2)'),
  ('part',     'accessory',         true,  'TX_STATE', 'ACC: accessories taxed (s11.2)'),
  ('labor',    '*',                 false, 'NONE',     'SLB: labor never taxed (s11.2)'),
  ('sublet',   '*',                 false, 'NONE',     'Provisional: sublet rides inside SLB today (s11.4); CPA'),
  ('fee',      'shop_supplies',     true,  'TX_STATE', 'SSS: shop supplies taxed (s11.2, s11.6)'),
  ('fee',      'shipping_handling', false, 'NONE',     'SM4 = Shipping & Handling, untaxed (s11.6)'),
  ('fee',      'admin',             false, 'NONE',     'Administrative fee outside the tax base (s11.6)'),
  ('fee',      '*',                 false, 'NONE',     'Default for unknown fee codes; review'),
  ('discount', '*',                 false, 'NONE',     'Discounts applied after tax today (s11.6; CPA Q5)')
on conflict (line_type, subtype) do nothing;

-- resolver: the one place that decides if a line is taxable
create or replace function provose_resolve_tax(p_type provose_line_type, p_subtype text)
returns table (taxable boolean, tax_code text, rate numeric)
language sql stable as $$
  select t.taxable, t.tax_code, c.rate
  from taxability t join tax_code c on c.code = t.tax_code
  where t.line_type = p_type and t.subtype in (coalesce(p_subtype,'*'), '*')
  order by case when t.subtype = '*' then 1 else 0 end
  limit 1
$$;

-- ---------- payers (s3, s10.4: net-new; invisible in Lightspeed) ----------
create table if not exists payer (
  id          uuid primary key default gen_random_uuid(),
  payer_type  provose_payer_type not null,
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  qbo_id      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (payer_type, name)
);
insert into payer (payer_type, name, notes) values
  ('customer', 'Customer (self-pay)', 'Default payer for every job unless split'),
  ('internal', 'PRVS Internal',       'Shop-paid work: warranty-of-our-work, goodwill, internal units')
on conflict (payer_type, name) do nothing;

-- ---------- triggers ----------
drop trigger if exists trg_provose_config_audit on provose_config;
create trigger trg_provose_config_audit after insert or update or delete on provose_config for each row execute function provose_audit();
drop trigger if exists trg_provose_config_touch on provose_config;
create trigger trg_provose_config_touch before update on provose_config for each row execute function provose_touch_updated_at();

drop trigger if exists trg_tax_code_audit on tax_code;
create trigger trg_tax_code_audit after insert or update or delete on tax_code for each row execute function provose_audit();
drop trigger if exists trg_taxability_audit on taxability;
create trigger trg_taxability_audit after insert or update or delete on taxability for each row execute function provose_audit();
drop trigger if exists trg_payer_audit on payer;
create trigger trg_payer_audit after insert or update or delete on payer for each row execute function provose_audit();
drop trigger if exists trg_payer_touch on payer;
create trigger trg_payer_touch before update on payer for each row execute function provose_touch_updated_at();

-- ---------- RLS + explicit grants (Supabase default public grants end 2026-10-30) ----------
alter table provose_audit_log enable row level security;
alter table provose_config    enable row level security;
alter table tax_code          enable row level security;
alter table taxability        enable row level security;
alter table payer             enable row level security;

revoke all on provose_audit_log, provose_config, tax_code, taxability, payer from anon;
grant select on provose_audit_log to authenticated;                      -- RLS narrows to sr_manager/admin
grant select, update on provose_config to authenticated;
grant select, insert, update on tax_code, taxability, payer to authenticated;

-- audit log: readable by sr_manager/admin only; written only by the definer trigger
drop policy if exists provose_audit_log_read on provose_audit_log;
create policy provose_audit_log_read on provose_audit_log for select to authenticated using (is_sr_manager_or_admin());

-- config + tax tables: all staff read, sr_manager/admin write
drop policy if exists provose_config_read  on provose_config;
drop policy if exists provose_config_write on provose_config;
create policy provose_config_read  on provose_config for select to authenticated using (true);
create policy provose_config_write on provose_config for update to authenticated using (is_sr_manager_or_admin()) with check (is_sr_manager_or_admin());

drop policy if exists tax_code_read  on tax_code;
drop policy if exists tax_code_write on tax_code;
create policy tax_code_read  on tax_code for select to authenticated using (true);
create policy tax_code_write on tax_code for all to authenticated using (is_sr_manager_or_admin()) with check (is_sr_manager_or_admin());

drop policy if exists taxability_read  on taxability;
drop policy if exists taxability_write on taxability;
create policy taxability_read  on taxability for select to authenticated using (true);
create policy taxability_write on taxability for all to authenticated using (is_sr_manager_or_admin()) with check (is_sr_manager_or_admin());

-- payers: all staff read, manager+ write (service writers add carriers)
drop policy if exists payer_read  on payer;
drop policy if exists payer_write on payer;
create policy payer_read  on payer for select to authenticated using (true);
create policy payer_write on payer for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());

-- ---------- verification (run after apply; expect 1 / 2 / 9 / 2) ----------
-- select (select count(*) from provose_config), (select count(*) from tax_code), (select count(*) from taxability), (select count(*) from payer);
-- select * from provose_resolve_tax('fee','shop_supplies');   -- true, TX_STATE, 0.0625
-- select * from provose_resolve_tax('fee','something_new');   -- false, NONE, 0  (falls back to '*')
