#!/bin/bash

# Smoke tests for DELETE /api/re/v2/dashboards/[dashboardId]
# Tests deletion with proper auth context (env_id + business_id)

set -e

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3001}"
DASHBOARD_ID="a1b2c3d4-0003-0030-0001-000000000001"  # Example test ID
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"

echo "===== Smoke Test: DELETE Dashboard ====="
echo ""

# Test 1: Successful deletion with all required params
echo "[1] DELETE dashboard with valid env_id and business_id"
curl -X DELETE \
  "${FRONTEND_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?env_id=${ENV_ID}&business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 2: Missing business_id (should return 400)
echo "[2] DELETE dashboard missing business_id (should return 400)"
curl -X DELETE \
  "${FRONTEND_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?env_id=${ENV_ID}" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 3: Missing env_id (should return 400)
echo "[3] DELETE dashboard missing env_id (should return 400)"
curl -X DELETE \
  "${FRONTEND_URL}/api/re/v2/dashboards/${DASHBOARD_ID}?business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 4: Invalid dashboard ID (should return 404)
echo "[4] DELETE non-existent dashboard (should return 404)"
curl -X DELETE \
  "${FRONTEND_URL}/api/re/v2/dashboards/invalid-id?env_id=${ENV_ID}&business_id=${BUSINESS_ID}" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 5: OPTIONS request (check allowed methods)
echo "[5] OPTIONS request (check CORS headers)"
curl -X OPTIONS \
  "${FRONTEND_URL}/api/re/v2/dashboards/${DASHBOARD_ID}" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -v 2>&1 | grep -i "Allow"

echo ""
echo "===== Smoke tests complete ====="
