# PRVS Dashboard — Emergency Rollback Guide

Use this guide if the dashboard is broken and you need to restore a working version immediately.
**You do not need Claude to do this.**

---

## Step 1 — Open Terminal

**Mac:** Press `Cmd + Space` → type `Terminal` → hit Enter

**Windows:** Press `Windows key` → type `PowerShell` → hit Enter

---

## Step 2 — Navigate to the Dashboard Folder

```
cd ~/Documents/rv-dashboard
```

If that doesn't work, try:

```
cd ~/Desktop/rv-dashboard
```

You'll know it worked when the prompt shows `rv-dashboard` in it.

---

## Step 3 — Run the Rollback Command

Pick the version you want to restore. **Most recent versions are at the top.**

| Version | Date | What's in it | Command |
|---------|------|-------------|---------|
| v1.301 | 2026-04-05 | Fix parts request RLS error for techs with expired sessions | `git reset --hard v1.301 && git push --force` |
| v1.295 | 2026-03-30 | GH#5 Work Assignment System (phase 1) — 8-silo WO builder, task CRUD, staff table, dollar rollup | `git reset --hard v1.295 && git push --force` |
| v1.294 | 2026-03-27 | GH#15 Phase 2 — QR scan opens dashboard with auto-scroll + pulse highlight | `git reset --hard v1.294 && git push --force` |
| v1.292 | 2026-03-26 | Remap parking spots to hand-drawn lot designations | `git reset --hard v1.292 && git push --force` |
| v1.291 | 2026-03-25 | Parking Spot field (GH#15 Phase 1) | `git reset --hard v1.291 && git push --force` |
| v1.290 | 2026-03-24 | Kenect messaging integration (GH#10) — dormant, not deployed | `git reset --hard v1.290 && git push --force` |
| v1.287 | 2026-03-22 | Wholesale and Retail Price columns in Manage Parts table | `git reset --hard v1.287 && git push --force` |
| v1.285 | 2026-03-20 | Four-state parts chips (Estimate, Sourcing, Outstanding, Received) | `git reset --hard v1.285 && git push --force` |

> **Note:** Versions v1.302 through v1.308 were committed but not tagged as releases.
> To roll back to the latest commit, use: `git reset --hard origin/main && git push --force`

> **⚠️ Schema changes:** Versions v1.295+ added new Supabase tables (staff, service_work_orders, service_tasks). Rolling back before v1.295 will break Work Orders features. The tables stay in Supabase regardless — only the frontend code changes.

Type the command exactly, hit Enter, and wait for it to say `main -> main`. That means it's done.

---

## Step 4 — Hard Refresh the Dashboard in the Browser

**Mac:** `Cmd + Shift + R`

**Windows:** `Ctrl + Shift + R`

This forces the browser to reload the restored version instead of showing a cached copy.

---

## Where to Find All Available Versions

Go to: **https://github.com/PatriotsRV/rv-dashboard/releases**

Every tagged release is listed there with notes on what it contains.
The tag name (e.g. `v1.301`) is what you put after `--hard` in the rollback command.

---

## Still Stuck?

Start a new Claude session in Cowork and say:

> *"Roll back the dashboard to v1.301"*

Claude can do it in about 30 seconds.

Or ask Perplexity Computer:

> *"Check the live dashboard and tell me if it's working"*

Perplexity can browse the live site and confirm.

---

## Important: Preventing Future Conflicts

**Do not push changes directly to GitHub while a Claude session is active.**
If you need to make a change or restore a backup, either:
- Wait until the Claude session is finished, or
- Tell Claude at the **start** of the next session before any files are touched — Claude will sync up first with one command

Direct pushes during an active session cause a "diverged branch" which requires recovery work and can extend outages.
