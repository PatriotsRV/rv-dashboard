#!/usr/bin/env python3
"""ER Triage Automation - Phase 2b auto-fix GATE step.

Runs AFTER the headless fixer has edited the working tree. Enforces the
spec-5 hard rails deterministically (the fixer is asked to self-limit, but
this step is the real boundary). Emits a verdict for the workflow:

  verdict=refused   fixer set eligible:false (no edits) -> no PR, clean exit
  verdict=pass      all gates passed -> safe to (dry-run) package / open PR
  (nonzero exit)    a rail was violated -> job fails, NO PR

Checks (when eligible):
  1. Diff caps:   <= MAX_FILES changed files, <= MAX_DIFF_LINES (added+removed).
  2. Path allowlist: every changed file must match ALLOWED_GLOBS. Anything
     else (scripts/, .github/, supabase/, *.sql, ...) fails.
  3. Content denylist: high-signal forbidden tokens in ADDED lines fail
     (delete paths, RLS/policies, SQL DDL, auth id-token, service_role).
  4. Marker present: ADDED lines must contain "[ER AUTOFIX".
  5. Version bump: fix_result.version string must appear in ADDED lines.
  6. node --check on every changed JS module + every inline <script> block of
     every changed HTML file.
  7. files_changed in fix_result.json must match the actual git diff.

Env:
  MAX_FILES        default 3
  MAX_DIFF_LINES   default 80  (added+removed; leaves room for version bump)

Usage: python3 scripts/er_autofix_gate.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile

ALLOWED_GLOBS = (
    re.compile(r"^index\.html$"),
    re.compile(r"^checkin\.html$"),
    re.compile(r"^customer-checkin\.html$"),
    re.compile(r"^js/[A-Za-z0-9_-]+\.js$"),
    re.compile(r"^css/[A-Za-z0-9_-]+\.css$"),
)

# High-signal patterns that indicate an excluded area (spec 5). Conservative:
# only clear red flags, to avoid false positives on ordinary UI code.
FORBIDDEN_ADDED = (
    re.compile(r"\.delete\s*\("),
    re.compile(r"deleted_at"),
    re.compile(r"signInWithIdToken"),
    re.compile(r"service_role"),
    re.compile(r"\bDROP\s+(TABLE|POLICY|CONSTRAINT)\b", re.I),
    re.compile(r"\bALTER\s+TABLE\b", re.I),
    re.compile(r"\bCREATE\s+POLICY\b", re.I),
    re.compile(r"loadUserRoles"),
    re.compile(r"user_roles"),
)


def fail(msg):
    print("GATE FAIL: " + msg, file=sys.stderr)
    sys.exit(1)


def gh_output(key, val):
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write("%s=%s\n" % (key, val))


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def numstat():
    r = run(["git", "diff", "--numstat", "HEAD"])
    if r.returncode != 0:
        fail("git diff --numstat failed: " + r.stderr)
    files = []
    total = 0
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        added, removed, path = parts
        a = 0 if added == "-" else int(added)
        d = 0 if removed == "-" else int(removed)
        total += a + d
        files.append((path, a, d))
    return files, total


def added_lines():
    r = run(["git", "diff", "HEAD"])
    if r.returncode != 0:
        fail("git diff failed: " + r.stderr)
    out = []
    for line in r.stdout.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            out.append(line[1:])
    return out


def node_check_source(src, suffix):
    with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False,
                                     encoding="utf-8") as tf:
        tf.write(src)
        tmp = tf.name
    try:
        r = run(["node", "--check", tmp])
        return r.returncode == 0, (r.stderr or r.stdout).strip()
    finally:
        os.unlink(tmp)


SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S | re.I)
SRC_RE = re.compile(r"\bsrc\s*=", re.I)
MODULE_RE = re.compile(r"type\s*=\s*[\"']module[\"']", re.I)


def check_html_inline_scripts(path):
    with open(path, "r", encoding="utf-8") as fh:
        html = fh.read()
    n = 0
    for m in SCRIPT_RE.finditer(html):
        attrs, body = m.group(1), m.group(2)
        if SRC_RE.search(attrs):
            continue  # external script, nothing inline to check
        if not body.strip():
            continue
        n += 1
        suffix = ".mjs" if MODULE_RE.search(attrs) else ".js"
        ok, err = node_check_source(body, suffix)
        if not ok:
            fail("node --check failed on inline <script> #%d in %s:\n%s"
                 % (n, path, err))
    return n


def main():
    try:
        max_files = int(os.environ.get("MAX_FILES", "3"))
    except ValueError:
        max_files = 3
    try:
        max_lines = int(os.environ.get("MAX_DIFF_LINES", "80"))
    except ValueError:
        max_lines = 80

    try:
        with open("fix_result.json", "r", encoding="utf-8") as fh:
            fr = json.load(fh)
    except Exception as exc:  # noqa: BLE001
        fail("cannot read fix_result.json: " + str(exc))

    if not fr.get("eligible", False):
        reason = fr.get("reason", "(no reason given)")
        print("Fixer REFUSED: " + reason)
        gh_output("verdict", "refused")
        gh_output("refuse_reason", reason.replace("\n", " ")[:200])
        return

    files, total = numstat()
    changed_paths = [p for p, _a, _d in files]
    if not changed_paths:
        fail("eligible:true but no files changed in the working tree")

    # 1. caps
    if len(changed_paths) > max_files:
        fail("too many files changed: %d > %d (%s)"
             % (len(changed_paths), max_files, ", ".join(changed_paths)))
    if total > max_lines:
        fail("diff too large: %d changed lines > %d" % (total, max_lines))

    # 2. path allowlist
    for p in changed_paths:
        if not any(rx.match(p) for rx in ALLOWED_GLOBS):
            fail("path not allowed: " + p)

    # 7. files_changed matches reality
    declared = set(fr.get("files_changed", []))
    if declared != set(changed_paths):
        fail("fix_result.files_changed %s != actual diff %s"
             % (sorted(declared), sorted(changed_paths)))

    adds = added_lines()
    joined = "\n".join(adds)

    # 3. content denylist
    for rx in FORBIDDEN_ADDED:
        if rx.search(joined):
            fail("forbidden token in added lines: /%s/" % rx.pattern)

    # 4. marker
    if "[ER AUTOFIX" not in joined:
        fail("required marker [ER AUTOFIX ...] not found in added lines")

    # 5. version bump
    version = (fr.get("version") or "").strip()
    if not version:
        fail("fix_result.version missing")
    ver_token = version.split()[0]  # e.g. "v1.448" from "v1.448 (...)"
    if ver_token not in joined:
        fail("version string %r not present in added lines (no version bump?)"
             % ver_token)

    # 6. node --check
    checked = 0
    for p in changed_paths:
        if p.endswith(".js"):
            with open(p, "r", encoding="utf-8") as fh:
                ok, err = node_check_source(fh.read(), ".mjs")
            if not ok:
                fail("node --check failed on %s:\n%s" % (p, err))
            checked += 1
        elif p.endswith(".html"):
            checked += check_html_inline_scripts(p)
        # .css: no syntax gate

    diff_stat = "%d file(s), %d changed lines, %d JS unit(s) syntax-checked" % (
        len(changed_paths), total, checked)
    print("GATE PASS: " + diff_stat)
    gh_output("verdict", "pass")
    gh_output("diff_stat", diff_stat)
    gh_output("changed_files", ",".join(changed_paths))
    gh_output("fix_version", ver_token)


if __name__ == "__main__":
    main()
