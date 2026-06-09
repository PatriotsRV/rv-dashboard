#!/usr/bin/env python3
"""ER Triage Automation - Phase 2b auto-fix SELECT step.

Deterministic step (handles the Supabase service key; the LLM fixer never
sees it). Picks the bug-bucket ERs that are CANDIDATES for an automated fix,
applying a coarse pre-filter so the fixer is not wasted on obviously
ineligible work. Final eligibility is decided by the fixer (which reads the
code) and enforced by the gate (er_autofix_gate.py) - this step only narrows.

Selection rules (a candidate must satisfy ALL):
  - triage_bucket == 'bug'
  - status not in ('done', 'declined')           (open work only)
  - triage_pr_url is empty                        (no fix PR already opened)
  - triage_verdict does NOT mention an excluded area (see EXCLUDE_HINTS):
    auth / RLS / Twilio / notifications / delete / DB migration / money.
    Per spec 5 these are NEVER auto-fixed. This is only a hint - the gate
    enforces the hard rails by path + content.
  - if ER_ID is set, only that one ER (still subject to the rules above
    unless FORCE=1, which bypasses the verdict hint for a targeted dry-run).

Caps the result to MAX_FIXES (default 1) so a single run has a small,
reviewable blast radius.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (required)
  ER_ID      target a single ER id (optional)
  FORCE      "1" to bypass the verdict-hint pre-filter for ER_ID (optional)
  MAX_FIXES  max candidates to emit (default 1)

Output:
  autofix_candidates.json  {selected_at, candidates:[...]}
  GITHUB_OUTPUT            candidate_count, candidate_id (first), skipped_count
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# Verdict text that flags an excluded area (spec 5 "never auto-fixed").
EXCLUDE_HINTS = (
    "auth", "rls", "permission", "login", "twilio", "sendblue", "sms",
    "notification", "notif", "email", "delete", "deletion", "migration",
    "schema", "money", "price", "pricing", "dollar", "payment", "cashier",
    "large",  # large bugs are out of the small/cosmetic/data-display class
)


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def rest_get(url, key, path):
    req = urllib.request.Request(url + path, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def verdict_excluded(verdict):
    low = (verdict or "").lower()
    return [h for h in EXCLUDE_HINTS if h in low]


def main():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    er_id = os.environ.get("ER_ID", "").strip()
    force = os.environ.get("FORCE", "") == "1"
    try:
        max_fixes = max(1, int(os.environ.get("MAX_FIXES", "1")))
    except ValueError:
        max_fixes = 1

    query = ("/rest/v1/enhancement_requests"
             "?select=*&triage_bucket=eq.bug&order=triage_run_at.desc&limit=200")
    if er_id:
        query += "&id=eq." + urllib.parse.quote(er_id)
    try:
        rows = rest_get(url, key, query)
    except Exception as exc:  # noqa: BLE001
        fail("Supabase fetch failed: " + str(exc))
    if not isinstance(rows, list):
        fail("Unexpected response shape (not a list)")

    candidates = []
    skipped = []
    for er in rows:
        rid = er.get("id")
        status = (er.get("status") or "").lower()
        pr_url = (er.get("triage_pr_url") or "").strip()
        verdict = er.get("triage_verdict") or ""
        if status in ("done", "declined"):
            skipped.append((rid, "status=" + status))
            continue
        if pr_url:
            skipped.append((rid, "already has triage_pr_url"))
            continue
        hits = verdict_excluded(verdict)
        if hits and not (er_id and force):
            skipped.append((rid, "verdict hints excluded area: " + ",".join(hits)))
            continue
        candidates.append({
            "id": rid,
            "category": er.get("category"),
            "source_page": er.get("source_page"),
            "submitted_by_name": er.get("submitted_by_name"),
            "description": er.get("description"),
            "triage_loe": er.get("triage_loe"),
            "triage_verdict": verdict,
        })

    candidates = candidates[:max_fixes]

    out = {
        "selected_at": datetime.now(timezone.utc).isoformat(),
        "er_id_filter": er_id or None,
        "force": force,
        "candidates": candidates,
    }
    with open("autofix_candidates.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=True)

    print("Selected %d candidate(s); skipped %d." % (len(candidates), len(skipped)))
    for rid, why in skipped:
        print("  skip %s: %s" % (rid, why))
    for c in candidates:
        print("  candidate %s (%s)" % (c["id"], c["category"]))

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write("candidate_count=%d\n" % len(candidates))
            fh.write("skipped_count=%d\n" % len(skipped))
            fh.write("candidate_id=%s\n" % (candidates[0]["id"] if candidates else ""))


if __name__ == "__main__":
    main()
