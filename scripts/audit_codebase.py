#!/usr/bin/env python3
"""
PRVS Codebase Audit
===================
Static-analysis script that walks the PRVS dashboard codebase and flags
the bug classes that have repeatedly bitten this project:

  (A) Supabase JS .insert/.update/.upsert field names that don't exist on
      the target table.  Session 73 archive bugs.
  (B) repair_orders.status writes that don't call writeAuditLog or
      .from('audit_log').insert nearby.  Session 71/72 ghost-write pattern.
  (C) .single() calls (flagged for review — .maybeSingle() may be safer
      when 0 rows is valid).
  (D) accessToken-based auth guards (should be !getSB() || !supabaseSession).
  (E) Status string literals that don't match the 11 canonical values from
      the Session 72 CHECK constraint.
  (F) Surviving hardcoded ADMIN_EMAILS / MANAGER_EMAILS / SR_MANAGER_EMAILS
      constants (post-S2 these should be ZERO).
  (G) SQL ON CONFLICT (col) clauses that have no backing UNIQUE constraint
      defined in this repo. Session 73 archive bug #3.
  (H) SQL ::jsonb casts not wrapped in BEGIN/EXCEPTION blocks.
      Session 73 archive bug #2.

This is a *static* scan — it reads files and grep-pattern-matches. It does
not connect to Supabase. Some bug classes (notably 'A') need an authoritative
schema dump to cross-reference; that dump is embedded inline below so the
script is self-contained. Update SCHEMA below as tables evolve.

Usage:
    python3 scripts/audit_codebase.py [--output docs/qa/CODEBASE_AUDIT.md]

Exit code: 0 if no BLOCKING findings, 1 otherwise.

Pattern follows docs/qa/SESSION_72_STATUS_CASING_SCAN.md.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Schema (verified 2026-05-23 via information_schema dump in Supabase Studio)
# ---------------------------------------------------------------------------
# When you add a new column or a new table, update this dict. The audit
# script uses it to flag JS .insert/.update field names that don't exist
# on the target table.

SCHEMA: dict[str, set[str]] = {
    "repair_orders": {
        "id", "ro_id", "customer_name", "phone", "email", "address", "rv",
        "vin", "repair_type", "description", "technician", "date_received",
        "date_arrived", "promised_date", "pct_complete", "dollar_value",
        "status", "urgency", "customer_type", "ro_type", "parking_spot",
        "photo_url", "insurance_data", "deleted_at", "deleted_by",
        "is_training", "planned_dropoff_date", "photo_library",
        "has_open_parts_request", "parts_status", "requested_by_email",
        "rv_photo_url", "original_ro_number", "lead_notes",
        "created_at", "updated_at",
    },
    "cashiered": {
        "id", "original_ro_id", "ro_id", "customer_name", "phone", "email",
        "address", "rv", "vin", "repair_type", "description", "technician",
        "date_received", "date_arrived", "promised_date", "pct_complete",
        "dollar_value", "status", "urgency", "customer_type", "ro_type",
        "photo_url", "insurance_data", "days_on_lot", "date_closed",
        "week_label", "archived_at",
    },
    "parts": {
        "id", "ro_id", "part_name", "part_number", "condition", "qty",
        "status", "parts_source", "po_number", "ordered_by", "date_ordered",
        "eta", "tracking_number", "part_url", "return_deadline",
        "wholesale_price", "retail_price", "core_charge", "labor_hours",
        "supplier", "sales_assoc_name", "sales_assoc_phone",
        "sales_assoc_email", "date_received", "received_by", "warranty_period",
        "notes", "created_at", "updated_at", "service_task_id",
        "lifecycle_status", "date_installed", "installed_by_email",
    },
    "time_logs": {
        "id", "ro_id", "tech_email", "tech_name", "user_id", "clock_in",
        "clock_out", "service_type", "shop_activity", "work_notes",
        "duration_seconds", "close_reason", "reminded_at", "extended_at",
        "service_task_id", "created_at",
    },
    "notes": {
        "id", "ro_id", "user_id", "type", "body", "created_at",
    },
    "audit_log": {
        "id", "ro_id", "user_id", "user_email", "user_name", "field_changed",
        "old_value", "new_value", "changed_at",
    },
    "insurance_scans": {
        "id", "ro_id", "user_id", "raw_data", "scanned_at",
    },
    "service_work_orders": {
        "id", "ro_id", "service_silo", "status", "dollar_value",
        "created_at", "updated_at",
    },
    "service_tasks": {
        "id", "work_order_id", "ro_id", "task_title", "description",
        "status", "estimated_hours", "depends_on", "parent_task_id",
        "actual_hours", "billed_hours", "completed_at", "completed_by_email",
        "assigned_tech_email", "created_at", "updated_at",
    },
}

# Tables we haven't fully dumped — fields on these won't be cross-referenced.
SCHEMA_PARTIAL: set[str] = {
    "staff", "users", "user_roles", "roles", "manager_work_lists",
    "scheduled_notifications", "enhancement_requests", "sms_log",
    "sms_templates", "time_off_requests", "app_config",
    "wo_task_templates", "wo_template_tasks", "wo_template_task_parts",
    "cashiered_parts", "cashiered_time_logs", "cashiered_notes",
    "cashiered_audit_log", "cashiered_insurance_scans",
    "cashiered_service_work_orders", "cashiered_service_tasks",
    "cashiered_work_orders", "solar_project_store", "solar_settings",
    "config",
}

# 11 canonical status values per Session 72 CHECK constraint
CANONICAL_STATUSES: set[str] = {
    "Not On Lot", "On Lot", "Scheduled", "Awaiting Approval",
    "Awaiting parts", "Ready to Work", "In progress", "Repairs Completed",
    "Waiting for QA/QC", "Ready for pickup", "Delivered/Cashed Out",
}

# Files to scan
HTML_FILES = [
    "index.html", "checkin.html", "customer-checkin.html",
    "closed-ros.html", "worklist-report.html", "analytics.html",
    "solar.html", "time-off.html",
]
SQL_GLOBS = ["supabase/migrations/*.sql"]
EDGE_FN_GLOBS = ["supabase/functions/*/index.ts"]


# ---------------------------------------------------------------------------
# Finding model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    severity: str       # BLOCKING | HIGH | MEDIUM | LOW
    bug_class: str      # A through H
    file: str
    line: int
    message: str
    context: str = ""

    def to_md(self) -> str:
        ctx = f"\n  ```\n  {self.context.strip()}\n  ```" if self.context else ""
        return f"- **{self.file}:{self.line}** — {self.message}{ctx}"


SEVERITY_ORDER = {"BLOCKING": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


# ---------------------------------------------------------------------------
# Scanner: (A) JS .insert/.update field-name mismatches
# ---------------------------------------------------------------------------

INSERT_RE = re.compile(
    r"\.from\(\s*['\"]([a-z_]+)['\"]\s*\)\s*\.(insert|update|upsert)\s*\(\s*\{([^}]*)\}",
    re.DOTALL,
)
FIELD_RE = re.compile(r"^\s*([a-z_][a-z0-9_]*)\s*:", re.MULTILINE)


def scan_js_field_mismatches(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for m in INSERT_RE.finditer(text):
        table = m.group(1)
        op = m.group(2)
        body = m.group(3)
        if table not in SCHEMA:
            # Don't crash on partial-schema tables — note and skip
            if table not in SCHEMA_PARTIAL:
                line = text[:m.start()].count("\n") + 1
                findings.append(Finding(
                    "LOW", "A", str(path), line,
                    f"Table `{table}` is not in SCHEMA or SCHEMA_PARTIAL — update audit_codebase.py if real",
                ))
            continue
        cols = SCHEMA[table]
        for fm in FIELD_RE.finditer(body):
            field_name = fm.group(1)
            if field_name not in cols:
                line = text[:m.start()].count("\n") + body[:fm.start()].count("\n") + 1
                findings.append(Finding(
                    "HIGH", "A", str(path), line,
                    f"`{op}` on `{table}` writes unknown column `{field_name}` (not in schema)",
                    context=body[max(0, fm.start()-30):fm.end()+30],
                ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (B) repair_orders.status writes without nearby audit_log
# ---------------------------------------------------------------------------

STATUS_WRITE_RE = re.compile(
    r"\.from\(\s*['\"]repair_orders['\"]\s*\)\s*\.update\s*\(\s*\{[^}]*\bstatus\s*:",
    re.DOTALL,
)
AUDIT_NEARBY_RE = re.compile(
    r"\b(writeAuditLog|from\(\s*['\"]audit_log['\"]\s*\)\s*\.insert)\b",
)
NEARBY_LINES = 50  # writeAuditLog must appear within this many lines


def scan_ghost_writes(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for m in STATUS_WRITE_RE.finditer(text):
        line_no = text[:m.start()].count("\n") + 1
        window_start = max(0, line_no - NEARBY_LINES)
        window_end = min(len(lines), line_no + NEARBY_LINES)
        window = "\n".join(lines[window_start:window_end])
        if not AUDIT_NEARBY_RE.search(window):
            findings.append(Finding(
                "BLOCKING", "B", str(path), line_no,
                f"repair_orders.status write with no writeAuditLog/audit_log.insert within ±{NEARBY_LINES} lines (ghost-write pattern)",
                context=lines[line_no-1] if line_no <= len(lines) else "",
            ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (C) .single() — flag for review
# ---------------------------------------------------------------------------

SINGLE_RE = re.compile(r"\.single\s*\(\s*\)")


def scan_single_calls(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        if _is_comment_line(line):
            continue
        if SINGLE_RE.search(line) and "maybeSingle" not in line:
            findings.append(Finding(
                "LOW", "C", str(path), i,
                ".single() — verify 0 rows can't legitimately occur, else use .maybeSingle()",
                context=line.strip(),
            ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (D) accessToken-based Supabase guards
# ---------------------------------------------------------------------------

ACCESS_TOKEN_GUARD_RE = re.compile(r"!\s*accessToken\s*\)")


def scan_access_token_guards(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        if _is_comment_line(line):
            continue
        if ACCESS_TOKEN_GUARD_RE.search(line):
            findings.append(Finding(
                "HIGH", "D", str(path), i,
                "Auth guard uses `!accessToken` alone — should be `!getSB() || !supabaseSession`",
                context=line.strip(),
            ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (E) Status string literals that don't match canonical set
# ---------------------------------------------------------------------------

# Match common patterns where status string literals get written:
#   status: 'In Progress'
#   status === 'In Progress'
#   status: "In Progress"
STATUS_LITERAL_RE = re.compile(
    r"""(?:status\s*[:=]+\s*|status\s*[!=]==?\s*)['"]([^'"]+)['"]""",
)
# Known non-canonical strings used elsewhere (informational labels, not DB writes)
SAFE_NON_CANONICAL = {
    "all", "any", "Any", "All", "—", "", " ",
    # Used as display labels, not DB values
    "Closed", "Cashed Out", "Archived",
}


def scan_status_casing(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        if _is_comment_line(line):
            continue
        for m in STATUS_LITERAL_RE.finditer(line):
            val = m.group(1)
            if val in SAFE_NON_CANONICAL:
                continue
            if val in CANONICAL_STATUSES:
                continue
            findings.append(Finding(
                "MEDIUM", "E", str(path), i,
                f"Status string literal `'{val}'` does not match the 11 canonical values",
                context=line.strip(),
            ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (F) Hardcoded ADMIN/MANAGER/SR_MANAGER_EMAILS constants
# ---------------------------------------------------------------------------

HARDCODED_ROLE_RE = re.compile(
    r"\b(ADMIN_EMAILS|MANAGER_EMAILS|SR_MANAGER_EMAILS|PARTS_MANAGER_EMAILS)\b",
)


def _is_comment_line(line: str) -> bool:
    """True if the line is purely a comment (JS/SQL/HTML). Block-comment middles
    starting with * (e.g. ` * v1.295: ...`) also count."""
    s = line.lstrip()
    return (
        s.startswith("//")
        or s.startswith("--")
        or s.startswith("/*")
        or s.startswith("*")
        or s.startswith("<!--")
        or s.startswith("#")
    )


def _build_comment_mask(text: str) -> list[bool]:
    """Return a per-line boolean mask: True iff that line sits inside a
    multiline block comment (<!-- --> or /* */) or is itself a single-line
    comment. Single-line // and -- are handled via _is_comment_line at the
    call site; this helper covers the multiline blocks the simple check
    misses (e.g. HTML comment banner at the top of index.html with
    'v1.295: ... MANAGER_EMAILS ...' lines that aren't real code)."""
    lines = text.splitlines()
    mask = [False] * len(lines)
    in_html = False
    in_block = False
    for i, line in enumerate(lines):
        # Inside-block start state already accounts for opens on prior lines
        if in_html or in_block:
            mask[i] = True
        if "<!--" in line and "-->" not in line.split("<!--", 1)[1]:
            in_html = True
            mask[i] = True
        if in_html and "-->" in line:
            in_html = False
        if "/*" in line and "*/" not in line.split("/*", 1)[1]:
            in_block = True
            mask[i] = True
        if in_block and "*/" in line:
            in_block = False
        # Also flag pure single-line comments
        if not mask[i] and _is_comment_line(line):
            mask[i] = True
    return mask


def scan_hardcoded_roles(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    mask = _build_comment_mask(text)
    for i, line in enumerate(lines, 1):
        if mask[i - 1]:
            continue
        if HARDCODED_ROLE_RE.search(line):
            findings.append(Finding(
                "BLOCKING", "F", str(path), i,
                "Hardcoded role/email constant — Security Remediation S2 should have removed this",
                context=line.strip(),
            ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (G) SQL ON CONFLICT (col) without backing UNIQUE constraint
# ---------------------------------------------------------------------------

ON_CONFLICT_RE = re.compile(r"ON\s+CONFLICT\s*\(\s*([a-z_,\s]+)\)", re.IGNORECASE)
UNIQUE_DEFN_RE = re.compile(
    r"(?:UNIQUE\s*\(([^)]+)\)|UNIQUE\s+(?:INDEX|KEY)?\s+\S+\s+ON\s+\S+\s*\(([^)]+)\)|"
    r"ADD\s+CONSTRAINT\s+\S+\s+UNIQUE\s*\(([^)]+)\)|"
    r"CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+\S+\s*\(([^)]+)\))",
    re.IGNORECASE,
)


def scan_on_conflict(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    # Collect all unique columns referenced in this file
    unique_cols: set[str] = set()
    for m in UNIQUE_DEFN_RE.finditer(text):
        for g in m.groups():
            if g:
                for col in g.split(","):
                    unique_cols.add(col.strip())
    for m in ON_CONFLICT_RE.finditer(text):
        cols = [c.strip() for c in m.group(1).split(",")]
        line_no = text[:m.start()].count("\n") + 1
        for c in cols:
            if c not in unique_cols and c != "id":  # PK is always unique
                findings.append(Finding(
                    "HIGH", "G", str(path), line_no,
                    f"ON CONFLICT ({c}) but no UNIQUE constraint on `{c}` defined in this file — verify external constraint exists",
                    context=text[max(0, m.start()-20):m.end()+20].replace("\n", " "),
                ))
    return findings


# ---------------------------------------------------------------------------
# Scanner: (H) SQL ::jsonb cast not wrapped in BEGIN/EXCEPTION
# ---------------------------------------------------------------------------

JSONB_CAST_RE = re.compile(r"::jsonb\b")


def scan_jsonb_casts(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        if not JSONB_CAST_RE.search(line):
            continue
        # Look back 10 lines for BEGIN/EXCEPTION block, look ahead 30 for EXCEPTION
        start = max(0, i - 10)
        end = min(len(lines), i + 30)
        block = "\n".join(lines[start:end])
        if "EXCEPTION" not in block and "to_jsonb" not in line:
            # to_jsonb() is the safe form (auto-handles record types)
            findings.append(Finding(
                "MEDIUM", "H", str(path), i,
                "::jsonb cast without nearby EXCEPTION handler — empty strings or malformed JSON will abort the transaction",
                context=line.strip(),
            ))
    return findings


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def collect_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for f in HTML_FILES:
        p = repo_root / f
        if p.exists():
            files.append(p)
    for g in SQL_GLOBS + EDGE_FN_GLOBS:
        files.extend(sorted(repo_root.glob(g)))
    return files


# Which scanners apply to which file types
JS_SCANNERS = [
    scan_js_field_mismatches,
    scan_ghost_writes,
    scan_single_calls,
    scan_access_token_guards,
    scan_status_casing,
    scan_hardcoded_roles,
]
SQL_SCANNERS = [
    scan_on_conflict,
    scan_jsonb_casts,
]


def run_audit(repo_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in collect_files(repo_root):
        rel = path.relative_to(repo_root)
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:
            findings.append(Finding("LOW", "?", str(rel), 0, f"Could not read: {e}"))
            continue
        if path.suffix in {".html", ".ts", ".js"}:
            for s in JS_SCANNERS:
                for fi in s(rel, text):
                    findings.append(fi)
        if path.suffix == ".sql":
            for s in SQL_SCANNERS:
                for fi in s(rel, text):
                    findings.append(fi)
    return findings


def render_md(findings: list[Finding]) -> str:
    findings.sort(key=lambda f: (SEVERITY_ORDER[f.severity], f.bug_class, f.file, f.line))
    out: list[str] = []
    out.append("# PRVS Codebase Audit Report")
    out.append("")
    out.append(f"Generated by `scripts/audit_codebase.py` against the repo at "
               f"{Path(__file__).parent.parent}.")
    out.append("")
    out.append("## Summary")
    out.append("")
    by_sev: dict[str, int] = {}
    by_class: dict[str, int] = {}
    for f in findings:
        by_sev[f.severity] = by_sev.get(f.severity, 0) + 1
        by_class[f.bug_class] = by_class.get(f.bug_class, 0) + 1
    out.append("| Severity | Count |")
    out.append("|---|---|")
    for sev in ["BLOCKING", "HIGH", "MEDIUM", "LOW"]:
        out.append(f"| {sev} | {by_sev.get(sev, 0)} |")
    out.append("")
    out.append("| Bug class | Count |")
    out.append("|---|---|")
    descriptions = {
        "A": "JS field name not in schema",
        "B": "repair_orders.status write without audit log (ghost-write)",
        "C": ".single() — review for 0-row tolerance",
        "D": "accessToken-only auth guard",
        "E": "Non-canonical status string literal",
        "F": "Hardcoded role/email constant (post-S2)",
        "G": "SQL ON CONFLICT without UNIQUE constraint",
        "H": "SQL ::jsonb cast without EXCEPTION wrapper",
    }
    for c, desc in descriptions.items():
        out.append(f"| {c} — {desc} | {by_class.get(c, 0)} |")
    out.append("")
    for sev in ["BLOCKING", "HIGH", "MEDIUM", "LOW"]:
        sev_findings = [f for f in findings if f.severity == sev]
        if not sev_findings:
            continue
        out.append(f"## {sev} ({len(sev_findings)})")
        out.append("")
        for c in sorted(set(f.bug_class for f in sev_findings)):
            class_findings = [f for f in sev_findings if f.bug_class == c]
            out.append(f"### Class {c} — {descriptions.get(c, '?')} ({len(class_findings)})")
            out.append("")
            for f in class_findings:
                out.append(f.to_md())
            out.append("")
    return "\n".join(out) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="PRVS codebase audit")
    parser.add_argument(
        "--output", default="docs/qa/CODEBASE_AUDIT.md",
        help="Output markdown report path (relative to repo root)",
    )
    args = parser.parse_args()
    repo_root = Path(__file__).parent.parent.resolve()
    findings = run_audit(repo_root)
    report = render_md(findings)
    out_path = repo_root / args.output
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"Wrote {len(findings)} finding(s) to {out_path}")
    blockers = [f for f in findings if f.severity == "BLOCKING"]
    if blockers:
        print(f"❌ {len(blockers)} BLOCKING finding(s) — see report")
        return 1
    print("✓ No BLOCKING findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
