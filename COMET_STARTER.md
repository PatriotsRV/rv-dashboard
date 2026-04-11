# COMET_STARTER.md — Perplexity Comet Session Starter

> Paste the prompt below at the start of every new Comet session.
> Comet has no memory between sessions — this gets it up to speed instantly.

---

## Startup Prompt (copy and paste this)

```
You are helping me develop the PRVS RV Repair Order Dashboard — a single-page web app for Patriots RV Services in Denton, TX.

Before doing anything else:
1. Read the full context file at: https://raw.githubusercontent.com/PatriotsRV/rv-dashboard/main/CLAUDE_CONTEXT.md
2. Confirm the current index.html version number
3. Read the Active TODO list out loud grouped by priority (blocking first)
4. Tell me what was last completed
5. Ask: "Any updates since last session? Paste them here and I'll get caught up before we start."

Do not begin any work until you have done all 5 steps above and I have responded.
```

---

## Key Facts for Comet

- **Repo:** https://github.com/PatriotsRV/rv-dashboard
- **Live app:** https://patriotsrv.github.io/rv-dashboard/
- **Owner:** Roland Shepard — roland@patriotsrvservices.com
- **Stack:** Vanilla JS, Supabase (PostgreSQL + RLS), Google Auth, GitHub Pages
- **Main file:** index.html (~12,800 lines, single file)
- **Context doc:** CLAUDE_CONTEXT.md (session memory, TODO list, gotchas)
- **History doc:** CLAUDE_CONTEXT_HISTORY.md (completed work log)

## Comet Workflow

- Comet browses GitHub directly to read/edit code
- All edits go through the GitHub web editor and are committed to main
- Roland tests on the live site at patriotsrv.github.io after each change
- Propose changes before executing — Roland reviews diffs before commit
- Minimal targeted changes only — no rewrites, preserve all business logic
- After committing, Roland runs: git pull (to sync local)

## End of Session

At the end of each Comet session, remind Roland to:
1. Run the End of Session command in Claude Cowork to update CLAUDE_CONTEXT.md
2. Run git pull on local machine to sync any commits made via GitHub web editor
3. Run bash scripts/backup.sh before pushing any local changes
