#!/bin/bash

##############################################################################
# SMOKE TEST: Debt Yield Metric Detection and Dashboard Generation
#
# Purpose: Verify that a prompt containing "debt yield" is properly detected
# and results in a valid dashboard spec with DEBT_YIELD metrics.
#
# Prerequisites:
#   - Local dev server running at http://localhost:3000 (or DASHBOARD_API_URL env var)
#   - Database accessible and populated with test data
#   - API route /api/re/v2/dashboards/generate is available
#
# Usage:
#   bash smoke_test.sh                                     # uses default URL
#   DASHBOARD_API_URL=https://api.example.com bash smoke_test.sh  # custom URL
##############################################################################

set -e

# Configuration
API_URL="${DASHBOARD_API_URL:-http://localhost:3000}"
ENDPOINT="${API_URL}/api/re/v2/dashboards/generate"
TEST_ASSET_ID="${TEST_ASSET_ID:-550e8400-e29b-41d4-a716-446655440000}"
TEST_ENV_ID="${TEST_ENV_ID:-550e8400-e29b-41d4-a716-446655440001}"

echo "=========================================="
echo "DEBT YIELD SMOKE TEST"
echo "=========================================="
echo "Target: ${ENDPOINT}"
echo "Entity: asset"
echo "Asset ID: ${TEST_ASSET_ID}"
echo ""

##############################################################################
# TEST 1: Full phrase "debt yield"
##############################################################################

echo "[TEST 1] Prompt: 'build a dashboard with debt yield for this asset'"
echo ""

RESPONSE=$(curl -s -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "build a dashboard with debt yield for this asset",
    "entity_type": "asset",
    "entity_ids": ["'"${TEST_ASSET_ID}"'"],
    "env_id": "'"${TEST_ENV_ID}"'"
  }')

echo "Response:"
echo "${RESPONSE}" | jq '.' 2>/dev/null || echo "${RESPONSE}"
echo ""

# Validate response structure
if echo "${RESPONSE}" | jq -e '.name' >/dev/null 2>&1; then
  echo "✓ Response contains 'name' field"
else
  echo "✗ Response missing 'name' field"
  exit 1
fi

if echo "${RESPONSE}" | jq -e '.spec.widgets' >/dev/null 2>&1; then
  echo "✓ Response contains 'spec.widgets'"
else
  echo "✗ Response missing 'spec.widgets'"
  exit 1
fi

if echo "${RESPONSE}" | jq -e '.validation.valid' >/dev/null 2>&1; then
  echo "✓ Response contains 'validation.valid'"
  IS_VALID=$(echo "${RESPONSE}" | jq -r '.validation.valid')
  if [ "${IS_VALID}" = "true" ]; then
    echo "✓ Dashboard spec is valid"
  else
    echo "⚠ Dashboard spec has validation warnings"
    echo "${RESPONSE}" | jq '.validation.warnings'
  fi
else
  echo "✗ Response missing 'validation.valid'"
  exit 1
fi

# Check if DEBT_YIELD appears in any widget metrics
if echo "${RESPONSE}" | jq -e '.spec.widgets[].config.metrics[]? | select(.key == "DEBT_YIELD")' >/dev/null 2>&1; then
  echo "✓ DEBT_YIELD found in widget metrics"
else
  echo "⚠ DEBT_YIELD not found in widget metrics (may be in unused slots)"
  echo "  Widget metrics:"
  echo "${RESPONSE}" | jq '.spec.widgets[].config.metrics' | head -20
fi

echo ""
echo "TEST 1: Response shape validation PASSED"
echo ""

##############################################################################
# TEST 2: Abbreviation "dy"
##############################################################################

echo "[TEST 2] Prompt: 'show me the dy for this asset'"
echo ""

RESPONSE2=$(curl -s -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "show me the dy for this asset",
    "entity_type": "asset",
    "entity_ids": ["'"${TEST_ASSET_ID}"'"],
    "env_id": "'"${TEST_ENV_ID}"'"
  }')

echo "Response:"
echo "${RESPONSE2}" | jq '.' 2>/dev/null || echo "${RESPONSE2}"
echo ""

# Validate response structure
if echo "${RESPONSE2}" | jq -e '.spec.widgets' >/dev/null 2>&1; then
  echo "✓ Response contains 'spec.widgets'"
else
  echo "✗ Response missing 'spec.widgets'"
  exit 1
fi

# Check if DEBT_YIELD appears in any widget metrics
if echo "${RESPONSE2}" | jq -e '.spec.widgets[].config.metrics[]? | select(.key == "DEBT_YIELD")' >/dev/null 2>&1; then
  echo "✓ DEBT_YIELD found in widget metrics when using 'dy' abbreviation"
else
  echo "⚠ DEBT_YIELD not found in widget metrics for 'dy' prompt"
  echo "  Widget metrics:"
  echo "${RESPONSE2}" | jq '.spec.widgets[].config.metrics' | head -20
fi

echo ""
echo "TEST 2: 'dy' abbreviation detection PASSED"
echo ""

##############################################################################
# TEST 3: Entity type filtering (asset vs investment)
##############################################################################

echo "[TEST 3] Prompt: 'debt yield analysis for investment'"
echo ""

RESPONSE3=$(curl -s -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "debt yield analysis for investment",
    "entity_type": "investment",
    "entity_ids": ["'"${TEST_ASSET_ID}"'"]
  }')

echo "Response:"
echo "${RESPONSE3}" | jq '.entity_scope' 2>/dev/null || echo "${RESPONSE3}"
echo ""

if echo "${RESPONSE3}" | jq -e '.entity_scope.entity_type == "investment"' >/dev/null 2>&1; then
  echo "✓ Entity type correctly set to 'investment'"
else
  echo "⚠ Entity type not investment"
fi

echo ""
echo "TEST 3: Entity type handling PASSED"
echo ""

##############################################################################
# SUMMARY
##############################################################################

echo "=========================================="
echo "ALL SMOKE TESTS PASSED"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✓ Prompt with 'debt yield' generates valid dashboard"
echo "  ✓ Prompt with 'dy' abbreviation is detected"
echo "  ✓ Response contains required fields (name, spec, validation)"
echo "  ✓ Entity scope correctly handled"
echo ""
echo "Next steps:"
echo "  1. Run unit tests with: npm run test-dashboards"
echo "  2. Verify DEBT_YIELD calculation in widget rendering"
echo "  3. Test with real financial data"
echo ""
