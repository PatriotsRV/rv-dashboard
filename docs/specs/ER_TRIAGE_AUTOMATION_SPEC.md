# Enhancement-Request Triage Automation — Spec

**Status:** Draft v0.2 (2026-06-09, Session 97 — Phase 2b built, dry-run posture)
**Owner:** Roland Shepard / PRVS
**Goal:** Automate the triage of Enhancement Requests (ERs) so that AI continuously (a) classifies every new ER against the live codebase, (b) for the low-risk *bug* class, writes a fix + regression-tests it + opens a **gated** PR for Roland to deploy, and (c) keeps a living triage report + dashboard current. This is the concrete build of the project's "autonomy north star": **nightly ER triage → code → pre-prod test → human-gated push.**

This spec encodes the manual procedure proven in Session 94 (v1.447) and lays out the path to automate it in safe, reversible phases.

---

## 1. Problem & motivation

ERs arrive via the dashboard's "Make-A-Wish" button (`enhancement_requests` table). They pile up `unreviewed` (29 at the start of Session 94). Triage is high-value but manual: each free-text wish has to be read, mapped to current code, and judged "already done / still needed / a bug." Session 94 did this by hand for 37 ERs in one sitting and found the serious bugs were already resolved by the modularization refactor — exactly the kind of repeatable judgment worth automating.

**Key realization:** triage is fundamentally an *LLM* task (read free text → map to code → judge). A SQL trigger alone cannot do it. The trigger is only the doorbell; the brain is a headless AI runner with repo + GitHub access.

---

## 2. Data model (current)

`enhancement_requests` columns: `id` (uuid), `submitted_by` (email), `submitted_by_name`, `source_page`, `category` (enum-ish text: General UI/UX, New Feature Idea, RO Management, Bug Report, Parts & Ordering, Notifications / Email, Work List, Time Clock / Check-In, Work Orders), `description` (free text), `status` (`unreviewed` | `in-progress` | `done` | `declined`), `admin_notes`, `priority` (unused, defaults `unreviewed`), `created_at`, `updated_at`.

Proposed additive columns (Phase 2a migration, expand-only, no breakage):

| Column | Type | Purpose |
|---|---|---|
| `triage_bucket` | text | `done` \| `bug` \| `needed` \| `data` \| `duplicate` — last AI verdict |
| `triage_loe` | text | `S` \| `M` \| `L` \| `XL` for the `needed` bucket |
| `triage_verdict` | text | one-line AI rationale + mapped code refs |
| `triage_run_at` | timestamptz | when last triaged (idempotency) |
| `triage_pr_url` | text | link to the auto-fix PR, if one was opened |

Idempotency rule: a runner skips any ER whose `triage_run_at >= updated_at` (already triaged, unchanged) unless explicitly re-run.

---

## 3. Triage procedure (the reusable core)

This is what both a human-driven run (the `prvs-er-triage` skill) and the automated runner execute. Codified from Session 94:

1. **Pull** every ER (all statuses for a full pass; or just `unreviewed` + stale for an incremental pass).
2. **Dedupe / drop test entries** (e.g., "testing dictation").
3. For each ER, **map to the current modular codebase** (`js/*.js`, `index.html`, `checkin.html`, edge functions, SQL) and assign a bucket:
   - **Done** — already delivered by the refactor or prior feature work → recommend `status=done`.
   - **Bug** — a defect; verify against current code whether it *still* exists. If yes, classify risk (cosmetic / data / small / large).
   - **Needed** — valid open enhancement → assign LOE (S <2h, M ½–1 session, L multi-session, XL new subsystem) and a theme cluster.
   - **Data** — a data correction (e.g., a misspelled name) rather than code → emit SQL, do not touch code.
   - **Duplicate** — fold into the canonical ER.
