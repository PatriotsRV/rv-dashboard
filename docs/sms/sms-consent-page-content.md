# Public SMS Consent Page — Content for patriotsrvservices.com/sms-consent

> **Purpose:** Hand this content to the marketing-site Claude project to publish at `https://patriotsrvservices.com/sms-consent` (or `/employee-sms-consent`).
> **Why:** Required as publicly verifiable evidence for the Twilio A2P 10DLC Campaign resubmission (rejection error 30909, possible cause #4 — opt-in evidence not publicly accessible).
> **Last updated:** 2026-04-25
> **Related:** `docs/sms/Employee_SMS_Consent_Form.docx` + `.pdf` (the form referenced and embedded on this page)

---

## Page Title

**Employee SMS Consent — Patriots RV Services**

---

## Meta Description (for SEO and TCR clarity)

> Patriots RV Services Employee SMS Communications consent flow. This page documents the full opt-in process used to enroll employees in our internal operational text-messaging program for shift-end reminders and time-tracking notifications.

---

## Page Body Content

### About this Program

Patriots RV Services LLC operates an internal operational SMS messaging program to help our employees clock out of our time-tracking system at the end of their workday. This program is **employee-only** — we do not use this program to send marketing or customer-facing messages.

This page documents the full opt-in (consent) process used for the program, in accordance with the Telephone Consumer Protection Act (TCPA), CTIA messaging guidelines, and Twilio A2P 10DLC requirements.

---

### Program Details

| Detail | Value |
|---|---|
| **Sender Number** | +1 (940) 488-2313 |
| **Program Name** | Patriots RV Services Employee Operational Notifications |
| **Audience** | Patriots RV Services LLC employees only (no customers) |
| **Message Types** | Shift-end clock-out reminders · Auto-logout notifications · Session-extension confirmations |
| **Message Frequency** | Up to 2 messages per workday. Typical frequency is 0–1 messages per workday. |
| **Carrier Charges** | Message and data rates may apply. Patriots RV Services does not charge for these messages, but your wireless carrier's standard rates apply. |
| **Opt-Out** | Reply STOP to any message at any time. |
| **Help** | Reply HELP to any message for support contact information. |

---

### How Employees Opt In

All employees enrolled in the SMS program complete **written opt-in consent** before any messages are sent. The opt-in process works as follows:

1. **Form distribution.** During onboarding (and, for existing employees, before enrollment in the SMS program), the employee receives a copy of our Employee SMS Consent Form. The form is delivered in person by their direct manager or by HR.

2. **Form review.** The employee reviews the form, which explicitly discloses: sender number, message types, frequency, carrier-charge applicability, opt-out instructions (STOP), and help instructions (HELP).

3. **Signature.** The employee signs and dates the form, and writes the mobile phone number at which they consent to receive SMS.

4. **Receipt by Patriots RV Services.** A manager or HR representative receives the signed form, countersigns to acknowledge receipt, and records the consent timestamp in our internal staff database (`staff.sms_opt_in_at`).

5. **Enrollment.** Only after the signed consent is received and recorded does the employee's phone number become eligible for SMS sends from the program.

---

### View the Consent Form

A blank copy of the Employee SMS Consent Form is publicly downloadable below:

[**Download: Employee SMS Consent Form (PDF)**](Employee_SMS_Consent_Form.pdf)

---

### Sample Signed Form

Below is a screenshot of a signed example of the Employee SMS Consent Form, demonstrating that the consent process is real and operational. Personally identifiable information has been redacted for privacy.

> **[INSERT SCREENSHOT HERE — image of a printed and signed consent form. Roland will sign one and provide. Phone number and signature can remain visible since this is the company owner's; OR redact phone number and show signature only. Image should be hosted at `/images/sms-consent-signed-example.jpg` or similar.]**

---

### How Employees Opt Out

Once enrolled, employees may opt out at any time by any of the following methods:

- **Reply STOP** to any message from +1 (940) 488-2313. Opt-out is automatic and immediate.
- **Reply HELP** to any message to receive support contact information.
- **Notify their manager or HR in writing.** The phone number and consent timestamp will be removed from the staff SMS enrollment within one business day.

Opt-out does not affect employment status or any other aspect of the employee's role at Patriots RV Services.

---

### Privacy

Phone numbers collected through this program are stored only in the internal Patriots RV Services staff database and are used exclusively for the operational messages described above. **Mobile information is not shared with third parties or affiliates for marketing or promotional purposes.**

For full details, please see:

- [Privacy Policy](/privacy)
- [SMS Terms of Service](/terms-of-service)

---

### Contact

Questions about this program may be directed to:

**Patriots RV Services LLC**
728 Northwood Dr
Flower Mound, TX 75022
Phone: (940) 488-2313
Email: repair@patriotsrvservices.com

---

## Notes for the Marketing-Site Claude Project

1. **The consent form PDF must be hosted at the public URL** — `https://patriotsrvservices.com/Employee_SMS_Consent_Form.pdf` (or in a subfolder, but the link in the page must resolve publicly without login).

2. **The signed-example screenshot must also be publicly hosted** — the image referenced in the "Sample Signed Form" section. Roland will sign one copy of the form, photograph or scan it, and provide the image. Recommended path: `/images/sms-consent-signed-example.jpg`.

3. **Linking from Privacy Policy and Terms of Service:** Add a link to this page (`/sms-consent`) in the SMS Communications sections of both `/privacy` and `/terms-of-service` so the consent flow is discoverable from those pages too. This strengthens the verifiability for TCR reviewers.

4. **Page must be publicly accessible** — no login wall, no `noindex` meta tag, no `robots.txt` block. TCR needs to be able to navigate to it directly from a clean browser session.

5. **All 5 mandatory disclosures must remain visible on the page text itself** — even though they're also in the linked PDF. TCR sometimes only reads the page body.

6. **Mobile-friendly** — TCR reviewers may check on mobile.

7. **Once live, send Roland the live URL** so he can paste it into the Twilio A2P Campaign Message Flow field and resubmit.

---

## Twilio Resubmission Checklist (for Roland, after the page is live)

- [ ] New page is live at `patriotsrvservices.com/sms-consent` and publicly accessible (test in incognito/private window)
- [ ] Consent form PDF downloadable from the page
- [ ] Signed-example screenshot visible on the page
- [ ] Privacy Policy + ToS links work
- [ ] Page is mobile-responsive
- [ ] Twilio Console → A2P 10DLC → Campaign → update Message Flow text (use the version drafted in CLAUDE_CONTEXT.md Session 56 entry)
- [ ] Confirm Sample Messages and Campaign Description still match employee-only scope
- [ ] Resubmit
- [ ] Wait 1-5 business days for TCR re-vetting
