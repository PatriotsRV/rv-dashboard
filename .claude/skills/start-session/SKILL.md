---
name: start-session
description: "PRVS Dashboard session startup. Triggers when Roland says 'Start Session', 'Resume Session', 'start', 'resume', or any variation of beginning/resuming a work session. MUST trigger on these phrases — this is the session initialization protocol."
---

# Start / Resume Session

When this skill is triggered, execute the following session startup protocol exactly:

1. **Read both context files** from the local workspace folder (not GitHub):
   - `CLAUDE_CONTEXT.md`
   - `CLAUDE_CONTEXT_HISTORY.md`

2. **Confirm the current `index.html` version** matches the File Inventory table in CLAUDE_CONTEXT.md. If there's a mismatch, flag it.

3. **Read the Active TODO List aloud** to Roland, grouped by priority (🔴 Blocking, 🟠 High, 🟡 Medium, 🔵 Low). Include status for each item.

4. **Flag any blocking issues:**
   - 🔴 items that are still open
   - Any pending Roland-action items (marked "Roland action")

5. **Ask for iPhone updates:**
   > "Any updates from your iPhone since last session? Paste them here and I'll merge them into CLAUDE_CONTEXT.md before we start."

   If Roland provides mobile updates, merge them into the TODO list immediately:
   - Mark completed items ✅
   - Add new items with the correct priority
   - Confirm what changed before continuing

6. **Ask before starting work:**
   > "Is there anything else to add or change before we start?"

   **Wait for Roland's answer before beginning any work.**

7. Only then begin work — starting with the highest-priority TODO item unless Roland redirects.