4. **Cluster** the `needed` bucket into themes so overlapping wishes are designed together.
5. **Emit artifacts:** regenerate `docs/ER_TRIAGE_<date>.md` + `docs/er-triage-dashboard.html`; write verdicts back to the ER rows (Phase 2a columns).
6. **For the auto-fixable bug class only** (cosmetic / data-display / small, bounded blast radius): produce a fix (see §5).

---

## 4. Architecture

```
enhancement_requests INSERT ──┐
                              ├──► doorbell ──► triage runner (headless Claude) ──► gated PR + report
nightly schedule (pg_cron) ───┘
```

### 4.1 Triggers
- **Nightly (build first):** `pg_cron` job (PRVS already uses pg_cron) hits the runner once a night (e.g., 02:00 CDT). Lowest risk; batch.
- **Real-time (build last):** `AFTER INSERT ON enhancement_requests` → `pg_net`/`supabase_functions.http_request` → GitHub `repository_dispatch` event → runner. Add only once nightly is proven.

### 4.2 The runner = GitHub Actions (not a Supabase edge function)
An edge function can't run Claude + git + open PRs. GitHub Actions already has the repo, git, a `GITHUB_TOKEN` with PR rights, and can run Claude headless (`claude -p` / Agent SDK). Inputs as Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (read ERs + write triage columns), `ANTHROPIC_API_KEY`.

Runner steps:
1. Checkout `pre-prod`.
2. Fetch ERs via Supabase REST (service key).
3. Run the **`prvs-er-triage`** procedure (§3) → buckets + verdicts.
4. Regenerate report + dashboard; commit doc changes to a `chore/er-triage-<date>` branch (docs only — safe).
5. Write verdicts back to ER rows.
6. For each auto-fixable **bug** (§5): create a `fix/er-auto-<id>` branch off pre-prod, apply the fix, run gates (§6), open a PR with evidence; set `triage_pr_url`.
7. Post a summary (Actions job summary + optional ER report email via the existing `send-er-report` function).

