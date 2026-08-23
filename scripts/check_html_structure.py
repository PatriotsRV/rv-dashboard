#!/usr/bin/env python3
"""
check_html_structure.py — structural sanity gate for every shipped HTML page.

WHY THIS EXISTS (Session 179, 2026-08-23)
-----------------------------------------
v1.498 shipped a production outage that nothing caught. The favicon insert
(ER d432863a) targeted the FIRST literal "<head>" text match in index.html.
That match was not the real document head — it was inside the header changelog
comment, in the v1.481 sidebar write-up. The injected block carried its own
comment terminator, which closed the changelog comment ~630 lines early:

  * the real <head> never received the favicon
  * ~630 lines of changelog rendered as visible body text
  * the dashboard was unusable in production until Roland found it by hand

audit_codebase.py DID flag it — as 3 Class F "hardcoded role/email" BLOCKING
findings. Those were real: the audit's comment mask correctly determined those
changelog lines were no longer inside a comment, so it read the prose as live
code. But "Class F in the changelog" looks like noise, so it was logged as
"false positives from header line shift" and dismissed, and prod shipped broken.

The lesson: the breakage could only ever surface INDIRECTLY, because nothing
validated HTML structure. This script closes that gap by asserting the
invariants directly, so the failure message names the actual problem.

CHECKS (all BLOCKING — exit 1 on any failure)
---------------------------------------------
  1. comment delimiters balance ("<!--" count == "-->" count)
  2. no nested comment start (a "<!--" before the previous one closed)
  3. the document parses with <html> present, and nothing renders before it
  4. <head> contains a <title> (the canary — an early-closed comment empties head)
  5. no header-changelog prose leaks into <body>
  6. no literal "<head>"/"<body>" tag token inside any comment — the landmine
     that let a text-matching insert fire in the wrong place to begin with

Usage:
    python3 scripts/check_html_structure.py [file.html ...]     # default: all *.html
Exit code: 0 if every page passes, 1 otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import html5lib
except ImportError:
    sys.stderr.write(
        "ERROR: html5lib is required.\n"
        "  pip install html5lib --break-system-packages\n"
    )
    sys.exit(2)

REPO = Path(__file__).resolve().parent.parent

# Pages that are deliberately partial/experimental and not shipped as documents.
SKIP = {"index.draft.html"}

# Strings that must only ever appear inside the header changelog comment.
# If any of these turns up in the rendered body, a comment closed early.
CHANGELOG_CANARIES = [
    "layout-sidebar before paint",
    "TEXTLY PIVOT",
    "Kenect history import",
    "ER QUICK-WIN BATCH",
    "Sync Gate Case B",
]


class Failure(Exception):
    pass


def check_comment_balance(src: str) -> list[str]:
    problems = []
    opens = src.count("<!--")
    closes = src.count("-->")
    if opens != closes:
        problems.append(
            f"comment delimiters unbalanced: {opens} '<!--' vs {closes} '-->' "
            f"(an unclosed comment swallows the document; an extra terminator "
            f"closes one early and dumps its contents into the page)"
        )
    # A '<!--' appearing before the previous comment closed.
    if re.search(r"<!--(?:(?!-->).)*?<!--", src, re.S):
        problems.append(
            "nested comment start: a '<!--' appears before the previous comment "
            "closed. HTML has no nested comments — the first '-->' ends both."
        )
    return problems


def check_no_tag_tokens_in_comments(src: str) -> list[str]:
    """The v1.498 landmine: a literal <head>/<body> inside a comment is a
    target for any text-matching insert, which then fires in the wrong place."""
    problems = []
    for m in re.finditer(r"<!--(.*?)-->", src, re.S):
        body = m.group(1)
        for tag in ("<head>", "<body>"):
            if tag in body:
                line = src[: m.start()].count("\n") + 1
                problems.append(
                    f"line {line}: literal '{tag}' inside a comment. This is what "
                    f"broke v1.498 — a script searching for the first '{tag}' "
                    f"matched here instead of the real document. Reword it "
                    f"(e.g. 'head-level script')."
                )
    return problems


def check_parsed_document(src: str) -> list[str]:
    problems = []

    if "<html" not in src:
        return ["no <html> tag found"]

    # Nothing but whitespace/doctype/comments may precede <html>.
    pre = src[: src.index("<html")]
    stripped = re.sub(r"<!--.*?-->", "", pre, flags=re.S)
    stripped = re.sub(r"<!DOCTYPE[^>]*>", "", stripped, flags=re.I).strip()
    if stripped:
        problems.append(
            f"content renders before <html>: {stripped[:120]!r} — almost always "
            f"a comment that closed early"
        )

    doc = html5lib.parse(src, namespaceHTMLElements=False)
    head, body = doc.find("head"), doc.find("body")

    if head is None:
        return problems + ["parsed document has no <head>"]

    if head.find("title") is None:
        problems.append(
            "<head> has no <title>. This is the canary: when a comment closes "
            "early the parser bails out of head, and title/scripts/links all "
            "land in body instead."
        )

    if body is not None:
        body_text = "".join(body.itertext())
        leaked = [c for c in CHANGELOG_CANARIES if c in body_text]
        if leaked:
            problems.append(
                f"header changelog text is rendering in <body>: {leaked!r}. "
                f"The changelog comment closed early."
            )

    return problems


def check_file(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8", errors="replace")
    return (
        check_comment_balance(src)
        + check_no_tag_tokens_in_comments(src)
        + check_parsed_document(src)
    )


def main(argv: list[str]) -> int:
    if argv:
        targets = [Path(a) for a in argv]
    else:
        targets = sorted(p for p in REPO.glob("*.html") if p.name not in SKIP)

    total_problems = 0
    for path in targets:
        if not path.exists():
            print(f"✗ {path}: not found")
            total_problems += 1
            continue
        problems = check_file(path)
        if problems:
            total_problems += len(problems)
            print(f"\n✗ {path.name}")
            for p in problems:
                print(f"    - {p}")
        else:
            print(f"✓ {path.name}")

    print()
    if total_problems:
        print(f"❌ {total_problems} structural problem(s) across {len(targets)} page(s)")
        print("   These are BLOCKING. A page that fails here is broken in a browser.")
        return 1
    print(f"✓ All {len(targets)} page(s) structurally sound")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
