# Handoff: PRVS RO Dashboard — Floating Rail Redesign

## Overview
Redesign of the Patriots RV Services (PRVS) work-order (RO) dashboard used daily by service-center staff on desktop. Filters and admin actions move from a top bar into a **floating left filter rail**; the rail and the main work-order table read as two separate floating white cards on a light gray page. Apple-inspired: near-monochrome, one navy accent, elevation instead of borders, calm and scannable.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, etc.) using its established patterns, components, and data layer. If no frontend environment exists yet, choose the most appropriate framework and implement the design there.

`RO Dashboard.dc.html` is the reference prototype. It uses a proprietary streaming-component format; treat the markup, inline styles, and the `Component` logic class inside it as the specification, not as a library to import. All behavior is also documented below — this README is self-sufficient.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, and interaction states are final and should be recreated pixel-perfectly using the codebase's existing conventions.

## Data Model (map to live production data)
The prototype renders from a flat array of work orders. Map each field to your production source:

| Prototype field | Type | Example | Notes |
|---|---|---|---|
| `wo` | string | `"WO-4187"` | Work order number, shown in navy, tabular numerals |
| `cust` | string | `"D. Whitfield"` | Customer display name |
| `model` | string | `"2019 Winnebago Vista 29V"` | Unit description, second gray line under customer |
| `unit` | string | `"Class A · 30 ft"` | Unit class + length |
| `silo` | enum | `Roofs · Repairs · Paint & Body · Solar` | |
| `writer` | string | `"Brandon Dillon"` | Service writer (prototype names besides Brandon Dillon are placeholders — use the real roster) |
| `status` | enum | `open · progress · approval · parts · done · closed` | See status table below |
| `updated` | string/date | `"Today, 9:41 AM"` | Relative date formatting |
| `created` | string/date | `"Jun 12"` | Shown in detail view |

Detail view additionally shows **line items** (`desc`, `hours`, per-item status) and **notes** (`author`, `time`, `text`) — the prototype fabricates these; wire to real RO line items and notes.

Filter counts in the rail are computed from the full (unfiltered) dataset per dimension.

## Screens / Views

### 1. Work Orders List (default)
**Layout**
- Page background `#F5F5F7`. Content grid max-width 1600px, centered, 20px padding, 20px gap.
- Two floating white cards: fixed **280px filter rail** (left) + main card (fills rest).
- Cards: white, border-radius 16px, shadow `0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)`, **no borders**.
- Rail is `position: sticky; top: 20px; max-height: calc(100vh - 40px)` and scrolls independently.

**Filter rail (top → bottom)** — rail padding 20px 14px:
1. **Brand block**: 30×30 navy (`#1D4E89`) rounded-8px mark with "PR" (white, 600, 12px), name "Patriots RV Services" (15px/600, letter-spacing −0.01em), subtitle "RO Dashboard" (11px, `#86868B`).
2. **Search field**: fill `#F5F5F7`, radius 10px, no border, padding 9px 12px (34px left for the magnifier icon), placeholder "Search work orders…". Focus: `box-shadow: 0 0 0 3px rgba(29,78,137,0.18)`.
3. **FILTER BY STATUS** — All Work Orders, Open, In Progress, Waiting Approval, Waiting Parts, Completed, Closed.
4. **FILTER BY SILO** — Roofs, Repairs, Paint & Body, Solar (toggle: clicking active silo clears it).
5. **FILTER BY WRITER** — All Writers + individual writers.
6. Hairline divider `rgba(0,0,0,0.05)`, 1px.
7. **ADMIN** — New Work Order, Clone Work Order, Reports, Make-A-Wish, Settings. Quiet 38px list rows: 16px thin-line icons (stroke 1.8, round caps), text `#6E6E73`; hover fill `#F5F5F7` and text darkens to `#1D1D1F`. **Not colored buttons.**