### 4.3 Gating
Every code change is a **PR targeting `pre-prod`** — never a direct push, never `main`. Roland reviews, merges to pre-prod, then runs the existing FF pre-prod→main promotion. Start 100% human-gated. Only after a clean track record, optionally allow auto-merge **to pre-prod** (main always stays Roland's gate).

---

## 5. Auto-fix scope & safety rails

**Eligible for auto-fix (Phase 2b):** bugs classified **cosmetic / data-display / small**, with:
- changes confined to ≤ 3 files and ≤ ~40 changed lines,
- no DB migrations (SQL is emitted for Roland, never auto-run),
- no auth / RLS / money-math / delete-path logic,
- a deterministic, testable expected result.

**Never auto-fixed (triage comment only):** anything `needed` (enhancements), L/XL items, schema changes, auth/permissions, notifications/Twilio, or anything touching financial calculations or deletes.

**Hard rails (enforced in the runner):**
- branch-only, target `pre-prod`, never `main`;
- ASCII-only commit/command text;
- version bump (index.html badge + comment + boot log; module boot log; affected standalone-page version) on every code PR;
- greppable marker `[ER AUTOFIX vX.Y S##]` on every change;
- rollback hash recorded in the PR body;
- idempotency via `triage_run_at`.

---

## 6. Regression gates (per auto-fix PR)
1. `node --check` on every touched module + inline `<script>` block.
2. Byte/diff sanity: only intended lines changed (decisive diff).
3. Headless browser regression (Playwright in the Action): boot the page on a local `http.server`, assert version, assert the fix's expected behavior, assert **zero console errors**. (Mirrors the Session-94 Claude-in-Chrome checks: currency-input formatting, modal open/close, board render.)
4. PR body embeds the evidence (assertions + diff stat + rollback hash). No green gates → no PR (failure summary instead).

Note: GitHub Pages serves JS subresources with ~10-min max-age and Pages deploys are async — **prod verification must wait for propagation + hard reload.** The gate runs on a local server, so it is not subject to this lag; prod verification stays a post-merge human/Claude step.

---

## 7. Phasing

| Phase | Deliverable | Risk |
|---|---|---|
| **2a** | `prvs-er-triage` skill (codifies §3) + additive triage columns + a scheduled run that regenerates the report/dashboard and writes verdicts back to ERs. **No code changes — read-only on the codebase.** | Low |
| **2b** | GitHub Actions runner that opens **auto-fix PRs** for the eligible bug class (§5) with the §6 gates. Human-gated to pre-prod. | Medium |
| **2c** | Real-time `AFTER INSERT` trigger → `repository_dispatch` (in addition to nightly). | Medium |
| **2d** | Relax gating: allow auto-merge **to pre-prod** once 2b has a clean track record. Main stays human-gated. | Earned |

Build order is strict: prove each phase boringly reliable before the next.

---

## 8. Session-94 baseline (proof the procedure works)
- 37 ERs triaged → 9 done, 3 bug-bucket, ~24 needed (6 themes); report + dashboard generated.
- 4 ERs marked in DB (unreviewed 29 → 26).
- 2 bugs fixed (n33 currency 2-decimal inputs, n22 check-in Return-to-Dashboard), regression-green, shipped as v1.447 / checkin v1.34.
- 1 data fix (staff name spelling) via emitted SQL.

Artifacts: `docs/ER_TRIAGE_2026-06-07.md`, `docs/er-triage-dashboard.html`, skill `prvs-er-triage`.

---

## 10. Phase 2b implementation (Session 97, 2026-06-09)

Built dispatch-only and **DRY_RUN by default** (Roland's call): the pipeline
builds the fix + runs the full gate, then uploads the candidate patch + evidence
as an artifact instead of opening a PR. Flip `dry_run=false` on dispatch to open
a real PR to `pre-prod`. Not wired into the nightly schedule until proven.

Auto-fix scope chosen: **cosmetic + data-display + small functional** bugs
(still <= 3 files / ~40 changed lines; never auth/RLS, money, delete, DB, or
notifications). Regression gate: the **realistic** form of section 6 — full
live-auth browser rendering is infeasible in CI (needs Google OAuth), so the
browser gate loads the page on the unauthenticated sampleData path and asserts
version + zero fatal (non-allow-listed) console errors + board render.

Files:
- `.github/workflows/er-autofix.yml` — `workflow_dispatch` (inputs: `dry_run`
  default true, `er_id` optional, `force`). LLM step sees only `ANTHROPIC_API_KEY`.
- `scripts/er_autofix_select.py` — picks one eligible bug-bucket ER (verdict-hint
  pre-filter; final call is the fixer + gate).
- `scripts/er_autofix_runner_prompt.md` — headless fixer prompt (Edit/Write only,
  no git/network; refuses out-of-rails work; emits `fix_result.json`).
- `scripts/er_autofix_gate.py` — deterministic rails: diff caps, path allow-list,
  content deny-list, marker + version-bump, `node --check`. Verdict pass/refused;
  rail violation fails the job. (Unit-tested against pass/refuse/forbidden-token/
  oversize/bad-path cases, Session 97.)
- `scripts/er_autofix_browser_check.mjs` — Playwright/Chromium load gate.
  `REQUIRE_BOARD=soft` until the first dry-run confirms headless board render,
  then flip to `hard`.

Open follow-ups: confirm headless board render on the first dry-run (then
`REQUIRE_BOARD=hard`); after a clean track record, batch >1 fix per run and
consider folding into the nightly (Phase 2c/2d).

---

## 9. Open questions for Roland
1. Nightly run time (suggest 02:00 CDT, off-hours)?
2. OK to add a Supabase **service-key** secret to a private GitHub Actions workflow (required for the runner to read ERs / write verdicts)?
3. Auto-fix bug-class threshold — comfortable starting with cosmetic + data-display only, then widening?
4. Where the AI posts its triage summary: ER `admin_notes`, a daily email via `send-er-report`, or both?
