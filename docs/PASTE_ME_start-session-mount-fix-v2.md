# Paste-Me v2: Fix the Start Session MOUNT GATE (auto-mount + dynamic path)

**Supersedes** `PASTE_ME_start-session-mount-fix.md` (S140, wait-and-retry). That fix targeted a
*boot race* that does not exist. It has now failed to help twice (S141, S143) and is not the cause.

## What's actually wrong — three bugs

**1. It was never a boot race.** S141 and S143 both tripped the gate with the env flag reading
`User selected a folder: no` and `mnt/` containing only `outputs` and `uploads`. All 3 retries
failed because there was nothing to wait *for*. Waiting longer cannot fix "no folder attached."

**2. The project Context listing is NOT a session mount.** The `rv-dashboard` entry on the project
page mounts a **read-only snapshot of project knowledge** at `.projects/<project-id>/docs/`. That
snapshot contains a *copy* of `CLAUDE_CONTEXT.md` — stale, and unwritable. It is not the git repo.
This is why the gate keeps tripping even though the project page looks correct.

> ⚠️ This snapshot is a live trap: a future session could find
> `.projects/<id>/docs/CLAUDE_CONTEXT.md`, believe it is the real file, and act on stale state —
> exactly the silent-stale-read the MOUNT GATE exists to prevent. The rule below forbids it.

**3. The skill hardcodes a path that does not exist.** It says `/mnt/rv-dashboard/CLAUDE_CONTEXT.md`.
The real bash path is `/sessions/<session-name>/mnt/rv-dashboard/`, and `<session-name>` is
regenerated every session. `/mnt/` contains only `.virtiofs-root`. **The gate would trip even with
the folder correctly mounted.** Bug #2 has been masking this one.

**The fix:** Step 0 should not hard-stop — it should just *mount the folder*.
`request_cowork_directory` with path `~/rv-dashboard` mounted it in one call at S143: no picker, no
navigation, no user action.

---

## How to apply

1. Open **Claude → Settings → Capabilities → Skills**
2. Find **`prvs-start-session`** and open it for editing
3. Select from `## STEP 0 — 🔴 MOUNT GATE (HARD STOP — do this FIRST)` down to (but **NOT**
   including) `## STEP 2 — Confirm What You've Read`
4. Delete it, paste the replacement block below in its place
5. Save

> ⚠️ **CORRECTION (applied S143):** an earlier draft of this doc said *"everything else in the skill stays
> exactly as-is."* **That was wrong.** The dead `/mnt/rv-dashboard` path also appears in the skill's
> **"What This Skill Reads"** table (top) and **"Key Reference"** table (bottom) — so STEP 1 says "never
> hardcode `/mnt/rv-dashboard`" while a table 60 lines above hands Claude exactly that path. Both tables must
> be fixed too; see **"Also fix these two tables"** below. Same class of bug as S140's: a skill contradicting
> itself. When retiring a rule, grep for its twins.

---

## PASTE THIS (replaces all of STEP 0 and STEP 1)

```markdown
## STEP 0 — 🔴 MOUNT GATE (do this FIRST)

The env flag `User selected a folder: yes` does **NOT** mean `rv-dashboard` is mounted, and the
`rv-dashboard` entry under the project's **Context** panel does **NOT** mount the git repo — it
mounts a stale read-only knowledge snapshot. Neither is proof. **Check, then mount.**

**1. Check whether the working folder is already mounted:**

    RV=$(ls -d /sessions/*/mnt/rv-dashboard 2>/dev/null | head -1)
    echo "RV=${RV:-NOT MOUNTED}"

**2. If it prints `NOT MOUNTED`, mount it — do not stop, do not ask:**

Call `request_cowork_directory` with path `~/rv-dashboard`. This resolves in one call and needs no
folder picker. Then re-run the check above to confirm.

**3. If bash returns "Workspace still starting":** that IS a boot race — wait ~5s and retry the
check up to 3 times before mounting.

**4. Only if `request_cowork_directory` itself fails:** STOP and tell Roland:
> "🔴 MOUNT GATE: `request_cowork_directory` could not mount `~/rv-dashboard`. Please attach the
> folder manually. I will not read from GitHub or from the project Context snapshot."

Then **wait**. Do not proceed.

### 🔴 NO SUBSTITUTE SOURCES — EVER

Context may be read **only** from the live mounted git repo. Never from:
- **GitHub** — it is a write-backup, not a read source
- **`.projects/<id>/docs/`** — the project Context snapshot; stale and read-only

Reading either risks acting on stale state and silently destroying local work. Mounting the real
folder is always the fix. If Roland *explicitly* instructs otherwise after the gate trips, that is
his call — say plainly which source you used and flag the staleness risk.

---

## STEP 1 — Read Both Files from the Live Repo

**Paths — use the right one per tool. Never hardcode `/mnt/rv-dashboard`:**

| Tool | Path |
|---|---|
| `Read` / `Write` / `Edit` / `Grep` / `Glob` (host) | `/Users/rolandshepard/rv-dashboard/` |
| `bash` (sandbox) | `$RV` from Step 0 — resolve it, don't assume it |

Read these two files before doing anything else:

1. `CLAUDE_CONTEXT.md`
2. `CLAUDE_CONTEXT_HISTORY.md`

> ⚠️ **`CLAUDE_CONTEXT.md` is >256KB and will fail a plain `Read`** (S143). Do not let this push you
> toward a smaller stale copy. Read it in pieces instead — the parts that matter are:
>
>     cd "$RV"
>     grep -nE "^#{1,3} " CLAUDE_CONTEXT.md              # section map
>     awk 'NR>=A && NR<=B {printf "%d|%.180s\n", NR, $0}' CLAUDE_CONTEXT.md   # TODO table, truncated
>     git branch --show-current && git log --oneline -5 && git status --short
>
> Report honestly which portions you read and which you did not.

**Staleness check:** confirm the newest Session Log entry, the `index.html` version in the File
Inventory, and the HEAD commit subject all agree. If they disagree, warn Roland before starting.
```

