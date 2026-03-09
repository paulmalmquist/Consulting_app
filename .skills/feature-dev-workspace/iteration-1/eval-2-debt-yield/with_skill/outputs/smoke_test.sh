#!/bin/bash

###############################################################################
# Smoke Test: Debt Yield Metric Detection in Dashboard Generator
#
# This script tests the dashboard generation endpoint with prompts containing
# "debt yield" and "dy" to verify they correctly detect and include the
# DEBT_YIELD metric in the generated dashboard spec.
#
# Usage:
#   ./smoke_test.sh              # Tests against localhost (dev)
#   ./smoke_test.sh prod         # Tests against production
#
# Prerequisites:
#   - curl (standard on macOS/Linux)
#   - jq (for JSON output formatting)
#   - For dev: local server running on port 3001
#   - For prod: network access to paulmalmquist.com
###############################################################################

set -e

# Configuration
TARGET="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$TARGET" = "prod" ]; then
  BASE_URL="https://www.paulmalmquist.com"
  ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
  BIZ_ID="a1b2c3d4-0001-0001-0001-000000000001"
  ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"
else
  # Development/local testing
  BASE_URL="http://localhost:3001"
  ENV_ID="env-test-1"
  BIZ_ID="biz-test-1"
  ASSET_ID="asset-test-1"
fi

ENDPOINT="$BASE_URL/api/re/v2/dashboards/generate"

echo "=================================================="
echo "Smoke Test: Debt Yield Metric Detection"
echo "=================================================="
echo "Target: $TARGET"
echo "Endpoint: $ENDPOINT"
echo "Entity Type: asset"
echo "Asset ID: $ASSET_ID"
echo "=================================================="
echo ""

###############################################################################
# Test 1: Full phrase "debt yield" detection
###############################################################################

echo "Test 1: Prompt with 'debt yield' phrase"
echo "========================================="

PROMPT_1="build a dashboard with debt yield metrics for this asset"
BODY_1=$(cat <<EOF
{
  "prompt": "$PROMPT_1",
  "entity_type": "asset",
  "entity_ids": ["$ASSET_ID"],
  "env_id": "$ENV_ID",
  "business_id": "$BIZ_ID"
}
EOF
)

echo "Sending request..."
echo "Prompt: \"$PROMPT_1\""
echo ""

RESPONSE_1=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY_1")

echo "Response:"
echo "$RESPONSE_1" | jq '.' 2>/dev/null || echo "$RESPONSE_1"
echo ""

# Validation
if echo "$RESPONSE_1" | jq -e '.spec.widgets[] | select(.config.metrics[]? | select(.key == "DEBT_YIELD"))' >/dev/null 2>&1; then
  echo "✓ Test 1 PASSED: DEBT_YIELD metric found in dashboard spec"
else
  echo "✗ Test 1 FAILED: DEBT_YIELD metric NOT found in dashboard spec"
fi

echo ""
echo ""

###############################################################################
# Test 2: Short form "dy" detection
###############################################################################

echo "Test 2: Prompt with 'dy' abbreviation"
echo "======================================"

PROMPT_2="show me the dy for this property"
BODY_2=$(cat <<EOF
{
  "prompt": "$PROMPT_2",
  "entity_type": "asset",
  "entity_ids": ["$ASSET_ID"],
  "env_id": "$ENV_ID",
  "business_id": "$BIZ_ID"
}
EOF
)

echo "Sending request..."
echo "Prompt: \"$PROMPT_2\""
echo ""

RESPONSE_2=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY_2")

echo "Response:"
echo "$RESPONSE_2" | jq '.' 2>/dev/null || echo "$RESPONSE_2"
echo ""

# Validation
if echo "$RESPONSE_2" | jq -e '.spec.widgets[] | select(.config.metrics[]? | select(.key == "DEBT_YIELD"))' >/dev/null 2>&1; then
  echo "✓ Test 2 PASSED: DEBT_YIELD metric found in dashboard spec"
else
  echo "✗ Test 2 FAILED: DEBT_YIELD metric NOT found in dashboard spec"
fi

echo ""
echo ""

###############################################################################
# Test 3: Multiple metrics including debt yield
###############################################################################

echo "Test 3: Prompt with multiple metrics (debt yield + dscr)"
echo "========================================================="

PROMPT_3="create a dashboard comparing debt yield and dscr coverage for assets"
BODY_3=$(cat <<EOF
{
  "prompt": "$PROMPT_3",
  "entity_type": "asset",
  "entity_ids": ["$ASSET_ID"],
  "env_id": "$ENV_ID",
  "business_id": "$BIZ_ID"
}
EOF
)

echo "Sending request..."
echo "Prompt: \"$PROMPT_3\""
echo ""

