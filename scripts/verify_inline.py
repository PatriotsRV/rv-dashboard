#!/usr/bin/env python3
"""verify_inline.py — Session 91 delete-inline pre-check (Phases 13/14/15/17/18).

For each module, parse `export [async] function NAME` declarations, then locate
the inline twin in index.html (brace-matched) and confirm the bodies are
byte-identical (module body minus the injected `export ` == inline body).

Also scans for top-level (non-function-wrapped) calls to any target function
in the inline script blocks, which would make deletion unsafe.

Usage: python3 scripts/verify_inline.py
Exit 0 = all verified byte-identical + no top-level calls. Non-zero otherwise.
"""

import re
import sys
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(REPO, "index.html")

MODULES = {
    "js/qr.js": ["openQRModal", "printQRLabel", "handleDeepLink"],
    "js/work-list.js": [
        "daysSinceAddedToWorkList", "toggleWorkListPanel", "_populateManagerPicker",
        "loadWorkList", "addToWorkList", "_showSiloPickerForAdd",
        "_addToWorkListWithSilo", "removeFromWorkList", "_saveWorkListOrder",
        "_initWorkListBtn", "_renderWorkListSiloTabs", "_setWorkListSilo",
        "renderWorkList",
    ],
    "js/insurance.js": [
        "renderCustomFields", "openEstimateScanner", "handleEstimateFile",
        "callClaudeVision", "renderSuggestions", "applyChip", "applyChipConflict",
        "writeInsuranceData",
    ],
    "js/duplicates.js": [
        "getBaseROId", "findDuplicateGroups", "openDuplicateManager",
        "highlightDupeRows", "executeDupeMerge",
    ],
    "js/enhancement.js": [
        "openERModal", "closeERModal", "startERDictation",
        "submitEnhancementRequest", "loadERUnreviewedCount", "openERAdminView",
        "closeERAdminView", "loadERAdminData", "filterERAdmin", "updateERStatus",
        "saveERNote",
    ],
}


def extract_function(src, name):
    """Find `[async ]function NAME(` at any indent, return (start, end, text)
    via brace matching. Returns list of all occurrences."""
    out = []
    for m in re.finditer(
        r"^([ \t]*)(?:export\s+)?((?:async\s+)?function\s+" + re.escape(name) + r"\s*\()",
        src, re.M,
    ):
        start = m.start(2)
        i = src.index("{", m.end(2) - 1) if "{" not in m.group(2) else m.end(2)
        # walk from the first '{' after the param list
        i = src.index("{", start)
        depth = 0
        j = i
        in_str = None
        in_line_comment = in_block_comment = in_regex = in_regex_class = False
        prev = ""
        last_sig = ""  # last significant (non-ws, non-comment) char — regex-vs-division heuristic
        while j < len(src):
            c = src[j]
            if in_line_comment:
                if c == "\n":
                    in_line_comment = False
            elif in_block_comment:
                if prev == "*" and c == "/":
                    in_block_comment = False
            elif in_regex:
                if c == "\\":
                    j += 2
                    prev = ""
                    continue
                if in_regex_class:
                    if c == "]":
                        in_regex_class = False
                elif c == "[":
                    in_regex_class = True
                elif c == "/":
                    in_regex = False
                    last_sig = "/"
            elif in_str:
                if c == "\\":
                    j += 2
                    prev = ""
                    continue
                if c == in_str:
                    in_str = None
                elif in_str == "`" and c == "$" and j + 1 < len(src) and src[j + 1] == "{":
                    # template literal interpolation — brace-match inside
                    depth_t = 0
                    k = j + 1
                    while k < len(src):
                        if src[k] == "{":
                            depth_t += 1
                        elif src[k] == "}":
                            depth_t -= 1
                            if depth_t == 0:
                                break
                        k += 1
                    j = k
            else:
                if c in "\"'`":
                    in_str = c
                elif c == "/" and j + 1 < len(src) and src[j + 1] == "/":
                    in_line_comment = True
                elif c == "/" and j + 1 < len(src) and src[j + 1] == "*":
                    in_block_comment = True
                elif c == "/":
                    # regex literal if last significant char can't end an expression
                    if last_sig == "" or last_sig in "(,=:[!&|?{};+-*%<>~^" or last_sig == "n" and src[max(0, j - 6):j].endswith("return"):
                        in_regex = True
                    last_sig = c
                elif c == "{":
                    depth += 1
                    last_sig = c
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        out.append((m.start(2), j + 1, src[m.start(2):j + 1]))
                        break
                    last_sig = c
                elif not c.isspace():
                    last_sig = c
            prev = c
            j += 1
    return out


def main():
    with open(INDEX, encoding="utf-8") as f:
        index_src = f.read()

    failures = []
    total = 0
    results = []

    for mod_path, names in MODULES.items():
        with open(os.path.join(REPO, mod_path), encoding="utf-8") as f:
            mod_src = f.read()
        for name in names:
            total += 1
            mod_hits = extract_function(mod_src, name)
            # module decl carries `export ` prefix — extract_function matches the
            # `function` keyword, so export prefix is naturally excluded
            inline_hits = extract_function(index_src, name)
            if len(mod_hits) != 1:
                failures.append(f"{mod_path}:{name} — {len(mod_hits)} decls in module (want 1)")
                continue
            if len(inline_hits) != 1:
                failures.append(f"index.html:{name} — {len(inline_hits)} inline decls (want 1)")
                continue
            if mod_hits[0][2] == inline_hits[0][2]:
                results.append(f"  OK  {name}  ({mod_path})")
            else:
                failures.append(f"{name} — BODY MISMATCH module vs inline")

    print(f"Byte-identical check: {total - len(failures)}/{total}")
    for r in results:
        print(r)

    # top-level call scan: any of the 40 names invoked at column 0..N outside
    # a function body is risky; we approximate by checking calls that are NOT
    # inside any function (crude: lines invoking name( that appear before
    # DOMContentLoaded registration and at top-level indent in script blocks).
    all_names = [n for ns in MODULES.values() for n in ns]
    toplevel = []
    for name in all_names:
        for m in re.finditer(r"^(?:" + re.escape(name) + r")\s*\(", index_src, re.M):
            ln = index_src.count("\n", 0, m.start()) + 1
            toplevel.append(f"  line {ln}: top-level call to {name}()")
    if toplevel:
        print("\nTOP-LEVEL CALLS FOUND (unsafe):")
        print("\n".join(toplevel))

    if failures:
        print("\nFAILURES:")
        for f_ in failures:
            print("  " + f_)
        sys.exit(1)
    if toplevel:
        sys.exit(2)
    print("\nALL VERIFIED — safe to delete.")
    sys.exit(0)


if __name__ == "__main__":
    main()
