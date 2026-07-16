# Paste-Me: Fix the Start Session MOUNT GATE (wait-and-retry)

**Why:** The mount gate has tripped 5 sessions straight (S136–S140). Likely cause is a *boot race* —
the Linux workspace mounts asynchronously, but Start Session checks for the folder immediately and
finds nothing. A short wait-and-retry should absorb it.

**Bonus fix:** the `prvs-start-session` skill currently says *"If the workspace is unavailable, fetch
both from GitHub"* — which is the exact silent fallback the MOUNT GATE forbids. The skill and
`CLAUDE_CONTEXT.md` contradict each other today. This edit fixes both.

---

## How to apply

1. Open **Claude → Settings → Capabilities → Skills**
2. Find **`prvs-start-session`** and open it for editing
3. Find the section that begins `## STEP 1 — Read Both Files from Local Workspace`
4. **Select from that heading down to (but NOT including) `## STEP 2 — Confirm What You've Read`**
5. Delete it, and paste the replacement block below in its place
6. Save

Everything else in the skill stays exactly as-is.

---

## PASTE THIS (replaces all of STEP 1)

```markdown
## STEP 0 — 🔴 MOUNT GATE (HARD STOP — do this FIRST)

The env flag "User selected a folder: yes" means Roland *has* a folder selected — it does **NOT**
mean the folder is mounted yet. The workspace boots asynchronously, so an immediate check races the
mount. This has produced a false failure in 5 consecutive sessions (S136–S140).

**Check, then retry before declaring failure:**

1. Check the mount:
   ```bash
   ls /mnt/rv-dashboard/CLAUDE_CONTEXT.md
   ```
2. **If it is not there, DO NOT stop and DO NOT fall back to GitHub yet.** Wait ~5 seconds and
   re-check. Retry up to **3 times** (~15s total). If bash returns "Workspace still starting",
   that is the race — keep retrying.
3. If it appears on any retry: ✅ proceed to STEP 1. Mention briefly that the mount needed a retry,
   so the pattern stays visible.
4. **Only if all 3 retries fail:** STOP. Tell Roland:
   > "🔴 MOUNT GATE: the `rv-dashboard` folder isn't mounted after 3 retries. Please reconnect it
   > via the folder picker. I will not read from GitHub — it's a write-backup, not a read source."

   Then **wait**. Do not proceed. Do not read from GitHub.

> 🔴 **NO SILENT GITHUB FALLBACK — EVER.** GitHub is a write-backup, NOT a read source. Reading
> context from GitHub when the local folder is missing risks acting on stale state and silently
> destroying local work. Retrying the mount is allowed; substituting a different source is not.
> If Roland explicitly instructs a GitHub read after the gate trips, that is his call — say clearly
> which source you used and flag the staleness risk.

---

## STEP 1 — Read Both Files from Local Workspace

Read these two files **in full, top to bottom, before doing anything else**:

1. `/mnt/rv-dashboard/CLAUDE_CONTEXT.md`
2. `/mnt/rv-dashboard/CLAUDE_CONTEXT_HISTORY.md`

> ⚠️ **Staleness check:** The last line of `CLAUDE_CONTEXT.md` contains the date and session
> number it was last updated. If it does not match the most recent session in the Session Log,
> warn Roland: *"CLAUDE_CONTEXT.md may be stale — last updated [date], but Session Log shows
> Session [N] on [date]. Recommend verifying before we start."*
```

---

## What changed, in one line each

- **Added STEP 0** — the mount gate now lives in the skill, not only in `CLAUDE_CONTEXT.md`
- **Added wait-and-retry** — 3 attempts, ~5s apart, before declaring failure (the actual fix)
- **Removed the GitHub fallback** from STEP 1 — it contradicted the S136 mount gate
- **Kept** the staleness check unchanged

## Note

The retry does not weaken the gate. The gate's job is to prevent a *silent source substitution*;
retrying the same source isn't that. If the mount is genuinely absent, it still hard-stops and asks.

If it still trips after this change, the retry window is too short OR it's a real app-side bug —
thumbs-down that session and report it.
