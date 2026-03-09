#!/bin/bash

##############################################################################
# REPE Context Bootstrap - Smoke Test
#
# This script tests the REPE context bootstrap endpoint against the Railway
# production backend to verify the binding_found logic fix.
#
# The fix ensures that when a business is resolved (by binding, heuristic, or
# auto-create), the endpoint returns business_found: true and binding_found: true
# (if binding exists after the function completes).
#
# Usage:
#   bash smoke_test.sh [BACKEND_URL] [ENV_ID_1] [ENV_ID_2] ...
#
# Examples:
#   bash smoke_test.sh https://backend.railway.app prod-env-001 prod-env-002
#   bash smoke_test.sh https://api.example.com $(cat seed_ids.txt)
#
##############################################################################

set -e

# Configuration
BACKEND_URL="${1:-https://api.consulting-app.railway.app}"
ENV_IDS=("${@:2}")

# If no env_ids provided, use seed IDs (adjust to your production seed IDs)
if [ ${#ENV_IDS[@]} -eq 0 ]; then
    ENV_IDS=(
        "f0790a88-5d05-4991-8d0e-243ab4f9af27"
        "prod-env-12345678-abcd-efgh-ijkl-mnopqrstuvwx"
        "staging-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    )
fi

PASS=0
FAIL=0

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "REPE Context Bootstrap - Smoke Test"
echo "=========================================="
echo "Backend URL: $BACKEND_URL"
echo "Testing ${#ENV_IDS[@]} environment(s)"
echo ""

##############################################################################
# Test: GET /api/repe/context with env_id parameter
##############################################################################
test_context_endpoint() {
    local env_id=$1
    local test_name="Context endpoint with env_id=$env_id"

    echo -e "${YELLOW}Testing: $test_name${NC}"

    # Make request
    response=$(curl -s -w "\n%{http_code}" \
        -X GET "${BACKEND_URL}/api/repe/context" \
        -H "Accept: application/json" \
        --data-urlencode "env_id=$env_id")

    # Extract status code and body
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # Check status code
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}  FAIL: HTTP $http_code${NC}"
        echo "  Response: $body"
        ((FAIL++))
        return 1
    fi

    # Parse JSON response
    business_id=$(echo "$body" | grep -o '"business_id":"[^"]*"' | cut -d'"' -f4)
    env_id_resp=$(echo "$body" | grep -o '"env_id":"[^"]*"' | cut -d'"' -f4)
    business_found=$(echo "$body" | grep -o '"business_found":[^,}]*' | cut -d':' -f2)
    binding_found=$(echo "$body" | grep -o '"binding_found":[^,}]*' | cut -d':' -f2)
    env_found=$(echo "$body" | grep -o '"env_found":[^,}]*' | cut -d':' -f2)

    # Assertions
    local test_pass=true

    if [ -z "$business_id" ] || [ "$business_id" = "null" ]; then
        echo -e "${RED}  FAIL: business_id is null or missing${NC}"
        test_pass=false
    fi

    if [ "$business_found" != "true" ]; then
        echo -e "${RED}  FAIL: business_found should be true, got: $business_found${NC}"
        test_pass=false
    fi

    if [ "$env_found" != "true" ]; then
        echo -e "${RED}  FAIL: env_found should be true, got: $env_found${NC}"
        test_pass=false
    fi

    if $test_pass; then
        echo -e "${GREEN}  PASS: HTTP 200, business_id=$business_id${NC}"
        echo "    business_found=$business_found, binding_found=$binding_found, env_found=$env_found"
        ((PASS++))
        return 0
    else
        echo "  Full response: $body"
        ((FAIL++))
        return 1
    fi
}

##############################################################################
# Test: GET /api/repe/context with X-Env-Id header
##############################################################################
test_context_endpoint_header() {
    local env_id=$1
    local test_name="Context endpoint with X-Env-Id header ($env_id)"

    echo -e "${YELLOW}Testing: $test_name${NC}"

    response=$(curl -s -w "\n%{http_code}" \
        -X GET "${BACKEND_URL}/api/repe/context" \
        -H "Accept: application/json" \
        -H "X-Env-Id: $env_id")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" != "200" ]; then
        echo -e "${RED}  FAIL: HTTP $http_code${NC}"
        ((FAIL++))
        return 1
    fi

    business_id=$(echo "$body" | grep -o '"business_id":"[^"]*"' | cut -d'"' -f4)
    business_found=$(echo "$body" | grep -o '"business_found":[^,}]*' | cut -d':' -f2)

    if [ -z "$business_id" ] || [ "$business_id" = "null" ]; then
        echo -e "${RED}  FAIL: business_id is null${NC}"
        ((FAIL++))
        return 1
    fi

    if [ "$business_found" != "true" ]; then
        echo -e "${RED}  FAIL: business_found should be true${NC}"
        ((FAIL++))
        return 1
    fi

    echo -e "${GREEN}  PASS: HTTP 200, business_id=$business_id${NC}"
    ((PASS++))
    return 0
}

##############################################################################
# Test: GET /api/repe/health to verify schema is migrated
##############################################################################
test_health_endpoint() {
    echo -e "${YELLOW}Testing: Health check endpoint${NC}"

    response=$(curl -s -w "\n%{http_code}" \
        -X GET "${BACKEND_URL}/api/repe/health" \
        -H "Accept: application/json")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" != "200" ]; then
        echo -e "${RED}  FAIL: HTTP $http_code${NC}"
        echo "  This might indicate schema is not fully migrated"
        ((FAIL++))
        return 1
    fi

    db_ok=$(echo "$body" | grep -o '"db_ok":[^,}]*' | cut -d':' -f2)
    if [ "$db_ok" != "true" ]; then
        echo -e "${YELLOW}  WARNING: db_ok is not true${NC}"
    fi

    echo -e "${GREEN}  PASS: Health endpoint responding${NC}"
    ((PASS++))
    return 0
}

##############################################################################
# Test: POST /api/repe/context/init for explicit initialization
##############################################################################
test_context_init_endpoint() {
    local env_id=$1
    local test_name="Context init endpoint ($env_id)"

    echo -e "${YELLOW}Testing: $test_name${NC}"

    response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BACKEND_URL}/api/repe/context/init" \
        -H "Accept: application/json" \
        -H "Content-Type: application/json" \
        -d "{\"env_id\": \"$env_id\"}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" != "200" ]; then
        echo -e "${RED}  FAIL: HTTP $http_code${NC}"
        ((FAIL++))
        return 1
    fi

    business_id=$(echo "$body" | grep -o '"business_id":"[^"]*"' | cut -d'"' -f4)
    if [ -z "$business_id" ] || [ "$business_id" = "null" ]; then
        echo -e "${RED}  FAIL: business_id is null${NC}"
        ((FAIL++))
        return 1
    fi

    echo -e "${GREEN}  PASS: Context initialized, business_id=$business_id${NC}"
    ((PASS++))
    return 0
}

##############################################################################
# Main test execution
##############################################################################

# First, check if backend is reachable
echo -e "${YELLOW}Checking backend connectivity...${NC}"
if ! curl -s -f -o /dev/null "$BACKEND_URL/api/repe/health" 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot reach backend at $BACKEND_URL${NC}"
    echo "Please verify the URL and that the backend is running."
    exit 1
fi
echo -e "${GREEN}Backend is reachable${NC}"
echo ""

# Run health check
test_health_endpoint
echo ""

# Test each environment ID
for env_id in "${ENV_IDS[@]}"; do
    echo "Testing with env_id: $env_id"
    test_context_endpoint "$env_id"
    test_context_endpoint_header "$env_id"
    test_context_init_endpoint "$env_id"
    echo ""
done

##############################################################################
# Summary
##############################################################################
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASS${NC}"
echo -e "${RED}FAILED: $FAIL${NC}"
echo "TOTAL: $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
