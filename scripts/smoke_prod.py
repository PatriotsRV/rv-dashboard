#!/usr/bin/env python3
"""
smoke_prod.py — does the LIVE production dashboard actually work?

WHY THIS EXISTS (Session 179, 2026-08-23)
-----------------------------------------
S178's "prod check" was a curl. A curl returns HTTP 200 for a completely
broken page, so v1.498 passed its post-deploy check while the dashboard was
rendering ~630 lines of changelog as body text. Roland found the outage
himself, by opening the site.

Availability is not correctness. This script fetches the real page and asserts
it is a working dashboard: structure intact, no changelog leak, the expected
app scaffolding present, and version.json agreeing with the served HTML.

Usage:
    python3 scripts/smoke_prod.py [--url https://...] [--expect-version 1.499]
Exit code: 0 healthy, 1 broken.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request

try:
    import html5lib
except ImportError:
    sys.stderr.write("ERROR: pip install html5lib --break-system-packages\n")
    sys.exit(2)

DEFAULT_URL = "https://patriotsrv.github.io/rv-dashboard/"

# Markers that must only ever live inside the header changelog comment.
CHANGELOG_CANARIES = [
    "layout-sidebar before paint",
    "TEXTLY PIVOT",
    "Kenect history import",
    "Sync Gate Case B",
]

# Scaffolding a working dashboard always renders.
REQUIRED_MARKERS = [
    "PRVS Repair Order Dashboard",
    "New Repair Order",
]


def fetch(url: str, timeout: int = 30) -> str:
    # Cache-bust so we never smoke-test a stale CDN copy.
    sep = "&" if "?" in url else "?"
    req = urllib.request.Request(
        f"{url}{sep}_smoke=1",
        headers={"User-Agent": "prvs-smoke/1.0", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return r.read().decode("utf-8", errors="replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--expect-version", default=None,
                    help="Optional: assert the served page reports this version.")
    args = ap.parse_args()

    problems: list[str] = []

    try:
        html = fetch(args.url)
    except Exception as e:
        print(f"❌ could not fetch {args.url}: {e}")
        return 1

    print(f"fetched {args.url} ({len(html):,} bytes)")

    # ── structure ────────────────────────────────────────────────────
    doc = html5lib.parse(html, namespaceHTMLElements=False)
    head, body = doc.find("head"), doc.find("body")

    if head is None or head.find("title") is None:
        problems.append(
            "<head> has no <title> — the page's head collapsed. This is the exact "
            "signature of the v1.498 outage (a comment closing early)."
        )
    else:
        print(f"  title: {head.find('title').text}")

    body_text = "".join(body.itertext()) if body is not None else ""

    leaked = [c for c in CHANGELOG_CANARIES if c in body_text]
    if leaked:
        problems.append(f"changelog text is rendering in the page body: {leaked!r}")

    missing = [m for m in REQUIRED_MARKERS if m not in body_text]
    if missing:
        problems.append(f"expected dashboard content missing from the page: {missing!r}")

    if html.count("<!--") != html.count("-->"):
        problems.append(
            f"comment delimiters unbalanced in the SERVED html "
            f"({html.count('<!--')} open vs {html.count('-->')} close)"
        )

    # ── version agreement ────────────────────────────────────────────
    served = re.search(r"PRVS Dashboard v(\d+\.\d+)", html)
    served_ver = served.group(1) if served else None
    print(f"  version in html: {served_ver}")

    try:
        vj = json.loads(fetch(args.url.rstrip("/") + "/version.json"))
        vj_ver = vj.get("version")
        print(f"  version.json:    {vj_ver}")
        if served_ver and vj_ver and served_ver != vj_ver:
            problems.append(
                f"version.json ({vj_ver}) disagrees with the served page "
                f"({served_ver}) — the refresh poller will misfire"
            )
    except Exception as e:
        problems.append(f"version.json unreadable: {e}")
        vj_ver = None

    if args.expect_version:
        want = args.expect_version.lstrip("v")
        if served_ver != want:
            problems.append(f"expected version {want}, page serves {served_ver}")

    # ── verdict ──────────────────────────────────────────────────────
    print()
    if problems:
        print(f"❌ PRODUCTION IS BROKEN — {len(problems)} problem(s):")
        for p in problems:
            print(f"    - {p}")
        return 1
    print("✓ production healthy: structure intact, no changelog leak, versions agree")
    return 0


if __name__ == "__main__":
    sys.exit(main())
