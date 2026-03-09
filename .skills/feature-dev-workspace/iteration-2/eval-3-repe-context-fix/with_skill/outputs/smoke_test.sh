#!/bin/bash
# Smoke test for REPE context bootstrap endpoint
# Tests with production seed IDs from CLAUDE.md

# Backend URL (from CLAUDE.md deploy topology)
BACKEND_URL="https://authentic-sparkle-production-7f37.up.railway.app"

# Production seed IDs (from CLAUDE.md)
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
FUND_ID="a1b2c3d4-0003-0030-0001-000000000001"
ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"

echo "=========================================="
echo "REPE Context Bootstrap Smoke Test"
echo "=========================================="
echo ""

# Test 1: Get REPE context with env_id (binding resolution)
echo "Test 1: GET /api/repe/context with env_id (binding resolution)"
echo "URL: $BACKEND_URL/api/repe/context?env_id=$ENV_ID"
curl -s -X GET "$BACKEND_URL/api/repe/context?env_id=$ENV_ID" \
  -H "Content-Type: application/json" | jq .
echo ""
echo ""

# Test 2: Get REPE context with business_id (explicit business)
echo "Test 2: GET /api/repe/context with business_id (explicit business)"
echo "URL: $BACKEND_URL/api/repe/context?business_id=$BUSINESS_ID"
curl -s -X GET "$BACKEND_URL/api/repe/context?business_id=$BUSINESS_ID" \
  -H "Content-Type: application/json" | jq .
echo ""
echo ""

# Test 3: Get REPE context with both env_id and business_id
echo "Test 3: GET /api/repe/context with both env_id and business_id"
echo "URL: $BACKEND_URL/api/repe/context?env_id=$ENV_ID&business_id=$BUSINESS_ID"
curl -s -X GET "$BACKEND_URL/api/repe/context?env_id=$ENV_ID&business_id=$BUSINESS_ID" \
  -H "Content-Type: application/json" | jq .
echo ""
echo ""

# Test 4: List funds for the context
echo "Test 4: GET /api/repe/funds?env_id=$ENV_ID (list funds in context)"
echo "URL: $BACKEND_URL/api/repe/funds?env_id=$ENV_ID"
curl -s -X GET "$BACKEND_URL/api/repe/funds?env_id=$ENV_ID" \
  -H "Content-Type: application/json" | jq '.[:2]'  # Just show first 2
echo ""
echo ""

# Test 5: Get REPE health check
echo "Test 5: GET /api/repe/health (health check)"
echo "URL: $BACKEND_URL/api/repe/health"
curl -s -X GET "$BACKEND_URL/api/repe/health" \
  -H "Content-Type: application/json" | jq .
echo ""
echo ""

echo "=========================================="
echo "Expected Results:"
echo "- Test 1 should return business_id, env_id, created, source, diagnostics"
echo "- Test 2 should return business_id (even without env_id)"
echo "- Test 3 should return both env_id and business_id"
echo "- Test 4 should return array of funds (not null)"
echo "- Test 5 should return ok: true/false with migrations_present"
echo "=========================================="
