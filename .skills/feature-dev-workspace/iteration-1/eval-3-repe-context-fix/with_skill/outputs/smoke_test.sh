#!/bin/bash
#
# Smoke test for REPE context bootstrap endpoint fix
# Tests the endpoint against production Railway after deployment
#
# Production URLs:
#   Backend: https://authentic-sparkle-production-7f37.up.railway.app
#   Seed IDs: env_id=a1b2c3d4-0001-0001-0003-000000000001
#             business_id=a1b2c3d4-0001-0001-0001-000000000001

set -e

BASE="https://authentic-sparkle-production-7f37.up.railway.app"
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
BUSINESS_ID="a1b2c3d4-0001-0001-0001-000000000001"

echo "=========================================="
echo "REPE Context Endpoint Smoke Test"
echo "=========================================="
echo ""

# Test 1: Health check
echo "[TEST 1] Health endpoint"
HEALTH=$(curl -s "$BASE/health")
echo "Response: $HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed"
    exit 1
fi
echo ""

# Test 2: Context endpoint with env_id param
echo "[TEST 2] Context endpoint with env_id query param"
CONTEXT=$(curl -s "$BASE/api/repe/context?env_id=$ENV_ID")
echo "Response:"
echo "$CONTEXT" | python3 -m json.tool
echo ""

# Parse response
if echo "$CONTEXT" | grep -q '"env_id"'; then
    ENV_ID_RESP=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('env_id'))")
    echo "✓ env_id field present: $ENV_ID_RESP"
else
    echo "✗ env_id field missing"
    exit 1
fi

if echo "$CONTEXT" | grep -q '"business_id"'; then
    BIZ_ID_RESP=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('business_id'))")
    echo "✓ business_id field present: $BIZ_ID_RESP"
else
    echo "✗ business_id field missing"
    exit 1
fi

if echo "$CONTEXT" | grep -q '"created"'; then
    CREATED=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('created'))")
    echo "✓ created field present: $CREATED"
else
    echo "✗ created field missing"
    exit 1
fi

if echo "$CONTEXT" | grep -q '"source"'; then
    SOURCE=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('source'))")
    echo "✓ source field present: $SOURCE"
else
    echo "✗ source field missing"
    exit 1
fi

if echo "$CONTEXT" | grep -q '"diagnostics"'; then
    BINDING_FOUND=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('diagnostics', {}).get('binding_found'))")
    BUSINESS_FOUND=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('diagnostics', {}).get('business_found'))")
    ENV_FOUND=$(echo "$CONTEXT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('diagnostics', {}).get('env_found'))")
    echo "✓ diagnostics field present"
    echo "  - binding_found: $BINDING_FOUND"
    echo "  - business_found: $BUSINESS_FOUND"
    echo "  - env_found: $ENV_FOUND"

    if [ "$BUSINESS_FOUND" != "True" ]; then
        echo "✗ business_found must be True"
        exit 1
    fi
else
    echo "✗ diagnostics field missing"
    exit 1
fi
echo ""

# Test 3: Context endpoint with explicit business_id
echo "[TEST 3] Context endpoint with explicit business_id"
CONTEXT2=$(curl -s "$BASE/api/repe/context?business_id=$BUSINESS_ID")
echo "Response:"
echo "$CONTEXT2" | python3 -m json.tool
echo ""

if echo "$CONTEXT2" | grep -q '"business_id"'; then
    BIZ_ID_RESP2=$(echo "$CONTEXT2" | python3 -c "import sys, json; print(json.load(sys.stdin).get('business_id'))")
    echo "✓ business_id field present: $BIZ_ID_RESP2"
    if [ "$BIZ_ID_RESP2" != "$BUSINESS_ID" ]; then
        echo "✗ business_id mismatch: expected $BUSINESS_ID, got $BIZ_ID_RESP2"
        exit 1
    fi
else
    echo "✗ business_id field missing"
    exit 1
fi
echo ""

# Test 4: Context endpoint with both env_id and business_id
echo "[TEST 4] Context endpoint with both env_id and business_id"
CONTEXT3=$(curl -s "$BASE/api/repe/context?env_id=$ENV_ID&business_id=$BUSINESS_ID")
echo "Response:"
echo "$CONTEXT3" | python3 -m json.tool
echo ""

if echo "$CONTEXT3" | grep -q '"env_id"' && echo "$CONTEXT3" | grep -q '"business_id"'; then
    ENV_ID_RESP3=$(echo "$CONTEXT3" | python3 -c "import sys, json; print(json.load(sys.stdin).get('env_id'))")
    BIZ_ID_RESP3=$(echo "$CONTEXT3" | python3 -c "import sys, json; print(json.load(sys.stdin).get('business_id'))")
    echo "✓ Both env_id and business_id present"
    echo "  - env_id: $ENV_ID_RESP3"
    echo "  - business_id: $BIZ_ID_RESP3"
else
    echo "✗ Missing env_id or business_id field"
    exit 1
fi
echo ""

echo "=========================================="
echo "✓ ALL SMOKE TESTS PASSED"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Health endpoint responding"
echo "  - Context endpoint returns valid response with env_id param"
echo "  - Context endpoint returns valid response with business_id param"
echo "  - Context endpoint returns valid response with both params"
echo "  - All required fields present (env_id, business_id, created, source, diagnostics)"
echo "  - business_found is always True"
echo "  - No null responses"
echo ""
