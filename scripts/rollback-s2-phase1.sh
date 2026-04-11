#!/bin/bash
# =============================================================================
# PRVS Dashboard — S2 Phase 1 Rollback Script
# =============================================================================
# Reverses the S2 database migrations in strict reverse order (1.6 → 1.1).
# Run this if any Phase 1 migration step breaks access in production.
#
# Each step is idempotent — safe to run multiple times or skip individual steps.
#
# Pre-S2 database state (captured 2026-04-11):
#   roles:      6 roles (Admin, Insurance Manager, Manager, Parts Manager, Solar, Technician)
#   user_roles: 7 entries:
#               andrew@/Manager, brandon@/Manager, mauricio@/Manager, ryan@/Manager,
#               ryan@/Solar, solar@/Solar, tipton@/Solar
#   staff:      Kevin (sr_manager), Sofia (sr_manager) — already existed before S2
#
# FK behavior: user_roles.role_id → roles.id is ON DELETE CASCADE
#              Deleting a role auto-removes its user_roles entries.
#
# Usage:
#   bash scripts/rollback-s2-phase1.sh                  # Full rollback (all steps)
#   bash scripts/rollback-s2-phase1.sh --step 1.4       # Rollback a single step
#   bash scripts/rollback-s2-phase1.sh --nuclear        # Single-transaction nuke
#   bash scripts/rollback-s2-phase1.sh --verify         # Just verify current state
#   bash scripts/rollback-s2-phase1.sh --dry-run        # Show SQL without executing
#
# Requirements:
#   - SUPABASE_DB_URL environment variable (Postgres connection string)
#     OR psql access to the Supabase database
#   - Can also be run by copying SQL blocks into the Supabase SQL Editor
# =============================================================================

set -euo pipefail

# --- Config ---
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No color

# --- Parse flags ---
MODE="full"       # full | step | nuclear | verify | dry-run
TARGET_STEP=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --step)
      MODE="step"
      TARGET_STEP="$2"
      shift 2
      ;;
    --nuclear)
      MODE="nuclear"
      shift
      ;;
    --verify)
      MODE="verify"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      head -28 "$0" | tail -24
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
done

# --- SQL execution helper ---
run_sql() {
  local description="$1"
  local sql="$2"

  echo ""
  echo -e "${CYAN}━━━ $description ━━━${NC}"

  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] Would execute:${NC}"
    echo "$sql"
    return 0
  fi

  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    result=$(psql "$SUPABASE_DB_URL" -c "$sql" 2>&1) || {
      echo -e "${RED}FAILED: $description${NC}"
      echo "$result"
      return 1
    }
    echo "$result"
    echo -e "${GREEN}✓ $description${NC}"
  else
    echo -e "${YELLOW}No SUPABASE_DB_URL set. Copy this SQL into Supabase SQL Editor:${NC}"
    echo ""
    echo "$sql"
    echo ""
  fi
}

# ─────────────────────────────────────────────────────────────
# VERIFICATION QUERY
# ─────────────────────────────────────────────────────────────
verify_state() {
  local label="${1:-Current}"

  run_sql "$label state — user_roles" "
SELECT u.email, r.name AS role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY r.name, u.email;
"

  run_sql "$label state — roles table" "
SELECT name FROM roles ORDER BY name;
"

  run_sql "$label state — staff (Kevin & Sofia)" "
SELECT name, email, role, active FROM staff
WHERE email IN ('kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com');
"
}

# ─────────────────────────────────────────────────────────────
# INDIVIDUAL ROLLBACK STEPS (reverse order: 1.6 → 1.1)
# ─────────────────────────────────────────────────────────────

rollback_1_6() {
  # Sofia already existed as sr_manager before S2 — Step 1.6 was a no-op.
  # This just confirms her state is correct.
  run_sql "Rollback 1.6 — Confirm Sofia staff entry (no-op)" "
-- Sofia was already sr_manager before S2. Restoring known-good state:
UPDATE staff SET role = 'sr_manager', active = TRUE
WHERE email = 'sofia@patriotsrvservices.com';
"
}

rollback_1_5() {
  # Kevin already existed as sr_manager before S2 — Step 1.5 was a no-op.
  run_sql "Rollback 1.5 — Confirm Kevin staff entry (no-op)" "
-- Kevin was already sr_manager before S2. Restoring known-good state:
UPDATE staff SET role = 'sr_manager', active = TRUE
WHERE email = 'kevin@patriotsrvservices.com';
"
}

