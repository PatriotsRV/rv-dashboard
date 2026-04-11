# Dead Code Cleanup — Implementation Spec

**Project:** PRVS Dashboard (`index.html` + secondary HTML files)  
**Status:** Implementation-ready — hand off to Claude Cowork for single-session execution  
**Scope:** Remove unreferenced CSS classes, dead JS functions, and stale Sheets-era code  
**Prepared from:** Full static analysis audit (April 11, 2026)

---

## Table of Contents

1. [Background](#1-background)  
2. [Dead CSS — index.html](#2-dead-css--indexhtml)  
3. [Dead JS Functions — index.html](#3-dead-js-functions--indexhtml)  
4. [Dead Code — Secondary HTML Files](#4-dead-code--secondary-html-files)  
5. [DO NOT REMOVE — Dynamic CSS Classes](#5-do-not-remove--dynamic-css-classes)  
6. [Implementation Order](#6-implementation-order)  
7. [Verification Checks](#7-verification-checks)

---

## 1. Background

A full static analysis of all 6 HTML files in rv-dashboard found:

| Category | Count | Est. Lines Removed |
|---|---|---|
| Dead CSS classes (index.html) | 22 classes | ~150 lines |
| Dead JS functions (index.html) | 21 functions | ~530 lines |
| Dead CSS classes (analytics.html) | 2 classes | ~20 lines |
| Dead JS functions (secondary files) | 3 functions | ~25 lines |
| **Total** | **~725 lines of dead code** | |

None of this code is reachable at runtime. It adds ~20KB of unnecessary payload to index.html and creates maintenance confusion (e.g., developers styling `.priority-badge` thinking it's applied somewhere).

### What Was Audited
- Every CSS class defined in `<style>` blocks checked against all HTML attributes and JS strings
- Every `function` definition checked for any reference outside its own declaration line
- Every `getElementById` / `querySelector` checked against DOM IDs
- Every `animation:` reference checked against defined `@keyframes`

---

## 2. Dead CSS — index.html

### Block A: Upload Area (lines 319–373, ~55 lines)

Old upload UI styling from the pre-Supabase era. No HTML element or JS template uses these classes.

**Remove these rules:**
- `.upload-area` (line 319) — through closing brace
- `.upload-area:hover` (line 332)
- `.upload-area::before` (line 337)
- `.upload-area:hover::before` (line 348)
- `.upload-content` (line 352)
- `.upload-icon` (line 356)
- `.upload-text` (line 361)
- `.upload-subtext` (line 367)

Also remove `input[type="file"] { display: none; }` at line ~371 if it is only inside this block and no file inputs exist in the DOM.

### Block B: Parts Request Chip (lines 543–572, ~30 lines)

**Remove these rules:**
- `.parts-request-chip` (line 543) — through closing brace
- `.parts-request-chip:hover` (line 564)

### Block C: Priority Badge (line 695, ~13 lines)

**Remove this rule:**
- `.priority-badge` (line 695) — through closing brace

> **Note:** `.priority-urgent`, `.priority-high`, `.priority-medium`, `.priority-low` (lines 761–779) are also unreferenced. However, these appear to be intended for a priority feature that may be in development. **Remove only `.priority-badge`.** Leave the four priority color classes as they may be wired up in a future release.

### Block D: Time Logs Summary + Log Entry (lines 1852–1932, ~80 lines)

Styles for a time-log detail view that was either removed or never shipped. No JS template generates elements with these classes.

**Remove these rules:**
- `.time-logs-summary` (line 1852)
- `.summary-stat` (line 1862)
- `.summary-label` (line 1867)
- `.summary-value` (line 1876)
- `.time-logs-list` (line 1883)
- `.time-log-entry` (line 1890)
- `.log-header` (line 1897)
- `.log-tech` (line 1906)
- `.log-duration` (line 1911)
- `.log-details` (line 1918)
- `.log-time` (line 1924)
- `.log-active` (line 1929)

### Block E: Modal Close Button (lines 1934–1950, ~17 lines)

Generic modal close button styling — never applied to any element.

**Remove these rules:**
- `.modal-close-btn` (line 1934)
- `.modal-close-btn:hover` (line 1947)

### Block F: Custom View Grid (lines 1952–2015, ~64 lines)

The Custom View modal (line 11304) uses inline styles exclusively. These classes are never referenced.

**Remove these rules:**
- `.custom-view-grid` (line 1952)
- `.custom-view-checkbox` (line 1964)
- `.custom-view-checkbox:hover` (line 1976)
- `.custom-view-checkbox input[type="checkbox"]` (line 1981)
- `.custom-view-checkbox span` (line 1987)
- `.custom-view-actions` (line 1992)
- `.custom-view-btn` (line 1998)
- `.custom-view-btn:hover` (line 2011)

### Block G: Scan API Key Bar (lines 2346–2375, ~30 lines)

Styling for a scan API key input bar that no longer exists in the DOM or JS templates.

**Remove these rules:**
- `.scan-api-key-bar` (line 2346)
- `.scan-api-key-bar label` (line 2356)
- `.scan-api-key-bar input` (line 2364)

### Block H: .org, .w3 (line 111)

If `.org` and `.w3` are defined as standalone CSS rules (not part of a URL or data attribute), remove them. Verify they're actual class definitions, not substrings of something else (e.g., `.w3` could be inside the SVG data URL — do NOT remove that).

**Action:** Search for `.org {` and `.w3 {` as standalone rules. Remove only if found as top-level CSS class selectors.

---

## 3. Dead JS Functions — index.html

### Group 1: Google Sheets Legacy (11 functions, ~320 lines)

All `_SHEETS()` suffix functions are remnants from the Google Sheets → Supabase migration. They are never called.

| # | Function | Lines | Size |
|---|---|---|---|
| 1 | `updatePhotoInSheet_SHEETS()` | 4287–4305 | 19 lines |
| 2 | `loadCustomFieldConfig_SHEETS()` | 4354–4373 | 20 lines |
| 3 | `saveCustomFieldConfig_SHEETS()` | 4376–4390 | 15 lines |
| 4 | `loadPartsFromSheet()` | 5982 | 1 line (thin redirect) |
| 5 | `loadPartsFromSheet_SHEETS()` | 5983–6038 | 56 lines |
| 6 | `updatePartsJsonInSheet_SHEETS()` | 6052–6072 | 21 lines |
| 7 | `appendPartToSheet_SHEETS()` | 6076–6089 | 14 lines |
| 8 | `updatePartInSheet_SHEETS()` | 6093–6107 | 15 lines |
| 9 | `deletePartFromSheet_SHEETS()` | 6111–6128 | 18 lines |
| 10 | `updateROInSheets_SHEETS()` | 10408–10482 | 75 lines |
| 11 | `appendToSheets_SHEETS()` | 11092–11160 | 69 lines |

**Remove all 11 functions entirely.** Delete from the `function` keyword through the closing `}`.

### Group 2: Toast Migration Leftover (1 function, 11 lines)

| # | Function | Lines | Size | Reason |
|---|---|---|---|---|
| 12 | `markPartsOrdered()` | 10892–10902 | 11 lines | Phase 5 Toast refactor made this dead — the toast callback calls `_doMarkPartsOrdered()` directly |

**Remove entirely.**

### Group 3: Stale Utilities (9 functions, ~200 lines)

| # | Function | Lines | Size | Reason Dead |
|---|---|---|---|---|
| 13 | `parseCSV()` | 6880–6903 | 24 lines | CSV import feature removed/never shipped |
| 14 | `drawQRPlaceholder()` | 7882–7904 | 23 lines | QR placeholder never invoked |
| 15 | `upsertUser()` | 8619–8633 | 15 lines | Auth flow changed, upsert not called |
| 16 | `logInsuranceScanToSupabase()` | 9772–9783 | 12 lines | Scan logging never wired up |
| 17 | `stopTimeLogsAutoRefresh()` | 9928–9934 | 7 lines | Timer cleanup never called |
| 18 | `driveImgUrl()` | 10100–10113 | 14 lines | Google Drive image conversion, legacy |
| 19 | `loadDriveImage()` | 10115–10118 | 4 lines | Google Drive image loader, legacy |
| 20 | `backfillROIds()` | 10342–10378 | 37 lines | Explicitly stubbed: "skipped — using Supabase" |
| 21 | `openPartsRequestDetails()` | 10835–10889 | 55 lines | Never called from any event or function |

**Remove all 9 functions entirely.**

---

## 4. Dead Code — Secondary HTML Files

### analytics.html

**Dead CSS (2 blocks):**
- `.login-btn` + `.login-btn:hover` (lines 98–115, ~17 lines) — remove
- `.connect-sheets-btn` + `.connect-sheets-btn:hover` (lines 408–422, ~15 lines) — Google Sheets era, remove

**Dead JS (1 function):**
- `hasRole()` (lines 590–592, 3 lines) — defined but never called, remove

### solar.html

**Dead JS (1 function):**
- `fetchRoofInfo()` (lines 1467–1485, 19 lines) — roof lookup function never called, remove

### worklist-report.html

**Dead JS (1 function):**
- `hasRole()` (lines 406–408, 3 lines) — defined but never called, remove

### checkin.html / closed-ros.html
No dead code found. No changes needed.

---

## 5. DO NOT REMOVE — Dynamic CSS Classes

These CSS classes appear unused in static analysis but are **constructed dynamically at runtime** via template literals. They MUST be preserved.

### Status classes (built via `status-${statusClass}` at line ~7598)
```
.status-in-progress    .status-on-lot           .status-not-on-lot
.status-awaiting-parts .status-waiting-for-qa-qc .status-ready-for-pickup
.status-awaiting-approval .status-repairs-completed .status-delivered-cashed-out
.status-approval       .status-check            .status-completed
.status-parts          .status-progress         .status-ready
.status-badge          .status-dot
```

### RO card status variant (built via `ro-card-status-${statusClass}` at line ~7514)
```
.ro-card-status-waiting-for-qa-qc
```

### Urgency classes (built via `urgency-${...}` at line ~7517)
```
.urgency-critical  .urgency-high  .urgency-medium  .urgency-low
```

### Priority color classes (may be wired in future)
```
.priority-urgent  .priority-high  .priority-medium  .priority-low
```

### Toast type classes (built via `'toast toast--' + type` at line ~6651)
```
.toast--success  .toast--error  .toast--warning  .toast--info
```

---

## 6. Implementation Order

### Phase 1 — Remove Dead CSS from index.html

Work through Blocks A–G in order (top to bottom by line number). For each block:
1. Find the first rule in the block
2. Delete from that rule through the last rule in the block (including the closing `}`)
3. Leave a single blank line between the rule above and the rule below

**Order:** Block A (319) → Block B (543) → Block C (695) → Block D (1852) → Block E (1934) → Block F (1952) → Block G (2346) → Block H (.org/.w3 if applicable)

### Phase 2 — Remove Dead JS Functions from index.html

Work top to bottom by line number. For each function:
1. Delete from the `function` or `async function` keyword through the closing `}`
2. If there's a comment block immediately above the function that describes it, delete that too
3. Leave a single blank line between the code above and below

**Order by original line number (remove top → bottom to minimize line-shift confusion):**
1. `updatePhotoInSheet_SHEETS` (4287)
2. `loadCustomFieldConfig_SHEETS` (4354)
3. `saveCustomFieldConfig_SHEETS` (4376)
4. `loadPartsFromSheet` + `loadPartsFromSheet_SHEETS` (5982–6038)
5. `updatePartsJsonInSheet_SHEETS` (6052)
6. `appendPartToSheet_SHEETS` (6076)
7. `updatePartInSheet_SHEETS` (6093)
8. `deletePartFromSheet_SHEETS` (6111)
9. `parseCSV` (6880)
10. `drawQRPlaceholder` (7882)
11. `upsertUser` (8619)
12. `logInsuranceScanToSupabase` (9772)
13. `stopTimeLogsAutoRefresh` (9928)
14. `driveImgUrl` (10100)
15. `loadDriveImage` (10115)
16. `backfillROIds` (10342)
17. `updateROInSheets_SHEETS` (10408)
18. `openPartsRequestDetails` (10835)
19. `markPartsOrdered` (10892)
20. `appendToSheets_SHEETS` (11092)

### Phase 3 — Clean Secondary HTML Files

**analytics.html:**
- Remove `.login-btn` CSS block (lines 98–115)
- Remove `.connect-sheets-btn` CSS block (lines 408–422)
- Remove `hasRole()` function (lines 590–592)

**solar.html:**
- Remove `fetchRoofInfo()` function (lines 1467–1485)

**worklist-report.html:**
- Remove `hasRole()` function (lines 406–408)

---

## 7. Verification Checks

After all removals, run:

```bash
# 1. No removed CSS classes remain
for cls in upload-area upload-content upload-icon upload-text upload-subtext \
  parts-request-chip priority-badge time-logs-summary summary-stat summary-label \
  summary-value time-logs-list time-log-entry log-header log-tech log-duration \
  log-details log-time log-active modal-close-btn custom-view-grid \
  custom-view-checkbox custom-view-actions custom-view-btn scan-api-key-bar; do
  count=$(grep -c "$cls" index.html 2>/dev/null || echo 0)
  if [ "$count" -gt 0 ]; then echo "FAIL: .$cls still has $count refs"; fi
done
echo "CSS removal check complete"

# 2. No removed JS functions remain
for fn in updatePhotoInSheet_SHEETS loadCustomFieldConfig_SHEETS \
  saveCustomFieldConfig_SHEETS loadPartsFromSheet_SHEETS \
  updatePartsJsonInSheet_SHEETS appendPartToSheet_SHEETS \
  updatePartInSheet_SHEETS deletePartFromSheet_SHEETS parseCSV \
  drawQRPlaceholder upsertUser logInsuranceScanToSupabase \
  stopTimeLogsAutoRefresh driveImgUrl loadDriveImage backfillROIds \
  updateROInSheets_SHEETS openPartsRequestDetails markPartsOrdered \
  appendToSheets_SHEETS; do
  count=$(grep -c "$fn" index.html 2>/dev/null || echo 0)
  if [ "$count" -gt 0 ]; then echo "FAIL: $fn still has $count refs"; fi
done
echo "JS function removal check complete"

# 3. loadPartsFromSheet redirect removed
grep -c "loadPartsFromSheet" index.html
# Expected: 0

# 4. Dynamic CSS classes still present (must NOT be removed)
for cls in status-in-progress urgency-high toast--success ro-card-status-waiting; do
  grep -q "$cls" index.html && echo "OK: .$cls preserved" || echo "FAIL: .$cls missing"
done

# 5. Total line count reduction
wc -l index.html
# Expected: ~13,250 (down from ~13,997 — roughly 725 lines removed)

# 6. Secondary files
grep -c "login-btn\|connect-sheets-btn\|hasRole" analytics.html
# Expected: 0
grep -c "fetchRoofInfo" solar.html
# Expected: 0
grep -c "hasRole" worklist-report.html
# Expected: 0

# 7. Confirm 3 destructive confirm() calls still exist
grep -c "confirm(" index.html
# Expected: 3

# 8. showToast still works
grep -c "showToast(" index.html
# Expected: 120+

# 9. No syntax errors — check balanced braces
python3 -c "
import re
with open('index.html') as f:
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', f.read(), re.DOTALL)
for i, s in enumerate(scripts):
    opens = s.count('{')
    closes = s.count('}')
    if opens != closes:
        print(f'FAIL: script block {i}: {opens} opens vs {closes} closes')
    else:
        print(f'OK: script block {i}: {opens} balanced braces')
"
```

### Context File Updates

Update CLAUDE_CONTEXT.md:
- Note dead code cleanup was performed
- Update line count estimate

Update CLAUDE_CONTEXT_HISTORY.md:
- Add session entry documenting dead code removal (~725 lines)
