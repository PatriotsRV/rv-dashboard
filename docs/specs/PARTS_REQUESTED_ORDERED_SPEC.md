# Spec — Parts "Requested → Ordered" State Machine

**Status:** ✅ DECISIONS LOCKED — ready to build · **Drafted:** 2026-06-01 (Session 85) · **Author:** Cowork
**Depends on:** Phase 8 (`js/parts.js`) soaking on `pre-prod` — this feature will repurpose the
orphaned `markPartsOrdered` / `_doMarkPartsOrdered` that were deliberately left inline.

> ✅ Design locked 2026-06-01 (Roland). See **§7 Decisions (LOCKED)**. Build starts on a
> `feature/parts-requested-ordered` branch off `pre-prod` per **§8**.

---

## 1. The problem (what you flagged)

When a tech submits a parts request, `submitPartsRequest` immediately sets the RO-level
`parts_status = 'outstanding'` (`index.html:12537`). In the Set Parts Status modal,
`outstanding` is literally labeled **"Ordered — awaiting delivery."** So the moment a tech
*asks for* parts, the board already reads **"Parts Outstanding (Ordered)"** — even though
nobody has ordered anything. There is no separate step for a manager to confirm the parts were
actually **ordered**, and the "Requested" chip is suppressed whenever status is `outstanding`
(`index.html:9408`), so under the normal flow it never appears.

The old one-click **"Mark Parts Ordered"** button (`markPartsOrdered` → `_doMarkPartsOrdered`)
used to be the manager's "these are really on order now" action, but its button was removed —
the only trace left is an orphaned translation string `✅ Mark Parts Ordered` (`index.html:10377`).

**Goal:** a clean, role-gated flow — **Requested → Ordered → Received** — so the board and the
parts report distinguish "a tech asked" from "purchasing placed the order."

---

## 2. There are two parts-status layers (important context)

The dashboard tracks parts status in **two independent places**. This feature is about the
**RO-level** layer, but the per-part layer matters for the auto-rollup decision (§5.7).

| Layer | Where it lives | Values | Drives |
|---|---|---|---|
| **Per-part status** | `parts` table, one row per part; `PART_STATUSES` in `config.js` | `Ordered`, `In Transit`, `Sourcing`, `Received`, `Installed`, `Backordered`, `Returned`, `Lost` | The "🔩 N Parts • …" **parts-badge** (`index.html:9563`), set in the Manage Parts modal per part |
| **RO-level `parts_status`** | `repair_orders.parts_status` (free text, **no CHECK constraint**) | `sourcing`, `outstanding`, `received`, `estimate`, `null` | The big **parts-status-chip**, the **filter buttons**, and the **parts report** |

Note the per-part layer **already has an `Ordered` value** — only the RO-level rollup lacks the
Requested/Ordered distinction. The per-part "parts-badge" even maps `Sourcing → "Requested"` and
`Ordered/In Transit → "Outstanding"` in its rollup label (`index.html:9563`), which is its own
small inconsistency we can optionally align (§7-D).

---

## 3. Current RO-level states vs. proposed

| State | Today | Proposed | Meaning |
|---|---|---|---|
| `sourcing` | ✅ | ✅ keep | Actively hunting for a source/price |
| `estimate` | ✅ | ✅ keep | Estimate-only request (for quoting, not ordering) |
| `outstanding` | ✅ (= "Ordered, awaiting delivery") | **→ rename to `ordered`** (recommended) | PM/Service Mgr placed the order; awaiting delivery |
| **`requested`** | ❌ (suppressed) | **➕ add** | Tech asked; **not yet ordered** — this is the new gate |
| `received` | ✅ | ✅ keep | All parts arrived |

**Recommended canonical set:** `requested · sourcing · ordered · received · estimate · null`.

The rename `outstanding → ordered` removes the "two words, one meaning" confusion. It requires a
one-time data backfill of existing rows (§5.8) and updating the report fallback. The alternative
(keep `outstanding`, add `ordered` as a separate value) avoids a backfill but leaves two
near-synonyms in the data forever — not recommended. **Decision: §7-A.**

---

## 4. Target flow

```
tech submits request ─▶ REQUESTED ──(PM/Service Mgr)──▶ ORDERED ──▶ RECEIVED
                           │                               ▲
                           └────────(optional)── SOURCING ─┘
                        ESTIMATE  (estimate-only path, unchanged)
```

- `submitPartsRequest` sets **`requested`** (today it wrongly sets `outstanding`).
- Only **Parts Manager / Service Manager / Admin** can move `requested → ordered` (the gated step).
- `received` still auto-flips when all parts are marked Received/Installed (existing v1.306 logic),
  and still clears `has_open_parts_request`.

---

## 5. Touch points (every file/line that changes)

### 5.1 `submitPartsRequest` — `index.html:12537`
`const newPartsStatus = isEstimateOnly ? 'estimate' : 'outstanding';`
→ change the non-estimate branch to **`'requested'`**. (`has_open_parts_request=true` stays.)

### 5.2 Set Parts Status modal — `openPartsStatusModal` `index.html:12765-12818`
Add a **"📦 Parts Ordered"** button and a **"🙋 Requested"** button. **Gate the Ordered button**
to PM/Service Mgr/Admin (see §6). Re-label the current "Outstanding" button to "Ordered".

### 5.3 `setPartsStatus` — `index.html:12821-12877`
Add `requested` and `ordered` to the `labels` map; decide flag-clearing (keep `has_open_parts_request`
true through `requested`/`ordered`, clear only on `received`/`clear` — unchanged behavior).

