-- ============================================================
-- phone_identity_link_s195.sql  (Session 195, 2026-10-04)  -- NOT YET RUN
-- Provose Phase 0: attach each active staff member's phone to their EXISTING
-- auth.users row so phone-OTP sign-in lands on the SAME auth.uid as Google did.
-- RLS, user_roles, audit_log and every "my ROs" view keep working unchanged.
--
-- Pre-flight (S195, read-only MCP): all 19 active staff already have an
-- auth.users row (provider google), none has a phone. So this is an UPDATE of
-- 19 rows + 19 identity rows; it creates no users.
--
-- GoTrue stores auth.users.phone WITHOUT the leading '+' (E.164 digits only),
-- e.g. '12142882887'. auth.identities for provider 'phone' uses provider_id =
-- the same digit string and identity_data {sub, phone, phone_verified}.
--
-- HOW TO RUN: Supabase SQL Editor, one block at a time, verify counts between.
-- Standing rule: guarded predicates + check affected-row counts (feedback_guard_er_status_sql).
-- ROLLBACK: block R at the bottom (clears phone + identity for exactly these users).
-- ============================================================

-- ---------- 0. PRE-FLIGHT (read-only) ----------
-- Expect 19 rows, every auth_id non-null, every auth_phone null, no phone dupes.
select s.name, s.email, s.phone_number,
       u.id as auth_id, u.phone as auth_phone,
       regexp_replace(s.phone_number, '\D', '', 'g') as digits
from public.staff s
left join auth.users u on lower(u.email) = lower(s.email)
where s.active = true
order by s.name;

select regexp_replace(phone_number, '\D', '', 'g') d, count(*)
from public.staff where active group by 1 having count(*) > 1;   -- expect 0 rows

-- ---------- 1. ATTACH PHONES (expect: UPDATE 19) ----------
update auth.users u
set    phone = x.digits,
       phone_confirmed_at = coalesce(u.phone_confirmed_at, now()),
       updated_at = now()
from (
  select u2.id, regexp_replace(s.phone_number, '\D', '', 'g') as digits
  from public.staff s
  join auth.users u2 on lower(u2.email) = lower(s.email)
  where s.active = true
    and s.phone_number is not null
    and length(regexp_replace(s.phone_number, '\D', '', 'g')) = 11
) x
where u.id = x.id
  and u.phone is null;                      -- guard: never overwrite an existing phone

-- ---------- 2. PHONE IDENTITIES (expect: INSERT 19) ----------
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.phone, 'phone',
       jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
       now(), now(), null
from auth.users u
join public.staff s on lower(s.email) = lower(u.email) and s.active = true
where u.phone is not null
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'phone');

-- ---------- 3. VERIFY (expect: 19 / 19 / 0) ----------
select count(*) filter (where u.phone is not null)                        as users_with_phone,
       count(*) filter (where i.id is not null)                           as phone_identities,
       count(*) filter (where u.phone is null)                            as still_missing
from public.staff s
join auth.users u on lower(u.email) = lower(s.email)
left join auth.identities i on i.user_id = u.id and i.provider = 'phone'
where s.active = true;

-- Spot-check Roland: phone '12142882887', phone_confirmed_at set, 2 identities (google + phone).
select u.email, u.phone, u.phone_confirmed_at, array_agg(i.provider order by i.provider) providers
from auth.users u left join auth.identities i on i.user_id = u.id
where u.email = 'roland@patriotsrvservices.com' group by 1,2,3;

-- ---------- R. ROLLBACK (only if needed; expect DELETE 19 then UPDATE 19) ----------
-- delete from auth.identities i using auth.users u, public.staff s
--  where i.user_id = u.id and i.provider = 'phone' and lower(s.email) = lower(u.email) and s.active = true;
-- update auth.users u set phone = null, phone_confirmed_at = null, updated_at = now()
--   from public.staff s where lower(s.email) = lower(u.email) and s.active = true and u.phone is not null;
