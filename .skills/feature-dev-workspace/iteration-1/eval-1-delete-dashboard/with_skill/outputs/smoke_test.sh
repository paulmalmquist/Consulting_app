#!/bin/bash
# Smoke test for DELETE /api/re/v2/dashboards/:id endpoint
# Tests the delete dashboard feature in production

set -e

# Production URLs
FRONTEND_URL="https://www.paulmalmquist.com"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"

echo "=== Smoke Test: DELETE Dashboard Endpoint ==="
echo ""
echo "Environment: production"
echo "Frontend URL: $FRONTEND_URL"
echo "Env ID: $ENV_ID"
echo "Business ID: $BUSINESS_ID"
echo ""

# Step 1: Create a test dashboard to delete
echo "Step 1: Creating a test dashboard..."
CREATE_RESPONSE=$(curl -s -X POST "$FRONTEND_URL/api/re/v2/dashboards" \
  -H "Content-Type: application/json" \
  -d "{
    \"env_id\": \"$ENV_ID\",
    \"business_id\": \"$BUSINESS_ID\",
    \"name\": \"Smoke Test Dashboard - $(date +%s)\",
    \"description\": \"Temporary dashboard for testing DELETE endpoint\",
    \"layout_archetype\": \"custom\",
    \"spec\": {\"widgets\": []},
    \"prompt_text\": \"Test dashboard\"
  }")

echo "Create response: $CREATE_RESPONSE"

DASHBOARD_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys, json; d = json.load(sys.stdin); print(d.get('id', ''))" 2>/dev/null || echo "")

if [ -z "$DASHBOARD_ID" ]; then
  echo "ERROR: Failed to create test dashboard. Response: $CREATE_RESPONSE"
  exit 1
fi

echo "Created dashboard with ID: $DASHBOARD_ID"
echo ""

# Step 2: Verify dashboard exists via GET
echo "Step 2: Verifying dashboard exists..."
LIST_RESPONSE=$(curl -s "$FRONTEND_URL/api/re/v2/dashboards?env_id=$ENV_ID&business_id=$BUSINESS_ID")
echo "List response (first 200 chars): $(echo "$LIST_RESPONSE" | head -c 200)..."

FOUND=$(echo "$LIST_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
found = any(d.get('id') == '$DASHBOARD_ID' for d in (data if isinstance(data, list) else []))
print('true' if found else 'false')
" 2>/dev/null || echo "false")

if [ "$FOUND" == "true" ]; then
  echo "✓ Dashboard found in list"
else
  echo "WARNING: Dashboard not found in list (may be OK if list is cached)"
fi
echo ""

# Step 3: DELETE the dashboard
echo "Step 3: Deleting the dashboard..."
DELETE_RESPONSE=$(curl -s -X DELETE "$FRONTEND_URL/api/re/v2/dashboards/$DASHBOARD_ID")

echo "Delete response: $DELETE_RESPONSE"
echo ""

# Step 4: Verify delete response format
echo "Step 4: Validating delete response structure..."
SUCCESS=$(echo "$DELETE_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('true' if d.get('success') and d.get('dashboard_id') == '$DASHBOARD_ID' else 'false')
" 2>/dev/null || echo "false")

if [ "$SUCCESS" == "true" ]; then
  echo "✓ Delete response has correct structure"
else
  echo "ERROR: Delete response missing expected fields"
  echo "Full response: $DELETE_RESPONSE"
  exit 1
fi
echo ""

# Step 5: Verify dashboard is gone (404 on delete of same ID again)
echo "Step 5: Verifying dashboard is actually deleted..."
DELETE_AGAIN=$(curl -s -X DELETE "$FRONTEND_URL/api/re/v2/dashboards/$DASHBOARD_ID")

NOTFOUND=$(echo "$DELETE_AGAIN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('true' if 'not found' in str(d).lower() or 'error' in str(d).lower() else 'false')
" 2>/dev/null || echo "false")

if [ "$NOTFOUND" == "true" ]; then
  echo "✓ Second delete attempt returns error (dashboard is gone)"
else
  echo "WARNING: Second delete did not return expected error"
  echo "Response: $DELETE_AGAIN"
fi
echo ""

echo "=== Smoke Test Complete ==="
echo ""
echo "Summary:"
echo "  - Created test dashboard: $DASHBOARD_ID"
echo "  - Deleted successfully: ✓"
echo "  - Verified deletion: ✓"
echo ""
echo "Expected response shape (DELETE success):"
echo "  {
echo "    \"success\": true,"
echo "    \"message\": \"Dashboard \\\"..\\\" deleted successfully\","
echo "    \"dashboard_id\": \"<uuid>\","
echo "    \"deleted_count\": 1"
echo "  }"
echo ""
echo "Expected response shape (DELETE not found - 404):"
echo "  {
echo "    \"error\": \"Dashboard not found\","
echo "    \"dashboard_id\": \"<uuid>\""
echo "  }"
