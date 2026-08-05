-- S169: review_request_text -> Kenect-parity copy (Roland's old-message screenshot).
-- {name} = customer_name as stored on the RO (edge fn v1.1 replaces it; falls
-- back to "there" if blank). {link} = branded short link (v.html?c=..., S166
-- machinery) to review.html?t=<token>; full URL on shortener failure.
-- NO "Reply STOP" line -- Roland call, matches the old Kenect message; the
-- STOP keyword gate is server-side in textly-webhook and still applies.
-- The logo attach is NOT in this text -- it is the media_url in
-- process-review-requests v1.1 (logo-sms.png, MMS).
--
-- Guarded single-row UPDATE (S125 lesson: never hand Roland an unguarded
-- multi-statement close-out). Run in the Supabase SQL editor.

UPDATE public.app_config
SET value = 'Hello {name}! Thank you very much for letting Patriots RV Services provide you your RV''s mission critical repairs.  We know it''s never fun having to repair your RV, and we hope we exceeded your expectations.  Please let us know how we did, and if there is anything we could have improved upon by providing a review of our service.  Thank you again for your time and trust!!  Be safe and enjoy your journey. God bless!
{link}',
    label = 'Review requests: SMS copy ({name} + {link} placeholders)'
WHERE key = 'review_request_text';

-- Verify (expect 1 row, the new copy):
SELECT key, value FROM public.app_config WHERE key = 'review_request_text';