- Section headers: 11px, weight 600, uppercase, letter-spacing 0.08em, `#86868B`, padding 0 10px 8px.
- Filter rows: 40px tall, radius 10px, padding 0 10px, gap 10px; 8px colored status dot, label (ellipsizes), right-aligned count pill (12px, tabular numerals, pill radius 999px, padding 2px 9px, fill `#F5F5F7`, text `#6E6E73`).
- Hover: fill `#F5F5F7`, 150ms ease.
- Active row: fill `rgba(29,78,137,0.08)`, text `#1D4E89`, weight 600; count pill becomes `rgba(29,78,137,0.12)` / navy. Never a hard border.

**Main card** — padding 26px 26px 10px:
- Header: title "Work Orders" 22px/600, letter-spacing −0.02em; subtitle 13px `#6E6E73` describing active filters ("All silos · sorted by last update", or e.g. "In Progress · Roofs · sorted by last update"); right side: WO count (13px `#86868B`, tabular) + primary navy button "New Work Order" (13px/600 white on `#1D4E89`, padding 9px 16px, radius 10px; hover opacity 0.9; active scale 0.97).
- Table columns: WO #, Customer (unit model as 13px gray second line), Unit, Silo, Writer, Status, Updated.
- Header row: light (no dark bar) — 11px/600 uppercase `#86868B`, letter-spacing 0.08em, padding 10px 12px, bottom hairline.
- Body rows: 60px tall, cell padding 0 12px, hairline dividers `rgba(0,0,0,0.05)`, hover `#FAFAFA` (120ms), cursor pointer, row click → detail view.
- WO # cell: weight 600, `#1D4E89`, tabular numerals. Secondary text `#6E6E73`; Updated column 13px `#86868B`, tabular.
- Footer: "Showing N of M work orders" left, 13px `#86868B`, padding 14px 12px 12px.

**Status chips** (pill radius 999px, 12px/600, padding 4px 11px, 6px dot):

| Status | Dot | Chip fill | Chip text |
|---|---|---|---|
| Open | `#0A84FF` | `rgba(29,78,137,0.08)` | `#1D4E89` |
| In Progress | `#FF9500` | `rgba(255,149,0,0.14)` | `#B36B00` |
| Waiting Approval | `#FF3B30` | `rgba(255,59,48,0.10)` | `#C7362E` |
| Waiting Parts | `#BF5AF2` | `rgba(191,90,242,0.12)` | `#8944AB` |
| Completed | `#34C759` | `rgba(52,199,89,0.12)` | `#1F8A3D` |
| Closed | `#8E8E93` | `rgba(142,142,147,0.14)` | `#6E6E73` |

Rail dot colors: All Work Orders `#1D4E89`; silos — Roofs `#1D4E89`, Repairs `#0A84FF`, Paint & Body `#FF9500`, Solar `#34C759`; writers `#8E8E93` (All Writers `#86868B`).

### 2. Work Order Detail (row click)
Replaces the list inside the same main card:
- Back link "‹ Work Orders" — navy, 13px/600, chevron icon, hover tint `rgba(29,78,137,0.08)`, radius 8px.
- Header: WO number 22px/600 + status chip; below, "Customer · Unit model" 13px `#6E6E73`. Right: navy "Edit Work Order" button (same style as primary).
- Meta panel: `#F5F5F7` fill, radius 12px, padding 20px 22px, 3-column grid (gap 18px 24px): Customer, Unit (model + class/length second line), Silo, Writer, Created, Updated. Labels in the 11px uppercase style; values 14px (Customer weight 600).
- **Line items**: 52px rows, hairline dividers; description (weight 500, flexes), hours right-aligned 13px `#86868B` tabular ("4.0 hrs"), small status chip. Below, right-aligned "Total · 13.5 hrs" 13px gray.
- **Notes**: stacked, 16px gap; author 13px/600 + time 12px `#86868B` on one line, note text 13px `#6E6E73`, line-height 1.5, max-width 640px.

