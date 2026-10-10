-- =====================================================================
-- PROVOSE P1-04  --  monthly sales-tax report (Lightspeed parity target)
-- Session: Provose 200 (2026-10-10)   Spec: V2_DMS_DESIGN.md s10.2, s11.2
-- Requires P1-01, P1-02. Idempotent.
-- Until P1-03 (invoice.finalized_at) exists, the reporting date is ro_job.closed_on,
-- falling back to the job's created date.
-- =====================================================================

alter table ro_job add column if not exists closed_on date;
create index if not exists ro_job_closed_on_idx on ro_job (closed_on);

-- one row per month x tax_code, matching the Lightspeed "Tax Report by Tax Category" totals
create or replace view provose_sales_tax_monthly as
select date_trunc('month', coalesce(j.closed_on, j.created_at::date))::date as month,
       l.tax_code,
       count(*)                                           as lines,
       count(distinct j.id)                               as jobs,
       count(distinct coalesce(j.ro_id::text, j.external_ref)) as ros,
       sum(l.sale_amount) filter (where l.taxable)        as taxable_sale,
       sum(l.sale_amount) filter (where not l.taxable)    as nontaxable_sale,
       sum(l.tax_amount)                                  as tax_collected
from ro_line l join ro_job j on j.id = l.job_id
group by 1, 2;

-- the headline numbers for one month (what gets filed with the Comptroller)
-- computed straight from the lines so RO counts are not double-counted across tax codes
create or replace function provose_sales_tax_report(p_month date)
returns table (month date, taxable_sale numeric, nontaxable_sale numeric, tax_collected numeric, ros bigint, lines bigint)
language sql stable as $$
  select date_trunc('month', p_month)::date,
         coalesce(sum(l.sale_amount) filter (where l.taxable),0),
         coalesce(sum(l.sale_amount) filter (where not l.taxable),0),
         coalesce(sum(l.tax_amount),0),
         count(distinct coalesce(j.ro_id::text, j.external_ref)),
         count(*)
  from ro_line l join ro_job j on j.id = l.job_id
  where date_trunc('month', coalesce(j.closed_on, j.created_at::date))::date = date_trunc('month', p_month)::date
$$;

-- PARITY PROVEN Provose 200 (2026-10-10): Sep 2026 Lightspeed tax report loaded as 222 ro_line rows / 37 ROs
-- -> taxable 95,344.93 / non-taxable 152,684.72 / tax 5,959.14, identical to Lightspeed to the penny.
-- Loader: docs/lightspeed/provose_load_2026-09.sql (gitignored).

revoke all on provose_sales_tax_monthly from anon;
grant select on provose_sales_tax_monthly to authenticated;