rollback_1_4() {
  # Pre-S2: andrew, brandon, mauricio, ryan already had Manager.
  # S2 added: jason, solar (Manager, not Solar), bobby.
  # Only remove the 3 that S2 added.
  run_sql "Rollback 1.4 — Remove S2-added Manager assignments (jason, solar, bobby)" "
DO \$\$
DECLARE
    mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
    _removed INT := 0;
BEGIN
    SELECT id INTO mgr_role_id FROM roles WHERE name = 'Manager';
    IF mgr_role_id IS NULL THEN
        RAISE WARNING 'Manager role not found — nothing to rollback';
        RETURN;
    END IF;

    -- Only the 3 Manager assignments S2 added (keep andrew, brandon, mauricio, ryan)
    FOREACH _email IN ARRAY ARRAY[
        'jason@patriotsrvservices.com',
        'solar@patriotsrvservices.com',
        'bobby@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = mgr_role_id;
            IF FOUND THEN
                _removed := _removed + 1;
                RAISE NOTICE 'Removed Manager role from %', _email;
            ELSE
                RAISE NOTICE '% did not have Manager role — skipped', _email;
            END IF;
        ELSE
            RAISE NOTICE '% not in users table — skipped', _email;
        END IF;
    END LOOP;

    RAISE NOTICE 'Rollback 1.4 complete: removed % Manager assignments', _removed;
END \$\$;
"
}

rollback_1_3() {
  # No one had Sr Manager before S2 (the role didn't exist). Remove all 3.
  run_sql "Rollback 1.3 — Remove all Sr Manager role assignments" "
DO \$\$
DECLARE
    sr_mgr_role_id UUID;
    _email TEXT;
    _user_id UUID;
    _removed INT := 0;
BEGIN
    SELECT id INTO sr_mgr_role_id FROM roles WHERE name = 'Sr Manager';
    IF sr_mgr_role_id IS NULL THEN
        RAISE WARNING 'Sr Manager role not found — already rolled back or never created';
        RETURN;
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'ryan@patriotsrvservices.com',
        'kevin@patriotsrvservices.com',
        'sofia@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = sr_mgr_role_id;
            IF FOUND THEN
                _removed := _removed + 1;
                RAISE NOTICE 'Removed Sr Manager role from %', _email;
            ELSE
                RAISE NOTICE '% did not have Sr Manager role — skipped', _email;
            END IF;
        ELSE
            RAISE NOTICE '% not in users table — skipped', _email;
        END IF;
    END LOOP;

    RAISE NOTICE 'Rollback 1.3 complete: removed % Sr Manager assignments', _removed;
END \$\$;
"
}

rollback_1_2() {
  # Neither Roland nor Lynn had Admin in user_roles before S2. Remove both.
  run_sql "Rollback 1.2 — Remove Admin role from Roland and Lynn" "
DO \$\$
DECLARE
    admin_role_id UUID;
    _email TEXT;
    _user_id UUID;
    _removed INT := 0;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';
    IF admin_role_id IS NULL THEN
        RAISE WARNING 'Admin role not found — nothing to rollback';
        RETURN;
    END IF;

    FOREACH _email IN ARRAY ARRAY[
        'roland@patriotsrvservices.com',
        'lynn@patriotsrvservices.com'
    ] LOOP
        SELECT id INTO _user_id FROM users WHERE email = _email;
        IF _user_id IS NOT NULL THEN
            DELETE FROM user_roles
            WHERE user_id = _user_id AND role_id = admin_role_id;
            IF FOUND THEN
                _removed := _removed + 1;
                RAISE NOTICE 'Removed Admin role from %', _email;
            ELSE
                RAISE NOTICE '% did not have Admin role — skipped', _email;
            END IF;
        ELSE
            RAISE NOTICE '% not in users table — skipped', _email;
        END IF;
    END LOOP;

    RAISE NOTICE 'Rollback 1.2 complete: removed % Admin assignments', _removed;
END \$\$;
"
}

rollback_1_1() {
  # "Sr Manager" did not exist before S2. Delete it.
  # FK is ON DELETE CASCADE, so any remaining user_roles referencing it are auto-removed.
  run_sql "Rollback 1.1 — Delete Sr Manager role (CASCADE removes assignments)" "
-- FK on user_roles.role_id is ON DELETE CASCADE.
-- This auto-removes any Sr Manager assignments not already cleaned up by Rollback 1.3.
DELETE FROM roles WHERE name = 'Sr Manager';
"
}

# ─────────────────────────────────────────────────────────────
# NUCLEAR ROLLBACK (single transaction)
# ─────────────────────────────────────────────────────────────

nuclear_rollback() {
  run_sql "NUCLEAR ROLLBACK — all S2 Phase 1 changes in one transaction" "
BEGIN;

-- 1.6/1.5: Kevin and Sofia staff entries were no-ops (already sr_manager). Confirm state.
UPDATE staff SET role = 'sr_manager', active = TRUE
WHERE email IN ('kevin@patriotsrvservices.com', 'sofia@patriotsrvservices.com');

-- 1.4: Remove the 3 Manager assignments S2 added (keep pre-existing 4)
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'Manager')
  AND user_id IN (
    SELECT id FROM users WHERE email IN (
        'jason@patriotsrvservices.com',
        'solar@patriotsrvservices.com',
        'bobby@patriotsrvservices.com'
    )
  );

-- 1.2: Remove Admin for Roland and Lynn
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'Admin')
  AND user_id IN (
    SELECT id FROM users WHERE email IN (
        'roland@patriotsrvservices.com',
        'lynn@patriotsrvservices.com'
    )
  );

