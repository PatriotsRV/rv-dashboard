-- ============================================================================
-- john_sms_signature_s161.sql
-- Session 161 (2026-07-28) — set John Nepomuceno's composer signature.
--
-- WHY: staff.sms_signature was NULL, and the code has NO fallback —
-- _loadMySignature() in js/messaging.js returns null, the "✍️ Added to every
-- send" preview strip stays hidden, and the append is skipped, so his replies
-- were going out as bare unsigned text. He is the first user with reply rights
-- and no signature (the 9 techs are also NULL but never reply to customers).
--
-- FORMAT: real newlines (\n), matching Brandon's name/title/company shape.
-- E'...' is a Postgres escape-string literal so \n becomes an actual newline,
-- NOT a literal backslash-n. Do not drop the leading E.
-- js/messaging.js normalizes \r\n -> \n and trims on read.
--
-- Idempotent — safe to re-run.
-- ============================================================================

update public.staff
   set sms_signature = E'John Nepomuceno\nOffice and Sales Assistant\nPatriots RV Services'
 where lower(email) = 'john@patriotsrvservices.com';

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- Expect: 3 lines rendered, char_length 66, newline_count 2.
select name,
       email,
       sms_signature,
       char_length(sms_signature)                                as chars,
       char_length(sms_signature) - char_length(replace(sms_signature, E'\n', '')) as newline_count
  from public.staff
 where lower(email) = 'john@patriotsrvservices.com';
