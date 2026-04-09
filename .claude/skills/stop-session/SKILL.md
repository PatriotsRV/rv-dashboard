---
name: stop-session
description: "PRVS Dashboard end-of-session shutdown. Triggers when Roland says 'Stop Session', 'End Session', 'stop', 'end', 'wrap up', or any variation of ending a work session. MUST trigger on these phrases — this is the session shutdown protocol."
---

# Stop / End Session

When this skill is triggered, execute the **complete** End of Session Checklist. Every step must be completed before the session ends:

1. **Run the backup script:**
   ```bash
   bash scripts/backup.sh
   ```
   Run this from the repo root (`rv-dashboard/`).

2. **Update CLAUDE_CONTEXT.md:**
   - **Active TODO List** — mark completed items ✅, add any new items discovered
   - **File Inventory** table — update with new version numbers
   - **Session Log** — add a row for this session
   - **Known Issues & Gotchas** — add any new bugs, gotchas, or design decisions

3. **Update CLAUDE_CONTEXT_HISTORY.md:**
   - **Completed Work** — add new items
   - **Version History** — update if version was bumped

4. If version was bumped: add a **GitHub Release TODO** to the Active TODO List for Roland to publish at `github.com/PatriotsRV/rv-dashboard/releases/new`.

5. **Update `PRVS_PROJECT_CONTEXT.md`** — sync the TODO list and "Recently Completed" section so Roland's Claude Project (iPhone) stays current.

6. **Save both files** (CLAUDE_CONTEXT.md and CLAUDE_CONTEXT_HISTORY.md) to the local workspace folder.

7. **Push both files to GitHub** as a backup — confirm with the commit hash.

8. **Do not end the session** until the push is confirmed.

> **Context limit warning:** If the session is about to end due to context limits, say:
> *"Context is getting full — let me update CLAUDE_CONTEXT.md before we lose this session."*
> Then complete this checklist immediately without waiting for Roland to ask.
