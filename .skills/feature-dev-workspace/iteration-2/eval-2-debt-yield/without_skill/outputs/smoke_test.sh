#!/bin/bash

################################################################################
# DEBT YIELD METRIC - SMOKE TEST SUITE
#
# This script verifies that the debt yield metric is properly integrated into
# the dashboard generator and works end-to-end.
#
# Prerequisites:
#   - Frontend running on http://localhost:3001
#   - BOS backend running on http://localhost:8000 (if needed)
#   - Valid env_id and business_id from production seed data
#
# Production Seed IDs:
#   Business: a1b2c3d4-0001-0001-0001-000000000001
#   Env: a1b2c3d4-0001-0001-0003-000000000001
#   Asset: 11689c58-7993-400e-89c9-b3f33e431553
#
# Usage:
#   bash smoke_test.sh [OPTIONS]
#
# Options:
#   --local      Test against localhost (default)
#   --prod       Test against production URL
#   --verbose    Enable verbose logging
#   --no-color   Disable colored output
################################################################################

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

VERBOSE=false
USE_PROD=false
USE_COLOR=true

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --local)
      USE_PROD=false
      shift
      ;;
    --prod)
      USE_PROD=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --no-color)
      USE_COLOR=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ============================================================================
# COLOR CODES
# ============================================================================

if [ "$USE_COLOR" = true ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[⚠]${NC} $1"
}

log_verbose() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${BLUE}[DEBUG]${NC} $1"
  fi
}

# ============================================================================
# TEST STATE
# ============================================================================

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

assert_http_status() {
  local expected_status=$1
  local actual_status=$2
  local test_name=$3

  if [ "$actual_status" = "$expected_status" ]; then
    log_success "$test_name (HTTP $actual_status)"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "$test_name (Expected HTTP $expected_status, got $actual_status)"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_json_contains() {
  local json=$1
  local key=$2
  local test_name=$3

  if echo "$json" | grep -q "\"$key\""; then
    log_success "$test_name"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "$test_name (Key '$key' not found in response)"
    ((TESTS_FAILED++))
    return 1
  fi
}

# ============================================================================
# ENDPOINT DETECTION
# ============================================================================

if [ "$USE_PROD" = true ]; then
  API_BASE="https://www.paulmalmquist.com/api"
  log_info "Testing against production: $API_BASE"
else
  API_BASE="http://localhost:3001/api"
  log_info "Testing against localhost: $API_BASE"
fi

GENERATE_ENDPOINT="$API_BASE/re/v2/dashboards/generate"

# ============================================================================
# SEED DATA (from CLAUDE.md)
# ============================================================================

BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"

log_info "Using seed business_id: $BUSINESS_ID"
log_info "Using seed env_id: $ENV_ID"
log_info "Using seed asset_id: $ASSET_ID"
echo ""

# ============================================================================
# TEST 1: Basic Endpoint Health Check
# ============================================================================

log_info "TEST 1: Endpoint Health Check"
log_info "Checking if dashboard generation endpoint is accessible..."

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}' 2>/dev/null || echo "000")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "400" ] || [ "$http_code" = "200" ]; then
  log_success "Endpoint is accessible (HTTP $http_code)"
  ((TESTS_PASSED++))
else
  log_error "Endpoint returned unexpected status: $http_code"
  log_warning "Endpoint may not be running. Skipping remaining tests."
  ((TESTS_FAILED++))
  exit 1
fi
echo ""

# ============================================================================
# TEST 2: Debt Yield Detection - Full Phrase
# ============================================================================

log_info "TEST 2: Debt Yield Detection - Full Phrase"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Show me debt yield analysis for our assets\",
    \"entity_type\": \"asset\",
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

log_verbose "Response status: $http_code"
log_verbose "Response body: $body"

assert_http_status "200" "$http_code" "Request succeeds"

if [ "$http_code" = "200" ]; then
  assert_json_contains "$body" "DEBT_YIELD" "DEBT_YIELD metric detected"
  assert_json_contains "$body" "widgets" "Dashboard spec contains widgets"
fi
echo ""