-- 1.1 + 1.3: Delete Sr Manager role (CASCADE auto-removes ryan/kevin/sofia assignments)
DELETE FROM roles WHERE name = 'Sr Manager';

COMMIT;
"
}

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   PRVS Dashboard — S2 Phase 1 Rollback                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}*** DRY RUN MODE — no SQL will be executed ***${NC}"
fi

case "$MODE" in
  verify)
    echo -e "\n${GREEN}Verifying current database state...${NC}"
    verify_state "Current"
    ;;

  step)
    case "$TARGET_STEP" in
      1.1) rollback_1_1 ;;
      1.2) rollback_1_2 ;;
      1.3) rollback_1_3 ;;
      1.4) rollback_1_4 ;;
      1.5) rollback_1_5 ;;
      1.6) rollback_1_6 ;;
      *)
        echo -e "${RED}Unknown step: $TARGET_STEP${NC}"
        echo "Valid steps: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6"
        exit 1
        ;;
    esac
    echo ""
    echo -e "${GREEN}Verifying state after rollback...${NC}"
    verify_state "Post-rollback"
    ;;

  nuclear)
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║   WARNING: This will revert ALL S2 database changes     ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    if [ "$DRY_RUN" = false ] && [ -n "${SUPABASE_DB_URL:-}" ]; then
      read -p "Type 'ROLLBACK' to confirm: " confirm
      if [ "$confirm" != "ROLLBACK" ]; then
        echo -e "${YELLOW}Aborted.${NC}"
        exit 0
      fi
    fi
    nuclear_rollback
    echo ""
    echo -e "${GREEN}Verifying state after nuclear rollback...${NC}"
    verify_state "Post-rollback"
    ;;

  full)
    echo ""
    echo -e "${YELLOW}Running full rollback in reverse order (1.6 → 1.1)...${NC}"
    echo ""

    rollback_1_6
    rollback_1_5
    rollback_1_4
    rollback_1_3
    rollback_1_2
    rollback_1_1

    echo ""
    echo -e "${GREEN}Verifying state after full rollback...${NC}"
    verify_state "Post-rollback"
    ;;
esac

echo ""
echo -e "${CYAN}━━━ Expected pre-S2 state ━━━${NC}"
echo "  user_roles (7 rows):"
echo "    andrew@/Manager, brandon@/Manager, mauricio@/Manager, ryan@/Manager"
echo "    ryan@/Solar, solar@/Solar, tipton@/Solar"
echo "  roles (6): Admin, Insurance Manager, Manager, Parts Manager, Solar, Technician"
echo "  Roland/Lynn: NO user_roles entries (access via hardcoded ADMIN_EMAILS fallback)"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run complete. No changes were made.${NC}"
else
  echo -e "${GREEN}Rollback complete. Verify access in the browser.${NC}"
fi
