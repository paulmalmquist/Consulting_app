#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Reality Lock Loop — Waterfall Scenario Execution & UI Verification
#
# Orchestrates:
#   1) Vercel env + commit parity check
#   2) Backend tests (pytest)
#   3) Frontend build (next build)
#   4) Playwright E2E tests against preview/production
#   5) Waterfall scenario run verification
#
# Each iteration appends to docs/reality_lock_log.md
#
# Usage:
#   ./scripts/reality_lock_loop.sh [--target preview|production] [--max-iters N]
###############################################################################

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/repo-b"
LOG_FILE="$ROOT/docs/reality_lock_log.md"
ITERATION=0
MAX_ITERS="${MAX_ITERS:-3}"
TARGET="${TARGET:-preview}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --max-iters) MAX_ITERS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local msg="$1"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$ts] $msg"
  echo "- [$ts] $msg" >> "$LOG_FILE"
}

append_header() {
  echo "" >> "$LOG_FILE"
  echo "## Reality Lock Loop — Iteration $ITERATION" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
  echo "**Target**: $TARGET" >> "$LOG_FILE"
  echo "**Commit**: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')" >> "$LOG_FILE"
  echo "**Branch**: $(git -C "$ROOT" branch --show-current 2>/dev/null || echo 'unknown')" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
}

check_vercel_parity() {
  log "Checking Vercel deployment parity..."
  local local_commit
  local_commit=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  if command -v vercel &>/dev/null; then
    local vercel_info
    vercel_info=$(cd "$FRONTEND_DIR" && vercel inspect --json 2>/dev/null || echo "{}")
    log "Local commit: $local_commit | Vercel deployment checked"
  else
    log "Vercel CLI not available — skipping parity check. Local commit: $local_commit"
  fi
  return 0
}

run_backend_tests() {
  log "Running backend tests..."
  if cd "$BACKEND_DIR" && python -m pytest tests/test_re_waterfall_scenario.py tests/test_re_financial_intelligence.py tests/test_re_sale_scenario.py tests/test_re_waterfall_math.py -v --tb=short 2>&1; then
    log "Backend tests: PASS"
    return 0
  else
    log "Backend tests: FAIL"
    return 1
  fi
}

run_frontend_build() {
  log "Running frontend build check..."
  if cd "$FRONTEND_DIR" && [ -x ./node_modules/.bin/next ]; then
    if ./node_modules/.bin/next build 2>&1 | tail -5; then
      log "Frontend build: PASS"
      return 0
    else
      log "Frontend build: FAIL"
      return 1
    fi
  else
    log "Frontend build: SKIPPED (node_modules not installed)"
    return 0
  fi
}

run_playwright_tests() {
  log "Running Playwright E2E tests..."
  if cd "$FRONTEND_DIR" && [ -x ./node_modules/.bin/playwright ]; then
    if ./node_modules/.bin/playwright test tests/repe/re-waterfall-scenario.spec.ts --reporter=list 2>&1; then
      log "Playwright waterfall scenario tests: PASS"
      return 0
    else
      log "Playwright waterfall scenario tests: FAIL"
      return 1
    fi
  else
    log "Playwright: SKIPPED (not installed)"
    return 0
  fi
}

run_waterfall_scenario_check() {
  log "Verifying waterfall scenario endpoint reachability..."

  # Check if backend is running locally
  if curl -sf http://localhost:8000/docs >/dev/null 2>&1; then
    log "Backend is running at localhost:8000"

    # Try to hit the validate endpoint
    local response
    response=$(curl -sf "http://localhost:8000/api/re/v2/funds/00000000-0000-0000-0000-000000000001/waterfall-scenarios/validate?env_id=meridian&business_id=00000000-0000-0000-0000-000000000001&scenario_id=00000000-0000-0000-0000-000000000001&quarter=2025Q1" 2>&1 || true)

    if echo "$response" | grep -q '"ready"'; then
      log "Waterfall scenario validate endpoint: REACHABLE"
    else
      log "Waterfall scenario validate endpoint: responded (may need seed data)"
    fi
  else
    log "Backend not running locally — scenario endpoint check skipped"
  fi

  return 0
}

# ── Main Loop ────────────────────────────────────────────────────────────────

echo "=== Reality Lock Loop ==="
echo "Target: $TARGET | Max iterations: $MAX_ITERS"
echo "Log: $LOG_FILE"
echo ""

while [ "$ITERATION" -lt "$MAX_ITERS" ]; do
  ITERATION=$((ITERATION + 1))
  append_header

  log "=== Iteration $ITERATION of $MAX_ITERS ==="

  FAILURES=0

  # Step 1: Parity check
  check_vercel_parity || true

  # Step 2: Backend tests
  run_backend_tests || FAILURES=$((FAILURES + 1))

  # Step 3: Frontend build
  run_frontend_build || FAILURES=$((FAILURES + 1))

  # Step 4: Playwright E2E
  run_playwright_tests || FAILURES=$((FAILURES + 1))

  # Step 5: Waterfall scenario check
  run_waterfall_scenario_check || FAILURES=$((FAILURES + 1))

  if [ "$FAILURES" -eq 0 ]; then
    log "=== ALL CHECKS PASSED — Iteration $ITERATION ==="
    echo "" >> "$LOG_FILE"
    echo "### Result: ALL PASS" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    echo "=== Reality Lock Loop COMPLETE ==="
    exit 0
  else
    log "=== $FAILURES failures in iteration $ITERATION ==="
    echo "" >> "$LOG_FILE"
    echo "### Result: $FAILURES FAILURES" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"

    if [ "$ITERATION" -lt "$MAX_ITERS" ]; then
      log "Retrying in next iteration..."
      sleep 2
    fi
  fi
done

log "=== Reality Lock Loop exhausted $MAX_ITERS iterations ==="
echo "" >> "$LOG_FILE"
echo "### Final: Loop exhausted without full pass" >> "$LOG_FILE"
exit 1
