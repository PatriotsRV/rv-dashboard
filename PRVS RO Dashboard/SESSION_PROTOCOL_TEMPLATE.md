# Session Protocol Template — For New Claude Projects

## HOW TO USE THIS TEMPLATE

### Step 1: Create your CLAUDE_CONTEXT.md
In your new Claude Project's workspace folder, create a file called `CLAUDE_CONTEXT.md`. Paste the template below (everything under "TEMPLATE STARTS HERE") and customize it:

- Replace `[PROJECT NAME]` with your project name (e.g., "Client Portal", "Inventory System")
- Replace `[WORKSPACE FOLDER]` with your Cowork workspace folder name
- Replace `[YOUR NAME]` with your name
- Replace `[MAIN FILE]` with whatever file you want Claude to version-check at startup (or remove that step if not applicable)
- Replace `[REPO URL]` with your GitHub repo (or remove GitHub steps if you don't use one)
- Replace `[BACKUP COMMAND]` with your backup command (or remove backup steps if you don't have one)
- Add or remove checklist items to fit your project's needs

### Step 2: Create your CLAUDE_CONTEXT_HISTORY.md
Create a companion file called `CLAUDE_CONTEXT_HISTORY.md` in the same folder. This is where completed TODOs, version history, session logs, and completed work details get archived so CLAUDE_CONTEXT.md doesn't grow too large.

### Step 3: Set your Project Instructions
In your Claude Project settings, set the custom instructions to something like:

> "You are working with [YOUR NAME] on [PROJECT NAME]. Every session MUST start by reading CLAUDE_CONTEXT.md from the workspace folder. This file contains the session protocol, TODO list, file inventory, known issues, and all context needed for continuity between sessions."

### Step 4: Start each session
Open a new session under the project and paste your START command (the green one below). Claude will read the context file, review TODOs, and get oriented before doing any work.

### Tips
- **Always start fresh sessions** — don't reuse old ones. The context files carry your memory.
- **Use PAUSE** during long sessions or before stepping away — it checkpoints your progress.
- **Use STOP** when you're done for the day — it saves everything for next time.
- **CLAUDE_CONTEXT.md is the single source of truth.** If Claude doesn't know something, it should be in this file.

---

# ========== TEMPLATE STARTS HERE ==========

---

# [PROJECT NAME] — Claude Context Document

> **This is Claude's memory across sessions.** Claude has no memory between sessions.
> Every session MUST start by reading this file. Every session MUST update this file before ending.

---

## ⚡ SESSION PROTOCOL — READ THIS FIRST

> **Storage strategy:** CLAUDE_CONTEXT.md lives **locally** in the `[WORKSPACE FOLDER]` Cowork workspace folder (primary). GitHub is a **backup only**, pushed at end of session. Always read from local. Always write to local first.

### 🟢 START OF SESSION — [YOUR NAME]'s command:
> *"Read CLAUDE_CONTEXT.md and CLAUDE_CONTEXT_HISTORY.md from the workspace folder before doing anything else. Confirm the current [MAIN FILE] version, read the Active TODO List out loud to me grouped by priority, and flag any blocking issues or [YOUR NAME]-action items still pending. Follow the Start of Session Checklist in that file. Then ask me: 'Any updates since last session? Paste them here and I'll merge them into CLAUDE_CONTEXT.md before we start.' If I provide updates, merge them into the TODO list immediately — mark completed items ✅, add new items with the correct priority — and confirm what changed before continuing. Then ask: 'Is there anything else to add or change before we start?' and wait for my answer before beginning any work."*

Claude must complete all of these before doing any work:

- [ ] 1. Read this file from the local workspace folder (not GitHub)
- [ ] 2. Read CLAUDE_CONTEXT_HISTORY.md for full project history
- [ ] 3. Confirm the current `[MAIN FILE]` version matches the File Inventory table below
- [ ] 4. Read and acknowledge the **Active TODO List** section aloud, grouped by priority
- [ ] 5. Flag any 🔴 blocking items and any pending [YOUR NAME]-action items
- [ ] 6. Ask for updates since last session — merge any provided before starting work
- [ ] 7. Ask: *"Is there anything else to add or change before we start?"* and wait
- [ ] 8. Only then begin work — starting with highest-priority TODO item unless [YOUR NAME] redirects

### ⏸ PAUSE / CHECKPOINT — [YOUR NAME]'s command:
> *"Pause what you're doing and save progress now. [BACKUP COMMAND IF APPLICABLE]. Update CLAUDE_CONTEXT.md with everything completed so far this session — TODO list, session log, any new gotchas — and save it to the workspace folder. Then push to GitHub as a backup. Confirm the push with the commit hash. Then tell me exactly where we are and what's next before continuing."*

Claude must:

- [ ] 1. Run backup if applicable
- [ ] 2. Update CLAUDE_CONTEXT.md with all progress so far (TODO list, session log, gotchas)
- [ ] 3. Save CLAUDE_CONTEXT.md to the local workspace folder
- [ ] 4. Push to GitHub as a backup — confirm with commit hash (if applicable)
- [ ] 5. Report: exactly where we are and what's next

### 🔴 END OF SESSION — [YOUR NAME]'s command:
> *"Before we stop: run the End of Session Checklist from CLAUDE_CONTEXT.md. Update the TODO list, File Inventory, Session Log, Completed Work, Known Issues, and Version History as needed. Save CLAUDE_CONTEXT.md to the workspace folder, then push to GitHub as a backup. Do not end the session until everything is saved."*

Claude must complete ALL of these before the session ends (context limit, user stops, etc.):

- [ ] 1. Run backup if applicable
- [ ] 2. Update the **Active TODO List** — mark completed items ✅, add any new items discovered
- [ ] 3. Update the **File Inventory** table with new version numbers
- [ ] 4. Add a row to the **Session Log** table
- [ ] 5. Add new items to **Completed Work** in `CLAUDE_CONTEXT_HISTORY.md`
- [ ] 6. Update the **Version History** table in `CLAUDE_CONTEXT_HISTORY.md` if version was bumped
- [ ] 7. Add any new bugs, gotchas, or design decisions to the **Known Issues & Gotchas** section
- [ ] 8. **Save CLAUDE_CONTEXT.md to the local workspace folder** (primary)
- [ ] 9. **Push to GitHub** (backup) — confirm with commit hash (if applicable)

> ⚠️ If the session is about to end due to context limits, Claude should say:
> *"Context is getting full — let me update CLAUDE_CONTEXT.md before we lose this session."*
> Then complete the End of Session Checklist immediately without waiting for [YOUR NAME] to ask.

---

## 🗂 Project Identity

| Field | Value |
|---|---|
| **Project** | [PROJECT NAME] |
| **Owner** | [YOUR NAME] — [YOUR EMAIL] |
| **GitHub Repo** | [REPO URL or N/A] |
| **Deployment** | [WHERE IT'S HOSTED or N/A] |

---

## 📋 ACTIVE TODO LIST

> This is the canonical task list. Update it every session. Priorities: 🔴 Blocking · 🟠 High · 🟡 Medium · 🔵 Low

| Priority | # | Task | Notes | Status |
|---|---|---|---|---|
| 🟠 | 1 | **[First task]** | [Notes] | ⏳ Open |
| 🟡 | 2 | **[Second task]** | [Notes] | ⏳ Open |

> Completed items moved to CLAUDE_CONTEXT_HISTORY.md

---

## 📁 File Inventory

| File | Version | Description |
|---|---|---|
| `[MAIN FILE]` | **v1.0** | [Description] |
| `CLAUDE_CONTEXT.md` | — | This file — session continuity |

---

## ⚠️ Known Issues & Gotchas

> Key gotchas Claude must know. Add items here as they come up.

*(None yet — add issues as they're discovered during development)*

---

## 🏗 Tech Stack

- **[List your tech stack here]**

---

# ========== COMPANION FILE: CLAUDE_CONTEXT_HISTORY.md ==========

# [PROJECT NAME] — Claude Context History

> Historical archive. Read this at session start and end. Companion to CLAUDE_CONTEXT.md.

---

## 📋 COMPLETED TODO ITEMS

> Archived from CLAUDE_CONTEXT.md active list.

| Priority | # | Task | Notes | Status |
|---|---|---|---|---|
| *(moved here when completed)* | | | | |

---

## ✅ Completed Work

- *(Add completed work details here each session)*

---

## 📜 Version History

| Version | Date | Summary |
|---|---|---|
| v1.0 | [DATE] | Initial version |

---

## 📅 Session Log

| Date | Session | Summary |
|---|---|---|
| [DATE] | 1 | [First session summary] |
