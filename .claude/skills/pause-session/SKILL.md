---
name: pause-session
description: "PRVS Dashboard session checkpoint/pause. Triggers when Roland says 'Pause Session', 'Checkpoint', 'save progress', 'pause', or any variation of saving mid-session progress. MUST trigger on these phrases — this is the session checkpoint protocol."
---

# Pause / Checkpoint Session

When this skill is triggered, execute the following checkpoint protocol exactly:

1. **Run the backup script:**
   ```bash
   bash scripts/backup.sh
   ```
   Run this from the repo root (`rv-dashboard/`).

2. **Update CLAUDE_CONTEXT.md** with all progress so far:
   - Update the Active TODO List (mark completed items ✅, add any new items)
   - Add any new gotchas or design decisions to Known Issues
   - Update File Inventory if any file versions changed

3. **Save CLAUDE_CONTEXT.md** to the local workspace folder.

4. **Push to GitHub as a backup.** Confirm the push with the commit hash.

5. **Report to Roland:**
   - Exactly where we are in the current task
   - What's been completed this session so far
   - What's next when we resume
