// js/i18n.js — Internationalization module
// ─────────────────────────────────────────────────────────────────────
// PHASE 5 (Session 76, 2026-05-25) — All 5 i18n functions extracted as a
// real ES module. Pure-additive: inline copies in index.html still own
// runtime. Module versions are bridged to window so a future Phase 19
// cleanup can delete the inline copies without breaking call sites.
//
// Translation system overview:
//   - English is the canonical UI language; Spanish keys live in
//     TRANSLATIONS_ES (config.js, ~104 entries).
//   - User preference is persisted in localStorage as 'prvs_lang'
//     ('en' or 'es'). No in-memory state — localStorage IS the state.
//   - Static UI elements opt in via `data-i18n="<English string>"` or
//     `data-i18n-ph="<English placeholder>"`. setupI18n() tags the
//     core navigation/header elements imperatively at boot.
//   - translateStaticUI() re-scans tagged elements on every language
//     change. setLang() also calls renderBoard() so card content
//     re-renders with the new language (renderBoard uses t() inline
//     for dynamic content).
//
// Exports:
//   getLang()           — returns 'en' | 'es' from localStorage
//   setLang(lang)       — persists choice, re-renders UI + board
//   t(str)              — lookup helper (returns Spanish if available, else passthrough)
//   translateStaticUI() — re-scans data-i18n / data-i18n-ph tagged elements
//   setupI18n()         — boot-time tagger; called from inline init in index.html
//
// Imports from config.js:
//   TRANSLATIONS_ES — { 'English string': 'Spanish string', ... }
//
// External refs accessed via window (inline-defined, not yet modularized):
//   window.renderBoard — called from setLang to re-render data-driven cards
// ─────────────────────────────────────────────────────────────────────

import { TRANSLATIONS_ES } from './config.js';

/** Return the current language preference ('en' or 'es'). Defaults to 'en'. */
export function getLang() {
    return localStorage.getItem('prvs_lang') || 'en';
}

/**
 * Persist the chosen language to localStorage and re-render UI.
 * Calls translateStaticUI() for header/labels and window.renderBoard()
 * for the data-driven card grid. Also updates the toggle button label.
 */
export function setLang(lang) {
    localStorage.setItem('prvs_lang', lang);
    translateStaticUI();
    if (typeof window.renderBoard === 'function') {
        window.renderBoard();
    }
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = lang === 'es' ? '🌐 EN' : '🌐 ES';
}

/**
 * Lookup helper. If the current language is 'es' and a translation exists in
 * TRANSLATIONS_ES, return it. Otherwise return the original string (English
 * passthrough). Safe to call with any string — missing translations don't throw.
 */
export function t(str) {
    if (getLang() !== 'es') return str;
    return (TRANSLATIONS_ES[str] !== undefined) ? TRANSLATIONS_ES[str] : str;
}

/**
 * Re-scan the DOM for elements tagged with data-i18n and data-i18n-ph and
 * apply translations. Called by setLang() on every language change and once
 * at boot by setupI18n().
 *
 * data-i18n: replaces element textContent. Preserves child element nodes by
 *   only updating the first non-empty TEXT_NODE child if the element has any
 *   ELEMENT_NODE children (used for buttons with chevron/dot span children).
 * data-i18n-ph: replaces the placeholder attribute on inputs.
 */
export function translateStaticUI() {
    // Translate elements tagged with data-i18n (text content)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translated = t(key);
        // If element has child element nodes (spans etc.), only update first text node
        const hasChildElements = [...el.childNodes].some(n => n.nodeType === Node.ELEMENT_NODE);
        if (hasChildElements) {
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    node.textContent = translated + ' ';
                    break;
                }
            }
        } else {
            el.textContent = translated;
        }
    });
    // Translate placeholder attributes
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPh);
    });
    // Sync lang toggle button label
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = getLang() === 'es' ? '🌐 EN' : '🌐 ES';
}

/**
 * Boot-time setup. Imperatively tags static header/nav elements with
 * data-i18n (where they otherwise have no clean handle) and applies the
 * persisted language on initial load. Called once from inline init in
 * index.html — must run AFTER the DOM has the static elements present
 * (i.e., after DOMContentLoaded or in a deferred script).
 */
export function setupI18n() {
    // Tag static header elements
    const h1 = document.querySelector('header h1');
    if (h1) h1.dataset.i18n = 'PRVS Repair Order Dashboard';
    const newROBtn = document.getElementById('newROBtn');
    if (newROBtn) newROBtn.dataset.i18n = '+ New RO';
    const liveSpan = document.querySelector('.live-indicator span:last-child');
    if (liveSpan) liveSpan.dataset.i18n = 'Live';
    const searchLabel = document.querySelector('.search-label');
    if (searchLabel) searchLabel.dataset.i18n = '🔍 Search:';
    const searchInput = document.getElementById('customerSearch');
    if (searchInput) searchInput.dataset.i18nPh = 'Search name, RO ID, VIN, tech, description, phone…';
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.dataset.i18n = '✕ Clear';
    // Tag filter section labels (preserve child spans)
    document.querySelectorAll('.filter-label').forEach(el => {
        // Grab the text-only content (ignore child spans like chevron/dot)
        let text = '';
        el.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) text += n.textContent; });
        text = text.trim();
        if (text && TRANSLATIONS_ES[text]) el.dataset.i18n = text;
    });
    // Tag filter buttons (only ones with translatable text)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const key = btn.textContent.trim();
        if (TRANSLATIONS_ES[key] !== undefined) btn.dataset.i18n = key;
    });
    // Apply initial language (in case user has ES set from previous session)
    translateStaticUI();
}

// ─────────────────────────────────────────────────────────────────────
// Window bridge — onclick handlers in index.html call setLang() directly
// (e.g., the language toggle button). Inline setupI18n() is called from
// the boot init flow. Bridging all 5 keeps the existing call sites
// working when Phase 19 cleanup eventually deletes the inline copies.
// ─────────────────────────────────────────────────────────────────────

Object.assign(window, {
    getLang,
    setLang,
    t,
    translateStaticUI,
    setupI18n,
});
