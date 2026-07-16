# PRVS Pause Session Protocol

## What This Skill Writes

Pause is a mid-session checkpoint — it keeps `CLAUDE_CONTEXT.md` current in case the
session ends unexpectedly. It does NOT do the full End Session sync.

| File | Action | Why |
|---|---|---|
| `CLAUDE_CONTEXT.md` | Update + save locally + commit/push on `pre-prod` | Protects TODO + session log against unexpected session end |
| `CLAUDE_CONTEXT_HISTORY.md` | ❌ Not updated at Pause | Updated only at End Session |

> `PRVS_PROJECT_CONTEXT.md` (iPhone Claude Project file sync) was disabled
> 2026-05-25 (Session 74). Do NOT touch it at Pause or End Session. (Roland's iPhone
> Claude *Project* is still in use — he pastes updates in manually at Start Session.
> It is the *file sync* that is dead.)

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

Confirm success before proceeding.

---

## STEP 2 — Update CLAUDE_CONTEXT.md

In `CLAUDE_CONTEXT.md` at the repo root, update:

- [ ] **Active TODO List** — mark items completed so far this session ✅; add newly discovered items
- [ ] **Session Log** — add or update a row for this session: date, session number, work done so far
- [ ] **Known Issues & Gotchas** — add anything new discovered this session

Save the file to the local workspace folder.

> ⚠️ `CLAUDE_CONTEXT.md` is >256KB and will fail a plain `Read`. Edit it in place with
> targeted replacements (python/grep/awk) — do NOT rewrite it wholesale from a partial read.

---

## STEP 3 — 🔒 Commit on `pre-prod` (NEVER `main`)

> 🔴 **This skill used to say `git push origin main`. That was WRONG and is now fixed (S143).**
> It violated the branch model codified in Session 79 and would have re-created the
> **Session 83 drift** — the exact failure End Session's Sync Gate exists to prevent. A Pause
> checkpoint is by definition unreleased work, so it is **always** a `pre-prod` commit. There is
> no Pause case that touches `main`.

**The mandatory invariant:** `git log pre-prod..main --oneline` MUST always be empty —
`main` must never contain a commit `pre-prod` lacks.

```bash
cd "$RV"
git checkout pre-prod
git add CLAUDE_CONTEXT.md
git commit -m "Pause checkpoint - Session [N] - [brief description of work so far]"
git push origin pre-prod
# HARD ASSERTION - these two MUST print identical hashes:
git rev-parse pre-prod
git rev-parse origin/pre-prod
# INVARIANT CHECK - this MUST print nothing:
git log pre-prod..main --oneline
```

`main` legitimately stays behind until the next release promotes `pre-prod` -> `main`.
That is expected, not a bug.

> ⚠️ ASCII ONLY in command blocks - no em-dashes, smart quotes, or apostrophes, not even
> inside `#` comments. They break Roland's terminal paste (`quote>` prompt).

**Paste the REAL `rev-parse` output.** Never report the sync done from memory.
No confirmed hash = pause is not complete.

---

## STEP 4 — Report Status

Tell Roland:

1. ✅ Commit hash (from the `pre-prod` push) + the asserted hashes
2. What has been completed so far this session
3. Exactly where we are in the current task
4. What comes next when we resume

Ask: *"Ready to continue?"*

---

## Hard Rules

- Run `backup.sh` before pushing — never skip
- Save `CLAUDE_CONTEXT.md` locally before pushing
- **Commit on `pre-prod`. NEVER `git push origin main` from Pause.**
- No confirmed commit hash = pause is not complete
- Do not update `CLAUDE_CONTEXT_HISTORY.md` here — End Session handles it
- Do not touch `PRVS_PROJECT_CONTEXT.md` — iPhone file sync is disabled
- Never hardcode `/mnt/rv-dashboard`; resolve `$RV` per STEP 0
- GitHub is a **write-backup, not a read source**. Never read context from GitHub or from
  `.projects/<id>/docs/`. If `CLAUDE_CONTEXT.md` and § SESSION PROTOCOL disagree with this
  skill, **§ SESSION PROTOCOL wins** — fix the skill.
