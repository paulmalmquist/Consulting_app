#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1" >&2; exit 1; }; }
need curl
need jq

status_code() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /tmp/bm_walloff_resp.json -w "%{http_code}" -X "$method" "${BASE_URL}${path}" -H 'Content-Type: application/json' -d "$body"
  else
    curl -sS -o /tmp/bm_walloff_resp.json -w "%{http_code}" -X "$method" "${BASE_URL}${path}"
  fi
}

echo "[1/8] Public pages accessible"
[[ "$(status_code GET /)" == "200" ]]
[[ "$(status_code GET /login)" == "200" ]]
[[ "$(status_code GET /public)" == "200" ]]
[[ "$(status_code GET /public/onboarding)" == "200" ]]
echo "ok"

echo "[2/8] /onboarding rewrites publicly"
code="$(status_code GET /onboarding)"
[[ "$code" == "200" ]]
grep -qi "Onboarding Intake" /tmp/bm_walloff_resp.json
echo "ok"

echo "[3/8] Private surfaces blocked without auth"
code="$(status_code GET /lab)"
[[ "$code" == "307" || "$code" == "308" ]]
echo "ok"

echo "[4/8] Private mutation APIs blocked without auth"
[[ "$(status_code POST /api/commands/confirm '{"plan_id":"x"}')" == "401" ]]
[[ "$(status_code POST /api/commands/execute '{"plan_id":"x","confirm_token":"y"}')" == "401" ]]
[[ "$(status_code GET /api/mcp/context-snapshot)" == "401" ]]
[[ "$(status_code GET '/api/ai/gateway/health')" == "401" ]]
echo "ok"

echo "[5/8] Public assistant health"
[[ "$(status_code GET /api/public/assistant/health)" == "200" ]]
jq -e '.ok == true and .prompt_version != null' /tmp/bm_walloff_resp.json >/dev/null
echo "ok"

echo "[6/8] Public assistant strategy answer"
[[ "$(status_code POST /api/public/assistant/ask '{"question":"How should a legal operations team phase workflow replacement safely?"}')" == "200" ]]
jq -e '.policy.action == "allow" and (.answer | length) > 20 and .prompt_version != null' /tmp/bm_walloff_resp.json >/dev/null
echo "ok"

echo "[7/8] Public assistant blocks mutation intent"
[[ "$(status_code POST /api/public/assistant/ask '{"question":"Delete environment acme now"}')" == "200" ]]
jq -e '.policy.action == "blocked" and (.answer | test("sign in"; "i"))' /tmp/bm_walloff_resp.json >/dev/null
echo "ok"

echo "[8/8] Public onboarding lead capture"
[[ "$(status_code POST /api/public/onboarding-lead '{"company_name":"Acme Holdings","email":"ops@acme.example","industry":"finance","team_size":"51-200"}')" == "201" ]]
jq -e '.lead_id != null and .status == "captured"' /tmp/bm_walloff_resp.json >/dev/null
echo "ok"

echo "public wall-off smoke test passed"
