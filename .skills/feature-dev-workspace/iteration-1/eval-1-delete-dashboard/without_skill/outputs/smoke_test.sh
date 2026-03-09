#!/bin/bash

# Smoke test for DELETE /api/re/v2/dashboards/[dashboardId] endpoint
#
# Prerequisites:
# 1. Application is running (e.g., npm run dev or deployed to staging)
# 2. Database contains at least one test dashboard
# 3. Environment variables set: BASE_URL (defaults to http://localhost:3000)
#
# Usage:
#   bash smoke_test.sh                                    # Uses http://localhost:3000
#   BASE_URL=https://staging.example.com bash smoke_test.sh

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PATH="/api/re/v2/dashboards"
TEST_DASHBOARD_NAME="Smoke_Test_Dashboard_$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Dashboard Delete Endpoint Smoke Test"
echo "========================================"
echo "Target: $BASE_URL$API_PATH"
echo ""

# Test 1: Create a test dashboard
echo -e "${YELLOW}[Test 1/5]${NC} Creating test dashboard..."

CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL$API_PATH" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "test-env",
    "business_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "'"$TEST_DASHBOARD_NAME"'",
    "description": "Temporary dashboard for smoke testing",
    "layout_archetype": "executive_summary",
    "spec": {
      "widgets": [
        {
          "id": "widget-1",
          "type": "metrics_strip",
          "config": {
            "metrics": [
              { "key": "noi", "label": "NOI" }
            ]
          }
        }
      ]
    }
  }')

# Extract dashboard ID from response
DASHBOARD_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$DASHBOARD_ID" ]; then
  echo -e "${RED}✗ FAILED${NC} - Could not create test dashboard"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ PASSED${NC} - Created dashboard with ID: $DASHBOARD_ID"
echo ""

# Test 2: Verify dashboard exists by listing
echo -e "${YELLOW}[Test 2/5]${NC} Verifying dashboard exists..."

LIST_RESPONSE=$(curl -s -X GET "$BASE_URL$API_PATH?env_id=test-env&business_id=550e8400-e29b-41d4-a716-446655440000")

if echo "$LIST_RESPONSE" | grep -q "$DASHBOARD_ID"; then
  echo -e "${GREEN}✓ PASSED${NC} - Dashboard found in list"
else
  echo -e "${RED}✗ FAILED${NC} - Dashboard not found in list"
  echo "Response: $LIST_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Delete the dashboard (main test)
echo -e "${YELLOW}[Test 3/5]${NC} Deleting dashboard..."

DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$API_PATH/$DASHBOARD_ID")

# Parse status code from last line
STATUS_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$DELETE_RESPONSE" | sed '$d')

echo "HTTP Status: $STATUS_CODE"

if [ "$STATUS_CODE" = "204" ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Delete returned 204 No Content (as expected)"
else
  echo -e "${RED}✗ FAILED${NC} - Expected status 204, got $STATUS_CODE"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

# Test 4: Verify dashboard no longer exists
echo -e "${YELLOW}[Test 4/5]${NC} Verifying dashboard is deleted..."

LIST_RESPONSE_AFTER=$(curl -s -X GET "$BASE_URL$API_PATH?env_id=test-env&business_id=550e8400-e29b-41d4-a716-446655440000")

if echo "$LIST_RESPONSE_AFTER" | grep -q "$DASHBOARD_ID"; then
  echo -e "${RED}✗ FAILED${NC} - Dashboard still found in list after deletion"
  echo "Response: $LIST_RESPONSE_AFTER"
  exit 1
else
  echo -e "${GREEN}✓ PASSED${NC} - Dashboard successfully removed from list"
fi
echo ""

# Test 5: Try to delete non-existent dashboard (should return 404)
echo -e "${YELLOW}[Test 5/5]${NC} Testing 404 on non-existent dashboard..."

NONEXISTENT_ID="00000000-0000-0000-0000-000000000000"
NOT_FOUND_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$API_PATH/$NONEXISTENT_ID")

STATUS_CODE=$(echo "$NOT_FOUND_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$NOT_FOUND_RESPONSE" | sed '$d')

if [ "$STATUS_CODE" = "404" ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Non-existent dashboard returns 404 (as expected)"
  # Verify error message
  if echo "$RESPONSE_BODY" | grep -q "not found"; then
    echo -e "  Response contains expected error message"
  fi
else
  echo -e "${RED}✗ FAILED${NC} - Expected status 404, got $STATUS_CODE"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

echo "========================================"
echo -e "${GREEN}All smoke tests passed!${NC}"
echo "========================================"
echo ""
echo "Summary:"
echo "  ✓ Create dashboard"
echo "  ✓ Verify dashboard exists"
echo "  ✓ Delete dashboard (204 response)"
echo "  ✓ Verify dashboard removed"
echo "  ✓ 404 on non-existent dashboard"
echo ""
echo "DELETE /api/re/v2/dashboards/[dashboardId] is working correctly!"
