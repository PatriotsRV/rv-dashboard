-- ============================================================================
-- aeroarmor_cost_model_s179.sql — Session 179 (2026-08-23)
--
-- AeroArmor Solar Shield roof PROFIT MARGIN CALCULATOR (aeroarmor-calculator.html).
-- First of a planned family of per-product true-cost pricing pages.
--
-- THREE tables:
--   1. aeroarmor_cost_items — the editable cost catalog (Ryan maintains prices
--      here; no code change needed to reprice).
--   2. aeroarmor_config     — key/value knobs (density, default thickness,
--      target margin, labor rate placeholder).
--   3. aeroarmor_jobs       — logged ACTUAL jobs, so the true cost is built from
--      a growing history rather than one sheet. Seeded with Ryan's two
--      hand-written analysis sheets (Benham/Delta 27ft, Southard/Premier 26ft).
--
-- RLS: is_sr_manager_or_admin() on everything. Ryan (Sr Manager) can edit the
-- catalog; Roland (Admin) sees all. No anon access — this is internal costing
-- data and must never be readable from the public site.
--
-- S124 note: explicit grants included (Supabase is dropping default
-- public-schema Data API grants for new tables after 2026-10-30).
-- Idempotent: safe to re-run.
--
-- NOTE: no cashiered twin / archive_one_ro change needed — these tables are
-- standalone and are NOT columns on repair_orders (S171 lesson does not apply).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. COST CATALOG
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists aeroarmor_cost_items (
  id           uuid primary key default gen_random_uuid(),
  item_key     text not null,
  label        text not null,
  category     text not null,   -- 'consumable' | 'polyurea'
  scope        text not null,   -- 'fixed' | 'per_linear_ft' | 'per_lb'
  unit         text not null,   -- 'each' | 'ft' | 'lb'
  unit_cost    numeric(12,4) not null default 0,
  default_qty  numeric(12,3) not null default 0,
  sort_order   int not null default 100,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  constraint aeroarmor_cost_items_key_unique unique (item_key),
  constraint aeroarmor_cost_items_category_ck check (category in ('consumable','polyurea')),
  constraint aeroarmor_cost_items_scope_ck    check (scope in ('fixed','per_linear_ft','per_lb')),
  constraint aeroarmor_cost_items_cost_ck     check (unit_cost >= 0),
  constraint aeroarmor_cost_items_qty_ck      check (default_qty >= 0)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CONFIG (key/value)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists aeroarmor_config (
  key         text primary key,
  value       numeric(12,4) not null,
  label       text not null,
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LOGGED ACTUAL JOBS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists aeroarmor_jobs (
  id                 uuid primary key default gen_random_uuid(),
  job_date           date,
  customer_name      text not null,
  unit               text,
  ro_id              text,              -- optional link to repair_orders.ro_id (text, not FK — historical jobs may predate the RO)
  length_ft          numeric(8,2) not null,
  width_ft           numeric(8,2) not null default 8,
  -- measured drum weights (total lbs actually sprayed, A + B)
  base_lbs_a         numeric(10,2),
  base_lbs_b         numeric(10,2),
  top_lbs_a          numeric(10,2),
  top_lbs_b          numeric(10,2),
  -- computed money (stored as calculated at save time, so history is immutable
  -- even after Ryan reprices the catalog)
  consumables_total  numeric(12,2),
  base_cost          numeric(12,2),
  top_cost           numeric(12,2),
  polyurea_total     numeric(12,2),
  labor_hours        numeric(8,2) default 0,
  labor_cost         numeric(12,2) default 0,
  grand_total        numeric(12,2),
  price_charged      numeric(12,2),     -- nullable — fill in to get real margin
  inputs             jsonb,             -- full snapshot of every input + catalog price used
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         text,
  constraint aeroarmor_jobs_length_ck check (length_ft > 0),
  constraint aeroarmor_jobs_width_ck  check (width_ft  > 0)
);

create index if not exists idx_aeroarmor_jobs_date on aeroarmor_jobs (job_date desc nulls last);

-- ────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (S115 pattern — set_updated_at() already exists)
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_aeroarmor_cost_items_updated_at'
                   and tgrelid = 'aeroarmor_cost_items'::regclass) then
    create trigger trg_aeroarmor_cost_items_updated_at
      before update on aeroarmor_cost_items
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_aeroarmor_config_updated_at'
                   and tgrelid = 'aeroarmor_config'::regclass) then
    create trigger trg_aeroarmor_config_updated_at
      before update on aeroarmor_config
      for each row execute function set_updated_at();
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — Sr Manager + Admin only, on all three tables
-- ────────────────────────────────────────────────────────────────────────────
alter table aeroarmor_cost_items enable row level security;
alter table aeroarmor_config     enable row level security;
alter table aeroarmor_jobs       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['aeroarmor_cost_items','aeroarmor_config','aeroarmor_jobs'] loop
    execute format('drop policy if exists %I on %I', t||'_srmgr_select', t);
    execute format('drop policy if exists %I on %I', t||'_srmgr_insert', t);
    execute format('drop policy if exists %I on %I', t||'_srmgr_update', t);
    execute format('drop policy if exists %I on %I', t||'_srmgr_delete', t);

    execute format('create policy %I on %I for select to authenticated using (is_sr_manager_or_admin())',            t||'_srmgr_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_sr_manager_or_admin())',       t||'_srmgr_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_sr_manager_or_admin()) with check (is_sr_manager_or_admin())', t||'_srmgr_update', t);
    execute format('create policy %I on %I for delete to authenticated using (is_sr_manager_or_admin())',            t||'_srmgr_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on aeroarmor_cost_items to authenticated;
grant select, insert, update, delete on aeroarmor_config     to authenticated;
grant select, insert, update, delete on aeroarmor_jobs       to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- SEED — cost catalog, straight off Ryan's two sheets (2026-08 pricing)
--
-- Every consumable EXCEPT felt was identical on both sheets, so those are
-- modelled as FIXED (qty x unit cost) with the sheet quantity as the default.
-- Felt is the one line that tracks length: $6.02 per linear foot.
--   Benham   27ft: 377.88 fixed + 27 x 6.02 = 540.42  (sheet says 540.42) OK
--   Southard 26ft: 377.88 fixed + 26 x 6.02 = 534.40  (sheet says 534.40) OK
-- ────────────────────────────────────────────────────────────────────────────
insert into aeroarmor_cost_items (item_key, label, category, scope, unit, unit_cost, default_qty, sort_order, notes) values
  ('felt',         'Felt',              'consumable', 'per_linear_ft', 'ft',   6.0200, 1,  10, 'Scales with roof length. Only length-driven consumable on Ryan''s sheets.'),
  ('solar_boxes',  'Solar Boxes',       'consumable', 'fixed',         'each', 7.1700, 1,  20, null),
  ('polycaulk',    'Polycaulk',         'consumable', 'fixed',         'each', 9.8300, 4,  30, null),
  ('screws',       'Screws',            'consumable', 'fixed',         'each', 32.2700, 1, 40, null),
  ('tape_rolls',   'Tape Rolls',        'consumable', 'fixed',         'each', 6.6700, 1,  50, null),
  ('gutters',      'Gutters',           'consumable', 'fixed',         'each', 7.3300, 2,  60, 'Sold as 2pk on the sheet; unit cost is per each.'),
  ('foil_tape',    'Foil Tape',         'consumable', 'fixed',         'each', 16.4700, 1, 70, null),
  ('wiretape',     'Wire Tape',         'consumable', 'fixed',         'each', 5.1800, 1,  80, null),
  ('silicone',     'Silicone',          'consumable', 'fixed',         'each', 9.6500, 2,  90, null),
  ('plastic_bag',  'Plastic Bag (mask)','consumable', 'fixed',         'ft',   0.0600, 80,100, 'Masking. 80 ft on both sheets; likely tracks perimeter on longer units.'),
  ('dicor_glue',   'Dicor Glue',        'consumable', 'fixed',         'each', 116.0200, 2,110,'LARGEST single consumable — 43% of consumables, ~13% of total job cost.'),
  ('poly_9700',    '9700 Aromatic Base Coat', 'polyurea', 'per_lb', 'lb', 5.7000, 0, 200, 'Price per lb, applied to A and B equally (1:1 plural component).'),
  ('poly_5700',    '5700 Aliphatic Top Coat', 'polyurea', 'per_lb', 'lb', 5.8600, 0, 210, 'Price per lb, applied to A and B equally (1:1 plural component).')
on conflict (item_key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- SEED — config
--
-- BASE/TOP mils defaults are CALIBRATED FROM THE TWO MEASURED SHEETS, not from
-- a product datasheet. Because they are derived from drum start-minus-finish
-- weights, they ALREADY INCLUDE overspray, purge and waste. That is why
-- waste_pct defaults to 0 — adding a waste factor on top of a scale-measured
-- rate would double-count it.
--
--   Benham   216 sqft: base 120 lb -> 0.5556 lb/sqft -> 101.9 mils
--                      top   96 lb -> 0.4444 lb/sqft ->  81.5 mils
--   Southard 208 sqft: base 126 lb -> 0.6058 lb/sqft -> 111.1 mils
--                      top  97.2 lb -> 0.4673 lb/sqft ->  85.7 mils
--   Blended default:   base ~106 mils, top ~84 mils
-- ────────────────────────────────────────────────────────────────────────────
insert into aeroarmor_config (key, value, label, notes) values
  ('density_lb_per_gal', 8.7500, 'Polyurea density (lb/gal)',       'approx 1.05 g/cc. Drives mils <-> lbs. 1 gal @ 1 mil covers 1604 sqft.'),
  ('default_width_ft',   8.0000, 'Default roof width (ft)',         'Every RV PRVS works on is 8 ft wide — length is the real variable.'),
  ('base_mils',        106.0000, 'Base coat applied thickness (mils)','Calibrated from measured drum weights on the Benham + Southard sheets. Includes waste.'),
  ('top_mils',          84.0000, 'Top coat applied thickness (mils)','Calibrated from measured drum weights. SEE THE FLAG — this looks far thicker than an aliphatic top coat should run.'),
  ('waste_pct',          0.0000, 'Extra waste factor (%)',          'Defaults to 0 ON PURPOSE: the mils defaults are scale-derived and already contain waste. Only raise this if you switch to datasheet theoretical coverage.'),
  ('target_margin_pct', 55.0000, 'Target gross margin (%)',         'Drives the cost-up suggested price. Tune freely.'),
  ('labor_rate_per_hr',  0.0000, 'Labor rate ($/hr) — PLACEHOLDER', 'Set to 0 for now per Roland S179. Slot reserved to be fed from the tech check-in page (time_logs) later.')
on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- SEED — Ryan's two hand-written analysis sheets, as the first history rows.
-- Both reconcile to the penny against the handwritten grand totals.
-- ────────────────────────────────────────────────────────────────────────────
insert into aeroarmor_jobs
  (customer_name, unit, length_ft, width_ft,
   base_lbs_a, base_lbs_b, top_lbs_a, top_lbs_b,
   consumables_total, base_cost, top_cost, polyurea_total,
   labor_hours, labor_cost, grand_total, notes)
select 'Southard', 'Premier', 26, 8,
       63.0, 63.0, 48.6, 48.6,
       534.40, 718.20, 569.60, 1287.80,
       0, 0, 1822.20,
       'Seeded from Ryan''s handwritten POLYUREA ROOF COST ANALYZATION REPORT. Verified: consumables 534.40, polyurea 1287.80, grand total 1822.20 all reconcile. Drum chain shows this job ran BEFORE Benham (its finish weights are Benham''s start weights).'
where not exists (select 1 from aeroarmor_jobs where customer_name = 'Southard' and length_ft = 26);

insert into aeroarmor_jobs
  (customer_name, unit, length_ft, width_ft,
   base_lbs_a, base_lbs_b, top_lbs_a, top_lbs_b,
   consumables_total, base_cost, top_cost, polyurea_total,
   labor_hours, labor_cost, grand_total, notes)
select 'Benham', 'Delta', 27, 8,
       60.0, 60.0, 48.0, 48.0,
       540.42, 684.00, 562.56, 1246.56,
       0, 0, 1786.98,
       'Seeded from Ryan''s handwritten POLYUREA ROOF COST ANALYZATION REPORT. Verified: consumables 540.42, polyurea 1246.56, grand total 1786.98 all reconcile.'
where not exists (select 1 from aeroarmor_jobs where customer_name = 'Benham' and length_ft = 27);

COMMIT;

-- ============================================================================
-- VERIFY (run after)
-- ============================================================================
-- select item_key, label, scope, unit_cost, default_qty from aeroarmor_cost_items order by sort_order;
-- select key, value, label from aeroarmor_config order by key;
-- select customer_name, length_ft, consumables_total, polyurea_total, grand_total,
--        round(grand_total / length_ft, 2)              as cost_per_linear_ft,
--        round(grand_total / (length_ft * width_ft), 2) as cost_per_sq_ft
--   from aeroarmor_jobs order by length_ft;
-- ============================================================================
