-- ============================================================
-- message_media_signatures_s151.sql (GH#39 S151b, 2026-07-21)
-- MMS attach + per-user SMS signatures for the Textly composer.
-- Run live by Roland in the SQL Editor 2026-07-21 (parts 1-2 first,
-- part 3 as signatures were provided). Idempotent.
-- ============================================================

-- 1. Per-user SMS signature, auto-appended by js/messaging.js
--    sendCustomerMessage() (preview shown under the composer).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS sms_signature text;

-- 2. Public bucket for outbound MMS media. PUBLIC by design: Textable's
--    /api/send media[] takes plain public URLs it fetches server-side.
--    Bucket paths are unguessable (mms/<yyyy-mm>/<ts>-<rand>-<name>).
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated staff can upload; public read rides the public bucket
-- (no SELECT policy needed for the public-URL endpoint).
DO $$ BEGIN
  CREATE POLICY "msgmedia_auth_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'message-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Signatures (Kenect carry-over, Roland-provided S151).
UPDATE staff SET sms_signature = E'Lynn Titel-Shepard\nPatriots RV Services\nOwner-COO'
WHERE email = 'lynn@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Roland Shepard\nPatriots RV Services\nVeteran/Founder/Owner'
WHERE email = 'roland@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Brandon Dillon\nService Advisor\nPatriots RV Services'
WHERE email = 'brandon@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Bobby Thatcher\nParts Manager/50 Year Tech Specialist'
WHERE email = 'bobby@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Mauricio Tellez\nService Writer'
WHERE email = 'mauricio@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Andrew Page\nPatriots RV Services\nSlide Dept. Service Manager'
WHERE email = 'andrew@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Jason Rubin\nService & Maintenance Manager\nPatriots RV Services\n682-356-8526\nwww.patriotsrvservices.com'
WHERE email = 'jason@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Riley Scott\nPatriots RV Services\nSolar Specialist'
WHERE email = 'solar@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Sofia Pedroza\nReceptionist\nPatriots RV Services'
WHERE email = 'sofia@patriotsrvservices.com';

UPDATE staff SET sms_signature = E'Ryan Dillon\nAeroArmor Specialist/Shop Assistant Manager\nPatriots RV Services\n940-488-5047\nwww.patriotsrvservices.com'
WHERE email = 'ryan@patriotsrvservices.com';
