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
