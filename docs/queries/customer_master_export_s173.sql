-- ============================================================================
-- Customer Master Export  (Session 173, 2026-08-12)
-- ----------------------------------------------------------------------------
-- Roland's ask: "every customer we have ever dealt with" -- first + last name,
-- phone, email, zip.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor, hit Run,
-- then click "Download CSV" above the results grid.
--
-- DO NOT run this through the Supabase MCP. Every row an MCP query returns has
-- to pass through Claude's context and then be re-emitted to become a file --
-- roughly 2x the payload, ~100K tokens for this result set. See the S173
-- Known Issue in CLAUDE_CONTEXT.md. MCP is for counts, schema and spot checks.
--
-- SOURCES (these are the only three tables holding customer contact data):
--   repair_orders  -- active ROs      (name, phone, email, address)
--   cashiered      -- archived ROs    (name, phone, email, address)
--   conversations  -- messages board  (name, phone, email; NO address column)
--
-- Dedupe key = last 10 digits of the phone. Field precedence RO > cashiered >
-- conversations. Staff numbers excluded via staff.phone_number.
--
-- MEASURED AT WRITE TIME (2026-08-12):
--   3,262 unique customers
--     phone  3,262 (100%)   name 3,017 (92%)
--     email    237 (7%)     zip   167 (5%)
--     all four 159 (4.9%)
--   Email and zip are thin because ~3,000 of the 3,262 are Kenect-import
--   conversations rows carrying name + phone only.
--
-- KNOWN DEFECTS IN THE UNDERLYING DATA (see the S173 TODO row):
--   1. Some conversations.customer_name values are raw phone numbers.
--   2. Placeholder names: NeedLastName, UNKNOWN, "bad number scottbowman".
--   3. Vendors mixed in: Call Rail, Conversionly Marketing, Denton Appliance.
--   4. Typo twins -- one person under two numbers one digit apart.
-- ============================================================================

with u as (
  select customer_name                                                  as nm,
         right(regexp_replace(coalesce(phone,''),'\D','','g'),10)        as ph,
         nullif(trim(lower(email)),'')                                   as em,
         nullif(trim(address),'')                                        as addr,
         3                                                               as pr
  from repair_orders
  union all
  select customer_name,
         right(regexp_replace(coalesce(phone,''),'\D','','g'),10),
         nullif(trim(lower(email)),''),
         nullif(trim(address),''),
         2
  from cashiered
  union all
  select customer_name,
         right(regexp_replace(coalesce(phone_key,''),'\D','','g'),10),
         nullif(trim(lower(email)),''),
         null,
         1
  from conversations
),
f as (select * from u where length(ph) = 10),
sp as (
  select right(regexp_replace(coalesce(phone_number,''),'\D','','g'),10) as p
  from staff where phone_number is not null
),
m as (
  select ph,
    (array_agg(nullif(trim(regexp_replace(nm,'\s+',' ','g')),'') order by pr desc)
       filter (where nullif(trim(nm),'') is not null))[1]                as nm,
    min(em) filter (where em is not null)                                as em,
    (array_agg(nullif(trim(regexp_replace(addr,'[\s\r\n]+',' ','g')),'') order by pr desc)
       filter (where addr is not null))[1]                               as addr,
    max(pr)                                                              as mpr
  from f
  where ph not in (select p from sp where length(p) = 10)
  group by ph
)
select
  case when nm ~ '\s' then split_part(nm,' ',1) else coalesce(nm,'') end as first_name,
  case when nm ~ '\s' then substr(nm, strpos(nm,' ')+1) else '' end      as last_name,
  coalesce(nm,'')                                                       as full_name,
  ph                                                                    as phone,
  coalesce(em,'')                                                       as email,
  coalesce(
    (regexp_match(coalesce(addr,''),'\m(\d{5})(?:-\d{4})?\M[^0-9]*$'))[1],
    (regexp_match(coalesce(addr,''),'\m\d{5}\M'))[1],
    '')                                                                 as zip,
  coalesce(addr,'')                                                     as address,
  case mpr when 3 then 'RO' when 2 then 'CASHIERED' else 'MESSAGES' end  as source,
  case when nm ~ '\S+\s+\S' and em is not null and addr ~ '\d{5}'
       then 'Y' else 'N' end                                            as has_all_four
from m
order by lower(coalesce(nm,'zzzz')), ph;