## Interactions & Behavior
- **Filtering**: status, silo, and writer filters combine (AND) with the search query. Search matches WO #, customer, unit model, writer (case-insensitive substring). Any filter change clears an open detail view.
- **Silo toggle**: clicking the active silo row deselects it (back to all). Status and writer use explicit "All …" rows.
- **Transitions**: background 150ms ease (rail rows/admin/buttons), 120ms (table rows). Respect `prefers-reduced-motion`.
- **Empty state** (no matches): centered in main card — 44px gray circle with magnifier icon, "No matching work orders" 15px/600, helper text 13px `#6E6E73`, "Clear all filters" navy link (hover tint pill). Resets all filters + search.
- **Loading state**: skeleton table — 6 rows of gray bars (`#F0F0F2` on hairline rows) with a gentle opacity pulse (1.4s ease-in-out, staggered 120ms per row).
- **Responsive**: below **1100px** viewport width the rail column collapses; a 36×36 filter toggle button (fill `#F5F5F7`, radius 10px) appears left of the title and opens the rail as a **slide-over**: fixed left panel (280px, inset 20px top/left/bottom, radius 16px, shadow `0 12px 40px rgba(0,0,0,0.18)`) over a `rgba(0,0,0,0.22)` scrim; scrim click or × closes. Filters remain live while open.

## State Management
- `statusFilter` ('all' | status key), `siloFilter` ('all' | silo), `writerFilter` ('all' | writer), `searchQuery` (string)
- `selectedWO` (null | WO id) — toggles list vs. detail view
- `railOpen` (boolean, narrow viewports only)
- Data fetching: work-order list (with computed per-dimension counts) + per-WO detail (line items, notes). Prototype filters client-side; server-side filtering is fine as long as counts reflect the full set.

## Design Tokens
- **Page** `#F5F5F7` · **Card** `#FFFFFF`
- **Text** primary `#1D1D1F`, secondary `#6E6E73`, tertiary `#86868B`
- **Accent (only one)** patriot navy `#1D4E89`; tint `rgba(29,78,137,0.08)`, active-pill tint `0.12`, focus ring `0.18`. Used only for: active filter rows, WO numbers, links, primary buttons, Open chip text.
- **Semantic** green `#34C759`, red `#FF3B30` — status meaning only, never decoration
- **Hairline** `rgba(0,0,0,0.05)` · hover fill `#FAFAFA` (rows) / `#F5F5F7` (controls)
- **Radii**: cards 16px, controls/buttons/rows 10px, meta panel 12px, back link 8px, pills 999px
- **Shadows**: card `0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)`; slide-over `0 12px 40px rgba(0,0,0,0.18)`
- **Type**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Weights **400 and 600 only** (500 appears on table customer names / line-item descriptions — acceptable to normalize to 600). Base 14px; title 22px; labels 11px uppercase 0.08em. `font-variant-numeric: tabular-nums` on all counts, WO numbers, hours, dates.
- **Spacing rhythm**: 20px gutters; rail sections 18px apart; card padding 26px; row heights 40px (rail) / 60px (table) / 52px (line items).

## Assets
No external assets. Icons are inline SVG thin-line glyphs (16px, stroke 1.8, round caps): plus, duplicate, bar chart, star, gear, magnifier, chevron, close, filter-lines. Substitute your icon library's equivalents (SF Symbols weight ≈ regular). Brand mark is a typed "PR" tile — replace with the real PRVS logo mark if available.

## Screenshots
Captured from the prototype at a narrow (collapsed-rail) viewport; on desktop ≥1100px the rail sits inline at left.
- `screenshots/01-work-orders-list.png` — Work Orders list
- `screenshots/02-filter-rail.png` — filter rail (shown as slide-over)
- `screenshots/03-empty-state.png` — empty state (no filter matches)
- `screenshots/04-wo-detail.png` — Work Order detail view

## Files
- `RO Dashboard.dc.html` — the full reference prototype (markup + inline styles + logic class with all behavior and mock data)
- `prvs_ro_dashboard_mockup.html` — the original static HTML mockup this design implements (plain HTML/CSS, easiest to open directly in a browser)