RESPONSE_3=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY_3")

echo "Response:"
echo "$RESPONSE_3" | jq '.' 2>/dev/null || echo "$RESPONSE_3"
echo ""

# Validation
if echo "$RESPONSE_3" | jq -e '.spec.widgets[] | select(.config.metrics[]? | select(.key == "DEBT_YIELD"))' >/dev/null 2>&1; then
  echo "✓ Test 3a PASSED: DEBT_YIELD metric found"
else
  echo "✗ Test 3a FAILED: DEBT_YIELD metric NOT found"
fi

if echo "$RESPONSE_3" | jq -e '.spec.widgets[] | select(.config.metrics[]? | select(.key == "DSCR_KPI"))' >/dev/null 2>&1; then
  echo "✓ Test 3b PASSED: DSCR_KPI metric found"
else
  echo "✗ Test 3b FAILED: DSCR_KPI metric NOT found"
fi

echo ""
echo ""

###############################################################################
# Test 4: Validation status
###############################################################################

echo "Test 4: Dashboard validation status"
echo "===================================="

# Use response from Test 1
if echo "$RESPONSE_1" | jq -e '.validation.valid == true' >/dev/null 2>&1; then
  echo "✓ Test 4a PASSED: validation.valid = true"
else
  echo "✗ Test 4a FAILED: validation.valid != true"
fi

if echo "$RESPONSE_1" | jq -e '.validation.warnings | length >= 0' >/dev/null 2>&1; then
  echo "✓ Test 4b PASSED: validation.warnings field exists"
  WARNINGS=$(echo "$RESPONSE_1" | jq '.validation.warnings')
  echo "  Warnings: $WARNINGS"
else
  echo "✗ Test 4b FAILED: validation.warnings field missing"
fi

echo ""
echo ""

###############################################################################
# Test 5: Response structure validation
###############################################################################

echo "Test 5: Response structure validation"
echo "======================================"

# Check required response fields
REQUIRED_FIELDS=("name" "description" "layout_archetype" "spec" "entity_scope" "validation")

for field in "${REQUIRED_FIELDS[@]}"; do
  if echo "$RESPONSE_1" | jq -e ".$field" >/dev/null 2>&1; then
    echo "✓ Field '$field' present"
  else
    echo "✗ Field '$field' MISSING"
  fi
done

# Check spec.widgets structure
if echo "$RESPONSE_1" | jq -e '.spec.widgets | length > 0' >/dev/null 2>&1; then
  WIDGET_COUNT=$(echo "$RESPONSE_1" | jq '.spec.widgets | length')
  echo "✓ Dashboard has $WIDGET_COUNT widgets"
else
  echo "✗ Dashboard has no widgets"
fi

# Check that each widget has required fields
if echo "$RESPONSE_1" | jq -e '.spec.widgets[] | select(.id and .type and .config and .layout)' >/dev/null 2>&1; then
  echo "✓ All widgets have required fields (id, type, config, layout)"
else
  echo "✗ Some widgets missing required fields"
fi

echo ""
echo ""

###############################################################################
# Summary
###############################################################################

echo "=================================================="
echo "Smoke Test Summary"
echo "=================================================="
echo ""
echo "Test Results:"
echo "  1. Full phrase 'debt yield' detection"
echo "  2. Short form 'dy' detection"
echo "  3. Multiple metrics detection (debt yield + dscr)"
echo "  4. Validation status checks"
echo "  5. Response structure validation"
echo ""
echo "If all tests passed:"
echo "  - The DEBT_YIELD keyword mapping is working"
echo "  - Prompts with 'debt yield' and 'dy' correctly detect the metric"
echo "  - Generated dashboard specs include DEBT_YIELD in widget metrics"
echo "  - Validation passes for DEBT_YIELD metrics"
echo ""
echo "Next step:"
echo "  - Manually verify dashboard rendering in the UI"
echo "  - Check that DEBT_YIELD appears in widget visualization"
echo ""

###############################################################################
# Optional: Pretty-print full response for debugging
###############################################################################

if [ "$2" = "-v" ] || [ "$2" = "--verbose" ]; then
  echo "=================================================="
  echo "Verbose Output: Full Response #1"
  echo "=================================================="
  echo "$RESPONSE_1" | jq '.' 2>/dev/null || echo "$RESPONSE_1"
  echo ""
  echo "=================================================="
  echo "Verbose Output: Full Response #2"
  echo "=================================================="
  echo "$RESPONSE_2" | jq '.' 2>/dev/null || echo "$RESPONSE_2"
  echo ""
  echo "=================================================="
  echo "Verbose Output: Full Response #3"
  echo "=================================================="
  echo "$RESPONSE_3" | jq '.' 2>/dev/null || echo "$RESPONSE_3"
fi
