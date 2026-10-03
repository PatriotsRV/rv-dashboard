# PRVS RO Dashboard — Backup & Restore Architecture

> Written Session 194 (2026-10-03) in response to Roland's directive: *"ENSURE that all work and code will be safe, backed up, and capable of being restored if ANY glitch happens with Claude or Cloudflare or the development of v2.+"*
> Status: **design + workflow rewrite committed on `pre-prod`; two Roland actions outstanding (Section 6).**

## 0. What Session 194 found (the "before" picture)

The nightly `backup.yml` had been green every night since 9/22 and was backing up **20 of 63 tables**, and truncating the larger ones:

- Not covered at all: `messages` (61k rows — the entire customer texting history), `conversations`, `conversation_events`, every `cashiered_*` archive table (closed-RO history), `ro_receivables`, `tasks`, `task_events`, all `planner_*` tables, `review_requests`, `review_feedback`, `scheduled_messages`, `scheduled_notifications`, `woosender_leads`, `time_off_requests`, `short_links`, `aeroarmor_*`, `app_config`, `staff_groups`, `staff_broadcasts`, `message_snippets`, `silo_targets`, `shop_tasks`, `customer_note_entries`, the `kenect_*_raw` imports…
- Truncated: Supabase/PostgREST returns at most 1,000 rows per request. `audit_log` (~2,800) and `notes` (~1,300) were being written as their first 1,000 rows, and the manifest reported the clipped count as success.
- Storage bucket `rv-media` (RO photos, documents, estimates): **no backup of any kind.**

A green run was not evidence of a backup. **Rule from this session: a backup job must verify what it wrote against what the source holds, and fail loudly on mismatch.**

## 1. What has to survive

| Asset | Where it lives | Why it matters | Loss impact |
|---|---|---|---|
| **Database** (63 public tables, ~100 MB) | Supabase Postgres 17 (`axfejhudchdejoiwaetq`) | The business: ROs, customers, parts, time, money, messages | Catastrophic |
| **Auth identities** | Supabase `auth` schema | Who can sign in; `public.users.id` ↔ `auth.uid` links (S156 drift note) | Painful — re-link 25 users |
| **Media** | Supabase Storage bucket `rv-media` | RO photos, insurance docs, estimates | Serious — evidence for insurance work |
| **Code** | git: local Mac clone + `PatriotsRV/rv-dashboard` (GitHub) + Cloudflare Pages build cache | The app, edge functions, migrations | Recoverable from any copy |
| **Session memory** | `CLAUDE_CONTEXT.md`, `CLAUDE_CONTEXT_HISTORY.md`, `docs/` — in git | Everything Claude knows between sessions | Recoverable from git |
| **Edge-function secrets** | Supabase dashboard (not in git, by design) | API keys for Anthropic, Textly, Google, etc. | Annoying — re-enter from password manager |
| **Cloudflare config** | Pages project, Access app + policies, DNS | The front door | Rebuildable in ~30 min from Section 5 |
| **Google OAuth client** | Google Cloud console | Sign-in | Rebuildable; origins list in CLAUDE_CONTEXT |

## 2. The layered design (after this session)

Three independent copies of the database, two of the code, with different failure modes:

```
                 ┌─────────────────────────────────────────────┐
                 │  Supabase Postgres (live)                   │
                 └──────┬───────────────┬──────────────────────┘
      Supabase-managed  │               │  GitHub Actions nightly 08:00 UTC
      daily backups     │               │  (.github/workflows/backup.yml)
      (Pro plan, 7 d)   │               ├──► pg_dump custom-format → workflow ARTIFACT (30 d)   ← restorable, complete
                        │               └──► JSON per table, paged + VERIFIED → prvshepard/rv-dashboard-backups (30 d)
                        ▼
              Supabase dashboard → Database → Backups (restore button)

   Code:  Mac clone  ◄──git──►  GitHub PatriotsRV/rv-dashboard (pre-prod + main + tags)  ──►  Cloudflare Pages (serves main)
          scripts/backup.sh snapshots to .backups/ before every push
```

**Why three DB copies, not one.** Supabase's own backup protects against *our* mistakes (bad migration, mass-corrupting SQL — S-era ER incident) but lives inside the Supabase account; if the account or project is lost, so is it. The pg_dump artifact lives in GitHub, outside Supabase. The JSON export is human-readable and greppable for a single-row recovery ("what did RO 7388's notes say last Tuesday") without a full restore.

**Why the code does not need more.** Git is already a distributed backup: every clone is a full copy with history. Mac + GitHub + Cloudflare's checkout = three. The rule that matters is *the Mac clone stays* — Roland's note that nothing should be stored locally would remove one of three copies for no gain.

## 3. The rewritten `backup.yml` (S194)

