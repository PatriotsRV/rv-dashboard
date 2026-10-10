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

> **Cloud-sandbox sessions (S200+):** the repo is mounted on Roland's Mac and reached through `device_bash`
> at `$HOME/mnt/rv-dashboard`. There, `cd "$HOME/mnt/rv-dashboard" || echo NOT MOUNTED` is the check, and the
> connected-folder list in the session reminder is the mount. Same gate, different path.

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
| `device_bash` (cloud sandbox, S200+) | `$HOME/mnt/rv-dashboard` |

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

**Staleness check:** confirm the newest Session Log **table row**, the header blockquote under the
File Inventory, the `index.html` version in the File Inventory, and the HEAD commit subject all agree.
If they disagree, warn Roland before starting. (S200 caught a missing S199 table row this way — the
table is the one that gets forgotten.)

---

## STEP 1a — Name the Session: `Provose <n>` (Roland directive, S200, 2026-10-10)

Every session is named **`Provose <n>`**, never "New session". `<n>` is the next number after the
newest Session Log row (S199 → Provose 200; numbering continues unbroken).

- Claude **cannot** rename the Cowork chat. Roland does it in the desktop app (session title / `…` menu
  → Rename). So, once the files are read, say: *"This is Provose <n> — please rename the chat."*
- Claude then uses `Provose <n>` as the label in everything it writes this session: the Session Log row,
  the `*Last updated*` marker, commit subjects (`Provose <n> End — …`, `Provose <n> checkpoint: …`), and
  `claude/SESSION_<n>_SUMMARY.md` in the project.
- Sessions ≤ 199 keep their historical "Session <n>" wording. `S<n>` stays as the short form inside TODO
  rows and Known Issues.

---

## STEP 2 — Hand Off to the Canonical Checklist

Both files are now loaded. **`CLAUDE_CONTEXT.md` § ⚡ SESSION PROTOCOL is the single source of truth
for what happens next.** Execute its START OF SESSION checklist in full — every step, including the
`pre-prod` confirm and the **drift check** (`git log main..pre-prod --oneline` AND
`git log pre-prod..main --oneline`; the hard invariant is that `pre-prod..main` MUST be empty).

This skill deliberately does **not** restate those steps. If this skill and § SESSION PROTOCOL ever
disagree, **§ SESSION PROTOCOL wins** — and this skill is the thing to fix.

> ⚠️ **If ANY git command here fails with "another git process seems to be running" — `.git/index.lock` IS clearable (S181).**
> `git status` and `git checkout pre-prod` both write the index, and the sandbox routinely leaves a lock it cannot unlink
> (`Operation not permitted`, FUSE). **Fix: call the `allow_cowork_file_delete` tool on `<RV>/.git/index.lock`, then
> `rm -f .git/index.lock .git/HEAD.lock`, then retry.** S177/S180 recorded this as unclearable and were WRONG — do not tell
> Roland it is impossible, and do not burn the start of a session debugging it. The
> `warning: unable to unlink .git/objects/**/tmp_obj_*` noise is harmless; filter it.

> 🔵 **The drift check reads LOCAL refs — that is CORRECT here, and here is the one condition that changes it (S181).**
> Since S180's SSH migration, pushes run host-side (see the End/Pause skills), so the sandbox never fetches and its
> `origin/*` refs go stale. That is harmless: Roland works from one Mac, this Cowork session is the only writer, and local
> IS the source of truth. **Do NOT add a routine `git fetch` — it fails from the sandbox anyway and would only slow every
> session start.** ⚠️ **The single trigger to reconsider:** if Roland ever mentions committing or pushing from another
> machine, or directly on the host outside a session, then local may be BEHIND origin and the drift check would compare
> stale refs and wrongly report clean. Only then, verify host-side first:
>
> ```
> do shell script "cd ~/rv-dashboard && /usr/bin/git fetch origin 2>&1; echo '---AHEAD/BEHIND pre-prod vs origin---'; /usr/bin/git rev-list --left-right --count pre-prod...origin/pre-prod"
> ```
>
> Output `0	0` means in sync. Anything else — resolve before any other work.

---

## STEP 3 — iPhone Updates: PERMANENTLY SKIPPED

The iPhone project / mobile sync was disabled S74 and is permanently off. **Do not ask Roland for iPhone
updates** and do not mention the step. Go straight to STEP 4.

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
- Bump the version in exactly TWO places per release (S182): the `window.APP_VERSION` declaration in `index.html` and `version.json`. The badges, the boot `console.log` and the update poller all DERIVE from the declaration — do not hand-edit them, and never let a module declare its own copy. `scripts/check_version_sync.py` enforces this and is BLOCKING in CI
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
| Repo (device_bash) | `$HOME/mnt/rv-dashboard` |
| Session name | `Provose <n>` — Roland renames the chat; Claude labels everything it writes |
| Context / history / iPhone-sync files | `CLAUDE_CONTEXT.md` · `CLAUDE_CONTEXT_HISTORY.md` · `PRVS_PROJECT_CONTEXT.md` (repo root) |
| ⛔ Never read context from | GitHub (write-backup only) · `.projects/<id>/docs/` (stale snapshot) |
| Backup script | `bash scripts/backup.sh` |
