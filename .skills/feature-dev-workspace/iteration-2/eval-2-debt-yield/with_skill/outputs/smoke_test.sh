#!/bin/bash

##############################################################################
# Smoke Test: Debt Yield Metric Detection
#
# Tests that the dashboard generator correctly detects and includes the
# DEBT_YIELD metric when users mention "debt yield" or "dy" in prompts.
#
# Prerequisites:
# - Backend running on port 8000
# - Frontend running on port 3001
# - Production database seeded with test data
#
# Run from repo-b root:
#   bash .skills/feature-dev-workspace/iteration-2/eval-2-debt-yield/with_skill/outputs/smoke_test.sh
##############################################################################

set -e

BACKEND_URL="${BACKEND_URL:-https://authentic-sparkle-production-7f37.up.railway.app}"
FRONTEND_URL="${FRONTEND_URL:-https://www.paulmalmquist.com}"

# Production test IDs from CLAUDE.md
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"

echo "======================================================================"
echo "Smoke Test: Debt Yield Metric Detection"
echo "======================================================================"
echo "Backend URL: $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"
echo "Business ID: $BUSINESS_ID"
echo "ENV ID: $ENV_ID"
echo "Asset ID: $ASSET_ID"
echo ""

##############################################################################
# TEST 1: Dashboard generation with "debt yield" prompt
##############################################################################
echo "[TEST 1] Generate dashboard with 'debt yield' prompt"
echo "Request: POST /api/re/v2/dashboards/generate"
echo "Payload:"
cat <<EOF
{
  "prompt": "Show me debt yield analysis for the asset",
  "entity_type": "asset",
  "entity_ids": ["$ASSET_ID"],
  "env_id": "$ENV_ID",
  "business_id": "$BUSINESS_ID"
}
EOF
echo ""

RESPONSE=$(curl -s -X POST "$FRONTEND_URL/api/re/v2/dashboards/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Show me debt yield analysis for the asset\",
    \"entity_type\": \"asset\",
    \"entity_ids\": [\"$ASSET_ID\"],
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }")

echo "Response:"
echo "$RESPONSE" | jq .

# Check if DEBT_YIELD is in the response
if echo "$RESPONSE" | jq '.spec.widgets[].config.metrics[]?.key' | grep -q "DEBT_YIELD"; then
  echo "✓ DEBT_YIELD detected in dashboard spec"
else
  echo "✗ DEBT_YIELD NOT detected in dashboard spec"
  echo "Metrics found:"
  echo "$RESPONSE" | jq '.spec.widgets[].config.metrics[]?.key'
fi
echo ""

##############################################################################
# TEST 2: Dashboard generation with "dy" abbreviation prompt
##############################################################################
echo "[TEST 2] Generate dashboard with 'dy' abbreviation prompt"
echo "Request: POST /api/re/v2/dashboards/generate"
echo "Payload:"
cat <<EOF
{
  "prompt": "What's the DY for this property?",
  "entity_type": "asset",
  "entity_ids": ["$ASSET_ID"],
  "env_id": "$ENV_ID",
  "business_id": "$BUSINESS_ID"
}
EOF
echo ""

RESPONSE=$(curl -s -X POST "$FRONTEND_URL/api/re/v2/dashboards/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"What's the DY for this property?\",
    \"entity_type\": \"asset\",
    \"entity_ids\": [\"$ASSET_ID\"],
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\"
  }")

echo "Response:"
echo "$RESPONSE" | jq .

# Check if DEBT_YIELD is in the response
if echo "$RESPONSE" | jq '.spec.widgets[].config.metrics[]?.key' | grep -q "DEBT_YIELD"; then
  echo "✓ DEBT_YIELD detected in dashboard spec"
else
  echo "✗ DEBT_YIELD NOT detected in dashboard spec"
  echo "Metrics found:"
  echo "$RESPONSE" | jq '.spec.widgets[].config.metrics[]?.key'
fi
echo ""

##############################################################################
# TEST 3: Verify metric catalog contains DEBT_YIELD
##############################################################################
echo "[TEST 3] Verify DEBT_YIELD exists in metric catalog"

# This would require exposing the metric catalog via API or reading the source
# For now, we'll just verify the file exists and contains the metric
METRIC_FILE="/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/lib/dashboards/metric-catalog.ts"

if grep -q "DEBT_YIELD" "$METRIC_FILE"; then
  echo "✓ DEBT_YIELD found in metric-catalog.ts"
  grep "DEBT_YIELD" "$METRIC_FILE"
else
  echo "✗ DEBT_YIELD NOT found in metric-catalog.ts"
fi
echo ""

##############################################################################
# TEST 4: Verify keyword mapping is in place
##############################################################################
echo "[TEST 4] Verify debt yield keyword mapping in generate route"

ROUTE_FILE="/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.ts"

# Check for "debt yield" keyword
if grep -q '"debt yield"' "$ROUTE_FILE"; then
  echo "✓ 'debt yield' keyword mapping found in generate route"
else
  echo "✗ 'debt yield' keyword mapping NOT found in generate route"
fi

# Check for "dy" abbreviation
if grep -q '\bdy\b.*DEBT_YIELD' "$ROUTE_FILE"; then
  echo "✓ 'dy' abbreviation mapping found in generate route"
else
  echo "✗ 'dy' abbreviation mapping NOT found in generate route"
fi
echo ""

##############################################################################
# Summary
##############################################################################
echo "======================================================================"
echo "Smoke Test Complete"
echo "======================================================================"
echo ""
echo "Expected Behavior:"
echo "  1. Dashboard generation succeeds (status 200)"
echo "  2. DEBT_YIELD metric is detected in widget configurations"
echo "  3. Metric catalog contains DEBT_YIELD with correct metadata"
echo "  4. Keyword mappings enable detection of 'debt yield' and 'dy'"
echo ""
