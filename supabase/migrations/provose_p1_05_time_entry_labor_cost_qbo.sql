-- =====================================================================
-- PROVOSE P1-05  --  true labor cost: staff worker_type/pay_type, time_entry, margin views, qbo_outbox
-- Session: Provose 200 (2026-10-10)   Spec: V2_DMS_DESIGN.md s3, s7, s10.1, s11.3
-- Requires P1-01..P1-04. Idempotent.
-- Formula (s10.1, locked): labor_cost = clock_hours x staff.hourly_rate x (1 + employee_burden_pct if employee).
-- Contractors: straight hourly. No per-person burden. Lightspeed's flat $175/hr cost is NOT migrated (s11.3).
-- Touches v1 `staff` ONLY by adding two defaulted columns (spec s10.1).
-- =====================================================================

-- ---------- staff: how each person is paid ----------
alter table staff add column if not exists worker_type text not null default 'employee'
  check (worker_type in ('employee','contractor'));
alter table staff add column if not exists pay_type text not null default 'hourly'
  check (pay_type in ('hourly','flat_rate'));   -- flat_rate modelled, unused (s10.1)

-- loaded cost rate per person, from config
create or replace function provose_cost_rate(p_staff_id uuid) returns numeric
language sql stable as $$
  select round(s.hourly_rate * (1 + case when s.worker_type = 'employee' then c.employee_burden_pct else 0 end), 4)
  from staff s cross join provose_config c where s.id = p_staff_id
$$;

create or replace function provose_labor_cost(p_staff_id uuid, p_hours numeric) returns numeric
language sql stable as $$ select round(coalesce(provose_cost_rate(p_staff_id), 0) * coalesce(p_hours, 0), 2) $$;

-- ---------- time_entry: shift / job / nonproductive (s3) ----------
create table if not exists time_entry (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references staff(id),
  entry_type      text not null default 'job' check (entry_type in ('shift','job','nonproductive')),
  job_id          uuid references ro_job(id) on delete set null,     -- v2: techs clock on JOBS
  ro_id           uuid references repair_orders(id) on delete set null, -- v1 RO link (carry-forward; S103 single-service clock)
  v1_time_log_id  uuid unique,                                         -- time_logs.id when imported
  started_at      timestamptz not null,
  ended_at        timestamptz,
  hours           numeric(8,3) generated always as (case when ended_at is null then null else round(extract(epoch from (ended_at - started_at)) / 3600.0, 3) end) stored,
  cost_rate       numeric(10,4) not null default 0,                  -- snapshot of provose_cost_rate at write
  labor_cost      numeric(12,2) generated always as (case when ended_at is null then null else round((extract(epoch from (ended_at - started_at)) / 3600.0) * cost_rate, 2) end) stored,
  activity        text,                                               -- nonproductive: shop_activity / training / cleanup ...
  notes           text,
  source          text not null default 'clock' check (source in ('clock','manual','v1_import')),
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint time_entry_order check (ended_at is null or ended_at >= started_at),
  constraint time_entry_job_link check (entry_type <> 'job' or job_id is not null or ro_id is not null)
);
create index if not exists time_entry_staff_idx on time_entry (staff_id, started_at desc);
create index if not exists time_entry_job_idx   on time_entry (job_id);
create index if not exists time_entry_ro_idx    on time_entry (ro_id);

create or replace function provose_time_entry_defaults() returns trigger
language plpgsql as $$
begin
  -- snapshot the loaded rate when the entry is created or its person changes; never silently on later edits
  if tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id or (old.cost_rate = 0 and new.cost_rate = 0) then
    new.cost_rate := coalesce(provose_cost_rate(new.staff_id), 0);
  end if;
  if new.created_by is null then new.created_by := auth.jwt()->>'email'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_time_entry_defaults on time_entry;
create trigger trg_time_entry_defaults before insert or update on time_entry for each row execute function provose_time_entry_defaults();
drop trigger if exists trg_time_entry_audit on time_entry;
create trigger trg_time_entry_audit after insert or update or delete on time_entry for each row execute function provose_audit();

-- ---------- v1 carry-forward: closed time_logs -> time_entry(type=job), matched by staff email ----------
-- Dry run first: select * from provose_import_v1_time_logs(true);
create or replace function provose_import_v1_time_logs(p_dry_run boolean default true)
returns table (candidates bigint, matched_staff bigint, already_imported bigint, inserted bigint)
language plpgsql security definer set search_path = public as $$
declare c bigint; m bigint; a bigint; i bigint := 0;
begin
  perform provose_require_manager();
  select count(*) into c from time_logs t where t.clock_out is not null;
  select count(*) into m from time_logs t join staff s on lower(s.email) = lower(t.tech_email) where t.clock_out is not null;
  select count(*) into a from time_logs t join time_entry e on e.v1_time_log_id = t.id;
  if not p_dry_run then
    insert into time_entry (staff_id, entry_type, ro_id, v1_time_log_id, started_at, ended_at, activity, notes, source, created_by)
    select s.id, case when t.ro_id is null then 'nonproductive' else 'job' end, t.ro_id, t.id, t.clock_in, t.clock_out,
           t.shop_activity, t.work_notes, 'v1_import', 'provose_import_v1_time_logs'
    from time_logs t join staff s on lower(s.email) = lower(t.tech_email)
    where t.clock_out is not null and t.clock_out >= t.clock_in
      and not exists (select 1 from time_entry e where e.v1_time_log_id = t.id);
    get diagnostics i = row_count;
  end if;
  return query select c, m, a, i;