### 5.4 Compact-card chips — `index.html:9403-9408`
Add `requested` (show the real "Requested" chip) and `ordered` branches; remove the
`partsStatus !== 'outstanding'` suppression hack.

### 5.5 Expanded-card chip — `index.html:9564-9572`
Add `requested` + `ordered` label/emoji cases.

### 5.6 Filters — buttons `index.html:3843-3846` + logic `index.html:9348-9354`
Add **Requested** and **Ordered** filter buttons + matching `ps-requested` / `ps-ordered` cases.
(Rename `ps-outstanding` → `ps-ordered`.)

### 5.7 CSS + colors — `index.html` `.parts-status-chip.*` (~851-894) + compact `.ch-*` + `PART_STATUS_COLORS`
Add `.requested` and `.ordered` chip styles (e.g. Requested = neon-pink/Requested pulse, Ordered = amber).

### 5.8 Reports
- `send-parts-report/index.ts:64-67` — currently lists everything except `received`+`estimate`.
  With the new set, `requested` + `sourcing` + `ordered` all appear. Decide whether to **split the
  report into "Needs Ordering" (requested/sourcing) vs "On Order" (ordered)** sections (§7-C).
  Update the `|| 'outstanding'` fallback at line 150 → `|| 'requested'`.
- `send-manager-report/index.ts:109` — selects `parts_status` for display only; no logic change.

### 5.9 Repurpose / retire the orphans
- `markPartsOrdered` + `_doMarkPartsOrdered` (`index.html:12712`) — either wire `markPartsOrdered`
  to the new gated "Ordered" action, **or** delete both and route everything through `setPartsStatus`.
  Recommended: **delete both** and add an `'ordered'` path to `setPartsStatus` (one code path,
  less surface). Remove the orphaned `✅ Mark Parts Ordered` translation (`index.html:10377`).

### 5.10 DB
`parts_status` is free text — new values need **no migration**. **Optional** (recommended,
mirrors the Session-72 status-casing hardening): add a `CHECK` constraint pinning the canonical
set `requested|sourcing|ordered|received|estimate` once the backfill (§5.3/§3) is done.

### 5.11 Data backfill (only if §7-A = rename)
One-time: `UPDATE repair_orders SET parts_status='ordered' WHERE parts_status='outstanding';`
Run in Supabase SQL Editor, provided inline.

---

## 6. Role gating — needs your mapping

The permission system (`hasRole`) has **Manager, Sr Manager, Insurance WO Writer, Solar, Tech** —
there is **no `Parts Manager` or `Service Manager` RBAC role.** "Parts Manager" exists only as a
*staff-table* value (`parts_manager`) used for report grouping + email recipients, not for gating.
The current Set Parts Status modal is gated `isAdmin() || hasRole('Manager') || hasRole('Sr Manager')`.

Options for who can do `requested → ordered`:

- **A. Reuse existing roles** — Admin + Manager + Sr Manager (current gate). Zero setup. "Service
  Manager" = your Manager/Sr Manager roles; no dedicated Parts Manager gate.
- **B. Add a `Parts Manager` RBAC role** — new row in `roles`, grant the relevant people in
  `user_roles`, gate Ordered to `Admin || hasRole('Sr Manager') || hasRole('Parts Manager')`.
  Matches your "parts manager or service manager" language most literally. ~1 SQL migration + you
  tell me who gets the role.
- **C. Gate by `staff.role='parts_manager'`** — not recommended; mixes the staff layer into the
  permission layer.

**Decision: §7-B.**

---

## 7. Decisions (LOCKED 2026-06-01)

- **A. State naming → RENAME.** `outstanding → ordered` + add `requested`. Canonical set:
  `requested · sourcing · ordered · received · estimate · null`. Includes the one-line backfill (§5.11).
- **B. Role gating → REUSE EXISTING ROLES.** The `requested → ordered` action is gated to
  `isAdmin() || hasRole('Manager') || hasRole('Sr Manager')` — same as today's Set Parts Status modal.
  No new `Parts Manager` RBAC role this round.
- **C. Parts report → SPLIT.** `send-parts-report` gets two sections: **"Needs Ordering"**
  (`requested` + `sourcing`) and **"On Order"** (`ordered`). `received`/`estimate` excluded as today.
  *(Default — flip to single-list if you prefer.)*
- **D. Per-part alignment → LEAVE ALONE.** The per-part "parts-badge" wording is untouched this round;
  only the RO-level `parts_status` layer changes.
- **E. Orphan handling → DELETE + CONSOLIDATE.** Delete `markPartsOrdered` + `_doMarkPartsOrdered`
  and route the Ordered transition through `setPartsStatus`. Remove the orphaned `✅ Mark Parts Ordered`
  translation (`index.html:10377`).

---

## 8. Suggested build order (after sign-off)

1. Branch `feature/parts-requested-ordered` off `pre-prod`.
2. (If rename) backfill SQL — you run it in Supabase.
3. `submitPartsRequest` → `requested`; `setPartsStatus` add `requested`/`ordered` + gate.
4. Modal buttons + role gate; chip render (compact + expanded); filters + buttons; CSS/colors.
5. Retire orphans + translations.
6. Report logic (`send-parts-report`) + redeploy edge function.
7. (Optional) CHECK constraint.
8. Local verify on a $0 tester RO (request → ordered → received round-trip, role-gate check via the
   Lynn-style role-simulation), then pre-prod → soak → main, tag, regression.

**Estimate:** ~2-3 hours of build once decisions A-E are locked. Touches `index.html`, the
`send-parts-report` edge function, and (Option B) one SQL migration.
