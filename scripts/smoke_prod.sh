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
        echo "❌ FAIL (got HTTP $status_code, expected $expected_status)"
        echo "  URL: $url"
        echo "  Response: $body"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    if [ "$check_json" = "true" ]; then
        if ! echo "$body" | jq -e . >/dev/null 2>&1; then
            echo "❌ FAIL (invalid JSON)"
            echo "  Response: $body"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    fi

    echo "✅ OK"
    return 0
}

# Test 1: Frontend root
test_endpoint "Frontend root" "$PROD_BASE_URL/" 200 false

# Test 2: Health check via proxy
test_endpoint "Health check (/v1/health)" "$PROD_BASE_URL/v1/health" 200 true

# Test 3: Direct API health check
test_endpoint "Direct API health (/api/v1/health)" "$PROD_BASE_URL/api/v1/health" 200 true

# Save critical test results
CRITICAL_FAILURES=$FAILURES

# Additional endpoint tests (these may fail if backend not fully deployed)
echo ""
echo "========================================="
echo "Extended Backend Tests (may fail if backend incomplete)"
echo "========================================="

# Test 4: Environments endpoint (requires full backend)
if test_endpoint "Environments list (/v1/environments)" "$PROD_BASE_URL/v1/environments" 200 true 2>/dev/null; then
    echo "  Backend appears fully deployed!"
else
    echo "  ⚠️  Backend not fully deployed - only health check working (expected for temp Next.js endpoint)"
fi

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="

if [ $CRITICAL_FAILURES -eq 0 ]; then
    echo "✅ All critical tests passed!"
    echo ""
    echo "Core infrastructure is working:"
    echo "  - Frontend: Deployed and serving"
    echo "  - Health check: Responding correctly"
    echo "  - API routing: Proxy working"

    if [ $FAILURES -gt 0 ]; then
        echo ""
        echo "Note: $FAILURES extended test(s) failed (non-critical)"
        echo "This is expected until full FastAPI backend is deployed."
    fi
    exit 0
else
    echo "❌ $CRITICAL_FAILURES critical test(s) failed"
    exit 1
fi
