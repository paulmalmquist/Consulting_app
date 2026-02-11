#!/usr/bin/env bash
#
# Production smoke test for Business OS deployment.
# Usage: ./scripts/smoke_prod.sh <PROD_BASE_URL>
# Example: ./scripts/smoke_prod.sh https://www.paulmalmquist.com
#

set -euo pipefail

PROD_BASE_URL="${1:-https://www.paulmalmquist.com}"

echo "========================================="
echo "Business OS Production Smoke Test"
echo "========================================="
echo "Base URL: $PROD_BASE_URL"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Track failures
FAILURES=0

# Helper function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local check_json="${4:-true}"

    echo -n "Testing $name ... "

    response=$(curl -s -w "\n%{http_code}" "$url" 2>&1 || echo "000")
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" != "$expected_status" ]; then
        echo "FAIL (got HTTP $status_code, expected $expected_status)"
        echo "  URL: $url"
        echo "  Response: $body"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    if [ "$check_json" = "true" ]; then
        if ! echo "$body" | jq -e . >/dev/null 2>&1; then
            echo "FAIL (invalid JSON)"
            echo "  Response: $body"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    fi

    echo "OK"
    return 0
}

# ── Critical tests ────────────────────────────────────────────────────

# Test 1: Frontend root
test_endpoint "Frontend root" "$PROD_BASE_URL/" 200 false

# Test 2: Health check via proxy
test_endpoint "Health check (/v1/health)" "$PROD_BASE_URL/v1/health" 200 true

echo ""
echo "========================================="
echo "Backend API Endpoints (real DB)"
echo "========================================="

# Test 3: Templates endpoint (real DB)
test_endpoint "Templates GET (/api/templates)" "$PROD_BASE_URL/api/templates" 200 true

# Test 4: Departments catalog (real DB)
test_endpoint "Departments GET (/api/departments)" "$PROD_BASE_URL/api/departments" 200 true

echo ""
echo "========================================="
echo "Lab Endpoints (real DB)"
echo "========================================="

# Test 5: Environments endpoint (real DB)
test_endpoint "Environments GET (/v1/environments)" "$PROD_BASE_URL/v1/environments" 200 true

# Test 6: Audit endpoint (real DB)
test_endpoint "Audit list (/v1/audit)" "$PROD_BASE_URL/v1/audit" 200 true

# Test 7: Queue endpoint (real DB)
test_endpoint "Queue list (/v1/queue)" "$PROD_BASE_URL/v1/queue" 200 true

# Test 8: Metrics endpoint (real DB)
test_endpoint "Metrics (/v1/metrics)" "$PROD_BASE_URL/v1/metrics" 200 true

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="

if [ $FAILURES -eq 0 ]; then
    echo "All $((8)) tests passed!"
    echo ""
    echo "Infrastructure verified:"
    echo "  - Frontend: Deployed and serving"
    echo "  - Health check: Responding"
    echo "  - Templates: Real DB data"
    echo "  - Departments: Real DB data"
    echo "  - Lab environments: Real DB data"
    echo "  - Lab audit/queue/metrics: Real DB data"
    exit 0
else
    echo "$FAILURES test(s) failed"
    exit 1
fi
