#!/usr/bin/env python3
"""
check_version_sync.py — Session 182 (2026-08-24)

Asserts that the dashboard's version number agrees everywhere it appears, and
that no JS module has re-grown a private hardcoded copy of it.

WHY THIS EXISTS
---------------
The new-version banner works by comparing version.json (fetched at runtime)
against the version the tab is RUNNING. Those two numbers were maintained by
hand in separate files. js/ro-crud.js carried `const APP_VERSION = '1.496'`
with only a code comment marking it as a bump site; the release checklist
named index.html and version.json and never named it.

It was missed on v1.497, v1.498 and v1.499. Result: every client compared
1.499 against 1.496 and the comparison could never come out equal. The banner
told the whole shop to refresh, refreshing served the same stale constant, and
the banner came straight back. Worse, the hidden-tab branch of the same check
calls location.reload() outright, so every idle tab reloaded itself every five
minutes for two days.

A comment saying "BUMP SITE: keep in sync" is not a mechanism. This is.

WHAT IT ENFORCES
----------------
  1. version.json parses and holds a plausible version string.
  2. index.html declares the running version exactly once, as
     `window.APP_VERSION = '<v>'`.
  3. That declaration matches version.json.
  4. The header changelog's `PRVS Dashboard v<v>` title line matches too.
  5. No file under js/ hardcodes its own APP_VERSION assignment. This is the
     specific regression that caused the outage, so it is checked by shape and
     not by memory.

DELIBERATELY BLUNT
------------------
Check 5 scans raw text and does NOT skip comments, so writing the offending
declaration inside a code comment will trip it. That is on purpose, and it
already fired once on this file's own prose during S182. Do not "fix" it by
teaching it to strip comments: S179 lost a day of production to a literal tag
sitting in a comment, and the lesson recorded there was to reword the prose,
not to loosen the detector. A checker that is occasionally annoying beats a
clever one that misses the real thing. Reword the comment.

Exit 0 = consistent. Exit 1 = BLOCKING; see .github/workflows/ci-guardrails.yml.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

VERSION_RE = re.compile(r"^\d+\.\d+[A-Za-z0-9.\-]*$")
DECL_RE = re.compile(r"""window\.APP_VERSION\s*=\s*['"]([^'"]+)['"]""")
TITLE_RE = re.compile(r"PRVS Dashboard v(\d+\.\d+[A-Za-z0-9.\-]*)")
# A bare `const/let/var APP_VERSION = '...'` — a module minting its own copy.
# `window.APP_VERSION` reads are fine and must not match.
HARDCODE_RE = re.compile(
    r"""(?<!\.)\b(?:const|let|var)\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]"""
)

failures = []
notes = []


def fail(msg):
    failures.append(msg)


# ── 1. version.json ──────────────────────────────────────────────────────
version_json_path = ROOT / "version.json"
declared = None
if not version_json_path.exists():
    fail("version.json is missing — the update poller has nothing to fetch.")
else:
    try:
        payload = json.loads(version_json_path.read_text(encoding="utf-8"))
        declared = str(payload.get("version", "")).strip()
        if not declared:
            fail("version.json has no 'version' key.")
        elif not VERSION_RE.match(declared):
            fail(f"version.json version {declared!r} is not a plausible version string.")
        else:
            notes.append(f"version.json            = {declared}")
    except (json.JSONDecodeError, OSError) as exc:
        fail(f"version.json could not be read: {exc}")


# ── 2 & 3. the single declaration in index.html ──────────────────────────
index_path = ROOT / "index.html"
running = None
if not index_path.exists():
    fail("index.html is missing.")
else:
    html = index_path.read_text(encoding="utf-8")
    decls = DECL_RE.findall(html)
    if not decls:
        fail(
            "index.html does not declare window.APP_VERSION. The poller in "
            "js/ro-crud.js reads it to learn what this tab is running; without "
            "it the check fails closed and the banner never appears."
        )
    elif len(set(decls)) > 1:
        fail(
            "index.html declares window.APP_VERSION more than once with "
            f"conflicting values: {sorted(set(decls))}. There must be exactly "
            "one bump site."
        )
    else:
        running = decls[0]
        notes.append(f"index.html APP_VERSION  = {running}")
        if len(decls) > 1:
            notes.append(
                f"  (declared {len(decls)}x, all agreeing — collapse to one)"
            )
        if declared and running != declared:
            fail(
                f"MISMATCH: index.html is running {running!r} but version.json "
                f"advertises {declared!r}.\n"
                "         Every client would compare these two and conclude an "
                "update is available,\n"
                "         forever. This is the v1.497-v1.499 defect exactly. "
                "Bump both, or neither."
            )

    # ── 4. header changelog title line ───────────────────────────────────
    title = TITLE_RE.search(html)
    if not title:
        fail("index.html header changelog has no 'PRVS Dashboard v<version>' line.")
    else:
        notes.append(f"index.html changelog    = {title.group(1)}")
        if running and title.group(1) != running:
            fail(
                f"Header changelog says v{title.group(1)} but the running "
                f"version is {running}. The changelog is what a human reads to "
                "find out what shipped; it must not lie."
            )


# ── 5. no module may mint its own copy ───────────────────────────────────
js_dir = ROOT / "js"
if js_dir.is_dir():
    for path in sorted(js_dir.rglob("*.js")):
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in HARDCODE_RE.finditer(text):
            line = text[: match.start()].count("\n") + 1
            fail(
                f"{path.relative_to(ROOT)}:{line} hardcodes "
                f"APP_VERSION = {match.group(1)!r}.\n"
                "         This is the exact defect that shipped in v1.497-"
                "v1.499: a second copy of the\n"
                "         version that nothing forces anyone to update. Read "
                "window.APP_VERSION instead."
            )


# ── report ───────────────────────────────────────────────────────────────
print("PRVS version sync check")
print("-" * 60)
for note in notes:
    print(f"  {note}")

if failures:
    print()
    print(f"BLOCKING — {len(failures)} problem(s):")
    print()
    for item in failures:
        print(f"  ✗ {item}")
    print()
    print(
        "The version number is a promise to every browser on the lot. When it\n"
        "disagrees with itself, the update banner becomes undismissable and\n"
        "idle tabs reload in a loop. Fix the numbers; do not skip this check."
    )
    sys.exit(1)

print()
print("  ✓ all version sites agree; no module hardcodes its own copy")
sys.exit(0)
