#!/usr/bin/env python3
"""ER Triage Automation - Phase 2a fetch step.

Pulls every enhancement_requests row via Supabase REST (service key),
computes which rows need triage (idempotency rule from the spec:
skip any ER whose triage_run_at >= updated_at), and writes er_input.json
for the headless triage runner.

Env:
  SUPABASE_URL               e.g. https://axfejhudchdejoiwaetq.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service role key (Actions secret)
  FULL_PASS                  "1" to force re-triage of every ER (optional)

Output:
  er_input.json   {fetched_at, full_pass, needs_triage_ids, ers}
  GITHUB_OUTPUT   needs_count=<n> (when running inside Actions)

Security note: this script handles the service key; the LLM triage step
never sees it. ER text is untrusted user data - the runner prompt
instructs the model to treat it as data, never instructions.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

# S171 (2026-08-08): grace window for the re-triage predicate. The write-back
# stamps triage_run_at CLIENT-SIDE before its PATCH, and the table's updated_at
# trigger(s) bump updated_at to the DB's now() DURING that same PATCH — so
# triage_run_at always lands a few seconds BEFORE updated_at, and the bare
# `run_at < upd_at` predicate re-flagged every ER every night (96/97 flagged,
# all by a sub-5-min gap; nightly "delta" passes were full 90+-ER passes and
# run #60 died on the --max-turns cliff). An ER now needs re-triage only when
# updated_at is more than GRACE after triage_run_at. Edge case accepted: an ER
# edited within 10 min of its own triage write waits for its next edit or a
# full_pass.
TRIAGE_GRACE = timedelta(minutes=10)

TEST_ENTRY_MARKERS = ("testing dictation", "testing make-a-wish", "test test")


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def parse_ts(value):
    if not value:
        return None
    v = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


def main():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    full_pass = os.environ.get("FULL_PASS", "") == "1"
    if not url or not key:
        fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    endpoint = (url + "/rest/v1/enhancement_requests"
                "?select=*&order=created_at.asc&limit=1000")
    req = urllib.request.Request(endpoint, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            ers = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail("Supabase fetch failed: " + str(exc))

    if not isinstance(ers, list):
        fail("Unexpected response shape (not a list)")

    needs = []
    for er in ers:
        desc = (er.get("description") or "").strip().lower()
        if any(m in desc for m in TEST_ENTRY_MARKERS) and len(desc) < 60:
            continue  # test entries are never queued for triage
        run_at = parse_ts(er.get("triage_run_at"))
        upd_at = parse_ts(er.get("updated_at"))
        if full_pass:
            needs.append(er["id"])
        elif run_at is None or (upd_at is not None
                                and upd_at - run_at > TRIAGE_GRACE):
            needs.append(er["id"])

    out = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "full_pass": full_pass,
        "needs_triage_ids": needs,
        "ers": ers,
    }
    with open("er_input.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=True)

    print("Fetched %d ERs; %d need triage (full_pass=%s)"
          % (len(ers), len(needs), full_pass))

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write("needs_count=%d\n" % len(needs))
            fh.write("total_count=%d\n" % len(ers))


if __name__ == "__main__":
    main()
