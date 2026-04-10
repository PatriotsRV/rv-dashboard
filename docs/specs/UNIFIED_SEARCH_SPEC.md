# Unified Multi-Field Search — Implementation Spec

**Feature:** Upgrade the single-name-only search in `index.html` to a unified search that matches across 10 fields  
**File:** `rv-dashboard/index.html` (~13,631 lines, vanilla JS, no build step)  
**Reference pattern:** `closed-ros.html` lines 561–566 (haystack join approach)  
**Status:** Ready for execution in a single session

---

## 1. Objective

The current `customerSearch` input filters cards by `ro.customerName` only (substring match, lines 7076–7080). Replace that filter with a haystack approach that searches across 10 fields simultaneously. All other filters (status, parts, repair type, insurance, days-on-lot) continue to work alongside the search using AND logic.

---

## 2. Fields to Search

The following 10 fields from the `ro` object (camelCase, as mapped by `rowToRO()`) must be included in the haystack:

| Field in `ro` object | Supabase column | Example value |
|---|---|---|
| `ro.customerName` | `customer_name` | `"Smith, John"` |
| `ro.roId` | `ro_id` | `"PRVS-A1B2-2024"` |
| `ro.rv` | `rv` | `"2019 Winnebago Solis"` |
| `ro.vin` | `vin` | `"1FDXE4FS0JDC12345"` |
| `ro.technicianAssigned` | `technician` | `"Mike Torres"` |
| `ro.repairDescription` | `description` | `"Slide room motor replacement"` |
| `ro.parkingSpot` | `parking_spot` | `"B-14"` |
| `ro.customerPhone` | `phone` | `"(520) 555-1234"` |
| `ro.customerEmail` | `email` | `"jsmith@email.com"` |
| `ro.repairType` | `repair_type` | `"Roof,Solar"` |

---

## 3. Change 1 of 4 — HTML: Search Section

### Location
Lines 2736–2744 in `index.html`.

### Current HTML (lines 2736–2744)
```html
<div class="search-section">
    <label class="search-label">🔍 Search by Customer Name:</label>
    <input type="text" 
           id="customerSearch" 
           class="search-input" 
           placeholder="Type customer name to filter..."
           autocomplete="off">
    <button id="clearSearch" class="clear-search-btn" style="display: none;">✕ Clear</button>
</div>
```

### Replacement HTML
```html
<div class="search-section">
    <label class="search-label">🔍 Search:</label>
    <div style="flex:1; position:relative;">
        <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#6b7280; pointer-events:none; font-size:1rem;">🔍</span>
        <input type="text" 
               id="customerSearch" 
               class="search-input" 
               style="padding-left:36px; width:100%; box-sizing:border-box;"
               placeholder="Search name, RO ID, VIN, tech, description, phone…"
               autocomplete="off">
    </div>
    <button id="clearSearch" class="clear-search-btn" style="display: none;">✕ Clear</button>
</div>
```

**Notes:**
- The `id="customerSearch"` is preserved — no JS wiring changes needed for the event listener.
- The wrapper `<div style="flex:1; position:relative;">` gives the icon absolute positioning context and absorbs the `flex:1` that was previously on the `<input>` directly. Remove `flex:1` from the inline style on `<input>` (it now inherits width:100% from the wrapper). If the `.search-input` CSS class already sets `flex:1`, add `flex:unset` to the input's inline style or wrap accordingly — confirm by checking line 275: `flex: 1` is on `.search-input`. The wrapper `div` takes `flex:1` instead.
- The icon span uses the same 🔍 emoji for visual consistency with the dark theme without introducing any new icon library.

---

## 4. Change 2 of 4 — JS: Filter Logic in `renderBoard()`

### Location
Lines 7075–7081 in `index.html` (inside `renderBoard()`).

### Current code (lines 7075–7081)
```javascript
// Customer name search filter
if (currentSearchFilter) {
    filtered = filtered.filter(ro => {
        const customerName = (ro.customerName || '').toLowerCase();
        return customerName.includes(currentSearchFilter.toLowerCase());
    });
}
```

