#!/bin/bash
# =============================================================================
# PRVS Dashboard — Pre-Deploy Backup Script
# =============================================================================
# Run this before every git push to create a timestamped snapshot of all key
# files. Keeps the last 6 snapshots. Older ones are deleted automatically.
#
# Usage:
#   bash scripts/backup.sh
#
# To restore a file from a backup:
#   cp .backups/YYYY-MM-DD_HH-MM-SS/index.html ./index.html
# =============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/.backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
SNAPSHOT_DIR="$BACKUP_DIR/$TIMESTAMP"
MAX_BACKUPS=6

# Files to back up
FILES=(
  "index.html"
  "checkin.html"
  "solar.html"
  "analytics.html"
  "supabase/functions/send-quote-email/index.ts"
  "supabase/functions/roof-lookup/index.ts"
)

echo "📦 PRVS Backup — $TIMESTAMP"
echo "----------------------------------------"

# Create snapshot directory
mkdir -p "$SNAPSHOT_DIR/supabase/functions/send-quote-email"
mkdir -p "$SNAPSHOT_DIR/supabase/functions/roof-lookup"

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
echo "----------------------------------------"
