# Toast Notification System — Implementation Spec

**Project:** PRVS Dashboard (`index.html`, v1.308, ~13,631 lines)  
**Status:** Implementation-ready — hand off to Claude Cowork for single-session execution  
**Scope:** Replace all 116 `alert()` calls + handle 7 `confirm()` dialogs  
**Prepared from:** Full codebase analysis in `scan-index.md`

---

## Table of Contents

1. [Background & Constraints](#1-background--constraints)  
2. [Z-Index Layer Map](#2-z-index-layer-map)  
3. [Component Design](#3-component-design)  
4. [Complete CSS Code — Paste Into `<style>` Block](#4-complete-css-code)  
5. [Complete JavaScript Code — Paste Into `<script>` Block](#5-complete-javascript-code)  
6. [Migration Table — All 116 alert() Calls](#6-migration-table)  
7. [Confirm() Dialog Decisions](#7-confirm-dialog-decisions)  
8. [Implementation Order (5 Phases)](#8-implementation-order)  
9. [Integration Notes & Edge Cases](#9-integration-notes--edge-cases)  
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Background & Constraints

### The Problem
The PRVS Dashboard uses `alert()` for all 116 user-facing feedback messages — errors, successes, validations, and informational prompts. `alert()` is a blocking call that:
- Freezes JS execution and the entire UI thread
- Cannot be styled to match the dark theme
- Cannot stack or queue multiple messages
- Cannot auto-dismiss or include action buttons
- Degrades UX significantly, especially during rapid workflows (part saving, WO editing, status changes)

### App Constraints
- **Single file:** All CSS, HTML, and JS live inside one `index.html`. No modules, no build step.
- **No framework:** Vanilla JS only. No npm dependencies.
- **Dark theme only:** CSS variables defined in `:root` (lines 63–100):
  - `--bg-main: #0d0f12` — page background
  - `--bg-surface: #1a1d24` — card surface
  - `--bg-elevated: #252930` — elevated elements
  - `--border-color: #2d3139`
  - `--text-primary: #e8eaed`
  - `--text-secondary: #9ca3af`
  - `--accent-urgent: #ff3b30` (red)
  - `--accent-high: #ff9500` (amber/orange)
  - `--accent-low: #34c759` (green)
  - `--accent-info: #0a84ff` (blue)
- **Fonts:** `'Barlow Condensed', sans-serif` (UI text) and `'JetBrains Mono', monospace` (IDs/numbers)
- **Existing animation patterns:** `slideDown` (top→fade-in), `slideUp` (bottom→fade-in), `fadeIn`, `cardAppear`, `pulse`. New toast animation must follow these cubic-bezier conventions.
- **One existing proto-toast:** At line ~13480, `submitEnhancementRequest()` creates an inline amber toast div with `animation: slideIn 0.3s ease` — this references a keyframe `slideIn` that does **not** exist in the stylesheet (it silently fails). The new system fixes this.
- **One existing flash notification:** At line ~12336, `saveWOTemplate()` creates a bottom-center flash div at z-index 9999. This also gets replaced.

### Hosted on GitHub Pages
No server-side rendering, no backend. The file is delivered as-is. GitHub Pages does not restrict any client-side JS or CSS.

---

## 2. Z-Index Layer Map

The full stacking order (from `scan-index.md`, verified against the source):

| z-index | Element | Note |
|---|---|---|
| 10 | `.noise-overlay` | SVG grain texture |
| 1000 | Header + static CSS sticky elements | |
| 9998 | `#erFloatingBtn` (Genie Lamp FAB) | Bottom-left |
| 9999 | `saveWOTemplate()` flash div | Bottom-center (to be removed) |
| **10000** | Most standard modals | `#scheduleModalOverlay`, `#qrModalOverlay`, `#voiceNotesModal`, `#timeLogsModalOverlay`, `#customViewModalOverlay`, `#adminSettingsModalOverlay` |
| 10001 | `#photoLibraryModal`, `#codeExportModalOverlay` | |
| 10010–10020 | Parts request/lightbox overlays | |
| 10050 | `#erModalOverlay` | Enhancement request form |
| 10051 | Genie Lamp proto-toast (to be replaced) | |
| 10060 | `#erAdminOverlay` | |
| 11000 | `#kenectModalOverlay`, Work Order overlay | |
| 11999 | `#workListBackdrop` | |
| 12000 | `#workListPanel` | Slide-in sidebar |
| 12500 | Silo picker modal | |
| 100000 | WO Template overlay | **Highest — must stay above toasts** |

### Toast z-index Decision

**Toast container: `z-index: 13000`**

Rationale:
- Sits above the Work List panel (12000) and silo picker (12500) — so toasts are visible even when those are open
- Sits below the WO Template overlay (100000) — templates are modal-level interactions where toasts would be distracting anyway
- Toasts are non-blocking; they do not interfere with any modal interaction since they occupy the bottom-right corner only

---

## 3. Component Design

### Visual Spec

**Position:** Fixed, bottom-right corner  
**Offset:** `bottom: 24px; right: 24px`  
**Width:** `320px` (fixed, does not shrink on mobile — dashboard is desktop-only)  
**Stack direction:** Newest toast appears at the bottom; older toasts stack upward  
**Max visible:** 3 toasts at once. When a 4th is queued, the oldest visible toast is forcibly dismissed (with the same exit animation).

### Toast Types

| Type | CSS Class | Left Border Color | Icon | Duration |
|---|---|---|---|---|
| `success` | `.toast--success` | `#34c759` (`--accent-low`) | `✓` | 4 000 ms |
| `error` | `.toast--error` | `#ff3b30` (`--accent-urgent`) | `✕` | **persistent** (requires manual dismiss) |
| `warning` | `.toast--warning` | `#ff9500` (`--accent-high`) | `⚠` | 8 000 ms |
| `info` | `.toast--info` | `#0a84ff` (`--accent-info`) | `ℹ` | 4 000 ms |

### Anatomy of a Single Toast

```
┌─[colored left border 3px]────────────────────────────┐
│  [icon]  [message text]                    [×]        │
│          [optional action button]                     │
│  [progress bar — shrinks over duration]               │
└───────────────────────────────────────────────────────┘
```

- **Left border:** 3px solid, color per type — matches the existing `.ro-card` left-accent pattern used throughout the codebase
- **Icon:** Unicode character in the type's accent color, `font-size: 1.1rem`, `font-family: 'JetBrains Mono'`
- **Message text:** `font-family: 'Barlow Condensed'`, `font-size: 0.95rem`, `font-weight: 500`, `color: var(--text-primary)`
- **Dismiss button (×):** Always present. `color: var(--text-secondary)`. Clicking it triggers the exit animation immediately.
- **Action button:** Optional. Styled as a small pill button (same style as `.filter-btn.active` in the existing CSS). Text is configurable via `options.actionLabel`, click handler via `options.actionCallback`.
- **Progress bar:** 2px tall bar at the bottom of the card. Starts full-width, shrinks to 0 over the toast duration using a CSS `width` transition. Hidden for persistent toasts. Matches the type's accent color at 50% opacity.
- **Background:** `var(--bg-elevated)` (`#252930`) — one level above card surface, consistent with modal inner panels
- **Border:** `1px solid var(--border-color)` all around, plus left border override

### Animation

**Entry animation:** `toast-slide-in` keyframe — slides from `translateX(110%)` (off-screen right) to `translateX(0)` with `opacity: 0 → 1`. Duration: `280ms`, easing: `cubic-bezier(0.16, 1, 0.3, 1)` (matches `slideDown` and `cardAppear`).

**Exit animation:** `toast-slide-out` keyframe — slides to `translateX(110%)` with `opacity: 1 → 0`. Duration: `220ms`, easing: `ease-in`. After the animation ends, the element is removed from the DOM and the remaining toasts reflow smoothly (via the container's `gap` + `flex` layout).

**Gap reflow:** The container uses `display: flex; flex-direction: column; gap: 8px`. When a toast is removed, remaining toasts slide to fill the gap naturally using `transition: all 0.2s ease` on each toast element.

---

## 4. Complete CSS Code

**Paste location:** Inside the existing `<style>` block, immediately after the last `@keyframes` definition (currently `@keyframes slideUp` around line 1637). Place before the `.modal-header` rule that follows.

```css
/* ── Toast Notification System ─────────────────────────────────────── */

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(110%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-slide-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(110%);
  }
}

#toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 13000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  pointer-events: none; /* container itself is click-through */
}

.toast {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px 14px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  pointer-events: all; /* each toast is individually interactive */
  animation: toast-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: transform 0.2s ease, opacity 0.2s ease;
  font-family: 'Barlow Condensed', sans-serif;
  border-left-width: 3px;
  border-left-style: solid;
  min-height: 48px;
}

.toast.toast-exiting {
  animation: toast-slide-out 220ms ease-in forwards;
}

/* Type-specific left border colors */
.toast--success { border-left-color: #34c759; }
.toast--error   { border-left-color: #ff3b30; }
.toast--warning { border-left-color: #ff9500; }
.toast--info    { border-left-color: #0a84ff; }

/* Icon + message row */
.toast__body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-right: 20px; /* space for the × button */
}

.toast__icon {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  flex-shrink: 0;
  line-height: 1.4;
}

.toast--success .toast__icon { color: #34c759; }
.toast--error   .toast__icon { color: #ff3b30; }
.toast--warning .toast__icon { color: #ff9500; }
.toast--info    .toast__icon { color: #0a84ff; }

.toast__message {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
  flex: 1;
}

/* Dismiss (×) button */
.toast__close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
  font-family: 'JetBrains Mono', monospace;
}

.toast__close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

/* Optional action button */
.toast__action {
  margin-top: 8px;
  margin-left: 20px; /* align under message, past icon */
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  display: inline-block;
}

.toast--success .toast__action:hover { background: rgba(52, 199, 89, 0.15); border-color: #34c759; }
.toast--error   .toast__action:hover { background: rgba(255, 59, 48, 0.15); border-color: #ff3b30; }
.toast--warning .toast__action:hover { background: rgba(255, 149, 0, 0.15); border-color: #ff9500; }
.toast--info    .toast__action:hover { background: rgba(10, 132, 255, 0.15); border-color: #0a84ff; }

/* Progress bar */
.toast__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  border-radius: 0 0 10px 10px;
  transform-origin: left;
  transition: width linear; /* duration set inline via JS */
}

.toast--success .toast__progress { background: rgba(52, 199, 89, 0.5); }
.toast--error   .toast__progress { background: rgba(255, 59, 48, 0.5); }
.toast--warning .toast__progress { background: rgba(255, 149, 0, 0.5); }
.toast--info    .toast__progress { background: rgba(10, 132, 255, 0.5); }
```

---

## 5. Complete JavaScript Code

**Paste location:** In the `<script>` block, immediately after the utility constants section and before `function init()` (around line 6421). Look for the comment block above `init()` and place the toast system right above it. This ensures `showToast` is in global scope and available to all 277 functions.

```javascript
/* ── Toast Notification System ──────────────────────────────────────
 *
 *  showToast(message, type, options)
 *
 *  @param {string} message       — Text to display. Plain text only (no HTML).
 *  @param {string} [type]        — 'success' | 'error' | 'warning' | 'info'
 *                                   Defaults to 'info'.
 *  @param {object} [options]
 *    @param {number}   [options.duration]        — Override auto-dismiss ms.
 *                                                  Pass 0 to force persistent.
 *    @param {boolean}  [options.persistent]      — If true, never auto-dismisses.
 *                                                  Errors are persistent by default.
 *    @param {string}   [options.actionLabel]     — Label for optional action button.
 *    @param {Function} [options.actionCallback]  — Called when action button is clicked.
 *                                                  Toast dismisses after callback.
 *  @returns {HTMLElement} The created toast element (useful for manual dismiss).
 *
 *  Maximum 3 toasts visible at once. When a 4th arrives, the oldest is
 *  forcibly dismissed. Errors are persistent (no auto-dismiss, must click ×).
 * ─────────────────────────────────────────────────────────────────── */

(function () {
  const TOAST_MAX    = 3;
  const TOAST_ICONS  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const TOAST_DEFAULTS = {
    success : 4000,
    info    : 4000,
    warning : 8000,
    error   : 0,   // 0 = persistent
  };

  let _container = null;
  const _active  = []; // ordered oldest → newest

  function _getContainer() {
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'toast-container';
      document.body.appendChild(_container);
    }
    return _container;
  }

  function _dismiss(el) {
    if (el.dataset.dismissed === '1') return;
    el.dataset.dismissed = '1';

    // Clear any pending auto-dismiss timer
    if (el._toastTimer) {
      clearTimeout(el._toastTimer);
      el._toastTimer = null;
    }

    // Remove from active list
    const idx = _active.indexOf(el);
    if (idx !== -1) _active.splice(idx, 1);

    // Trigger exit animation then remove DOM node
    el.classList.add('toast-exiting');
    el.addEventListener('animationend', () => el.remove(), { once: true });

    // Fallback removal in case animationend never fires (e.g., reduced motion)
    setTimeout(() => { if (el.parentNode) el.remove(); }, 350);
  }

  function showToast(message, type, options) {
    type    = type    || 'info';
    options = options || {};

    const container = _getContainer();

    // Enforce max 3 — evict oldest
    if (_active.length >= TOAST_MAX) {
      _dismiss(_active[0]);
    }

    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    // Build inner HTML — safe because message is always plain text
    const escapedMsg = String(message)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const hasAction = options.actionLabel && typeof options.actionCallback === 'function';

    el.innerHTML =
      '<button class="toast__close" aria-label="Dismiss notification">×</button>' +
      '<div class="toast__body">' +
        '<span class="toast__icon">' + (TOAST_ICONS[type] || 'ℹ') + '</span>' +
        '<span class="toast__message">' + escapedMsg + '</span>' +
      '</div>' +
      (hasAction
        ? '<button class="toast__action">' +
            String(options.actionLabel).replace(/</g, '&lt;') +
          '</button>'
        : '') +
      '<div class="toast__progress"></div>';

    // Wire dismiss button
    el.querySelector('.toast__close').addEventListener('click', () => _dismiss(el));

    // Wire action button
    if (hasAction) {
      el.querySelector('.toast__action').addEventListener('click', () => {
        options.actionCallback();
        _dismiss(el);
      });
    }

    // Determine duration
    let persistent = options.persistent === true || type === 'error';
    let duration   = options.duration;
    if (duration === undefined) duration = TOAST_DEFAULTS[type] !== undefined ? TOAST_DEFAULTS[type] : 4000;
    if (duration === 0) persistent = true;

    // Animate progress bar
    const progressBar = el.querySelector('.toast__progress');
    if (persistent) {
      progressBar.style.display = 'none';
    } else {
      // Set initial width=100%, then transition to 0 over duration
      // rAF double-frame trick ensures the transition fires after paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressBar.style.transition = 'width ' + duration + 'ms linear';
          progressBar.style.width = '0%';
        });
      });
    }

    // Append and track
    container.appendChild(el);
    _active.push(el);

    // Auto-dismiss
    if (!persistent) {
      el._toastTimer = setTimeout(() => _dismiss(el), duration);
    }

    return el;
  }

  // Expose globally (matches existing pattern — all functions are on window)
  window.showToast = showToast;
})();
```

### Usage Examples

```javascript
// Success — auto-dismisses in 4s
showToast('Repair Order saved successfully!', 'success');

// Error — persistent, requires manual dismiss
showToast('Error saving Repair Order: ' + err.message, 'error');

// Warning — auto-dismisses in 8s
showToast('Please select at least one Repair Type', 'warning');

// Info — auto-dismisses in 4s
showToast('Please connect to PRVS database first!', 'info');

// With custom duration (12 seconds)
showToast('Parts request sent! Management has been notified.', 'success', { duration: 12000 });

// Persistent info
showToast('Google APIs are still loading…', 'info', { persistent: true });

// With action button
showToast('RO not visible — it may be filtered out.', 'warning', {
  actionLabel: 'Clear Filters',
  actionCallback: () => clearAllFilters()
});
```

---

## 6. Migration Table

All 116 `alert()` calls, mapped by line number (verified against the source), grouped by category. The **Replacement** column shows the exact `showToast()` call to use.

> **Note on line numbers:** Line numbers are exact as of v1.308. If any code is added before a given line between phases, adjust accordingly.

### Category A: Success Confirmations (22 calls)
These are safe to replace first — they confirm completed operations and carry zero risk of hiding a meaningful error.

| Line | Current `alert()` Message | Toast Type | Replacement Call |
|---|---|---|---|
| 3237 | `Configuration saved to "${presetName}" preset!\n\nNow click "Admin Settings" → "Export Configuration Code" to make it permanent.` | `success` | `showToast('Configuration saved to "' + presetName + '" preset! Use Admin Settings → Export to make it permanent.', 'success', { duration: 8000 })` |
| 3670 | `` `✅ ${uploaded} photo(s) uploaded! First photo set as main RV image.` `` | `success` | `showToast(uploaded + ' photo(s) uploaded — first photo set as main RV image.', 'success')` |
| 3674 | `` `✅ ${uploaded} photo(s) added to library! Use Manage Photos to set as main.` `` | `success` | `showToast(uploaded + ' photo(s) added to library! Use Manage Photos to set as main.', 'success')` |
| 3884 | `✅ Document uploaded successfully!\n\nNote: It may take up to 60 seconds for the document to appear...` | `success` | `showToast('Document uploaded! It may take up to 60 seconds to appear in the list.', 'success', { duration: 8000 })` |
| 3921 | `✅ Main photo updated!` | `success` | `showToast('Main photo updated!', 'success')` |
| 4068 | `` `✅ ${checked.length} photo(s) sent to ${toEmail} successfully!` `` | `success` | `showToast(checked.length + ' photo(s) sent to ' + toEmail + ' successfully!', 'success')` |
| 9972 | `` `✅ Done! Merged and deleted ${totalDeleted} duplicate RO${totalDeleted !== 1 ? 's' : ''}.\n\nReloading data...` `` | `success` | `showToast('Done! Merged and deleted ' + totalDeleted + ' duplicate RO' + (totalDeleted !== 1 ? 's' : '') + '. Reloading…', 'success', { duration: 6000 })` |
| 10209 | `` `✅ Notification sent to ${ro.requestedByEmail}` `` | `success` | `showToast('Notification sent to ' + ro.requestedByEmail, 'success')` |
| 10464 | `` `✅ Parts request sent! Management has been notified and the RO has been flagged.${photoMsg}` `` | `success` | `showToast('Parts request sent! Management has been notified.' + (photoMsg ? ' ' + photoMsg.trim() : ''), 'success', { duration: 6000 })` |
| 10570 | `✅ Parts marked as ordered. The indicator has been cleared.` | `success` | `showToast('Parts marked as ordered. The indicator has been cleared.', 'success')` |
| 11245 | `` `✅ Review request sent to ${ro.customerName \|\| phone}` `` | `success` | `showToast('Review request sent to ' + (ro.customerName \|\| phone), 'success')` |
| 11703 | `Repair Order saved successfully!` | `success` | `showToast('Repair Order saved successfully!', 'success')` |

**Sub-category: Session-expired confirmations replacing partial success context** — these are technically errors but phrased informationally:

| Line | Current Message | Toast Type | Notes |
|---|---|---|---|
| 3609 | `Session expired or not logged in. Please refresh the page and sign in again.` | `warning` | Not a crash, a user action needed |
| 3628 | `Session expired. Please refresh the page and sign in again.` | `warning` | Same |
| 3854 | `Session expired or not logged in. Please refresh the page and sign in again.` | `warning` | Same |

---

### Category B: Error Alerts (42 calls)
These report unexpected failures. All become `error` type (persistent).

| Line | Current `alert()` Message | Toast Type | Replacement Call |
|---|---|---|---|
| 3307 | `Error: Could not find the repair order.` | `error` | `showToast('Error: Could not find the repair order.', 'error')` |
| 3347 | `Error updating urgency: ` + error.message + `\n\nCheck the console for details.` | `error` | `showToast('Error updating urgency: ' + error.message, 'error')` |
| 3375 | `Error: Could not find the repair order.` | `error` | Same as 3307 |
| 3385 | `Error: Could not find the repair order in data.` | `error` | `showToast('Error: Could not find the repair order in data.', 'error')` |
| 3438 | `Error updating field: ` + error.message | `error` | `showToast('Error updating field: ' + error.message, 'error')` |
| 3460 | `Error: Could not find the repair order.` | `error` | Same as 3307 |
| 3486 | `Error updating progress: ` + error.message | `error` | `showToast('Error updating progress: ' + error.message, 'error')` |
| 3509 | `Error: Could not find the repair order.` | `error` | Same as 3307 |
| 3579 | `Error updating status: ` + error.message + `\n\nCheck the console for details.` | `error` | `showToast('Error updating status: ' + error.message, 'error')` |
| 3591 | `Error: Could not find the repair order.` | `error` | Same as 3307 |
| 3614 | `Error: Could not find the repair order.` | `error` | Same as 3307 |
| 3680 | `Error uploading photo: ` + error.message | `error` | `showToast('Error uploading photo: ' + error.message, 'error')` |
| 3892 | `Upload failed: This file type is not yet allowed in storage.\n\nFix: Go to Supabase → Storage → rv-media bucket → Edit → remove the MIME type restriction...` | `error` | `showToast('Upload failed: File type blocked by storage. Go to Supabase → Storage → rv-media → remove MIME type restriction, then retry.', 'error')` |
| 3894 | `Upload failed: ` + msg | `error` | `showToast('Upload failed: ' + msg, 'error')` |
| 4071 | `❌ Failed to send photos: ` + (err.message \|\| 'Unknown error') | `error` | `showToast('Failed to send photos: ' + (err.message \|\| 'Unknown error'), 'error')` |
| 4164 | `Error: Could not match this RO in local data.` | `error` | `showToast('Error: Could not match this RO in local data.', 'error')` |
| 4182 | `Error archiving RO. Check console for details.` | `error` | `showToast('Error archiving RO. Check console for details.', 'error')` |
| 4672 | `Scan failed: ` + (err.message \|\| 'Unknown error. Check console for details.') | `error` | `showToast('Scan failed: ' + (err.message \|\| 'Unknown error — check console.'), 'error')` |
| 6272 | `Error saving part: ` + e.message | `error` | `showToast('Error saving part: ' + e.message, 'error')` |
| 6298 | `Error deleting part: ` + e.message | `error` | `showToast('Error deleting part: ' + e.message, 'error')` |
| 6327 | `Error: ` + e.message | `error` | `showToast('Error marking part received: ' + e.message, 'error')` (add context) |
| 6853 | `Error adding to Work List: ` + (err.message \|\| err) | `error` | `showToast('Error adding to Work List: ' + (err.message \|\| err), 'error')` |
| 6868 | `Error removing item: ` + (err.message \|\| err) | `error` | `showToast('Error removing Work List item: ' + (err.message \|\| err), 'error')` |
| 8983 | `Error loading data from database: ` + err.message | `error` | `showToast('Error loading data from database: ' + err.message, 'error')` |
| 9505 | `Error loading data from Google Sheets. Check console for details.` | `error` | `showToast('Error loading data. Check console for details.', 'error')` |
| 9982 | `Error during merge: ` + (err.message \|\| JSON.stringify(err)) | `error` | `showToast('Error during merge: ' + (err.message \|\| 'Unknown error'), 'error')` |
| 10058 | `Error: Could not locate this RO in the spreadsheet. Please refresh and try again.` | `error` | `showToast('Error: Could not locate this RO. Please refresh and try again.', 'error')` |
| 10125 | `Error updating RO. Check console for details.` | `error` | `showToast('Error updating RO. Check console for details.', 'error')` |
| 10212 | `Error sending notification: ` + err.message | `error` | `showToast('Error sending notification: ' + err.message, 'error')` |
| 10468 | `Error sending parts request: ` + err.message | `error` | `showToast('Error sending parts request: ' + err.message, 'error')` |
| 10574 | `Error: ` + err.message | `error` | `showToast('Error marking parts ordered: ' + err.message, 'error')` (add context) |
| 10690 | `Error updating parts status: ` + err.message | `error` | `showToast('Error updating parts status: ' + err.message, 'error')` |
| 10790 | `Error saving to Google Sheets. Check console for details.` | `error` | `showToast('Error saving time log data. Check console for details.', 'error')` |
| 11247 | `` `❌ Review request failed: ${result.data?.error \|\| ...}` `` | `error` | `showToast('Review request failed: ' + (result.data?.error \|\| result.data?.message \|\| 'Unknown error'), 'error')` |
| 11250 | `` `❌ Error: ${e}` `` | `error` | `showToast('Error sending review request: ' + e, 'error')` |
| 11574 | `Error opening edit form: ` + error.message | `error` | `showToast('Error opening edit form: ' + error.message, 'error')` |
| 11670 | `Error saving Repair Order: ` + (err.message \|\| JSON.stringify(err)) | `error` | `showToast('Error saving Repair Order: ' + (err.message \|\| 'Unknown error'), 'error')` |
| 12042 | `Failed to update service type: ` + error.message | `error` | `showToast('Failed to update service type: ' + error.message, 'error')` |
| 12166 | `Error loading templates: ` + error.message | `error` | `showToast('Error loading templates: ' + error.message, 'error')` |
| 12231 | `Error loading template tasks: ` + error.message | `error` | `showToast('Error loading template tasks: ' + error.message, 'error')` |
| 12299 | `Error preparing template: ` + (err.message \|\| err) | `error` | `showToast('Error preparing template: ' + (err.message \|\| err), 'error')` |
| 12341 | `Error saving template: ` + err.message | `error` | `showToast('Error saving template: ' + err.message, 'error')` |
| 12420 | `Failed to save: ` + (err.message \|\| err) | `error` | `showToast('Failed to save work order: ' + (err.message \|\| err), 'error')` |
| 12439 | `Failed to update task status.` | `error` | `showToast('Failed to update task status.', 'error')` |
| 13311 | `Google APIs are taking too long to load. Please:\n1. Clear your browser cache...\n2. Refresh the page...` | `error` | `showToast('Google APIs timed out. Clear browser cache (Cmd+Shift+R), then refresh. Try incognito if this persists.', 'error')` |
| 13486 | `Error submitting request: ` + (err.message \|\| err) | `error` | `showToast('Error submitting enhancement request: ' + (err.message \|\| err), 'error')` |
| 13578 | `Error updating status: ` + (err.message \|\| err) | `error` | `showToast('Error updating status: ' + (err.message \|\| err), 'error')` |
| 13589 | `Error saving note: ` + (err.message \|\| err) | `error` | `showToast('Error saving note: ' + (err.message \|\| err), 'error')` |

---

### Category C: Validation Warnings (28 calls)
These guard against missing or invalid user input. They become `warning` type (8s auto-dismiss).

| Line | Current `alert()` Message | Toast Type | Notes |
|---|---|---|---|
| 3291 | `Please connect to PRVS database first!` | `warning` | Repeated at 3358, 3446, 3493, 10243, 10532, 10637 — see below |
| 3358 | `Please connect to PRVS database first!` | `warning` | Same message, different call site |
| 3446 | `Please connect to PRVS database first!` | `warning` | Same |
| 3493 | `Please connect to PRVS database first!` | `warning` | Same |
| 4036 | `Please enter a recipient email address.` | `warning` | `showToast('Please enter a recipient email address.', 'warning')` |
| 4039 | `Please select at least one photo to send.` | `warning` | `showToast('Please select at least one photo to send.', 'warning')` |
| 4302 | `Please enter a field label.` | `warning` | `showToast('Please enter a field label.', 'warning')` |
| 4306 | `A field with a similar name already exists. Please use a different label.` | `warning` | `showToast('A field with a similar name already exists.', 'warning')` |
| 4324 | `No custom fields defined yet. Use "+ Add Field" to create one.` | `info` | Informational guidance, not a blocker → `info` type |
| 4597 | `Please enter your Anthropic API key above the scan button before scanning.` | `warning` | `showToast('Enter your Anthropic API key before scanning.', 'warning')` |
| 5553 | `Please select a start date and time.` | `warning` | `showToast('Please select a start date and time.', 'warning')` |
| 5572 | `Please select at least one service calendar.` | `warning` | `showToast('Please select at least one service calendar.', 'warning')` |
| 6174 | `Part Name is required.` | `warning` | `showToast('Part Name is required.', 'warning')` |
| 6756 | `Could not find RO data. Try refreshing.` | `warning` | `showToast('Could not find RO data. Try refreshing.', 'warning')` |
| 6775 | `This RO is already on your Work List in every silo.` | `info` | Informational, not an error → `info` type |
| 7060 | `RO not visible in current view — it may be filtered out.` | `warning` | `showToast('RO not visible — may be filtered out.', 'warning', { actionLabel: 'Clear Filters', actionCallback: () => { /* see note */ } })` |
| 9658 | `Voice dictation is not supported in this browser. Please use Chrome or Safari.` | `warning` | `showToast('Voice dictation is not supported in this browser. Use Chrome or Safari.', 'warning', { duration: 10000 })` |
| 9820 | `Admin access required.` (in `openDuplicateManager`) | `warning` | `showToast('Admin access required.', 'warning')` |
| 9823 | `No duplicate ROs found.` | `info` | `showToast('No duplicate ROs found.', 'info')` |
| 10178 | `No requester email on file for this RO.\nParts must be requested via the dashboard "Request Parts" button...` | `warning` | `showToast('No requester email on file. Parts must be requested via the "Request Parts" button to capture the requester.', 'warning', { duration: 10000 })` |
| 10243 | `Please connect to PRVS database first!` | `warning` | Same as 3291 |
| 10341 | `Session expired — please refresh the page and try again.` | `warning` | `showToast('Session expired — please refresh the page and try again.', 'warning')` |
| 10344 | `Please describe the parts needed before sending.` | `warning` | `showToast('Please describe the parts needed before sending.', 'warning')` |
| 10347 | `Error: RO not found.` | `error` | This is an error state, not validation → `error` |
| 10532 | `Please connect to PRVS database first!` | `warning` | Same as 3291 |
| 10582 | `Only Managers and Admins can change parts status.` | `warning` | `showToast('Only Managers and Admins can change parts status.', 'warning')` |
| 10637 | `Please connect to PRVS database first!` | `warning` | Same as 3291 |
| 10811 | `No time logs found for this RO` | `info` | `showToast('No time logs found for this RO.', 'info')` |
| 11190 | `No valid phone number on this RO` | `warning` | `showToast('No valid phone number on this RO.', 'warning')` |
| 11232 | `No valid phone number on this RO` | `warning` | Same |
| 11275 | `Admin access required` | `warning` | `showToast('Admin access required.', 'warning')` |
| 11600 | `Google APIs are still loading. Please wait a moment and try again.` | `info` | `showToast('Google APIs are still loading. Please wait and try again.', 'info', { duration: 6000 })` |
| 11647 | `Please connect to PRVS database first!` | `warning` | Same as 3291 |
| 11656 | `Please select at least one Repair Type` | `warning` | `showToast('Please select at least one Repair Type.', 'warning')` |
| 11719 | `Please select at least one Repair Type` | `warning` | Same |
| 12032 | `Session expired — please refresh.` | `warning` | `showToast('Session expired — please refresh the page.', 'warning')` |
| 12052 | `You do not have permission to manage this silo.` | `warning` | `showToast('You do not have permission to manage this silo.', 'warning')` |
| 12232 | `This template has no tasks saved.` | `info` | `showToast('This template has no tasks saved yet.', 'info')` |
| 12264 | `Add at least one task before saving as a template.` | `warning` | `showToast('Add at least one task before saving as a template.', 'warning')` |
| 12349 | `Session expired — please refresh.` | `warning` | Same as 12032 |
| 13429 | `Voice dictation is not supported in this browser. Please use Chrome or Safari.` | `warning` | Same as 9658 |
| 13462 | `Please describe your enhancement request.` | `warning` | `showToast('Please describe your enhancement request.', 'warning')` |
| 13464 | `You must be signed in to submit a request.` | `warning` | `showToast('You must be signed in to submit a request.', 'warning')` |

---

### Category D: Access Control Notices (4 calls)
These tell the user they cannot do something. Use `warning`.

| Line | Current `alert()` Message | Toast Type | Replacement |
|---|---|---|---|
| 3230 | `Admin access required` | `warning` | `showToast('Admin access required.', 'warning')` |
| 3244 | `🔒 Custom view configuration is only available to administrators.` | `warning` | `showToast('Custom view is only available to administrators.', 'warning')` |
| 3252 | `🔒 Expanded view is only available to administrators.` | `warning` | `showToast('Expanded view is only available to administrators.', 'warning')` |
| 4151 | `Admin access required to archive ROs.` | `warning` | `showToast('Admin access required to archive ROs.', 'warning')` |
| 8864 | `Google APIs are still loading. Please wait a moment and try again.` | `info` | `showToast('Google APIs are still loading. Please wait a moment.', 'info', { duration: 6000 })` |

---

### Special: `"Clear Filters" Action Button` (line 7060)
The `alert()` at line 7060 (`RO not visible in current view — it may be filtered out.`) is the ideal candidate for the action button feature. The implementation:

```javascript
// Current (line ~7060):
alert('RO not visible in current view — it may be filtered out.');

// Replace with:
showToast('RO not visible — it may be filtered out.', 'warning', {
  duration: 12000,
  actionLabel: 'Clear Filters',
  actionCallback: function () {
    // Reset all filters to show all ROs
    currentStatusFilters = [];
    currentRepairFilter = 'all';
    currentPartsFilter = 'all';
    currentROTypeFilter = 'all';
    currentDaysFilter = null;
    currentSearchFilter = '';
    document.getElementById('customerSearch').value = '';
    renderBoard();
  }
});
```

---

## 7. Confirm() Dialog Decisions

7 `confirm()` calls exist. Each requires a case-by-case decision: some are genuine two-way decisions (keep), some are just confirmation gates (convert).

### Keep as `confirm()` — Destructive / Irreversible Actions

These involve permanent data deletion or irreversible state changes. The native `confirm()` dialog's blocking nature is a feature here — it ensures the user sees it before the action fires.

| Line | Message | Decision | Rationale |
|---|---|---|---|
| 4168 | `Archive "${ro.customerName}" (${ro.rv}) to Cashiered?\n\nThis will remove it from the active dashboard.` | **Keep `confirm()`** | Irreversible archival. Browser blocking dialog is intentional. |
| 4370 | `Delete custom field "${field.label}"?\n\nThis removes it from all future ROs...` | **Keep `confirm()`** | Schema-level deletion affecting all future ROs. |
| 6286 | `Delete part "${part.partName}"?` | **Keep `confirm()`** | Permanent part deletion. |

### Convert to Toast-with-Action — Non-destructive Confirmations

These are gating dialogs for reversible operations. Replace with a toast that has an "OK" / confirm action button. This is non-blocking and keeps the user in their workflow.

| Line | Message | Implementation |
|---|---|---|
| 4987 | `Insurance fields were detected in this estimate.\n\nConvert this RO to an Insurance Claim?\n\nClick OK for Insurance Claim, Cancel to keep Standard RO.` | Convert to toast — see code below |
| 10186 | `Send "Parts Ordered" notification to ${ro.requestedByEmail}?` + partsPreview | Convert to toast — see code below |
| 10536 | `Confirm parts have been ORDERED for ${ro.customerName}'s RO?\n\nThis will clear the Parts Requested indicator...` | Convert to toast — see code below |
| 11605 | `You are already connected. Do you want to disconnect?` | Convert to toast — see code below |

**Implementation for line 4987 (insurance conversion prompt):**
```javascript
// Current:
const convert = confirm('Insurance fields were detected...');
if (convert) { /* convert to insurance */ }

// Replace with:
showToast('Insurance fields detected. Convert this RO to an Insurance Claim?', 'info', {
  persistent: true,
  actionLabel: 'Convert to Insurance',
  actionCallback: function () {
    // Place the "convert" branch code here
    document.getElementById(mode === 'new' ? 'roTypeInsurance' : 'editRoTypeInsurance').click();
  }
});
// Do NOT auto-proceed — the action callback drives the conversion.
// Remove the if(convert){...} conditional block and move its contents into actionCallback.
```

**Implementation for line 10186 (notify parts requester):**
```javascript
// Current:
if (!confirm('Send "Parts Ordered" notification to ' + ro.requestedByEmail + '?' + partsPreview)) return;

// Replace with:
showToast('Send "Parts Ordered" notification to ' + ro.requestedByEmail + '?', 'info', {
  persistent: true,
  actionLabel: 'Send Notification',
  actionCallback: function () { notifyPartsRequester(filteredIndex); }
});
return; // Exit the current call — the callback drives re-entry
// Note: refactor notifyPartsRequester to skip the confirm step when called from the callback
```

**Implementation for line 10536 (confirm parts ordered):**
```javascript
// Current:
if (!confirm(`Confirm parts have been ORDERED for ${ro.customerName}'s RO?...`)) return;

// Replace with:
showToast('Confirm parts ordered for ' + ro.customerName + '? This clears the Parts Requested indicator.', 'warning', {
  persistent: true,
  actionLabel: 'Confirm Ordered',
  actionCallback: function () { _doMarkPartsOrdered(filteredIndex); }
});
return;
// Move the body of markPartsOrdered (below the confirm check) into _doMarkPartsOrdered()
```

**Implementation for line 11605 (disconnect confirmation):**
```javascript
// Current:
if (confirm('You are already connected. Do you want to disconnect?')) {
  // disconnect logic
}

// Replace with:
showToast('You are already connected. Disconnect?', 'warning', {
  persistent: true,
  actionLabel: 'Disconnect',
  actionCallback: function () {
    // move disconnect logic here
    getSB().auth.signOut();
    clearToken();
    currentData = sampleData;
    updateAuthStatus(false);
    renderBoard();
  }
});
```

---

## 8. Implementation Order

### Phase 1 — Add Toast Component (No `alert()` Changes)

**Goal:** Introduce the toast system without touching any existing `alert()` call. Verify it works in isolation.

**Steps:**
1. Insert the CSS block (Section 4) into `<style>` after the `@keyframes slideUp` block (around line 1637)
2. Insert the JS block (Section 5) into `<script>` immediately before `function init()` (around line 6421)
3. Verify by opening browser console and running: `showToast('Test success', 'success')` — confirm toast appears bottom-right, slides in, auto-dismisses after 4s
4. Run: `showToast('Test error', 'error')` — confirm it is persistent, has a `×` button that works
5. Run 4× `showToast('spam ' + i, 'info')` in a loop — confirm 4th evicts 1st
6. Also replace the two existing proto-toasts with `showToast()`:
   - **Line ~13480:** Replace the inline amber toast in `submitEnhancementRequest()` success path with `showToast('Wish submitted! Roland will review it.', 'success')`
   - **Line ~12336:** Replace the inline flash div in `saveWOTemplate()` with `showToast(overwriteId ? 'Template updated!' : 'Template saved!', 'success', { duration: 2500 })`

**Acceptance gate for Phase 1:** All four toast types display correctly. Max-3 cap works. Existing `alert()` calls still work (no regressions).

---

### Phase 2 — Replace Success/Info Alerts (Lowest Risk)

**Goal:** Replace Category A success confirmations and Category D informational access notices. These carry zero business logic.

**Estimated changes:** ~26 `alert()` calls

**Alert lines to change in this phase:**
- All Category A lines: 3237, 3670, 3674, 3884, 3921, 4068, 9972, 10209, 10464, 10570, 11245, 11703
- Session-expired informational lines: 3609, 3628, 3854
- Category D access notices: 3230, 3244, 3252, 4151
- Informational Category C items: 4324, 6775, 9823, 10811, 12232

**Process for each line:**
1. Find the `alert(...)` call by line number
2. Replace with the corresponding `showToast(...)` from the Migration Table
3. Do not change any surrounding logic — only swap the `alert()` call itself

**Acceptance gate for Phase 2:** All success flows (save photo, send email, mark ordered, save RO) show toast instead of alert. No functional regressions in success paths.

---

### Phase 3 — Replace Error Alerts

**Goal:** Replace all Category B error alerts. These are in `catch` blocks and error branches — they do not affect happy-path logic.

**Estimated changes:** ~47 `alert()` calls

**Alert lines to change in this phase:**
- All Category B lines: 3307, 3347, 3375, 3385, 3438, 3460, 3486, 3509, 3579, 3591, 3614, 3680, 3892, 3894, 4071, 4164, 4182, 4672, 6272, 6298, 6327, 6853, 6868, 8983, 9505, 9982, 10058, 10125, 10212, 10468, 10574, 10690, 10790, 11247, 11250, 11574, 11670, 12042, 12166, 12231, 12299, 12341, 12420, 12439, 13311, 13486, 13578, 13589

**Acceptance gate for Phase 3:** Deliberately trigger errors (disconnect Supabase, submit form with missing data that gets past validation, use admin functions as non-admin) and verify error toasts appear. Toasts must be persistent (no auto-dismiss) and dismissible with `×`.

---

### Phase 4 — Replace Validation Warnings

**Goal:** Replace Category C validation `alert()` calls (input guards, permission checks, system-state guards).

**Estimated changes:** ~28 `alert()` calls

**Alert lines to change in this phase:**
- All Category C and remaining lines: 3291, 3358, 3446, 3493, 4036, 4039, 4302, 4306, 4597, 5553, 5572, 6174, 6756, 7060 (with action button), 9658, 9820, 10178, 10243, 10341, 10344, 10347, 10532, 10582, 10637, 11190, 11232, 11275, 11600, 11647, 11656, 11719, 12032, 12052, 12264, 12349, 13429, 13462, 13464, 8864

**Special:** Line 7060 requires the action button implementation from Section 6. Implement the `clearAllFilters()` helper inline or wire directly to the filter reset variables.

**Acceptance gate for Phase 4:** Submit each form or trigger each guarded action without meeting the precondition. Verify warning toasts appear with 8s auto-dismiss. Verify line 7060 shows an action button that clears filters when clicked.

---

### Phase 5 — Convert Appropriate `confirm()` Dialogs

**Goal:** Replace the 4 non-destructive `confirm()` calls with toast-with-action-button patterns. Keep the 3 destructive `confirm()` calls as-is.

**Alert lines to change in this phase:**
- Line 4987 (insurance conversion prompt)
- Line 10186 (notify parts requester)
- Line 10536 (confirm parts ordered)
- Line 11605 (disconnect confirmation)

**Acceptance gate for Phase 5:** Each action-toast appears, remains visible until user acts, and the correct outcome (conversion, notification, mark-ordered, disconnect) occurs when the action button is clicked. Dismissing the toast without clicking the action button results in no action (matches `confirm()` cancel behavior).

---

## 9. Integration Notes & Edge Cases

### 1. The `"Please connect to PRVS database first!"` Pattern (8 occurrences)
This message appears at lines 3291, 3358, 3446, 3493, 10243, 10532, 10637, 11647. All eight are identical guards for `getSB()` being null. Replace all eight with:
```javascript
showToast('Please connect to the PRVS database first.', 'warning');
```
This is safe to do as a global find-and-replace on the exact string.

### 2. `alert()` inside Inline `onclick` Attributes
The codebase has 193 inline `onclick` attributes. None of the 116 `alert()` calls appear to be embedded in inline HTML attributes — they are all inside the main `<script>` block. Verify this assumption before Phase 2 with: `grep -n 'onclick.*alert' index.html`

### 3. `alert()` with `\n` Multi-line Content
Several alerts contain `\n\n` line breaks used for visual spacing (e.g., line 3237, 3892, 13311). Since toasts display plain text, these must be condensed to single-line or use a period/dash separator. The Migration Table already accounts for this — follow the provided replacement strings exactly.

### 4. The `slideIn` Keyframe Missing
The existing proto-toast at line 13480 references `animation: slideIn 0.3s ease` which does not exist in the stylesheet (this silently degrades to no animation). When replacing this toast with `showToast()` in Phase 1, the keyframe issue is automatically resolved because the new `toast-slide-in` keyframe is used instead.

### 5. `return` Statements After Alert in Guard Clauses
Most guard `alert()` calls are immediately followed by `return`. Pattern:
```javascript
if (!condition) { alert('message'); return; }
```
When replacing, preserve the `return` — the `showToast()` call is non-blocking but the `return` still terminates the function:
```javascript
if (!condition) { showToast('message', 'warning'); return; }
```

### 6. `alert()` Inside `async` Functions with `await`
Many `alert()` calls are in async functions. Because `showToast()` is synchronous (returns immediately), there is no change to the async flow. Do not add `await` before `showToast()`.

### 7. Toast Container Positioning with Work List Panel Open
The Work List panel (`#workListPanel`) is `360px` wide, slides in from the right, z-index 12000. The toast container is at `right: 24px`, z-index 13000. When both are open simultaneously, toasts appear above the panel (correct z-index) but may overlap the panel's right edge. This is acceptable — toasts are transient and the overlap is brief.

If this visual conflict is deemed unacceptable, a future enhancement could detect `_workListOpen === true` and shift the toast container's `right` value to `388px` dynamically. This is **out of scope** for this implementation.

### 8. Reduced Motion Accessibility
Browsers that honor `prefers-reduced-motion` should not animate toasts. Add this rule to the CSS block in Phase 1 (after the `@keyframes` declarations):
```css
@media (prefers-reduced-motion: reduce) {
  .toast, .toast.toast-exiting {
    animation: none;
    transition: none;
  }
}
```

### 9. HTML Escaping in Toast Messages
The JS implementation in Section 5 escapes `& < > "` in the message string before injecting into `innerHTML`. This prevents XSS if any error message accidentally contains user-sourced content (e.g., `err.message` from a Supabase error that might echo back a query fragment). Do not bypass this by using `el.innerHTML = message` directly — always use the `escapedMsg` path.

### 10. Multiple Toasts from Rapid User Actions
If a user clicks "Save Part" rapidly 5 times (e.g., spamming a button), 5 error toasts could fire in quick succession. The TOAST_MAX = 3 cap handles this — the oldest toast is evicted each time the cap is reached. No special debounce is needed for the toast system itself.

### 11. Cleanup of `saveWOTemplate()` Flash Div (Line ~12336)
The existing flash div is:
```javascript
const flash = document.createElement('div');
flash.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);...z-index:9999;...';
flash.textContent = overwriteId ? '✅ Template updated!' : '✅ Template saved!';
document.body.appendChild(flash);
setTimeout(() => flash.remove(), 2500);
```
Replace the entire 4-line block with:
```javascript
showToast(overwriteId ? 'Template updated!' : 'Template saved!', 'success', { duration: 2500 });
```

---

## 10. Acceptance Criteria

All criteria must pass before the implementation is complete.

### Given/When/Then

**Toast appearance:**
- Given any `showToast()` call is made, when the DOM is ready, then a toast appears in the bottom-right corner within 1 frame
- Given a `success` toast is shown, then it has a green left border, `✓` icon, and auto-dismisses after exactly 4 seconds
- Given an `error` toast is shown, then it has a red left border, `✕` icon, never auto-dismisses, and has a working `×` button
- Given a `warning` toast is shown, then it has an amber left border, `⚠` icon, and auto-dismisses after 8 seconds
- Given an `info` toast is shown, then it has a blue left border, `ℹ` icon, and auto-dismisses after 4 seconds

**Toast stacking:**
- Given 3 toasts are visible, when a 4th is triggered, then the oldest toast plays its exit animation and is removed before the 4th appears
- Given 2 toasts are visible, when the older one is manually dismissed, then the remaining toast smoothly reflows to fill the gap

**Progress bar:**
- Given a non-persistent toast is displayed, then a colored progress bar is visible at the bottom and its width reaches 0% at exactly the moment the toast begins its exit animation
- Given a persistent (error) toast is displayed, then no progress bar is visible

**Migration — zero alert() calls:**
- Given the Phase 5 implementation is complete, when `grep -c 'alert(' index.html` is run, then the count equals 0 (or equals the number of `alert(` string occurrences in comments/strings that are not actual calls)

**Migration — confirm() preserved:**
- Given the implementation is complete, then `confirm()` still appears at lines 4168, 4370, and 6286 (archive RO, delete custom field, delete part) and functions identically to pre-migration behavior

**Action button:**
- Given a toast with an action button is shown, when the user clicks the action button, then the callback fires and the toast dismisses
- Given a toast with an action button is shown, when the user clicks `×`, then the toast dismisses and the callback does NOT fire

**Visual fidelity:**
- Given the app is loaded, then the toast container has no visible presence until a toast is triggered (no empty white box, no border artifact)
- Given a toast is displayed in Barlow Condensed font, then its text is visually consistent with the rest of the dashboard's UI text

**Z-index:**
- Given the Work Order Template overlay (z-index 100000) is open, when a toast is triggered, then the toast appears behind the overlay (toasts at 13000 are obscured by 100000 — this is correct behavior)
- Given the Work List panel (z-index 12000) is open, when a toast is triggered, then the toast appears above the panel

---

*End of TOAST_SYSTEM_SPEC.md — v1.0, prepared for PRVS Dashboard v1.308*
