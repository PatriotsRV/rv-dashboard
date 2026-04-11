#!/bin/bash
# =============================================================================
# PRVS Dashboard — Pre-Deploy Backup Script
# =============================================================================
# Creates a timestamped snapshot of all key files and optionally exports
# Supabase tables and/or creates a git tag for major milestones.
# Keeps the last 6 file snapshots. Older ones are deleted automatically.
#
# Usage:
#   bash scripts/backup.sh                         # File snapshot only (default)
#   bash scripts/backup.sh --supabase              # Files + Supabase table export
#   bash scripts/backup.sh --tag my-tag-name       # Files + git tag
#   bash scripts/backup.sh --supabase --tag pre-security-remediation  # Full backup
#
# To restore a file from a backup:
#   cp .backups/YYYY-MM-DD_HH-MM-SS/index.html ./index.html
#
# To restore from a git tag:
#   git checkout <tag-name>
# =============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/.backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
SNAPSHOT_DIR="$BACKUP_DIR/$TIMESTAMP"
MAX_BACKUPS=6

# --- Parse flags ---
DO_SUPABASE=false
TAG_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --supabase)
      DO_SUPABASE=true
      shift
      ;;
    --tag)
      TAG_NAME="$2"
      shift 2
      ;;
    *)
      echo "⚠️  Unknown option: $1"
      echo "Usage: bash scripts/backup.sh [--supabase] [--tag <tag-name>]"
      exit 1
      ;;
  esac
done

# Files to back up
FILES=(
  "index.html"
  "checkin.html"
  "solar.html"
  "analytics.html"
  "closed-ros.html"
  "worklist-report.html"
  "supabase/functions/send-quote-email/index.ts"
  "supabase/functions/roof-lookup/index.ts"
  "supabase/functions/kenect-proxy/index.ts"
  "supabase/functions/send-er-report/index.ts"
  "supabase/functions/send-parts-report/index.ts"
  "supabase/functions/claude-vision-proxy/index.ts"
)

echo "📦 PRVS Backup — $TIMESTAMP"
echo "========================================"

# --- Step 1: File Snapshot ---
echo ""
echo "📁 Step 1: File Snapshot"
echo "----------------------------------------"

# Create snapshot directory
mkdir -p "$SNAPSHOT_DIR/supabase/functions/send-quote-email"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/roof-lookup"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/kenect-proxy"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/send-er-report"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/send-parts-report"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/claude-vision-proxy"

# Copy each file
for FILE in "${FILES[@]}"; do
  SRC="$REPO_ROOT/$FILE"
  DEST="$SNAPSHOT_DIR/$FILE"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$DEST"
    echo "  ✅ $FILE"
  else
    echo "  ⚠️  Skipped (not found): $FILE"
  fi
done

# Trim to MAX_BACKUPS — delete oldest snapshots beyond the limit
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  EXCESS=$(( BACKUP_COUNT - MAX_BACKUPS ))
  echo ""
  echo "🗑  Removing $EXCESS old snapshot(s) (keeping last $MAX_BACKUPS)..."
  ls -1 "$BACKUP_DIR" | sort | head -n "$EXCESS" | while read -r OLD; do
    rm -rf "$BACKUP_DIR/$OLD"
    echo "  Deleted: $OLD"
  done
fi

echo ""
echo "✅ Snapshot saved → .backups/$TIMESTAMP"
echo "   $(ls -1 "$BACKUP_DIR" | wc -l | tr -d ' ') snapshot(s) on file (max $MAX_BACKUPS)"

# --- Step 2: Supabase Table Export (optional) ---
if [ "$DO_SUPABASE" = true ]; then
  echo ""
  echo "🗄️  Step 2: Supabase Table Export"
  echo "----------------------------------------"

  # Check for required environment variables
  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    # Try to read from .env file if it exists
    if [ -f "$REPO_ROOT/.env" ]; then
      source "$REPO_ROOT/.env"
    fi
  fi

  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "  ⚠️  Skipping Supabase export — SUPABASE_URL and SUPABASE_SERVICE_KEY not set"
    echo "  Set these in your environment or in a .env file at the repo root:"
    echo "    export SUPABASE_URL=https://axfejhudchdejoiwaetq.supabase.co"
    echo "    export SUPABASE_SERVICE_KEY=your-service-role-key"
  else
    SUPABASE_EXPORT_DIR="$SNAPSHOT_DIR/supabase-data"
    mkdir -p "$SUPABASE_EXPORT_DIR"

    TABLES=(
      "repair_orders"
      "notes"
      "parts"
      "time_logs"
      "cashiered"
      "users"
      "user_roles"
      "roles"
      "audit_log"
      "config"
      "insurance_scans"
      "staff"
      "service_work_orders"
      "service_tasks"
      "enhancement_requests"
      "wo_task_templates"
      "wo_template_tasks"
      "manager_work_lists"
      "solar_project_store"
      "solar_settings"
    )

    EXPORT_SUCCESS=0
    EXPORT_FAIL=0

    for TABLE in "${TABLES[@]}"; do
      HTTP_STATUS=$(curl -s -o "$SUPABASE_EXPORT_DIR/$TABLE.json" -w "%{http_code}" \
        -H "apikey: $SUPABASE_SERVICE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
        -H "Accept: application/json" \
        "$SUPABASE_URL/rest/v1/$TABLE?select=*")

      if [ "$HTTP_STATUS" = "200" ]; then
        ROW_COUNT=$(python3 -c "import json; print(len(json.load(open('$SUPABASE_EXPORT_DIR/$TABLE.json'))))" 2>/dev/null || echo "?")
        echo "  ✅ $TABLE ($ROW_COUNT rows)"
        EXPORT_SUCCESS=$((EXPORT_SUCCESS + 1))
      else
        echo "  ❌ $TABLE (HTTP $HTTP_STATUS)"
        EXPORT_FAIL=$((EXPORT_FAIL + 1))
      fi
    done

    echo ""
    echo "  Exported: $EXPORT_SUCCESS tables  |  Failed: $EXPORT_FAIL"
    echo "  Data saved → .backups/$TIMESTAMP/supabase-data/"
  fi
fi

# --- Step 3: Git Tag (optional) ---
if [ -n "$TAG_NAME" ]; then
  echo ""
  echo "🏷️  Step 3: Git Tag"
  echo "----------------------------------------"

  # Check if tag already exists
  if git tag -l | grep -q "^${TAG_NAME}$"; then
    echo "  ⚠️  Tag '$TAG_NAME' already exists — skipping"
    echo "  To delete and recreate: git tag -d $TAG_NAME && git push origin :refs/tags/$TAG_NAME"
  else
    CURRENT_VERSION=$(grep -o 'v1\.[0-9]*' "$REPO_ROOT/index.html" | head -1 || echo "unknown")
    git tag -a "$TAG_NAME" -m "Snapshot: $TAG_NAME — $CURRENT_VERSION ($TIMESTAMP)"
    git push origin "$TAG_NAME"
    echo "  ✅ Tag '$TAG_NAME' created and pushed to GitHub"
    echo "  Restore with: git checkout $TAG_NAME"
  fi
fi

echo ""
echo "========================================"
echo "✅ PRVS Backup Complete — $TIMESTAMP"
[ "$DO_SUPABASE" = true ] && echo "   Supabase export: included"
[ -n "$TAG_NAME" ] && echo "   Git tag: $TAG_NAME"
echo "========================================"
