# PRVS Start Session Protocol

## What This Skill Reads

End Session writes and pushes three files. Start Session must read two of them:

| File | Location | Contains |
|---|---|---|
| `CLAUDE_CONTEXT.md` | repo root — see STEP 1 for the per-tool path | TODO list, File Inventory, Session Log, Known Issues |
| `CLAUDE_CONTEXT_HISTORY.md` | repo root — see STEP 1 for the per-tool path | Completed Work, Version History |

> `PRVS_PROJECT_CONTEXT.md` is for the iPhone Claude Project — not read at session start.

---

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

---

## STEP 2 — Hand Off to the Canonical Checklist

Both files are now loaded. **`CLAUDE_CONTEXT.md` § ⚡ SESSION PROTOCOL is the single source of truth
for what happens next.** Execute its START OF SESSION checklist in full — every step, including the
`pre-prod` confirm and the **drift check** (`git log main..pre-prod --oneline` AND
`git log pre-prod..main --oneline`; the hard invariant is that `pre-prod..main` MUST be empty).

This skill deliberately does **not** restate those steps. If this skill and § SESSION PROTOCOL ever
disagree, **§ SESSION PROTOCOL wins** — and this skill is the thing to fix.

---

## STEP 3 — Ask for iPhone Updates

Ask Roland:

> "Any updates from your iPhone since last session? Paste them here and I'll merge them into CLAUDE_CONTEXT.md before we start."

If Roland provides updates:

- Mark completed items ✅ in the Active TODO List
- Add new items with correct priority
- Save the updated `CLAUDE_CONTEXT.md` to the local workspace immediately
- Confirm exactly what changed before proceeding

---

## STEP 4 — Final Check

Ask:

> "Is there anything else to add or change before we start?"

Wait for Roland's answer. Do not begin work until confirmed.

---

## STEP 5 — Begin Work

Start with the highest-priority open TODO item unless Roland redirects.

---

## Non-Negotiable Session Rules

- Read BOTH context files before any work — no exceptions
- Run `bash scripts/backup.sh` before every `git push`
- Use `!getSB() || !supabaseSession` as auth guard — never `accessToken` alone
- Destructure `{ error }` from all Supabase writes — throw/alert if error exists
- Write audit log entries for field changes: `writeAuditLog(roId, [{field, oldValue, newValue}])`
- Capture `oldValue` BEFORE mutating `currentData`
- Use `.maybeSingle()` not `.single()` for any lookup where 0 rows is valid
- Parts request notes: `type:'ro_status'` + body prefix `🔩 PARTS REQUESTED:` — NEVER `type:'parts_request'`
- `uploadDocument` uses Supabase Storage only — never revert to Google Drive
- Bump version in `index.html` (comment + badge + `console.log`) with every release
- Commit and push after every meaningful change
- **If context window is getting full → run the End Session skill immediately, do not wait**

---

## Key Reference

| Item | Value |
|---|---|
| GitHub repo | `PatriotsRV/rv-dashboard` |
| Live URL | https://patriotsrv.github.io/rv-dashboard/ |
| Supabase ref | `axfejhudchdejoiwaetq` |
| Repo (host tools) | `/Users/rolandshepard/rv-dashboard/` |
| Repo (bash) | `$RV` — resolve per STEP 0, never hardcode |
| Context / history / iPhone-sync files | `CLAUDE_CONTEXT.md` · `CLAUDE_CONTEXT_HISTORY.md` · `PRVS_PROJECT_CONTEXT.md` (repo root) |
| ⛔ Never read context from | GitHub (write-backup only) · `.projects/<id>/docs/` (stale snapshot) |
| Backup script | `bash scripts/backup.sh` |
