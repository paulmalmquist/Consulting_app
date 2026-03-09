#!/bin/bash

# Smoke test for DELETE /api/re/v2/dashboards/[dashboardId]
# Tests the DELETE endpoint with production seed IDs

BASE_URL="https://www.paulmalmquist.com"
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
DASHBOARD_ID="test-dash-123"

echo "=== DELETE Dashboard Smoke Test ==="
echo ""

# Test 1: Delete existing dashboard (should return 200)
echo "Test 1: DELETE existing dashboard (200 expected)"
curl -X DELETE \
  "${BASE_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?env_id=${ENV_ID}&business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -v
echo ""
echo ""

# Test 2: Delete non-existent dashboard (should return 404)
echo "Test 2: DELETE non-existent dashboard (404 expected)"
curl -X DELETE \
  "${BASE_URL}/api/re/v2/dashboards/missing-dash-999?env_id=${ENV_ID}&business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -v
echo ""
echo ""

# Test 3: DELETE without env_id (should return 400)
echo "Test 3: DELETE without env_id (400 expected)"
curl -X DELETE \
  "${BASE_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -v
echo ""
echo ""

# Test 4: DELETE without business_id (should return 400)
echo "Test 4: DELETE without business_id (400 expected)"
curl -X DELETE \
  "${BASE_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?env_id=${ENV_ID}" \
  -H "Content-Type: application/json" \
  -v
echo ""
echo ""

# Test 5: OPTIONS request to verify CORS headers
echo "Test 5: OPTIONS request (200 expected with Allow header)"
curl -X OPTIONS \
  "${BASE_URL}/api/re/v2/dashboards/${DASHBOARD_ID}" \
  -v
echo ""
echo ""

echo "=== Smoke Test Complete ==="