1. Installs `pg_dump` 17 (server is PostgreSQL 17.6; the runner default is 16 and refuses).
2. `pg_dump --format=custom --schema=public` → `prvs-public-<date>.dump`; fails the job if under 1 MB. Separate best-effort `--data-only` dump of `auth` + `storage` schemas.
3. Uploads the dumps as a workflow artifact, **30-day retention**.
4. Enumerates every table from the REST OpenAPI root (`GET /rest/v1/`) — no hard-coded list, so new tables are covered the night they are created.
5. Pages each table with `Range` headers 1,000 rows at a time; reads the exact total from `Content-Range` (`Prefer: count=exact`); **fails the job if exported ≠ total**.
6. Gzips each table (`<table>.ndjson.gz`) and writes `manifest.json` with `{exported, db_total}` per table plus whether the pg_dump ran.
7. Pushes to the private backups repo only if everything verified. Prunes to 30 days there.

Until the `SUPABASE_DB_URL` secret exists, step 2 skips with a `::warning::` and the JSON path still runs — so the first run after merge is already a complete, verified backup even before the secret is added.

## 4. Restore procedures

### 4a. Whole database (worst case: project lost or mass corruption)
1. Supabase → new project (or the same one) → Connect → copy the **session pooler** URI.
2. Download the newest `prvs-pgdump-*` artifact from Actions → Daily Supabase Backup → the run → Artifacts.
3. `pg_restore --clean --if-exists --no-owner --no-privileges -d "<pooler URI>" prvs-public-<date>.dump`
4. Re-run the GRANTs that Supabase's 2026-10-30 Data API change requires (see `reference_supabase_public_grant_change`), then `supabase functions deploy` all functions, then re-enter secrets.
5. If it is a *new* project: new anon/service keys → update `js/config.js`, every page's inline key, every edge fn secret, the GitHub Actions secrets, and the OAuth redirect URI.

### 4b. One table or one row (the common case)
- From the backups repo: `zcat 2026-10-03/notes.ndjson.gz | jq 'select(.ro_id=="PRVS-...")'` → craft an `INSERT`/`UPDATE` in the SQL editor. Guard with redundant predicates and verify affected-row count (standing rule).
- From the dump: `pg_restore --data-only --table=notes -d <url> file.dump` restores one table (into an empty table, or use `-t` into a scratch schema and copy across).

### 4c. Point-in-time (e.g. "undo the last 2 hours")
- Not available today. Supabase PITR add-on is ~$100/mo (TODO row, deferred). The daily cadence means up to 24 h of loss in the worst case. **If v2 moves invoicing/payments into this DB, revisit PITR — money changes the calculus.**

### 4d. Media (`rv-media`)
- **Gap.** Nothing backs it up. Design for next session: a second workflow that lists the bucket via the Storage API and syncs new/changed objects to a Cloudflare R2 bucket (10 GB free tier; same account as Pages). Until then, Supabase's own infrastructure redundancy is the only protection.

### 4e. Code and Cloudflare front door
- Code: `git clone git@github.com:PatriotsRV/rv-dashboard.git` from any machine; `main` = production, `pre-prod` = integration, tags = every release (`v1.500` is the standing rollback anchor).
- Cloudflare rebuild from scratch (~30 min): Pages project `prvs-dashboard` ← `PatriotsRV/rv-dashboard`, branch `main`, no build, output `/`; custom domain `dashboard.prvstools.com`; Zero Trust → Access app `dashboard` on that hostname, 1-week session, policies `PRVS staff only` (Allow, `Emails ending in @patriotsrvservices.com`, ID `06fef3ab…`) + `PRVS shop network` (Bypass, IP `98.97.83.247/32`); `functions/_middleware.js` in the repo closes `*.pages.dev`.

## 5. Monitoring — how we know it keeps working
- GitHub emails the repo owner on a failed scheduled workflow. **The rewritten job now fails on incomplete data**, so that email is meaningful for the first time.
- Monthly spot-check (add to Start Session when the month changes): open the latest manifest in the backups repo and confirm `tables` count ≥ 60 and `pg_dump_artifact: "yes"`.
- `GH_BACKUP_PAT` expires **2027-08-23** — the push step will fail that night; the failure email is the alarm.

## 6. Roland actions outstanding
1. **Add the `SUPABASE_DB_URL` secret** (one time): Supabase dashboard → Connect → Session pooler → copy URI (contains the DB password) → GitHub `PatriotsRV/rv-dashboard` → Settings → Secrets and variables → Actions → New repository secret, name `SUPABASE_DB_URL`. Then Actions → Daily Supabase Backup → Run workflow → confirm the `prvs-pgdump-*` artifact appears.
2. **Decide on media backup** (R2 sync) — next session's build if yes.

## 7. Open decisions
- PITR when money moves into the DB (v2 invoicing).
- Whether 30-day retention is enough, or a monthly dump should be kept for a year (cheap: one artifact a month, 90-day max artifact retention means it would need R2 instead).
