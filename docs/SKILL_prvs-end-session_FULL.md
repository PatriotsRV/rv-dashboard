# PRVS End Session Protocol

## The Sync Contract

End Session is responsible for making Start Session work correctly next time.
Start Session reads `CLAUDE_CONTEXT.md` and `CLAUDE_CONTEXT_HISTORY.md` **from the live
mounted git repo**. Both must be written, saved locally, and pushed before this session closes.

| File | What Gets Updated | Read By |
|---|---|---|
| `CLAUDE_CONTEXT.md` | TODO list, File Inventory, Session Log, Known Issues | Start Session (laptop) |
| `CLAUDE_CONTEXT_HISTORY.md` | Completed Work, Version History | Start Session (laptop) |

> 🔴 **The push is a BACKUP, not a read source.** Start Session reads the **local repo only** —
> never GitHub, never `.projects/<id>/docs/`. Pushing protects against disk loss; it does not
> make GitHub a place to read context from. (S143: the phrase "from workspace or GitHub" lived
> in this skill's completion checklist and quietly contradicted the MOUNT GATE.)

> `PRVS_PROJECT_CONTEXT.md` (iPhone Claude Project file sync) was disabled 2026-05-25
> (Session 74). Do NOT update, repopulate, or push it. Skip any prior step that references it.

> ⚠️ **Context limit warning:** If the context window is nearly full, say:
> *"Context is getting full — running End Session now before we lose anything."*
> Execute this skill immediately. Do not wait for Roland to ask.

---

## STEP 0 — Resolve the Repo Path

**Never hardcode `/mnt/rv-dashboard` — it does not exist.**

    RV=$(ls -d /sessions/*/mnt/rv-dashboard 2>/dev/null | head -1)
    echo "RV=${RV:-NOT MOUNTED}"

| Tool | Path |
|---|---|
| `Read` / `Write` / `Edit` / `Grep` / `Glob` (host) | `/Users/rolandshepard/rv-dashboard/` |
| `bash` (sandbox) | `$RV` — resolve it, don't assume it |

If it prints `NOT MOUNTED`, call `request_cowork_directory` with path `~/rv-dashboard`.

---

## STEP 1 — Run Backup Script

```bash
cd "$RV"
bash scripts/backup.sh
```

Confirm success before writing any files.

---

## STEP 2 — Update CLAUDE_CONTEXT.md

In `CLAUDE_CONTEXT.md` at the repo root, update ALL of the following:

- [ ] **Active TODO List**
  - Mark every item completed this session ✅
  - Add newly discovered items with correct priority
  - Remove obsolete items (confirm with Roland first)
- [ ] **File Inventory** — update version numbers for every file changed this session; add/remove rows for files created or deleted
- [ ] **Session Log** — add a new row:
  `| [YYYY-MM-DD] | [session #] | [full summary of everything done this session] |`
- [ ] **Known Issues & Gotchas** — add new bugs, design decisions, or gotchas Claude must know next session
- [ ] **Last updated marker** — update the date/session stamp at the bottom of the file

> ⚠️ **Mark hypotheses as hypotheses.** A Known Issue heading states a *conclusion*. If the cause
> is a guess, write `⚗️ HYPOTHESIS (unproven as of S[N])` in the heading — do not state it as fact.
> S140 wrote "MOUNT GATE: it's a boot RACE" as a heading; S141 and S143 then read it as settled
> history and chased the wrong bug for 3 sessions. An untested guess, once written down, becomes
> "history."

> ⚠️ `CLAUDE_CONTEXT.md` is >256KB and will fail a plain `Read`. Edit it in place with targeted
> replacements (python/grep/awk) — do NOT rewrite it wholesale from a partial read.

Save to the local workspace.

---

## STEP 3 — Update CLAUDE_CONTEXT_HISTORY.md

In `CLAUDE_CONTEXT_HISTORY.md` at the repo root, update:

- [ ] **Completed Work** — add an entry for every feature, fix, or change completed this session
- [ ] **Version History** — if version was bumped, add a row:
  `| v[X.XXX] | [YYYY-MM-DD] | [description of what changed] |`

**If version was bumped, add a 🟡 Roland-action TODO to `CLAUDE_CONTEXT.md`:**
  `GitHub Release v[X.XXX] — create at github.com/PatriotsRV/rv-dashboard/releases/new`

(The release-tag push is part of STEP 4 Case B below — do not push the tag here.)

Save to the local workspace.

---

## STEP 3.5 — 🔍 TWIN CHECK (Class K) — run EVERY session, not just when rules changed

> **Why this exists (S143):** every protocol bug in this project's history came from the same
> failure — a rule was fixed in ONE copy and recorded as DONE while its twins lived on. S140
> removed the GitHub read-fallback from the start skill; the identical line survived in
> `SESSION_STARTER.md` for 3 more sessions. The pause skill kept `git push origin main` for ~64
> sessions after S79 made it illegal. **Nothing ever compared the copies.** Class K is that
> comparison — and it is automated precisely because every failure here was a *memory* failure,
> not a judgment one. Do not rely on remembering to grep.

```bash
cd "$RV"
python3 scripts/audit_codebase.py --output docs/qa/CODEBASE_AUDIT.md
```

Then read the **Class K** section of the report.

- **Exit code 1 / any BLOCKING Class K finding → the session is NOT done.** Fix it or get Roland's
  explicit call before proceeding.
- Class K scans the repo docs **and** the three `prvs-*` skills in the plugin cache. If it reports
  `[K0]` it could not find the skills — the most drift-prone copy went unchecked; say so out loud.

**If you retired or changed a rule this session, add a row to `RETIRED_RULES` in
`scripts/audit_codebase.py`.** That is the whole point: one row, enforced forever, everywhere, with
nobody having to remember. A rule retired without a `RETIRED_RULES` row will grow twins again.

**Canonical order:** `CLAUDE_CONTEXT.md` § SESSION PROTOCOL wins over any skill. If a skill needs
changing, edit `docs/SKILL_prvs-*_FULL.md` and have Roland **select-all-paste the whole file** —
never partial blobs. S143 proved partial blobs get half-applied. Note the skill **description**
field is separate frontmatter and does NOT get replaced by a body paste — check it too.

---

## STEP 4 — 🔒 BRANCH SYNC GATE (commit + push)

> The PRVS repo uses the `pre-prod` branch model (codified Session 79). The End-Session doc commit
> is ALWAYS made on `pre-prod` first, then promoted forward to `main` ONLY if a release shipped
> this session. `main` only ever moves by fast-forward from `pre-prod`. See the matching gate in
> `CLAUDE_CONTEXT.md` for the canonical text.

**The mandatory invariant:** `git log pre-prod..main --oneline` MUST always be empty —
`main` must never contain a commit `pre-prod` lacks. (A bare `git push origin main` of the doc
commit violates this. That was the Session 83 drift.)

**Paste the REAL output of every `rev-parse`. Never report the sync done from memory.**

### CASE A — NO release shipped this session (work stayed on pre-prod):

```bash
cd "$RV"
git checkout pre-prod
git add -A
git commit -m "Session [N] End - [brief summary]"
git push origin pre-prod
# HARD ASSERTION - these two MUST print identical hashes:
git rev-parse pre-prod
git rev-parse origin/pre-prod
# INVARIANT CHECK - this MUST print nothing:
git log pre-prod..main --oneline
```

`main` legitimately stays behind by the doc commit (and any unreleased pre-prod work)
until the next release promotes pre-prod -> main. That is expected, not a bug.

### CASE B — a release SHIPPED to main this session:

```bash
cd "$RV"
git checkout pre-prod
git add -A
git commit -m "Session [N] End - v[X.XXX] - [brief summary]"
git push origin pre-prod
git checkout main
git pull --ff-only origin main
git merge --ff-only pre-prod
git push origin main
git tag v[X.XXX]
git push origin v[X.XXX]
# HARD ASSERTION - all FOUR MUST print the SAME hash:
git rev-parse main
git rev-parse origin/main
git rev-parse pre-prod
git rev-parse origin/pre-prod
git checkout pre-prod
```

(If the release code was already merged + tagged earlier in the session, skip the
`git tag` / tag push above - the End-Session doc commit just rides the same FF.)

If any hash differs, the session is **NOT complete** - diagnose and resolve before declaring done.
A failed push or skipped sync means Start Session next time may read stale data, or `main` drifts
ahead of `pre-prod`.

> ⚠️ ASCII ONLY in command blocks - no em-dashes, smart quotes, or apostrophes, not even inside
> `#` comments. They break Roland's terminal paste (`quote>` prompt).

> ⚠️ Deletes can fail from the sandbox with "Operation not permitted" (FUSE). Use the
> `allow_cowork_file_delete` tool rather than telling Roland it is impossible.

Report the commit hash(es) to Roland.

---

## STEP 5 — Final Confirmation to Roland

Tell Roland:

1. ✅ Commit hash from the pre-prod push (+ main hash if a release shipped)
2. Which Sync Gate case ran (A or B) and the asserted hash(es)
3. Full list of everything completed this session
4. Current `index.html` version
5. Top 3 open TODO items for next session
6. Any Roland-action items pending (GitHub Releases, skill pastes, Supabase settings, etc.)

---

## Completion Checklist — Session is NOT done until every box is checked:

- [ ] `bash scripts/backup.sh` ran successfully
- [ ] `CLAUDE_CONTEXT.md` — TODO, File Inventory, Session Log, Known Issues updated + saved locally
- [ ] `CLAUDE_CONTEXT_HISTORY.md` — Completed Work, Version History updated + saved locally
- [ ] **Class K twin check run** (`python3 scripts/audit_codebase.py`) — zero BLOCKING Class K findings
- [ ] Doc commit made on `pre-prod` and pushed
- [ ] (If release shipped) fast-forwarded to `main` + release tag pushed
- [ ] 🔒 Sync Gate hash assertion PASSED with pasted output (Case A: 2 hashes match + `pre-prod..main` empty; Case B: 4 hashes match)
- [ ] Roland has the commit hash(es) in hand

> ✅ When all boxes are checked, Start Session next time will read current data **from the local
> repo**, and `main` is never ahead of `pre-prod`.
