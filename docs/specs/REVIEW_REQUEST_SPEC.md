# REVIEW_REQUEST_SPEC.md — "Please Give Us a Review" automation (GH#40, S151)

> Captured 2026-07-21 (S151) from the LIVE Kenect config via Roland's session,
> three days before Kenect access ends (COB 7/24). Kenect Reviews stats at
> capture: 131 reviews · Google 126 @ 4.9★ · Facebook 5 @ 5.0★ · 130 responded.
> Build target: in the RO DB, sessions before Friday 7/24 EOD (Roland).

## A. How Kenect did it (captured config)

| Piece | Kenect value |
|---|---|
| Trigger | Lightspeed transaction close (our equivalent: RO archived to Cashiered) |
| Delay | **24 hours** after trigger (⚠️ Roland remembers/wants **1 hour** — DECIDE at build; make it `app_config` key `review_request_delay_minutes`) |
| Frequency guard | No more than once per **60 days** per customer (radio options existed for every-transaction / first-transaction-only; 60-day cap was selected) |
| Real-time (manual) requests | Allowed to duplicate past the frequency guard |
| Landing page | Kenect-hosted, logo at top, "**Would you recommend Patriots RV Services?**" → Yes / No |
| YES path | "Select a site to leave a review." → Google / Facebook buttons (direct deep links) |
| NO path | "How can we improve? Send us direct feedback and we'll be in touch to make things right." + textarea + Submit Feedback + escape hatch link "If you'd prefer, you can leave an online review." |
| Private feedback | Lands in a staff-facing queue (Needs Response / In Progress / Resolved) — NOT posted publicly |
| Logo on page + texts | Enabled (PRVS round logo) |
| Review response | Kenect auto-posted AI responses to public reviews ("Auto-posted by Kenect") — nice-to-have later, NOT in scope |

**THE LINKS (verified from the live preview payload, locationId 10631):**

- Google write-review: `https://search.google.com/local/writereview?placeid=ChIJqdpO2dM3TIYRBv2akD3h9l0`
- Facebook page: `https://facebook.com/113792958286912`

## B. Proposed RO-DB build (adapter of proven pieces)

1. **Trigger + queue**: on Archive-to-Cashiered, insert a `review_requests` row
   (`ro_id, phone, customer_name, scheduled_at = now() + delay, status='pending'`).
   Frequency guard at insert: skip if a `sent` row exists for this phone_key in the
   last 60 days (mirror Kenect), and skip opted-out conversations.
2. **Sender**: extend the existing 15-min `process-scheduled-notifications` cron
   (or a small dedicated edge fn) — due rows send via **textly-send**
   (context `review_request`; STOP gate applies) and flip `status='sent'`.
3. **SMS copy** (draft, Roland to approve):
   "Thanks for choosing Patriots RV Services! We'd love to hear how we did:
   <link>  Reply STOP to opt out."
4. **Landing page**: NEW `review.html` on GitHub Pages (celeste-styled, logo).
   `?t=<uuid token>` ties the visit to the review_requests row. Yes → Google/FB
   buttons (links above, click recorded). No → feedback textarea → tokened edge fn
   writes `review_feedback` row + notifies managers (scheduled_notifications) —
   the "Private Feedback" queue can be a filter on the ER-style admin list later.
5. **Manual "Request a Review"** button on the RO card / Messages board (managers+),
   allowed to bypass the frequency guard like Kenect's real-time requests.

## C. Sibling TODOs captured in the same recon

- **After-hours auto-reply** (Kenect Auto Response — DIES with Kenect 7/24):
  rebuild in `textly-webhook`: business-hours check via `app_config`, one
  auto-reply per conversation per closed period (dedupe), text:
  "Thank you for texting Patriots RV Services. We are currently closed. We will
  respond to you as soon as we become available."
- **Teams/Groups staff broadcast** on the Messages board: compose once → fan out
  individual texts to a picked team (silo teams from `staff.service_silo` +
  custom lists) via textly-send context `staff_broadcast`. SMS has no true group
  thread — replies come back individually; that is fine for shop announcements.
- **Content / media library**: bucket-backed library of frequently re-sent media
  (Kenect "Content" feature) surfaced in the composer's 📎 flow.
- Kenect Analytics: liked, never used — park until the above ship.
