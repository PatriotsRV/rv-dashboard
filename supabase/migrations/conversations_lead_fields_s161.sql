-- ============================================================================
-- conversations_lead_fields_s161.sql
-- Session 161 (2026-07-28) — lead-capture fields on the Messages board.
--
-- WHY: the New Contact modal captured only name + phone. Roland wants email,
-- RV info, and Service Type captured at lead entry so (a) we can see what a
-- lead is coming in for, and (b) the data transfers into an RO with no
-- retyping.
--
-- ── THE RO-PARITY DECISION (read before changing anything) ──────────────────
-- Roland asked for SPLIT Year/Make/Model entry, but ALSO that it be "in the
-- same format as the RO". Those conflict: repair_orders.rv is ONE free-text
-- column holding e.g. '2016 Winnebago View'.
--
-- Resolution: store the split parts AND derive the RO-shaped string in the DB
-- via a GENERATED column. Entry stays granular; `rv` is always exactly what
-- repair_orders.rv expects, so a future lead->RO prefill is a straight copy
-- with ZERO transformation and no lossy re-splitting.
--
--   rv_year='2016', rv_make='Winnebago', rv_model='View'
--     -> rv = '2016 Winnebago View'      (matches repair_orders.rv exactly)
--
-- ⚠️ DO NOT rewrite this with concat_ws(). The obvious version —
--   nullif(trim(concat_ws(' ', rv_year, rv_make, rv_model)), '')
-- fails with `ERROR: 42P17: generation expression is not immutable`.
-- concat/concat_ws are STABLE, not IMMUTABLE (they can invoke type output
-- functions), and a GENERATED column demands strict immutability.
--
-- So we build it from immutable primitives only: `||`, coalesce, btrim,
-- regexp_replace and nullif are all IMMUTABLE. Plain `||` leaves double
-- spaces when a middle part is empty ('2016' + '' + 'View' -> '2016  View'),
-- so regexp_replace collapses any whitespace run to one space and btrim
-- removes the edges. nullif(...,'') keeps rv NULL rather than '' when all
-- three are empty, so `rv is null` stays a truthful "we don't know the RV
-- yet" test. Internal spaces in a real model ('Ace 32.3') survive intact.
--
-- rv is GENERATED ALWAYS — it CANNOT be written to directly. Any client that
-- tries to INSERT/UPDATE `rv` on conversations will get a hard error. Write
-- the three parts; let Postgres derive it.
--
-- ── SERVICE TYPE ────────────────────────────────────────────────────────────
-- Stored as comma-joined text to mirror repair_orders.repair_type exactly
-- ('Vroom, Repairs'). NOT an array — an array would break the copy-into-RO
-- parity that is the whole point. Canonical labels come from SERVICE_SILOS in
-- js/config.js: Roof, Solar, Vroom, Paint and Body, Repairs, TrueTopper,
-- Detailing, Chassis. Note 'Paint and Body' and 'Repairs' are the exact RO
-- strings — not 'Paint & Body', not 'Repair'. REPAIR_TYPE_TO_SILO maps them.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- No policy changes needed. conversations already has:
--   SELECT  USING (true)                -> everyone reads the new columns
--   UPDATE  USING/CHECK is_manager_or_above()  -> managers+ edit them
--   INSERT  CHECK is_manager_or_above()  -> managers+ set them at create
-- New columns inherit all three automatically.
--
-- Idempotent — safe to re-run.
-- ============================================================================

begin;

alter table public.conversations
    add column if not exists email        text,
    add column if not exists rv_year      text,
    add column if not exists rv_make      text,
    add column if not exists rv_model     text,
    add column if not exists service_type text;

-- RO-shaped derived RV string. Added separately because a generated column
-- cannot reference columns created in the same ALTER statement.
alter table public.conversations
    add column if not exists rv text
        generated always as (
            nullif(
                btrim(
                    regexp_replace(
                        coalesce(btrim(rv_year),  '') || ' ' ||
                        coalesce(btrim(rv_make),  '') || ' ' ||
                        coalesce(btrim(rv_model), ''),
                        '\s+', ' ', 'g'
                    )
                ),
            '')
        ) stored;

comment on column public.conversations.rv is
    'GENERATED — do not write. Derived from rv_year/rv_make/rv_model to match repair_orders.rv format for lead->RO transfer (S161).';
comment on column public.conversations.service_type is
    'Comma-joined Service Types mirroring repair_orders.repair_type, e.g. ''Vroom, Repairs''. Labels from SERVICE_SILOS in js/config.js (S161).';

commit;

-- ── VERIFY 1: columns exist, rv is generated ──────────────────────────────
select column_name, data_type, is_generated, generation_expression is not null as has_expr
  from information_schema.columns
 where table_schema='public' and table_name='conversations'
   and column_name in ('email','rv_year','rv_make','rv_model','rv','service_type')
 order by column_name;

-- ── VERIFY 2: the generated column actually produces RO format ────────────
-- Same expression as the column, run as a pure test. Writes nothing.
-- The `expected` column makes this self-checking — all_pass must be true.
select t.y, t.mk, t.md, t.expected,
       nullif(btrim(regexp_replace(
           coalesce(btrim(t.y),'') || ' ' || coalesce(btrim(t.mk),'') || ' ' || coalesce(btrim(t.md),''),
           '\s+', ' ', 'g')), '') as derived_rv,
       nullif(btrim(regexp_replace(
           coalesce(btrim(t.y),'') || ' ' || coalesce(btrim(t.mk),'') || ' ' || coalesce(btrim(t.md),''),
           '\s+', ' ', 'g')), '') is not distinct from t.expected as pass
  from (values
        ('2016','Winnebago','View',    '2016 Winnebago View'),   -- normal
        ('2016','Winnebago',null,      '2016 Winnebago'),        -- no trailing space
        ('2016',null,       'View',    '2016 View'),             -- gap in the MIDDLE (the || trap)
        (null,  null,       null,      null),                    -- NULL, not ''
        ('  2020  ','Thor', 'Ace 32.3','2020 Thor Ace 32.3')     -- trims, keeps internal space
       ) as t(y, mk, md, expected);