### Replacement code
```javascript
// Unified multi-field search filter
if (currentSearchFilter) {
    const needle = currentSearchFilter.toLowerCase();
    filtered = filtered.filter(ro => {
        const haystack = [
            ro.customerName,
            ro.roId,
            ro.rv,
            ro.vin,
            ro.technicianAssigned,
            ro.repairDescription,
            ro.parkingSpot,
            ro.customerPhone,
            ro.customerEmail,
            ro.repairType,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(needle);
    });
}
```

**Critical details:**
- `.filter(Boolean)` removes `null`, `undefined`, and empty string `''` values before joining — this prevents spurious matches on empty fields.
- `.join(' ')` uses a space delimiter so substrings cannot accidentally bridge two adjacent field values (e.g., `"Smith"` + `"PRVS-0001"` won't produce `"SmithPRVS-0001"`).
- `currentSearchFilter.toLowerCase()` is called once before the `.filter()` loop (assigned to `needle`) rather than once per iteration.
- The variable `currentSearchFilter` and the entire `renderBoard()` → `applyFilters()` call chain are **unchanged**. This is a drop-in replacement for exactly those 6 lines.
- All other filters that follow (status, repair type, days-on-lot, RO type, parts — lines 7083–7155) remain untouched; they apply in sequence via AND logic.

---

## 5. Change 3 of 4 — i18n: TRANSLATIONS_ES Dictionary

### Location
Inside the `TRANSLATIONS_ES` constant object, in the `// Search & filters` section starting at line 7911.

### Current entries to replace (lines 7912–7913)
```javascript
'🔍 Search by Customer Name:': '🔍 Buscar por Nombre:',
'Type customer name to filter...': 'Escriba el nombre del cliente...',
```

### Replacement entries
```javascript
'🔍 Search:': '🔍 Buscar:',
'Search name, RO ID, VIN, tech, description, phone…': 'Buscar nombre, OR, VIN, técnico, descripción, teléfono…',
```

**Note:** The old key `'🔍 Search by Customer Name:'` becomes `'🔍 Search:'` to match the new label text. The old key `'Type customer name to filter...'` becomes the new longer placeholder key. Both old keys are no longer referenced anywhere after the HTML change above; removing them is safe but optional — leaving dead dictionary entries causes no harm.

---

## 6. Change 4 of 4 — i18n: `setupI18n()` Function

### Location
Lines 8062–8065 in `index.html` (inside `setupI18n()`).

### Current code (lines 8062–8065)
```javascript
const searchLabel = document.querySelector('.search-label');
if (searchLabel) searchLabel.dataset.i18n = '🔍 Search by Customer Name:';
const searchInput = document.getElementById('customerSearch');
if (searchInput) searchInput.dataset.i18nPh = 'Type customer name to filter...';
```

### Replacement code
```javascript
const searchLabel = document.querySelector('.search-label');
if (searchLabel) searchLabel.dataset.i18n = '🔍 Search:';
const searchInput = document.getElementById('customerSearch');
if (searchInput) searchInput.dataset.i18nPh = 'Search name, RO ID, VIN, tech, description, phone…';
```

**Note:** The `data-i18n` key `'🔍 Search:'` must exactly match the dictionary key added in Change 3. The `data-i18nPh` key must exactly match the placeholder text key added in Change 3. Both `translateStaticUI()` (line 8027) and the `[data-i18n-ph]` handler (line 8046) use strict key equality — typos will silently fall back to the English string, so copy/paste from the dictionary entry.

---

## 7. No Changes Required

The following are explicitly **not** modified:

- The `currentSearchFilter` variable declaration (line 3087) — unchanged.
- The `setupEventListeners()` search wiring (lines 6479–6500) — the `'input'` event listener updates `currentSearchFilter` and calls `renderBoard()`. This wiring is correct as-is.
- The `clearSearchBtn` click handler (lines 6495–6500) — unchanged.
- The `applyFilters()` / `renderBoard()` call chain throughout the file — unchanged.
- The `.search-section`, `.search-label`, `.search-input`, `.clear-search-btn` CSS rules (lines 255–316) — unchanged.
- The mobile responsive overrides (lines 1546, 2011, 2018, 2023) — unchanged.

---

## 8. Performance

With ~50–100 active ROs, the haystack join runs synchronously on every keystroke with no perceptible lag. No debounce is needed. The total string length per RO through the haystack is roughly 200–400 characters; the `.filter()` executes in < 1 ms for 100 ROs.

---

## 9. Interaction With Existing Filters

The unified search is the **first** filter applied in `renderBoard()` (line 7076). After it narrows `filtered`, the remaining filters apply in this order:

1. Unified search (this change)
2. Multi-select status filter (line 7084)
3. Single-select repair type filter (line 7101)
4. Days on Lot filter (line 7110)
5. RO Type (insurance/hybrid/standard) filter (line 7118)
6. Parts status filter (line 7135)

All are AND-logic: a card must pass every active filter to appear. The order does not change behavior, only which subset each filter narrows further.

---

## 10. Testing Checklist

Perform each test with the dashboard connected to Supabase (real data) and with sample data (offline):

### Core search tests
- [ ] **Search by customer name** — type `"smith"` → only cards where customerName contains "smith" (case-insensitive) are shown. *(Regression: existing behavior must still work.)*
- [ ] **Search by RO ID** — type `"PRVS-"` → cards whose `roId` starts with "PRVS-" appear; type a full ID like `"PRVS-A1B2-2024"` → exactly one card (or zero if not present).
- [ ] **Search by VIN** — type the last 6 characters of a known VIN → matching card appears; other cards are hidden.
- [ ] **Search by technician name** — type a technician's first name → all cards assigned to that tech appear.
- [ ] **Search by repair description** — type a keyword from a description (e.g., `"slide"`) → cards with that word in `repairDescription` appear.
- [ ] **Search by parking spot** — type a spot code like `"B-14"` → only that card appears.
- [ ] **Search by phone** — type the last 4 digits of a phone number → matching card appears.
- [ ] **Search by email** — type part of a customer email → matching card appears.
- [ ] **Search by repair type** — type `"Roof"` → cards with repairType containing "Roof" appear; cards with `"Solar"` only do not appear.
- [ ] **Partial match across fields** — type a string that appears in two different fields on two different cards (e.g., a 4-letter substring) → both cards appear.

### Filter interaction tests
- [ ] **Search with active status filter** — set Status filter to "In Progress", then type a technician name → only cards that are both "In Progress" AND match the technician appear.
- [ ] **Search with active parts filter** — set Parts filter to "Outstanding", then search by VIN → only cards that match both appear.
- [ ] **Search clears correctly** — type a search string, confirm filtered view, click "✕ Clear" → full list (respecting other active filters) restores. The input field clears.
- [ ] **Empty search shows all** — clear the search input manually (backspace to empty) → all cards matching remaining active filters are shown.

### i18n tests
- [ ] **Spanish toggle active** — click the `🌐 ES` button, confirm the search label reads `"🔍 Buscar:"` and the placeholder reads `"Buscar nombre, OR, VIN, técnico, descripción, teléfono…"`.
- [ ] **Search works in Spanish mode** — with ES active, search by RO ID → filter still works (the dictionary only translates UI labels, not search logic).
- [ ] **Toggle back to English** — click `🌐 EN`, confirm label reverts to `"🔍 Search:"` and placeholder reverts to `"Search name, RO ID, VIN, tech, description, phone…"`.

### Edge cases
- [ ] **RO with empty technician field** — search for a technician name → the RO without a tech assigned does not appear or throw an error (`.filter(Boolean)` handles nulls).
- [ ] **Search query with spaces** — type `"john roof"` → a card matching "john" somewhere in haystack AND "roof" somewhere **is not** required to match (the haystack is a joined string, so `"john roof"` would only match if those exact characters appear consecutively in the joined haystack — this is expected and acceptable behavior; note it in team docs).
- [ ] **Case insensitivity** — type `"PRVS"` and `"prvs"` → both return the same results.

---

## 11. Summary of File Locations

| Change | Location in `index.html` | Lines affected |
|---|---|---|
| HTML search section | `<div class="search-section">` | 2736–2744 |
| JS filter logic in `renderBoard()` | `// Customer name search filter` block | 7075–7081 |
| TRANSLATIONS_ES dictionary | `// Search & filters` section | 7912–7913 |
| `setupI18n()` data-i18n tags | `const searchLabel = ...` block | 8062–8065 |