---

## Also fix these two tables (same skill)

**1. "What This Skill Reads" (top of skill)** — replace the table body with:

```markdown
| File | Location | Contains |
|---|---|---|
| `CLAUDE_CONTEXT.md` | repo root — see STEP 1 for the per-tool path | TODO list, File Inventory, Session Log, Known Issues |
| `CLAUDE_CONTEXT_HISTORY.md` | repo root — see STEP 1 for the per-tool path | Completed Work, Version History |
```

**2. "Key Reference" (bottom of skill)** — replace the three `/mnt/rv-dashboard` rows + backup row with:

```markdown
| Repo (host tools) | `/Users/rolandshepard/rv-dashboard/` |
| Repo (bash) | `$RV` — resolve per STEP 0, never hardcode |
| Context / history / iPhone-sync files | `CLAUDE_CONTEXT.md` · `CLAUDE_CONTEXT_HISTORY.md` · `PRVS_PROJECT_CONTEXT.md` (repo root) |
| Backup script | `bash scripts/backup.sh` |
```

Leave the GitHub repo / Live URL / Supabase ref rows alone.

---

## 3. Collapse STEP 2 into a pointer (ends the drift class for good)

**The gap this closes:** `CLAUDE_CONTEXT.md` mandates confirming `pre-prod` and running the drift check
(`git log main..pre-prod` / `pre-prod..main`) as START-OF-SESSION steps 2–3. **The skill's STEP 2 never
mentioned them.** A session following the skill literally skips the hard invariant.

The cure isn't to copy those steps into the skill — that's how all of this started. Give each file one job:

| File | Job |
|---|---|
| **Skill** | *Bootstrap only* — mount the folder, read the two files. All it can uniquely own, since you need it before the context file is reachable. |
| **`CLAUDE_CONTEXT.md` § SESSION PROTOCOL** | *The canonical checklist.* Read every session by definition. |

Replace the skill's entire `## STEP 2 — Confirm What You've Read` section with:

```markdown
## STEP 2 — Hand Off to the Canonical Checklist

Both files are now loaded. **`CLAUDE_CONTEXT.md` § ⚡ SESSION PROTOCOL is the single source of truth for
what happens next.** Execute its START OF SESSION checklist in full — every step, including the `pre-prod`
confirm and the **drift check** (`git log main..pre-prod --oneline` AND `git log pre-prod..main --oneline`;
the hard invariant is that `pre-prod..main` MUST be empty).

This skill deliberately does **not** restate those steps. If this skill and § SESSION PROTOCOL ever
disagree, **§ SESSION PROTOCOL wins** — and this skill is the thing to fix.
```

STEP 3 (iPhone updates), STEP 4, and STEP 5 stay as-is.

---

## Repo files fixed S143 (no action needed — already done)

- **`CLAUDE_CONTEXT.md`** Known Issue — the S140 "boot RACE" entry rewritten to the real 3-bug cause.
- **`SESSION_STARTER.md`** — **DELETED.** It was a third copy of the start protocol, referenced by nothing,
  and it had harbored the *"Fallback if workspace unavailable: fetch via GitHub API"* line for three sessions
  after S140 believed it had removed that rule from the skill. Roland types "start session"; the file earned
  nothing and cost a real bug.
- **`CLAUDE_CONTEXT.md` § SESSION PROTOCOL** — step 0 rewritten to auto-mount (it still said HARD STOP, which
  would have contradicted the new skill), and marked **CANONICAL** so future sessions know which file wins.
- **`docs/PASTE_ME_start-session-mount-fix.md` (v1)** — **DELETED.** It still instructed the reader to apply
  the disproven wait-and-retry fix. Git retains it.
- **Dead worktree `.claude/worktrees/epic-thompson-9936c6`** — **REMOVED** (16MB, untracked, git metadata
  pruned). It held a **1,469-line stale `CLAUDE_CONTEXT.md`** next to the live 1,657-line one — a greppable
  stale-read trap identical in kind to the `.projects/` snapshot.

### Still on disk — flagged, NOT touched (your call)

- **`COMET_STARTER.md`** — a paste block for *Perplexity Comet*, a different tool. Not a Claude-protocol
  duplicate, but it does restate project facts that can drift. Delete if Comet is out of the workflow.
- **`SESSION_PROTOCOL_TEMPLATE.md`** — a generic template for seeding *new* Claude projects. Likely
  superseded by the `project-kit` plugin's `init-project` skill. Another place the protocol is written down.

---

## After applying

Mark the 🟡 `MOUNT GATE retry` TODO row **✅ DONE — superseded by the S143 auto-mount fix**, and
record that the S140 wait-and-retry hypothesis was wrong. If a future session still trips the gate,
the cause is something new — do not re-add waiting.