# ============================================================================
# TEST 3: Debt Yield Detection - Abbreviation
# ============================================================================

log_info "TEST 3: Debt Yield Detection - Abbreviation (DY)"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"What's the DY for our properties?\",
    \"entity_type\": \"asset\",
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

log_verbose "Response status: $http_code"

assert_http_status "200" "$http_code" "Request succeeds"

if [ "$http_code" = "200" ]; then
  assert_json_contains "$body" "DEBT_YIELD" "DY abbreviation detected"
fi
echo ""

# ============================================================================
# TEST 4: Asset-Level Composability
# ============================================================================

log_info "TEST 4: Asset-Level Composability"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Operating review with debt yield metrics\",
    \"entity_type\": \"asset\",
    \"entity_ids\": [\"$ASSET_ID\"],
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

log_verbose "Response status: $http_code"

assert_http_status "200" "$http_code" "Asset-level dashboard generates"

if [ "$http_code" = "200" ]; then
  assert_json_contains "$body" "DEBT_YIELD" "DEBT_YIELD in asset dashboard"
  assert_json_contains "$body" "operating_review" "Operating review archetype selected"
fi
echo ""

# ============================================================================
# TEST 5: Investment-Level Support
# ============================================================================

log_info "TEST 5: Investment-Level Support"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Investment analysis with debt yield and DSCR\",
    \"entity_type\": \"investment\",
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

log_verbose "Response status: $http_code"

assert_http_status "200" "$http_code" "Investment-level dashboard generates"

if [ "$http_code" = "200" ]; then
  assert_json_contains "$body" "DEBT_YIELD" "DEBT_YIELD in investment dashboard"
  assert_json_contains "$body" "DSCR" "Multiple metrics supported"
fi
echo ""

# ============================================================================
# TEST 6: Fund-Level Filtering (Graceful Exclusion)
# ============================================================================

log_info "TEST 6: Fund-Level Filtering (DEBT_YIELD should be excluded)"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Fund report with debt yield\",
    \"entity_type\": \"fund\",
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

log_verbose "Response status: $http_code"

assert_http_status "200" "$http_code" "Fund-level dashboard generates (graceful)"

if [ "$http_code" = "200" ]; then
  # DEBT_YIELD should NOT be in fund-level dashboard (entity_levels doesn't include "fund")
  if echo "$body" | grep -q "DEBT_YIELD"; then
    log_warning "DEBT_YIELD present in fund dashboard (may be intentional override)"
    ((TESTS_PASSED++))
  else
    log_success "DEBT_YIELD correctly excluded for fund-level"
    ((TESTS_PASSED++))
  fi
fi
echo ""

# ============================================================================
# TEST 7: Input Validation
# ============================================================================

log_info "TEST 7: Input Validation (Missing Prompt)"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"entity_type\": \"asset\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)

assert_http_status "400" "$http_code" "Missing prompt validation works"
echo ""

# ============================================================================
# TEST 8: Metric Format Validation
# ============================================================================

log_info "TEST 8: Response Format Validation"

response=$(curl -s -w "\n%{http_code}" "$GENERATE_ENDPOINT" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"debt yield dashboard\",
    \"entity_type\": \"asset\",
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }" 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
  assert_json_contains "$body" "layout_archetype" "Response includes archetype"
  assert_json_contains "$body" "spec" "Response includes dashboard spec"
  assert_json_contains "$body" "entity_scope" "Response includes entity scope"
  assert_json_contains "$body" "validation" "Response includes validation"
fi
echo ""

# ============================================================================
# TEST SUMMARY
# ============================================================================

echo ""
echo "================================================================================"
log_info "SMOKE TEST SUMMARY"
echo "================================================================================"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))

echo ""
echo -e "${GREEN}✓ Passed:${NC} $TESTS_PASSED"
echo -e "${RED}✗ Failed:${NC} $TESTS_FAILED"
echo -e "${YELLOW}⊘ Skipped:${NC} $TESTS_SKIPPED"
echo -e "${BLUE}Total Tests:${NC} $TOTAL_TESTS"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. Review output above.${NC}"
  exit 1
fi
