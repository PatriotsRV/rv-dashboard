#!/usr/bin/env bash
# scripts/deploy_fn.sh <function-name> [<function-name> ...]
#
# Deploys PRVS Supabase edge functions WITH THE RIGHT --no-verify-jwt FLAG.
# Why this exists (S198, 2026-10-07): the S194 CORS redeploy of 16 functions ran a plain
# "supabase functions deploy X" for every one of them, which silently RESET verify_jwt to ON for
# process-scheduled-notifications and send-admin-pnl-report. Their pg_cron callers send no
# Authorization header, so every tick got 401 "Missing authorization header" and cron.job_run_details
# still said "succeeded" (net.http_post returns a request id, not the HTTP status). Staff notifications
# (assign / task / unreplied / urgent) were dead for four days and nobody noticed.
#
# RULE: never run "supabase functions deploy" by hand. Run this script. If you add a function that is
# called WITHOUT a JWT (pg_cron via net.http_post with no auth header, an external webhook, a customer
# page using the anon key only), add it to NO_VERIFY_JWT below in the same commit.
#
# Source of truth for the list (verified S198 against cron.job + invoke_* function bodies + headers):
#   - called by pg_cron with NO auth header: process-review-requests, process-scheduled-notifications,
#     send-admin-pnl-report, send-checkin-reminder, send-scheduled-messages, send-task-reminders,
#     send-unreplied-reminder
#   - external webhooks / customer pages: textly-webhook, projectblue-webhook, woosender-intake,
#     review-feedback, auth-send-sms (Supabase Auth hook), descope-sms (Descope connector)
#   - send-quote-email: deployed --no-verify-jwt per the S197 record (kiosk + checkin callers)
# Everything else (send-parts-report, send-manager-report, send-dropoff-report, send-er-report,
# send-er-completion, textly-send, projectblue-send, planner-ai, assistant-router, roof-lookup,
# claude-vision-proxy, sync-ro-calendar, projectblue-reconcile ...) is called with a user JWT or the
# service-role key and keeps the default verify_jwt=ON.
set -euo pipefail
PROJECT_REF="axfejhudchdejoiwaetq"
NO_VERIFY_JWT="auth-send-sms descope-sms process-review-requests process-scheduled-notifications projectblue-webhook review-feedback send-admin-pnl-report send-checkin-reminder send-quote-email send-scheduled-messages send-task-reminders send-unreplied-reminder textly-webhook woosender-intake"
if [ $# -eq 0 ]; then echo "usage: $0 <function-name> [...]"; exit 2; fi
for fn in "$@"; do
  if [ ! -f "supabase/functions/$fn/index.ts" ]; then echo "!! no such function: $fn"; exit 1; fi
  flag=""
  for n in $NO_VERIFY_JWT; do [ "$n" = "$fn" ] && flag="--no-verify-jwt"; done
  echo "== deploy $fn $flag"
  supabase functions deploy "$fn" $flag --project-ref "$PROJECT_REF"
done
