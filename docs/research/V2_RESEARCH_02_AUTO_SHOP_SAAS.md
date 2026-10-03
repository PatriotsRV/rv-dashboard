# V2 Research 02 — Modern auto-shop SaaS (Tekmetric, Shopmonkey, AutoLeap, Shop-Ware, Mitchell 1, Fullbay)

> Session 194 (2026-10-03). Subagent research feeding `docs/specs/V2_DMS_DESIGN.md`.
> [V] = fetched and read. [K] = background knowledge / aggregator blogs, unverified. Pricing from comparison blogs is indicative only.

## Per-product findings

### Tekmetric
- **Board / status vocabulary [V]** (https://support.tekmetric.com/hc/en-us/articles/360039292193-RO-Labels-and-Workflow-Statuses): 3-column kanban **Estimates / Work-In-Progress / Completed**.
  - Estimates labels: Not Started, Requires Authorization, Pending Authorization, Declined All.
  - WIP labels: Not Started, In Progress, Waiting on Parts, Waiting on Sublet ("X of Y hours"). Advisor sets by hand.
  - Completed labels: Ready to Post, Balance Due. Payment overlays: Credit due, Partially paid, Paid.
  - Up to 20 custom labels per column (22 chars). **Labels reset to column default when an RO moves columns.** Customer approval auto-moves RO to WIP.
  - Board can be grouped by RO status, employee or appointment type.
- **Multi-job / declined [V]:** RO holds multiple jobs; first approved job moves RO to WIP. All-declined stays in Estimates as "Declined All". Owners can block deletion and force **"Post as Declined"** so close-ratio metrics stay honest. Declined jobs stay visible on the RO.
- **DVI [V]:** inspections with photos feed estimate building.
- **Texting:** two-way gated to top tier (Scale).
- **API [V]** (https://www.usecarly.com/blog/tekmetric-ai/): client_credentials OAuth, 600 req/min; shops, customers, vehicles, ROs, jobs, labor, inventory, appointments, employees. Writes: customers, vehicles, ROs/jobs, canned jobs, appointments. **No inspections or messaging endpoints; webhooks partner-only; 2–3 week access review.**
- **Tech Board + mobile app [V].**
- **QuickBooks:** third-party "Accounting Link".
- **AI:** one native feature — AI-drafted Google review replies. Rest via partners (Detect Auto, Steer, Podium).
- **Pricing [V, 2026-09]:** ~$199 / $349 / $439 per mo (Start/Grow/Scale), unlimited users/ROs. No free trial. Separate subscription per location.

### Shopmonkey
- **Board [V/K]:** customizable drag-and-drop workflow; statuses are shop-defined rows (API `workflow statuses`). Likely defaults [K]: Estimate, Approved, In Progress, Ready for Pickup, Invoiced, Paid. Tech app mirrors columns; techs check off individual services (https://support.shopmonkey.io/hc/en-us/articles/38743052469780-Work-Orders-in-Shopmonkey-for-Techs-Mobile-App).
- **Estimates / DVI [V]:** canned services, VIN lookup, digital authorization w/ e-signature, inspections w/ photo/video by text.
- **Parts [V]:** PartsTech pricing/ordering; ALLDATA connection; API exposes purchase orders, part returns, vendors, pricing + labor matrices.
- **Time clock [V]:** built-in tech time logged against jobs → labor + payroll numbers.
- **Payments / QuickBooks [V]:** two-way texting, integrated payments, appointment reminders in every plan. QBO sync from Clever tier ($359+). Reported issues: invoice-number overlap with QB, inventory transfer errors after "2.0" migration, Canadian tax mapping (https://shoptechscore.com/shopmonkey-review/).
- **API [V]** (https://shopmonkey.dev/): appointments, customers, vehicles, orders, payments, invoices ("Statements"), canned services, labor + rates, parts/inventory, inspections + templates, tire/TPI, payment types/terms, tax config, pricing + labor matrices, purchase orders, part returns, users/roles, locations, vendors, referral sources, **webhooks**, workflows. **The open API of the group.**
- **AI:** nothing verified native; third-party AI phone agents via API.
- **Pricing [V, 2026-09]:** Basic ~$215, Clever ~$359, Genius ~$449–499/mo; 3–5 seats + $20/extra seat.
- **Complaints [V]:** "2.0" migration clunky, features removed; support drops for larger accounts; weak accounting expertise.

### AutoLeap
- Customizable workboard + DVI [V]. Strong parts/inventory. QBO native from Pro. Done-for-you migration (hidden setup fee). Two-way texting from Pro. **One device per login.**
- **AI [V]:** **AutoLeap AIR** AI receptionist (2026-04-28, https://businesswire.com/news/home/20260428092601/en/...): answers 24/7, books into calendar, **recognizes callers by phone number**, multilingual, FAQs, lead capture.
- Pricing ~$199 / $349 / $449.

### Shop-Ware
- **[V]** (https://shop-ware.com/features/digital-workflow/): real-time attention notifications; color-coded labels (customer tier new/repeat/gold, service type, waiting approval, loaner, discount); single-screen open-jobs dashboard with % complete + billed hours; ROs forwarded between techs/advisors in mobile.
- TechApp (bay documentation), Messenger (live chat approvals), **AI Parts Matrix (auto-adjusts parts pricing to hit profit targets)**, Capacity Management (bay hours), Analytics (advisor metrics, time-intensive jobs). No labor guide (needs ProDemand/ALLDATA).
- Pricing [V]: $249 / $379 / $499 / $799, unlimited users; CRM + scheduler bundle +$249. Deepest analytics of the group.

### Mitchell 1 Manager SE (https://shoptechscore.com/mitchell-1-review/, 2026-07)
- Estimate → RO → parts ordering → invoice. Job View v9.2: unlimited sub-estimates per vehicle in tabs. WIP dashboard, drag-drop scheduling, profit/department/margin reports, TeamWorks tech productivity.
- 2026: Manager SE Inspections (mobile DVI), OneFlow Estimator (auto-estimates from repair records), SocialCRM Book it Now.
- QuickBooks via Accounting Link (invoices, payments, customers). Complaints: desktop/server-based, 1.5–2 hr billing support holds, dated "Excel-like" UI. Quote-only; ~<$500/mo bundled.

### Fullbay (heavy-duty) (https://www.fullbay.com/products/service-orders/ · https://shoptechscore.com/fullbay-review/)
- Service order from request → signoff. Requests via **customer portal**, phone, email, text. Pending-repair scheduling (PM/DOT). Customers authorize PM/estimates/additional work in portal. Labor guides/wiring diagrams inside the order.
- Tech "wrench mode" clock in/out with auto labor logging.
- Parts: vendor portals, tiered markup by cost, canned jobs, notify when parts ready for pricing.
- QBO only from Pro (invoices, payments, customers).
- **AI [V]:** AI cleanup of tech notes, **voice transcription**, **Ask Spike** (NL queries over ops data), AI translation, AI Receptionist, Pitstop predictive maintenance.
- Pricing: ~$188–318 base + $89–119/user; texts $0.05 over allowance. Complaints: trial billing surprise, slow inventory, limited invoice/report customization.

## (a) RO status vocabulary side by side

| Product | Vocabulary |
|---|---|
| Tekmetric [V] | Columns Estimates / WIP / Completed. Labels: Not Started, Requires Authorization, Pending Authorization, Declined All; In Progress, Waiting on Parts, Waiting on Sublet; Ready to Post, Balance Due. Overlay: Credit due, Partially paid, Paid. |
| Shopmonkey [K] | Shop-defined. Typical: Estimate, Approved, In Progress, Waiting on Parts, Ready for Pickup, Invoiced/Paid. |
| AutoLeap [K] | Estimate, Approved, In Progress, Ready/Completed, Invoiced. |
| Shop-Ware [K] | Estimate, Authorized, Work in Progress, Ready, Posted + colored labels [V]. |
| Mitchell 1 [K] | Estimate, RO (open), Complete, Invoiced/Posted; sub-estimates [V]. |
| Fullbay [K] | Service request, Estimate, Approved, In Progress, Completed/Signoff, Invoiced. |

## (b) Entity model (Tekmetric + Shopmonkey verified; others same spine)
Customer · Vehicle (Fullbay: fleet unit → fleet customer) · RO/Order · Job/Service (canned) · Line items (labor, parts, sublet/tires, fees) · Inspection (Shopmonkey API yes, Tekmetric API no) · Invoice ("Statement" in Shopmonkey) · Payment · Appointment.

## (c) Ten table-stakes patterns
1. Three-stage pipeline (estimate → working → done/paid) as board columns.
2. **Estimate and RO are one record that changes state, not two documents.**
3. **Jobs are the unit of approval** — approve some, decline others on one RO.
4. Canned jobs/services with preset labor, parts, pricing.
5. Customer approval via text/email link with e-signature.
6. DVI with photos/video shared by link, feeding the estimate.
7. Tech mobile app: clock on job, see assigned work, check off services, notes.
8. Parts markup matrix + supplier ordering.
9. Two-way texting with templates, tied to the RO.
10. QuickBooks sync + reports on car count, ARO, GP, tech efficiency.

## (d) Five ideas worth stealing
1. Tekmetric per-column labels: few fixed lifecycle stages + free shop-defined sub-labels that reset on stage change.
2. Tekmetric "Post as Declined" discipline feeding close ratio.
3. Shop-Ware AI Parts Matrix tuned to a profit target.
4. Fullbay AI on tech input (voice→text, note cleanup, translation) + Ask Spike NL queries.
5. AutoLeap AIR caller recognition → book directly into calendar.

## (e) What these tools do NOT do well for PRVS (inferred)
- Built for cars in/out in 1–2 days. **RVs sit for weeks.** No per-job holds separate from RO status, no stalled-job aging, no long-job scheduler. "Waiting on Parts" is a manual RO-level label.
- **Multi-department (silo) work is weak** — bay-based, no first-class department queue with its own lead/work list/hours budget.
- **Insurance + warranty payers are the largest gap** — no split-payer lines, no supplement/re-approval workflow, no per-job payer. Payments are tender types, not payer entities with receivables.
- Deferred/declined follow-up is thin; shops bolt on separate automation platforms.
- API closure / tier gating (Tekmetric) or per-seat pricing (Shopmonkey).
- No progress billing / deposits on multi-week jobs; no WIP aging with partial invoicing.

## Sources
https://support.tekmetric.com/hc/en-us/articles/360039292193-RO-Labels-and-Workflow-Statuses · https://www.tekmetric.com/post/repairs-management-software-job-board · https://www.usecarly.com/blog/tekmetric-ai/ · https://shopmonkey.dev/ · https://support.shopmonkey.io/hc/en-us/articles/38743052469780 · https://shoptechscore.com/shopmonkey-review/ · https://shoptechscore.com/mitchell-1-review/ · https://shoptechscore.com/fullbay-review/ · https://www.fullbay.com/products/service-orders/ · https://shop-ware.com/features/digital-workflow/ · https://businesswire.com/news/home/20260428092601/en/AutoLeap-Introduces-the-First-AI-Receptionist-for-Auto-Shops-AutoLeap-AIR/ · https://ghlcarmechanicsnapshot.com/blog/tekmetric-vs-shopmonkey-vs-autoleap-vs-shop-ware/
