# CLAUDE_DESIGN_CONTEXT.md
PRVS RO Dashboard — CSS / Design redesign workstream
Repo: PatriotsRV/rv-dashboard

This file is the system of record for the visual redesign effort. It is a
SEPARATE workstream from the operational session-memory files
(CLAUDE_CONTEXT.md / CLAUDE_CONTEXT_HISTORY.md / PRVS_PROJECT_CONTEXT.md).
Every design session appends a dated entry below: decisions made, what changed,
files produced, and open questions for next time.

Design work (prototyping + rendered previews) is produced in a separate Claude
design conversation; this repo holds the durable record and the deployed CSS.

---

## Session D1 — 2026-06-21 — "Service Floor" direction established

**Mandate**
- Boldness: Reimagine (fresh high-end direction, not a recolor).
- Theme: open — landed on a warm-neutral LIGHT base (pending Roland's confirm for bright service-bay viewing).
- Scope this session: main RO dashboard (index.html) + introduce a unified token system.

**Direction chosen — "Service Floor"**
- Warm paper surfaces (--bg-floor #ece8e1) instead of screen-black; status colors reserved strictly for meaning, not decoration.
- SIGNATURE element: a horizontal "status rail" under the title that shows shop-wide load across all statuses at a glance, built from real PRVS statuses.
- Type: Barlow Condensed (display, retained for brand continuity) + Inter (body/data) + JetBrains Mono (RO#, timestamps, numeric data).
- RO card status accent moved from glowing borders to a tinted left spine + matching badge. Parts-request now pulses the spine only (was whole-card glow). QA/QC magenta retained.

**Token system introduced (the core POC win)**
- Full scale added: surfaces, brand, status (with bg pairs), type scale, 4-based spacing scale, radius, shadow, motion easing.
- Goal: ONE source of truth all pages import. Consolidates colors currently split between dashboard.css :root and the JS files.

**Files produced this session** (in repo under design/ or chosen location)
- dashboard.css (DRAFT v0.1) — token layer + redesigned header/rail/stats/filter-bar/RO-card. NOT yet a drop-in replacement for the 3,412-line production file.
- prototype.html — standalone interactive prototype of the redesigned board.
- prototype.png — rendered preview of the above.

**Status**: First-draft direction approved by Roland. Light theme, redesigned RO cards/stats/filter bar.

**Next session**
- Migrate JS colors (js/config.js, js/render.js statusColorMap) INTO the CSS custom properties — see migration map at the bottom of dashboard.css.
- Begin folding the real index.html markup onto the new tokens; restyle remaining components (modals, parts tables, progress inputs, worklist) section by section.
- Then extend the token layer to the standalone pages (customer-checkin, analytics, guide, time-off, etc.) so they stop redeclaring their own :root.

**Open questions for Roland**
1. Confirm light theme works for bright service-bay screens, or do we need a dark mode toggle?
2. Status rail as the signature, or reallocate that space (per-silo load? aging/overdue indicator?)?
3. Silo treatment: keep emojis, or move to a flat icon set?
4. Keep QA/QC magenta, or bring it into the standard status family?

---

## Session D2 — 2026-06-21 — Four direction questions DECIDED (Roland)

All four Session D1 open questions answered by Roland this session (operational
Cowork session, after publishing the v1.460 pre-redesign release + backup).

**Decisions**
1. **Theme — Light + dark TOGGLE.** Build both from the start (not light-only).
   Every token needs a dark counterpart; the draft :root token block must gain a
   `[data-theme="dark"]` (or `.theme-dark`) override set. Service bays vary in
   ambient light, so a user/device toggle is required, not optional.
2. **Status rail → switch to PER-SILO LOAD.** The signature horizontal rail is
   KEPT as the signature element, but it now breaks shop-wide load down by
   SERVICE SILO (Repair, Vroom, Solar, Roof, Paint & Body, Chassis, Detailing,
   TrueTopper) instead of by status. Rebuild the rail component + its legend
   around the 8 silos rather than the status set.
3. **Silos → FLAT ICON SET (Option B).** Move off emojis to a custom flat
   (outline) icon set, one icon per silo type. Decided via the A/B preview
   `design/silo-options.html`. Canonical silo list (from js/config.js
   REPAIR_TYPE_TO_SILO / SILO_TO_REPAIR_TYPE) = 8 silos: repair, vroom, solar,
   roof, paint_body, chassis, detailing, truetopper. The A/B mocked 6; **vroom +
   truetopper icons still need to be drawn.** Icons should inherit color/size
   from the parent chip (stroke = --ink-2) so they theme automatically.
4. **QA/QC → FOLD INTO STANDARD FAMILY.** Drop the dedicated magenta
   (`--s-check #c2185b`). "Waiting for QA/QC" now uses the standard amber review
   family (`--s-medium`), grouped with the review/approval gate states. Remove
   `--s-check` / `--s-check-bg` from the token layer and re-point the QA card
   badge + spine + foot-flag at `--s-medium`.

**Files produced this session**
- `design/silo-options.html` — standalone A/B preview of emoji vs flat-icon silo
  chips in the real Service Floor palette (same cards/statuses both sides; QA/QC
  already shown in the folded amber). Used to settle decision 3.

**Progress this session (after the decisions)**
- ✅ Drew the remaining 2 silo icons (vroom = steering wheel, truetopper =
  awning) → complete 8-icon outline set, delivered as a `<symbol>` sprite
  (#ic-repair ic-vroom ic-solar ic-roof ic-paint ic-chassis ic-detail ic-topper).
- ✅ `design/prototype-v2.html` — refreshed full board showing ALL four decisions
  together (working light/dark toggle, per-silo load rail + icon legend, flat
  icons on every card + the rail, QA/QC in amber). Roland reviewed → "looks good."
- ✅ `design/dashboard.draft.css` hardened to **DRAFT v0.2**: added the
  `html[data-theme="dark"]` warm-dark token set; new `--silo-*` categorical
  palette (8 stops, light+dark); rebuilt `.rail`/`.rail-legend` for per-silo load;
  added `.theme-toggle` + `.silo .si` icon-system styles; REMOVED `--s-check`
  (data-status="qa" now points at `--s-medium`); updated the migration map with
  the silo-token mapping. Brace-balanced (87/87), `--s-check` gone from all rules.

**Working copy created (Roland's directive: "make a copy of the index and do all
work in this copy for now")**
- ✅ `index.draft.html` at repo ROOT — a copy of production `index.html` (7,262 →
  7,275 lines). `design/dashboard.draft.css` is linked AFTER `css/dashboard.css`
  (incremental override); the 8-silo icon `<symbol>` sprite is injected after
  `<body>`; a DRAFT marker is in the header comment. Kept at repo root (not in
  design/) so the relative `css/` + `js/` paths still resolve — it loads the same
  modules + live data as the real dashboard. Production `index.html` verified
  UNTOUCHED (0 draft refs). **All redesign markup work happens in this copy until
  it looks + performs great, then we diff it back onto index.html.**
- NOTE: the draft CSS targets NEW class names (.card/.rail/.silo/etc. from the
  prototype), which do not yet match the production DOM — so the copy looks ~like
  prod until the markup is migrated component-by-component. That migration is the
  next work.

**Course-correction (same session) — layering FAILED, switched to standalone**
- Attempt to layer `design/dashboard.draft.css` onto a copy of production
  (`index.draft.html`) made the page UNREADABLE/UNUSABLE: the draft CSS uses
  generic selectors (`body`, `h1`, `.card`, `.badge`, `.stat`, a global `*`
  reset) that collide with the live dashboard's different DOM. Reverted
  `index.draft.html` to a clean byte-identical copy of production.
- Roland's call: pursue the redesign as a **STANDALONE working prototype** wired
  to live data — never touches/breaks the real dashboard.
- ✅ Verified RLS: policy "Anon can read repair_orders" (`using true`) → the
  browser can SELECT repair_orders with just the public anon key, NO auth needed.
  (Writes still require authenticated; this preview is read-only.)
- ✅ `design/board-live.html` — self-contained live preview. Links
  `dashboard.draft.css` + inlines the icon sprite; loads supabase-js from CDN;
  fetches live repair_orders (deleted_at null, status != Delivered/Cashed Out)
  with SUPABASE_URL + anon key; renders the per-silo rail (counts real
  repair_types, multi-silo ROs count per silo), live stat cards, status-accented
  RO cards w/ flat silo icons + progress meter + days-on-lot/promised/pickup,
  working theme toggle + filter chips + search. JS syntax-checked clean. Could
  NOT run the live fetch from the sandbox (blocked from supabase.co) — Roland to
  verify in-browser. `repair_type` is COMMA-SEPARATED (e.g. "Roof, Detailing,
  Repairs"); silosOf() splits/dedupes/maps via REPAIR_TYPE_TO_SILO.
- LESSON: a from-scratch redesign stylesheet can't be layered onto the legacy
  DOM. The standalone page is the iteration surface; port to index.html only at
  the end, as a deliberate markup+css swap.

**Next**
- Roland verifies board-live.html loads his real board; iterate look/UX on it.
- Migrate JS colors into the CSS tokens (js/config.js statusColorMap / silo maps,
  js/render.js) per the section-8 mapping table — establishes one source of truth.
- Begin folding the REAL index.html markup onto the new tokens so the live JS
  (render/drill-down) drives a working instance; restyle remaining components
  (modals, parts tables, progress inputs, worklist) section by section.
- Extend the token layer to the standalone pages (customer-checkin, analytics,
  guide, time-off, etc.) so they stop redeclaring their own :root.
- NOTE: the next phase starts touching production index.html / js — promotion
  rule still applies (iterate locally; promote to live css/pre-prod/prod only
  once it looks AND performs great).

**Promotion rule unchanged (Roland):** stays local/iterative in `design/`; only
promote draft → live `css/dashboard.css` + pre-prod → prod once it looks AND
performs great.