end $$;

-- ---------- margin views (s7: labor GP%, effective labor rate, efficiency) ----------
create or replace view job_labor as
select j.id as job_id,
       coalesce(sum(e.hours), 0)      as clock_hours,
       coalesce(sum(e.labor_cost), 0) as labor_cost,
       count(e.id)                    as entries
from ro_job j left join time_entry e on e.job_id = j.id and e.entry_type = 'job' and e.ended_at is not null
group by j.id;

create or replace view ro_job_margin as
select t.*, jl.clock_hours, jl.labor_cost as true_labor_cost, j.flag_hours,
       t.parts_sale - t.parts_cost                       as parts_gp,
       t.labor_sale - jl.labor_cost                      as labor_gp,
       case when t.labor_sale <> 0 then round((t.labor_sale - jl.labor_cost) / t.labor_sale * 100, 1) end as labor_gp_pct,
       case when jl.clock_hours > 0 then round(t.labor_sale / jl.clock_hours, 2) end as effective_labor_rate,
       case when jl.clock_hours > 0 and j.flag_hours is not null then round(j.flag_hours / jl.clock_hours * 100, 1) end as efficiency_pct,
       (t.sale_total - t.parts_cost - t.sublet_cost - jl.labor_cost) as true_gross_profit
from ro_job_totals t join ro_job j on j.id = t.job_id join job_labor jl on jl.job_id = t.job_id;

-- per-RO labor cost from v1-linked entries too (before jobs exist for v1 ROs)
create or replace view ro_labor_v1 as
select ro_id, sum(hours) as clock_hours, sum(labor_cost) as labor_cost, count(*) as entries
from time_entry where ro_id is not null and entry_type = 'job' and ended_at is not null group by ro_id;

-- ---------- qbo_outbox: idempotent one-way sync queue (s3, s5; sender is Phase 1.x) ----------
create table if not exists qbo_outbox (
  id              bigint generated always as identity primary key,
  entity          text not null check (entity in ('invoice','payment','customer','credit')),
  entity_id       uuid not null,
  version         int  not null default 1,
  request_id      text not null unique,             -- entity_id:version = QBO RequestId (idempotency)
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending','sent','error','skipped')),
  attempts        int  not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists qbo_outbox_status_idx on qbo_outbox (status, next_attempt_at);

create or replace function provose_enqueue_qbo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v int; ent text := tg_table_name;
begin
  if ent = 'invoice' then
    if not (new.status in ('final','void') and (old is null or old.status is distinct from new.status)) then return new; end if;
  end if;
  select coalesce(max(version), 0) + 1 into v from qbo_outbox where entity = ent and entity_id = new.id;
  insert into qbo_outbox (entity, entity_id, version, request_id, payload)
    values (ent, new.id, v, new.id::text || ':' || v, to_jsonb(new));
  return new;
end $$;
drop trigger if exists trg_invoice_qbo on invoice;
create trigger trg_invoice_qbo after update on invoice for each row execute function provose_enqueue_qbo();
drop trigger if exists trg_payment_qbo on payment;
create trigger trg_payment_qbo after insert on payment for each row execute function provose_enqueue_qbo();

-- ---------- RLS + grants ----------
alter table time_entry enable row level security;
alter table qbo_outbox enable row level security;
revoke all on time_entry, qbo_outbox, job_labor, ro_job_margin, ro_labor_v1 from anon;
grant select, insert, update, delete on time_entry to authenticated;
grant select on qbo_outbox to authenticated;                        -- written by the definer trigger only
grant select on job_labor, ro_job_margin, ro_labor_v1 to authenticated;

drop policy if exists time_entry_read on time_entry; drop policy if exists time_entry_write_mgr on time_entry; drop policy if exists time_entry_write_own on time_entry;
create policy time_entry_read on time_entry for select to authenticated using (true);
create policy time_entry_write_mgr on time_entry for all to authenticated using (is_manager_or_above()) with check (is_manager_or_above());
-- a tech may write only their own entries (staff row matched by sign-in email; phone-only staff carry their key email)
create policy time_entry_write_own on time_entry for all to authenticated
  using (staff_id = (select id from staff where lower(email) = lower(auth.jwt()->>'email') limit 1))
  with check (staff_id = (select id from staff where lower(email) = lower(auth.jwt()->>'email') limit 1));

drop policy if exists qbo_outbox_read on qbo_outbox;
create policy qbo_outbox_read on qbo_outbox for select to authenticated using (is_sr_manager_or_admin());

-- ---------- verification ----------
-- select worker_type, pay_type, count(*) from staff group by 1,2;                 -- 23 employee/hourly (adjust contractors after)
-- select * from provose_import_v1_time_logs(true);                                -- dry run counts
-- smoke: 2.5 h on LS:41203 by the first active tech with a rate -> labor_cost = 2.5 x rate x 1.10
-- insert into time_entry (staff_id, entry_type, job_id, started_at, ended_at, source, notes)
-- select s.id, 'job', j.id, '2026-09-17 13:00+00', '2026-09-17 15:30+00', 'manual', 'P1-05 smoke'
-- from (select id from staff where active and hourly_rate > 0 and role='tech' order by name limit 1) s, (select id from ro_job where external_ref='LS:41203') j;
-- select clock_hours, true_labor_cost, labor_sale, labor_gp, labor_gp_pct, effective_labor_rate from ro_job_margin where external_ref='LS:41203';
-- delete from time_entry where notes='P1-05 smoke';
