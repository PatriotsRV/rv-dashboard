# PRVS_PROJECT_CONTEXT.md — DISABLED

> **iPhone Claude Project integration disabled by Roland on 2026-05-25 (Session 74).**
>
> Roland's words: *"I never use it because I DON'T TRUST IT or you to be maintained and kept in sync. It's already wasting my time this morning as usual chasing down freaking issues that are NOT PART of what I started out to fix today. So GET RID of the iPhone project integration."*

## Do not update this file

Future Claude sessions must NOT re-populate this file with TODO mirrors, "Recently Completed" sections, or "Current Version" tables. The iPhone Claude Project is no longer a maintained surface; mirroring state into it created drift that wasted Roland's time.

If the `prvs-end-session` skill (or any other skill) instructs you to update `PRVS_PROJECT_CONTEXT.md`, **skip that step**. The skill's instruction is stale relative to this kill decision. CLAUDE_CONTEXT.md remains the only canonical session-memory file.

## Do not recreate the iPhone refresh bundle

The `_iphone_project_refresh/` folder is being removed in the same commit as this stub. Do not recreate it. Do not propose the `prvs-refresh-mobile` skill from the Session 74 Step 7 plan. Do not propose a GitHub Action that publishes the bundle as a release artifact.

## If Roland ever wants to reactivate

This decision is reversible. If Roland later asks to bring mobile sync back, the right approach is a **GitHub-native sync** on the Claude Project (point the Project's knowledge sync at the `PatriotsRV/rv-dashboard` repo with a folder filter) — not a manually-uploaded bundle. The manual bundle is what created the drift problem in the first place.
