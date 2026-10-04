# Phone-OTP sign-in inside the app (Provose Phase 0) — build spec + runbook

> Written Session 195 (2026-10-04). Roland decision: phone-OTP replaces Google in the app, built before the
> `dashboard.prvstools.com` handout; Google stays hidden ~2 weeks as fallback, then removed.
> Status: **foundation written, nothing deployed or run.** Next session starts at §4 step 1.

## 1. What exists after S195 (on `pre-prod`, untested)
| Piece | File | State |
|---|---|---|
| Send-SMS auth hook | `supabase/functions/auth-send-sms/index.ts` v1.0 | written; Standard-Webhooks signature + active-staff-phone gate + Textly send; **not deployed** |
| Phone → existing auth user link | `supabase/migrations/phone_identity_link_s195.sql` | written with pre-flight / verify / rollback blocks; **not run** |
| Sign-in page | `login.html` login-v1.0 | written; structure check ✓; uses storageKey `prvs_supabase_auth`; **not live** |
| Session gate helper | `js/session-gate.js` v1.0 | written; classic script exposing `window.PRVS.requireSession(sb)` + `signOutEverywhere(sb)`; **not wired** |

Pre-flight facts (read-only MCP, S195): all 19 active staff already have an `auth.users` row (provider google,
`last_sign_in_at` 2026-07 → 2026-10); **none has a phone**. 8 of 19 have a `public.users` row (the S164 "seven techs
missing" finding still stands — role loading falls back to `staff` for them; unchanged by this work).

## 2. The storageKey problem (found S195 — this is why "wire the pages" is a real step)
Pages do NOT share a Supabase session today. Each creates its own client with its own localStorage key:
`prvs_supabase_auth` (index, customer-checkin, index.draft), `prvs_messages_auth`, `prvs_closed_auth`,
`prvs_leads_auth`, `prvs_guide_auth`, `prvs_analytics_auth`, `prvs_timeoff_auth`, `prvs_report_auth`,
`prvs_solar_auth`, `prvs_checkin_auth` (+ home.html / checkin.html / tasks.html to confirm). Google One Tap made that
invisible (every page re-signed-in silently). With phone codes it would mean **a code per page** — unacceptable.
**Fix: every page's client uses `storageKey: 'prvs_supabase_auth'`.** supabase-js v2 is designed for one key shared
across tabs/pages on the same origin (navigator lock + storage events); the per-page keys were defensive, not required.
Do NOT instead copy one session blob into many keys — refresh-token rotation would log the other pages out.

## 3. Supabase project settings (Roland, dashboard; ~10 min)
1. Authentication → Providers → **Phone: Enable**. If the UI insists on choosing an SMS provider, pick any
   (e.g. Twilio) with placeholder values — the Send SMS hook (step 3) runs INSTEAD of the provider. *(verify on the
   day; if the hook still falls through to the provider, that is the signal the setting is wrong)*.
   Phone OTP length 6; **OTP expiry 300 s** (default 60 s is too short for a text); SMS rate limit stays default (30/h).
2. `supabase functions deploy auth-send-sms --no-verify-jwt` (host-side, like descope-sms). 11th `--no-verify-jwt` fn.
3. Authentication → Hooks → **Send SMS hook** → HTTP → URL `https://axfejhudchdejoiwaetq.supabase.co/functions/v1/auth-send-sms`
   → copy the generated secret (`v1,whsec_…`) → `supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_…'` → Enable.
   **The secret is shown once — do it from Roland's Chrome, not the browser pane (S195 clipboard lesson).**
4. Run `phone_identity_link_s195.sql` block by block in the SQL editor: pre-flight (19 / 0 dupes) → UPDATE 19 →
   INSERT 19 → VERIFY 19/19/0 → Roland spot-check shows providers {google, phone}.

## 4. Build steps (next session)
1. **Smoke the hook alone**: `curl` the function with a bad signature → 401; then a real `signInWithOtp` from
   `login.html` on localhost:8765 (`python3 -m http.server 8765` in the repo) with Roland's phone → text arrives from
   940-488-5047 → `verifyOtp` → session; `localStorage['prvs_supabase_auth']` populated; `auth.uid` =
   `827b36d6-31a8-4509-83be-b1c5e365d17f` (Roland's existing id). Then open `index.html` on the same origin → board
   loads with NO Google prompt (same key).
2. **Wire pages** — for each page: storageKey → `prvs_supabase_auth`; include `js/session-gate.js`; replace the
   "no session → render Google button / One Tap prompt" branch with `await PRVS.requireSession(_sb)`; keep the Google
   code path reachable only via `?google=1` for the fallback fortnight. Order: `home.html` → `index.html` (`js/auth.js`
   GROUP D, the One Tap surface) → `messages.html` → `tasks.html` → `checkin.html` → `closed-ros.html` →
   `time-off.html` → `leads.html` → `worklist-report.html` → `analytics.html` → `guide.html` → `solar.html` →
   `customer-checkin.html` (kiosk: `customerservice@` account has no phone — decide: give the kiosk a phone, or keep
   Google for that one account) → `index.draft.html` (or delete).
   `detectSessionInUrl` can go false everywhere (no more OAuth redirects) once Google is removed.
3. **Sign-out**: every page's sign-out → `PRVS.signOutEverywhere(_sb)` (clears the shared key, lands on login).
4. **Access session** (Cloudflare app `dashboard`) → 1 month, so off-site staff see the gate code monthly and the app
   code ~once per device.
5. **Regression** (Chrome or pane) on localhost then prod: cold load of each page with no session → login → back to
   the same page with query preserved (`index.html?ro=…`, `?planner=ai`, `messages.html?c=…`); deep links from
   emails/SMS still work; role-gated UI (manager picker, silo tabs) unchanged for Lynn/Brandon/a tech.
6. Release (Case B) — tag `v1.512` (index bumps in the two places) + `login-v1.0`; then the URL handout.
7. **+2 weeks**: delete Google code paths, GIS script tags, `GOOGLE_CLIENT_ID`, One Tap suppression logic
   (S165 v1.486/v1.487), and the Google OAuth origins become irrelevant.

## 5. Edge cases decided
- Unknown phone → `shouldCreateUser:false` → clear "not set up" message; nobody can self-register.
- Inactive staff → hook refuses (403) even if the auth row exists. Offboarding = `staff.active=false` (already the rule).
- Phone change → update `staff.phone_number` AND `auth.users.phone` (+ identity) — add to the staff-edit UI later;
  until then the migration pattern in §3.4 with a single-row WHERE.
- Kiosk account `customerservice@` (customer-checkin.html, S80) has no phone → see §4.2.
- Shop-network users (Access bypass) get exactly one code per device ever; off-site users one gate code/month + one app code/device.

## 6. Out of scope here
Cloudflare-JWT → Supabase session bridge (skips the app code off-site; cannot work on the shop LAN or github.io) — later nicety.
