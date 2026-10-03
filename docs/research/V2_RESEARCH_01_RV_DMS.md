# V2 Research 01 — RV / Powersports DMS landscape

> Session 194 (2026-10-03). Subagent research feeding `docs/specs/V2_DMS_DESIGN.md`.
> Evidence quality: vendor sites publish marketing-level feature lists only. RO state machines, RO→job→line structure, split billing and GL posting are NOT publicly documented for any of these products. [INFERRED] = reasoning from industry norms, not a cited fact. Verify through demos / Chrome walk-throughs before locking design.

## Per-product findings

### 1. CDK Lightspeed EVO (now "Lightspeed DMS"; powersports/marine/RV/golf) — PRVS's current DMS
- Sources: https://www.lightspeeddms.com/ · https://www.softwareadvice.com/product/420866-Lightspeed/ · https://www.flyntlok.com/insights/best-dealer-management-systems (competitor blog, biased)
- **Service/RO:** only "streamlined service workflows" + service-to-sales comms published. [INFERRED] classic DMS RO: header → complaint/operation lines → labor + parts.
- **Parts:** ~300 OEM price files (nightly/real-time). Parts Locator network across 4,500+ dealers. Real-time inventory.
- **Time clock:** not mentioned on site.
- **Accounting:** native GL with real-time posting. RevPay payments. F&I via RouteOne/AppOne/Dealertrack.
- **CRM:** texting + "Customer Hub" (all customer messages in one view).
- **Reporting:** Reporting module + industry benchmarking.
- **Pricing:** quote-only; est. $450–$3,000+/mo modular.
- **Complaints (Software Advice 3.9/5; 3.4 support/value):** 1990s UI; inadequate onboarding, expensive trainers; GL "massive and extremely complicated"; slow enhancements; weak ad-hoc reporting / hard exports; weak parts mgmt for some; slow phone support.
- **AI:** "AI Command Center" launched 2026-03-17 for RV dealers (https://rv-pro.com/news/lightspeed-launches-ai-command-center-for-rv-dealerships/) — natural-language Q&A returning charts ("slowest-moving units?"), continuous monitoring of revenue/inventory aging/margin, coaching from anonymized 4,500-dealer patterns. **Sales + inventory only — not service / RO.** Also AI sales walkaround videos.

### 2. IDS Astra G2 (RV + marine)
- Sources: https://www.ids-astra.com/rv/service-management/ · https://www.ids-astra.com/servicecrm/ · https://www.ids-astra.com/products/service360/
- **Service/RO:** WO holds multiple jobs ("techs move between jobs"). Warranty claim tracking with collections focus. Communication audit trail. Tech photo capture.
  - Service360 suite: **ServiceCRM** (mobile-first task manager + repair-event tracker with a **rules engine** that auto-generates tasks/emails/texts); **Service Mobile** (tech app: view WOs, change status, photos, time); Digital Signatures on WO; Digital Payments by text/email from WO; **Parts Request Online** (tech-originated, fires rules-engine notifications).
  - **RECT (Repair Event Cycle Time)** is the signature KPI; free monthly regional/national benchmarking; claims up to 15 days RECT reduction.
- **Time clock:** per-job clock in/out on mobile.
- **Accounting:** remote payments sync to AP; depth not published.
- **CRM:** ServiceCRM texting + reminders (add-on layer with prerequisites).
- **Pricing:** quote-only.
- **AI:** VINRV decoding (2025-04-23, https://rv-pro.com/?p=104734) — trim/weights/floorplan for 18+ brands. No shipped service AI.

### 3. Blackpurl 2 (cloud-native; trailer/RV/powersports/golf/equipment) — **closest architectural analog to PRVS**
- Sources: https://blackpurl.com/solutions/department/service/ · https://blackpurl.com/solutions/industry/rv/ · https://www.natda.org/news/blackpurl-2-released (2025-07-23)
- **Service/RO:** one workspace: estimates, jobs by status, clocked hours, required parts. Flow = estimate → click-to-approve (remote or tablet) → WO updates instantly. Tech photos/notes/upsell flags. **Flat-rate labor codes + bundled "service kits".** Drag-and-drop scheduling with **capacity limits per tech or bay.** Full unit history across multiple owners.
- **Parts:** vendor price files with markup built in; OEM fiche searchable inside WO with auto supersessions; non-stocked parts; RV vendor files incl. **NTP-Stag, Meyer**; barcode scanning.
- **Time clock:** mobile timers; live dashboards: efficiency, billable hours, labor recovery.
- **Accounting:** **no native GL** — approved labor/parts post to **QuickBooks Online or Xero** with configurable mapping; automatic tax by state/county/district; "SmartReverse" to correct posted transactions.
- **CRM:** built-in two-way text; optional Kenect.
- **Pricing:** ~$125–127/user/mo (~$1,900/mo for 15 users). QBO bundled.
- **Complaints:** fewer OEM price integrations (manual Excel imports); restrictive photo upload; per-seat scales poorly.
- **AI:** none shipped. "Intelligent prompts" / "Proactive Guidance" are workflow nudges.

### 4. DX1 (powersports-first, also RV)
- Sources: https://www.dx1app.com/Industry/Powersports · https://sourceforge.net/software/product/DX1/
- Appointments, customer WOs, **separate warranty and internal estimates**, tech hour tracking + efficiency. Service Scheduler (tech availability, assignment, estimates in-DMS). Order/receive/inventory; in-DMS fiche w/ bin, QOH, price (Honda/Yamaha/Kawasaki/Polaris/BRP); DataOne VIN lookup. QuickBooks/QBO; custom report builder; Lead Manager. From ~$1,200/mo. No AI found.

### 5. Motility (RV/trailer/marine/bus/heavy truck)
- Sources: https://www.motilitysoftware.com/rv · https://www.natda.org/news/motility-software-solutions-modernizes-specialty-dealerships-with-launch-of-motilityanywhere
- Scheduling + task mgmt; mobile photo upload; tracks orders/deliveries/appointments + **RECT**; native accounting; MotilityPay; automated text/email for leads; custom dashboards; Lot Metrix lot tracking. Founded 1984, ~7,000 users / 800 locations. No AI found.

### 6. Dealertrack DMS (Cox) — automotive, not RV
- Open-platform: 375+ OEM integration points, 275+ certified vendors via Opentrack. Service scheduling / check-in / inspection supplied by third parties. Useful idea only: **service, check-in and inspection as pluggable vendors behind an open API.**

### 7. Others
- **ShopView** (https://shopview.com/rv-repair-shop-software) states the core RV problem: "One job can involve multiple systems, several technicians, specialty parts, customer approvals, and a longer repair cycle."
- **Service Manager Pro** — labor-times + service-interval data exported into Lightspeed.
- Not reviewed: Dealer Spike, Fullbay RV page.

## (a) Entity model comparison

| Concept | Lightspeed | IDS Astra | Blackpurl 2 | DX1 | Motility |
|---|---|---|---|---|---|
| Customer | Customer Hub | Customer (ServiceCRM) | Customer, multi-owner unit history | Prospect/customer, AR customer | Customer (CRM) |
| Unit | Unit/inventory, rental | Unit (VINRV-decoded) | Unit, multi-owner | Unit, "garage", DataOne VIN | Unit inventory |
| RO | Service order [INF] | Work Order | Work Order / Estimate | WO, Estimate (warranty/internal) | Service/Parts record |
| Job | — | Jobs inside WO | Job with status | — | Task |
| Labor op | — | — | Flat-rate code, Service Kit | — | — |
| Part line | Parts, price file | Parts Request | Vendor file / fiche part | Fiche part, special order | Parts order |
| Invoice | Native | Native | Posted to QBO/Xero | Native + QBO | Native |
| Payment | RevPay | Digital Payments | — | Integrated | MotilityPay |
| Lead | Customer Hub | ServiceCRM task | — | Lead Manager | CRM lead |
| Task/rule | — | Rules-engine task | Intelligent prompts | — | — |
| Appointment | — | — | Appointment w/ capacity | Service Scheduler | Appointment |

## (b) Ten table-stakes patterns
1. Multi-job work order (IDS, Blackpurl explicit).
2. Tech mobile app with per-job clock in/out.
3. Photos + notes attached to WO from the bay.
4. Appointment scheduling with tech availability.
5. Estimate → customer approval, remote or in person.
6. OEM parts fiche + price files with supersessions.
7. Two-way texting + status updates.
8. Remote payment link from the WO.
9. Warranty as a distinct estimate/claim type (IDS, DX1).
10. Accounting handoff (native GL or QuickBooks) + cycle-time/efficiency reporting.

## (c) Five ideas worth stealing
1. **IDS RECT** — make repair-event cycle time the headline KPI, benchmarked per silo.
2. **IDS rules engine** — WO events auto-generate tasks/emails/texts (maps to PRVS Manager Daily Report rule engine).
3. **Blackpurl service kits + flat-rate codes** — bundled labor+parts+margin for fast consistent quoting (solar, roof).
4. **Blackpurl capacity-limited scheduling** per tech/bay against promised dates.
5. **Blackpurl QBO-as-ledger** — do NOT build a GL (Lightspeed's GL is the #1 complaint).

## (d) Gaps an AI-first tool could solve
- Slow/expensive onboarding + 1990s UIs → natural-language entry.
- Weak ad-hoc reporting → conversational queries over plain Postgres.
- Multi-system / multi-tech / multi-week RV jobs → auto-split complaints into jobs, detect blockers (parts, approvals).
- Estimating from a tech's voice note + photos.
- Auto-drafted customer updates when parts arrive or a promised date slips.
- Warranty claim writing + collection tracking.
- Proactive WIP aging / stalled-job flags.
- **No vendor has shipped service-side AI as of Oct 2026.**
