#!/usr/bin/env python3
"""ER Triage Automation - Phase 2a write-back step.

Validates er_verdicts.json (produced by the headless triage runner) and
writes triage verdicts back to enhancement_requests via Supabase REST.

Hard rails:
  - Only IDs listed in er_input.json needs_triage_ids may be written
    (the LLM cannot touch arbitrary rows).
  - Only the five triage_* columns + an admin_notes APPEND are written.
    status is NEVER changed by Phase 2a (Roland flips status himself).
  - admin_notes is append-only: existing human notes are preserved.
  - Schema-validated before any write; --validate-only for the CI gate.

Usage:
  python3 scripts/er_triage_writeback.py --validate-only
  python3 scripts/er_triage_writeback.py

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  WRITE_ADMIN_NOTES  "1" to append the verdict line to admin_notes (default 1)
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

VALID_BUCKETS = {"done", "bug", "needed", "data", "duplicate"}
VALID_LOE = {"S", "M", "L", "XL"}
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MAX_VERDICT_LEN = 500


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:  # noqa: BLE001
        fail("Cannot read %s: %s" % (path, exc))


def validate(verdicts, allowed_ids):
    if not isinstance(verdicts, list) or not verdicts:
        fail("er_verdicts.json: 'verdicts' must be a non-empty list")
    seen = set()
    for i, v in enumerate(verdicts):
        ctx = "verdict[%d]" % i
        vid = v.get("id", "")
        if not UUID_RE.match(str(vid)):
            fail(ctx + ": bad id " + repr(vid))
        if vid in seen:
            fail(ctx + ": duplicate id " + vid)
        seen.add(vid)
        if vid not in allowed_ids:
            fail(ctx + ": id %s is not in needs_triage_ids (refusing)" % vid)
        if v.get("bucket") not in VALID_BUCKETS:
            fail(ctx + ": bad bucket " + repr(v.get("bucket")))
        loe = v.get("loe")
        if loe is not None and loe not in VALID_LOE:
            fail(ctx + ": bad loe " + repr(loe))
        verdict = v.get("verdict", "")
        if not isinstance(verdict, str) or not verdict.strip():
            fail(ctx + ": verdict text required")
        if len(verdict) > MAX_VERDICT_LEN:
            fail(ctx + ": verdict exceeds %d chars" % MAX_VERDICT_LEN)
        extra = set(v.keys()) - {"id", "bucket", "loe", "verdict",
                                 "status_recommendation", "theme"}
        if extra:
            fail(ctx + ": unexpected keys " + repr(sorted(extra)))
    return True


def rest(url, key, method, path, body=None, prefer=None):
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url + path, data=data,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


def main():
    validate_only = "--validate-only" in sys.argv

    inp = load_json("er_input.json")
    verdicts = load_json("er_verdicts.json")
    allowed_ids = set(inp.get("needs_triage_ids", []))
    validate(verdicts, allowed_ids)
    print("Validation OK: %d verdicts, all IDs allowed" % len(verdicts))
    if validate_only:
        return

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    write_notes = os.environ.get("WRITE_ADMIN_NOTES", "1") == "1"

    now = datetime.now(timezone.utc)
    run_at = now.isoformat()
    stamp = now.strftime("%Y-%m-%d")
    by_id = {er["id"]: er for er in inp.get("ers", [])}

    counts = {}
    for v in verdicts:
        vid = v["id"]
        patch = {
            "triage_bucket": v["bucket"],
            "triage_loe": v.get("loe"),
            "triage_verdict": v["verdict"],
            "triage_run_at": run_at,
        }
        if write_notes:
            existing = (by_id.get(vid, {}).get("admin_notes") or "").rstrip()
            marker = "[AI triage %s]" % stamp
            line = "%s %s%s: %s" % (
                marker, v["bucket"],
                "/" + v["loe"] if v.get("loe") else "",
                v["verdict"])
            if marker not in existing:
                patch["admin_notes"] = (existing + "\n" + line).strip()
        try:
            rest(url, key, "PATCH",
                 "/rest/v1/enhancement_requests?id=eq." + vid,
                 body=patch, prefer="return=minimal")
        except Exception as exc:  # noqa: BLE001
            fail("PATCH failed for %s: %s" % (vid, exc))
        counts[v["bucket"]] = counts.get(v["bucket"], 0) + 1

    summary = ", ".join("%s=%d" % kv for kv in sorted(counts.items()))
    print("Write-back complete: %d rows (%s)" % (len(verdicts), summary))

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write("written_count=%d\n" % len(verdicts))
            fh.write("bucket_summary=%s\n" % summary)


if __name__ == "__main__":
    main()
