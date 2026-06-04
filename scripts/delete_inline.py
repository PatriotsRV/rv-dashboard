#!/usr/bin/env python3
"""delete_inline.py — Session 91 delete-inline execution (Phases 13/14/15/17/18).

Removes the 40 inline function bodies from index.html whose byte-identical
module twins already own window.* at runtime (verified by verify_inline.py).
Deletes bottom-to-top (offset-stable), leaving a greppable marker per fn:
    // [PHASE N DELETED v1.443 S91] name() -> js/mod.js

Run verify_inline.py FIRST. This script re-verifies byte-identity before
each deletion and aborts on any mismatch.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_inline import MODULES, extract_function, REPO, INDEX

PHASE = {
    "js/qr.js": 13,
    "js/work-list.js": 14,
    "js/insurance.js": 15,
    "js/duplicates.js": 17,
    "js/enhancement.js": 18,
}
VERSION = "v1.443"
SESSION = "S91"


def main():
    with open(INDEX, encoding="utf-8") as f:
        src = f.read()

    spans = []  # (start, end, marker)
    for mod_path, names in MODULES.items():
        with open(os.path.join(REPO, mod_path), encoding="utf-8") as f:
            mod_src = f.read()
        for name in names:
            mod_hits = extract_function(mod_src, name)
            inline_hits = extract_function(src, name)
            if len(mod_hits) != 1 or len(inline_hits) != 1:
                sys.exit(f"ABORT: {name} — module hits {len(mod_hits)}, inline hits {len(inline_hits)}")
            if mod_hits[0][2] != inline_hits[0][2]:
                sys.exit(f"ABORT: {name} — body mismatch, run verify_inline.py")
            start, end, _ = inline_hits[0]
            # extend start back to beginning of line to capture indent
            line_start = src.rfind("\n", 0, start) + 1
            indent = src[line_start:start]
            if indent.strip() != "":
                sys.exit(f"ABORT: {name} — non-whitespace before decl on its line")
            marker = f"{indent}// [PHASE {PHASE[mod_path]} DELETED {VERSION} {SESSION}] {name}() -> {mod_path}"
            spans.append((line_start, end, marker))

    # bottom-to-top so earlier offsets stay valid
    spans.sort(key=lambda s: s[0], reverse=True)
    for start, end, marker in spans:
        src = src[:start] + marker + src[end:]

    with open(INDEX, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"Deleted {len(spans)} inline bodies, markers left in place.")
    print(f"New line count: {src.count(chr(10)) + 1}")


if __name__ == "__main__":
    main()
